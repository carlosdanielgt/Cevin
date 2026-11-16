"""
Cevin Local MLX Multi-Model Inference Server (`mlx_server.py`)
==============================================================
Serves integrated fine-tuned 4-bit Apple Silicon MLX models natively via FastAPI:
  1. `Qwen2.5-1.5B-Instruct-4bit` (default — fine-tuned Qwen2.5-1.5B Rank-32 LoRA fused at `./cevin-1.5b-4bit-fused`, ~1.15 GB unified memory)
  2. `cevin-3b-4bit-fused` (fine-tuned Qwen2.5-3B LoRA fused at `./cevin-3b-4bit-fused` — ~2.73 GB unified memory)

Key guarantees:
1. Loads the configured default model ONCE at startup via `mlx_lm.load`.
2. Supports hot-switching between registered models via `POST /v1/cevin/select-model`
   or per-request `model` field on `POST /v1/cevin/infer` (releasing the previous model's
   Metal buffers cleanly before loading the requested weights).
3. Formats prompts with `tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)`.
4. Uses `mlx_lm.sample_utils.make_sampler(temp=request.temperature)`.
5. Serializes Metal GPU generation and model swaps with `asyncio.Lock()`.
6. Exposes `GET /health`, `GET /v1/models`, `POST /v1/cevin/select-model`,
   `POST /v1/cevin/unload`, and `POST /v1/cevin/infer`.

Run locally on Apple Silicon:
    uvicorn mlx_server:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import asyncio
import gc
import json
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DEFAULT_MODEL_ID = os.environ.get(
    "CEVIN_MLX_DEFAULT_MODEL", "Qwen2.5-1.5B-Instruct-4bit"
)
MAX_SEQ_LENGTH = 1024

DEFAULT_SYSTEM_PROMPT = (
    "You are Cevin's specialized Career Intelligence Engine. "
    "You operate strictly on structured career evidence. "
    "Never invent metrics, technologies, or experience not grounded in the source data. "
    "Always respond in valid JSON."
)


@dataclass(frozen=True)
class RegisteredModelSpec:
    id: str
    name: str
    local_path: str
    hf_fallback: Optional[str]
    family: str
    parameter_size: str
    peak_ram_gb: float
    is_default: bool
    fine_tuned: bool
    description: str

    def resolve_load_target(self) -> str:
        # Honor explicit CEVIN_MLX_MODEL_PATH override if targeting this model
        override_path = os.environ.get("CEVIN_MLX_MODEL_PATH", "").strip()
        local_dir_name = os.path.basename(self.local_path.rstrip("/"))
        if override_path and (
            os.path.basename(override_path.rstrip("/")) in (self.id, local_dir_name)
            or (self.id == DEFAULT_MODEL_ID and os.path.exists(override_path))
        ):
            return override_path
        if os.path.exists(self.local_path):
            return self.local_path
        if self.hf_fallback:
            return self.hf_fallback
        return self.local_path

    def is_available_locally(self) -> bool:
        if os.path.exists(self.local_path):
            return True
        override_path = os.environ.get("CEVIN_MLX_MODEL_PATH", "").strip()
        local_dir_name = os.path.basename(self.local_path.rstrip("/"))
        if override_path and os.path.exists(override_path):
            if os.path.basename(override_path.rstrip("/")) in (self.id, local_dir_name):
                return True
        return self.hf_fallback is not None


REGISTERED_MODELS: Dict[str, RegisteredModelSpec] = {
    "Qwen2.5-1.5B-Instruct-4bit": RegisteredModelSpec(
        id="Qwen2.5-1.5B-Instruct-4bit",
        name="Qwen2.5 1.5B Fine-Tuned (4-bit)",
        local_path=os.environ.get(
            "CEVIN_MLX_1_5B_PATH", "./cevin-1.5b-4bit-fused"
        ),
        hf_fallback=None,
        family="qwen2.5-mlx-lora",
        parameter_size="1.5B (4-bit fused)",
        peak_ram_gb=1.15,
        is_default=True,
        fine_tuned=True,
        description="Fine-tuned Qwen2.5-1.5B Rank-32 LoRA model trained on structured career reasoning (~1.2 GB RAM).",
    ),
    "cevin-3b-4bit-fused": RegisteredModelSpec(
        id="cevin-3b-4bit-fused",
        name="Cevin 3B Fine-Tuned (4-bit)",
        local_path=os.environ.get(
            "CEVIN_MLX_3B_PATH", "./cevin-3b-4bit-fused"
        ),
        hf_fallback=None,
        family="qwen2.5-mlx-lora",
        parameter_size="3B (4-bit fused)",
        peak_ram_gb=2.73,
        is_default=False,
        fine_tuned=True,
        description="Fine-tuned Qwen2.5-3B LoRA model for higher nuance (~2.7 GB RAM).",
    ),
}


def _lookup_registered_model(
    model_id_or_path: str,
) -> Optional[RegisteredModelSpec]:
    normalized = model_id_or_path.strip()
    if not normalized:
        return None
    if normalized in REGISTERED_MODELS:
        return REGISTERED_MODELS[normalized]
    base = os.path.basename(normalized.rstrip("/"))
    if base in REGISTERED_MODELS:
        return REGISTERED_MODELS[base]
    for spec in REGISTERED_MODELS.values():
        spec_dir = os.path.basename(spec.local_path.rstrip("/"))
        if normalized == spec_dir or base == spec_dir:
            return spec
    return None


def _resolve_initial_model_id() -> str:
    env_model_path = os.environ.get("CEVIN_MLX_MODEL_PATH", "").strip()
    if env_model_path:
        matched = _lookup_registered_model(env_model_path)
        if matched is not None:
            return matched.id
    matched_default = _lookup_registered_model(DEFAULT_MODEL_ID)
    if matched_default is not None:
        return matched_default.id
    return "Qwen2.5-1.5B-Instruct-4bit"


def _clear_metal_cache() -> None:
    gc.collect()
    try:
        import mlx.core as mx  # type: ignore

        if hasattr(mx, "metal") and hasattr(mx.metal, "clear_cache"):
            mx.metal.clear_cache()
        elif hasattr(mx, "clear_cache"):
            mx.clear_cache()
    except Exception:
        pass


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class CevinInferRequest(BaseModel):
    model: Optional[str] = None
    messages: Optional[List[ChatMessage]] = None
    system_prompt: Optional[str] = Field(default=DEFAULT_SYSTEM_PROMPT)
    user_prompt: Optional[str] = None
    temperature: float = Field(default=0.0, ge=0.0, le=1.0)
    max_tokens: int = Field(default=512, ge=1, le=MAX_SEQ_LENGTH)
    task: Optional[str] = None


class SelectModelRequest(BaseModel):
    model: str


class UsageMetrics(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_ms: int


class CevinInferResponse(BaseModel):
    text: str
    data: Optional[Dict[str, Any]] = None
    model: str
    task: Optional[str] = None
    usage: UsageMetrics


class ModelState:
    def __init__(self) -> None:
        self.model: Any = None
        self.tokenizer: Any = None
        self.loaded: bool = False
        self.load_error: Optional[str] = None
        self.active_model_id: str = _resolve_initial_model_id()
        spec = REGISTERED_MODELS.get(self.active_model_id)
        self.model_path: str = (
            spec.resolve_load_target()
            if spec
            else os.environ.get("CEVIN_MLX_MODEL_PATH", "./cevin-1.5b-4bit-fused")
        )
        self.lock: asyncio.Lock = asyncio.Lock()


state = ModelState()


def _resolve_target_path(model_id_or_path: str) -> tuple[str, str]:
    normalized = model_id_or_path.strip()
    spec = _lookup_registered_model(normalized)
    if spec is not None:
        if os.path.exists(normalized):
            return spec.id, normalized
        return spec.id, spec.resolve_load_target()
    return normalized, normalized


async def _load_model_unlocked(model_id_or_path: str) -> int:
    target_id, target_path = _resolve_target_path(model_id_or_path)
    if state.loaded and state.active_model_id == target_id and state.model is not None:
        return 0

    start_ns = time.perf_counter_ns()
    # Release previous model before loading new weights into unified memory
    state.model = None
    state.tokenizer = None
    state.loaded = False
    _clear_metal_cache()

    from mlx_lm import load  # type: ignore

    model, tokenizer = await asyncio.to_thread(load, target_path)
    state.model = model
    state.tokenizer = tokenizer
    state.active_model_id = target_id
    state.model_path = target_path
    state.loaded = True
    state.load_error = None
    return max(1, int((time.perf_counter_ns() - start_ns) / 1_000_000))


def _model_catalog_payload() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for spec in REGISTERED_MODELS.values():
        items.append(
            {
                "id": spec.id,
                "name": spec.name,
                "family": spec.family,
                "parameter_size": spec.parameter_size,
                "peak_ram_gb": spec.peak_ram_gb,
                "is_default": spec.is_default,
                "fine_tuned": spec.fine_tuned,
                "description": spec.description,
                "model_path": spec.resolve_load_target(),
                "active": state.loaded and state.active_model_id == spec.id,
                "available": spec.is_available_locally(),
            }
        )
    if state.active_model_id not in REGISTERED_MODELS:
        items.append(
            {
                "id": state.active_model_id,
                "name": state.active_model_id,
                "family": "custom-mlx",
                "parameter_size": "custom",
                "peak_ram_gb": 2.0,
                "is_default": False,
                "fine_tuned": False,
                "description": "Custom local MLX model.",
                "model_path": state.model_path,
                "active": state.loaded,
                "available": True,
            }
        )
    return items


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        async with state.lock:
            await _load_model_unlocked(state.active_model_id)
    except Exception as exc:  # pragma: no cover - surfaced via /health
        state.loaded = False
        state.load_error = str(exc)
    yield
    state.model = None
    state.tokenizer = None
    state.loaded = False
    _clear_metal_cache()


app = FastAPI(
    title="Cevin Local MLX Inference Service",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _extract_json_dict(raw_text: str) -> Optional[Dict[str, Any]]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        cleaned = cleaned[first_brace : last_brace + 1]
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    active_spec = REGISTERED_MODELS.get(state.active_model_id)
    return {
        "status": "ok" if state.loaded else "degraded",
        "loaded": state.loaded,
        "model": state.active_model_id,
        "model_path": state.model_path,
        "max_seq_length": MAX_SEQ_LENGTH,
        "backend": "mlx-lm",
        "peak_ram_gb": active_spec.peak_ram_gb if active_spec else 2.0,
        "available_models": _model_catalog_payload(),
        "error": state.load_error,
    }


@app.get("/v1/models")
async def list_models() -> Dict[str, Any]:
    return {
        "object": "list",
        "active_model": state.active_model_id,
        "loaded": state.loaded,
        "data": _model_catalog_payload(),
    }


@app.post("/v1/cevin/select-model")
async def select_model(request: SelectModelRequest) -> Dict[str, Any]:
    target = request.model.strip()
    if not target:
        raise HTTPException(status_code=422, detail="'model' must not be empty.")
    try:
        async with state.lock:
            load_ms = await _load_model_unlocked(target)
    except Exception as exc:
        state.load_error = str(exc)
        raise HTTPException(
            status_code=503,
            detail=f"Failed to load model '{target}': {exc}",
        ) from exc

    active_spec = REGISTERED_MODELS.get(state.active_model_id)
    return {
        "status": "ok",
        "loaded": state.loaded,
        "model": state.active_model_id,
        "model_path": state.model_path,
        "peak_ram_gb": active_spec.peak_ram_gb if active_spec else 2.0,
        "load_ms": load_ms,
    }


@app.post("/v1/cevin/unload")
async def unload_model() -> Dict[str, Any]:
    async with state.lock:
        state.model = None
        state.tokenizer = None
        state.loaded = False
        _clear_metal_cache()
    return {"status": "ok", "loaded": False}


@app.post("/v1/cevin/infer", response_model=CevinInferResponse)
async def infer(request: CevinInferRequest) -> CevinInferResponse:
    messages: List[Dict[str, str]] = []
    if request.messages and len(request.messages) > 0:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
    elif request.user_prompt:
        messages = [
            {
                "role": "system",
                "content": request.system_prompt or DEFAULT_SYSTEM_PROMPT,
            },
            {"role": "user", "content": request.user_prompt},
        ]
    else:
        raise HTTPException(
            status_code=422,
            detail="Either 'messages' or 'user_prompt' must be provided.",
        )

    from mlx_lm import generate  # type: ignore
    from mlx_lm.sample_utils import make_sampler  # type: ignore

    sampler = make_sampler(temp=request.temperature)

    async with state.lock:
        requested_model = request.model.strip() if request.model else None
        if requested_model and requested_model != state.active_model_id:
            try:
                await _load_model_unlocked(requested_model)
            except Exception as exc:
                state.load_error = str(exc)
                raise HTTPException(
                    status_code=503,
                    detail=f"Unable to switch to model '{requested_model}': {exc}",
                ) from exc

        if not state.loaded or state.model is None or state.tokenizer is None:
            try:
                await _load_model_unlocked(requested_model or state.active_model_id)
            except Exception as exc:
                state.load_error = str(exc)
                raise HTTPException(
                    status_code=503,
                    detail=(
                        f"Model '{state.model_path}' is not loaded. "
                        f"Error: {state.load_error or 'mlx_lm not initialized'}"
                    ),
                ) from exc

        prompt_str: str = state.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )

        start_ns = time.perf_counter_ns()
        raw_output: str = await asyncio.to_thread(
            generate,
            state.model,
            state.tokenizer,
            prompt=prompt_str,
            max_tokens=request.max_tokens,
            sampler=sampler,
            verbose=False,
        )
        elapsed_ms = max(1, int((time.perf_counter_ns() - start_ns) / 1_000_000))
        active_model_id = state.active_model_id

    prompt_tokens = max(1, len(prompt_str) // 4)
    completion_tokens = max(1, len(raw_output) // 4)
    parsed_json = _extract_json_dict(raw_output)

    return CevinInferResponse(
        text=raw_output.strip(),
        data=parsed_json,
        model=active_model_id,
        task=request.task or (parsed_json.get("task") if parsed_json else None),
        usage=UsageMetrics(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_ms=elapsed_ms,
        ),
    )
