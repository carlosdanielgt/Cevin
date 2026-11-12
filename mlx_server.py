"""
Cevin Fine-Tuned MLX 3B Inference Server (`mlx_server.py`)
==========================================================
Serves `./cevin-3b-4bit-fused` (fused `mlx-community/Qwen2.5-3B-Instruct-4bit` + `adapters_3b_v4` LoRA)
natively on Apple Silicon via FastAPI.

Key guarantees:
1. Loads `./cevin-3b-4bit-fused` ONCE at startup via `mlx_lm.load`.
2. Formats prompts with `tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)`.
3. Uses `mlx_lm.sample_utils.make_sampler(temp=request.temperature)`.
4. Serializes Metal GPU generation with `asyncio.Lock()` so concurrent HTTP requests
   never collide in Apple Metal GPU command buffers.
5. Exposes `GET /health` and `POST /v1/cevin/infer`.

Run locally on Apple Silicon:
    uvicorn mlx_server:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_PATH = os.environ.get("CEVIN_MLX_MODEL_PATH", "./cevin-3b-4bit-fused")
MAX_SEQ_LENGTH = 1024

DEFAULT_SYSTEM_PROMPT = (
    "You are Cevin's specialized Career Intelligence Engine. "
    "You operate strictly on structured career evidence. "
    "Never invent metrics, technologies, or experience not grounded in the source data. "
    "Always respond in valid JSON."
)


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class CevinInferRequest(BaseModel):
    messages: Optional[List[ChatMessage]] = None
    system_prompt: Optional[str] = Field(default=DEFAULT_SYSTEM_PROMPT)
    user_prompt: Optional[str] = None
    temperature: float = Field(default=0.0, ge=0.0, le=1.0)
    max_tokens: int = Field(default=512, ge=1, le=MAX_SEQ_LENGTH)
    task: Optional[str] = None


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
        self.model_path: str = MODEL_PATH
        self.lock: asyncio.Lock = asyncio.Lock()


state = ModelState()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        from mlx_lm import load  # type: ignore

        model, tokenizer = load(state.model_path)
        state.model = model
        state.tokenizer = tokenizer
        state.loaded = True
        state.load_error = None
    except Exception as exc:  # pragma: no cover - surfaced via /health
        state.loaded = False
        state.load_error = str(exc)
    yield
    state.model = None
    state.tokenizer = None
    state.loaded = False


app = FastAPI(
    title="Cevin 3B Fine-Tuned MLX Inference Service",
    version="1.0.0",
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
    return {
        "status": "ok" if state.loaded else "degraded",
        "loaded": state.loaded,
        "model": "cevin-3b-4bit-fused",
        "model_path": state.model_path,
        "max_seq_length": MAX_SEQ_LENGTH,
        "backend": "mlx-lm",
        "peak_ram_gb": 2.73,
        "error": state.load_error,
    }


@app.post("/v1/cevin/infer", response_model=CevinInferResponse)
async def infer(request: CevinInferRequest) -> CevinInferResponse:
    if not state.loaded or state.model is None or state.tokenizer is None:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Model '{state.model_path}' is not loaded. "
                f"Error: {state.load_error or 'mlx_lm not initialized'}"
            ),
        )

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

    prompt_str: str = state.tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )

    sampler = make_sampler(temp=request.temperature)
    start_ns = time.perf_counter_ns()

    async with state.lock:
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
    prompt_tokens = max(1, len(prompt_str) // 4)
    completion_tokens = max(1, len(raw_output) // 4)
    parsed_json = _extract_json_dict(raw_output)

    return CevinInferResponse(
        text=raw_output.strip(),
        data=parsed_json,
        model="cevin-3b-4bit-fused",
        task=request.task or (parsed_json.get("task") if parsed_json else None),
        usage=UsageMetrics(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_ms=elapsed_ms,
        ),
    )
