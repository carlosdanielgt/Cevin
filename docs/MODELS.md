# Cevin Models (`docs/MODELS.md`)

Cevin supports Apple Silicon local inference via `mlx_server.py` (using `mlx-lm` over FastAPI on `http://127.0.0.1:8000`) plus an in-browser **Demo mode** that requires no AI model.

> **Availability notice:** The fine-tuned **`Cevin 1.5B`** and **`Cevin 3B`** model weights and private training data are **not public yet**. Today you can run **Demo mode** on any OS, or run `mlx_server.py` on Apple Silicon with a public 4-bit MLX instruct model (`mlx-community/Qwen2.5-1.5B-Instruct-4bit`).

---

## 1. Model Cards

### `Cevin 1.5B` (Default)
- **Runtime Model ID / Local Directory:** `Qwen2.5-1.5B-Instruct-4bit` → `./cevin-1.5b-4bit-fused` (override via `CEVIN_MLX_1_5B_PATH` or `CEVIN_MODEL_PATH`)
- **Base Model:** Qwen2.5-1.5B-Instruct (`Qwen/Qwen2.5-1.5B-Instruct`, 4-bit MLX quantization)
- **Base Model License:** Apache-2.0 (see upstream Qwen2.5-1.5B-Instruct model card)
- **Fine-Tuned Weights Status:** Not public yet (`hf_fallback = None` in `mlx_server.py`)
- **Memory Footprint:** ~1.15 GB unified memory (configured `peak_ram_gb: 1.15`)
- **Profile (`qwen25_1_5b_mlx`):** `maxSeqLength: 1024`, `parallelRecommended: 1`, `fewShotStyle: 'inline'`, `disableRawPromptTrimming: true`
- **Intended Use:** Default everyday resume extraction, requirement matching, hallucination auditing, bullet evaluation/rewriting, and executive summary synthesis on 8 GB+ Apple Silicon Macs.

### `Cevin 3B`
- **Runtime Model ID / Local Directory:** `cevin-3b-4bit-fused` → `./cevin-3b-4bit-fused` (override via `CEVIN_MLX_3B_PATH` or `CEVIN_MODEL_PATH`)
- **Base Model:** Qwen2.5-3B-Instruct (`mlx-community/Qwen2.5-3B-Instruct-4bit`)
- **Base Model License:** **Qwen Research License** (see upstream Qwen2.5-3B-Instruct model card; commercial use of upstream 3B base weights is restricted under the Qwen Research License unless separately licensed)
- **Fine-Tuned Weights Status:** Not public yet (`hf_fallback = None` in `mlx_server.py`)
- **Memory Footprint:** ~2.73 GB unified memory (configured `peak_ram_gb: 2.73`)
- **Profile (`cevin_3b_mlx`):** `maxSeqLength: 1024`, `parallelRecommended: 1`, `fewShotStyle: 'inline'`, `disableRawPromptTrimming: true`
- **Intended Use:** Higher-capacity option on 16 GB+ Apple Silicon Macs for complex multi-role resumes and cover letter synthesis.

### Public 4-Bit MLX Fallback (`mlx-community/Qwen2.5-1.5B-Instruct-4bit`)
- **Runtime Model ID / Env:** `CEVIN_MODEL_PATH=mlx-community/Qwen2.5-1.5B-Instruct-4bit`
- **Base Model & License:** Qwen2.5-1.5B-Instruct (Apache-2.0) quantized to 4-bit MLX by `mlx-community`
- **Availability:** Publicly downloadable via `mlx_lm.load(...)` on first server startup
- **Memory Footprint:** ~1.15 GB unified memory
- **Profile (`base_instruct_mlx`):** Routes through `fewShotStyle: 'chat-turns'` and appends explicit JSON key definitions in `createMlxCareerIntelligenceAdapter` so un-tuned base weights adhere to Zod output schemas.
- **Limitations:** Not trained on Cevin's structured career tasks. Expect higher JSON repair rate and more frequent `"Original wording kept"` fallbacks than with fine-tuned weights.

---

## 2. Prompt Routing & Unified MLX Contract

1. **Fine-Tuned Models (`Cevin 1.5B` & `Cevin 3B`):**
   - Both models were trained on the exact same dataset with `mask_prompt: true` and `max_seq_length: 1024`.
   - Both receive the byte-identical `CEVIN_MLX_SYSTEM_PROMPT` and exact `TASK:` prompts with **zero** extra JSON schema text and **zero** chat-turn few-shot examples (`fewShotStyle: 'inline'`).
2. **Public Base Instruct Models (`mlx-community/*`):**
   - Automatically resolve to `base_instruct_mlx` (`fewShotStyle: 'chat-turns'`) and receive explicit JSON key schemas from `getUntunedJsonSchemaHint(task)`.
3. **5 Structured Career Tasks (`CareerIntelligencePort`):**
   - `experience_extraction` (`temp: 0.0`)
   - `experience_matching` (`temp: 0.0`)
   - `hallucination_audit` (`temp: 0.0`)
   - `bullet_evaluation_and_rewrite` (`temp: 0.0`, Header A for complete metrics vs. Header B for partial evidence)
   - `executive_summary_synthesis` (`temp: 0.2`, paired with `findUnverifiedSummaryNumbers` + automatic `hallucination_audit` check)

---

## 3. Memory, Swapping & Limits

- **Sequential GPU Execution:** `mlx_server.py` wraps Metal inference and model swaps in an `asyncio.Lock()` (`parallelRecommended: 1`).
- **Hot Swapping:** Selecting another model in Settings calls `POST /v1/cevin/select-model`, clears the active model and `mx.metal.clear_cache()`, and loads the new model into unified memory.
- **Context Budget:** Requests are capped at `maxSeqLength: 1024`. Job descriptions and Experience Bank subsets are pre-filtered in TypeScript before calling the model.
- **Truthfulness Safety Net:** Every generated bullet, summary, and cover letter block passes through deterministic sanitization, 6 domain validators, a 1-shot targeted repair call, and a deterministic fallback that keeps verified wording if validation still fails.

---

## 4. Benchmarks

> **No live Apple Silicon hardware benchmark numbers are published yet.**
> The existing `docs/bench/README.md` report was generated under deterministic simulation (`--provider mock`) rather than measured on physical Apple Silicon hardware. To measure live speed on your own Mac with `mlx_server.py` running, run:
> ```bash
> npm run bench:llm -- --model Qwen2.5-1.5B-Instruct-4bit
> ```
> Or use **Settings → Performance → Measure speed (~15s)** inside the app.
