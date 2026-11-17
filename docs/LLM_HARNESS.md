# Cevin LLM Harness (`Cevin 1.5B`, `Cevin 3B` & Public 4-Bit MLX on Apple Silicon)

Cevin's LLM Harness (`src/core/domain/harness.ts`, `src/core/application/gateway.ts`, `src/core/application/tasks/`, and `src/adapters/driven/llm/profiles.ts`) integrates local 4-bit Apple Silicon MLX models served via FastAPI (`mlx_server.py`)—with **`Cevin 1.5B`** (`Qwen2.5-1.5B-Instruct-4bit` / `./cevin-1.5b-4bit-fused`) as default, **`Cevin 3B`** (`./cevin-3b-4bit-fused`) selectable in Settings, and **`base_instruct_mlx`** for public un-tuned 4-bit MLX instruct models (`CEVIN_MODEL_PATH=mlx-community/Qwen2.5-1.5B-Instruct-4bit`).

---

## 1. Hardware Constraints & Design Rule

On Apple Silicon unified memory:
- **Footprint & Local Directories:**
  - `Cevin 1.5B` (`Qwen2.5-1.5B-Instruct-4bit`, `./cevin-1.5b-4bit-fused`) uses ~1.15 GB of unified memory with `maxSeqLength: 1024`.
  - `Cevin 3B` (`cevin-3b-4bit-fused`, `./cevin-3b-4bit-fused`) uses ~2.73 GB of unified memory with `maxSeqLength: 1024`.
  - Note: Fine-tuned weights are not public yet; setting `CEVIN_MODEL_PATH=mlx-community/Qwen2.5-1.5B-Instruct-4bit` runs a public 4-bit MLX instruct model.
- **Sequential GPU execution & Hot Swapping:** Metal inference runs sequentially (`parallelRecommended: 1`) via an `asyncio.Lock()` in `mlx_server.py`. Switching models via `POST /v1/cevin/select-model` (or passing `model` in `/v1/cevin/infer`) cleanly unloads the prior model and clears the Metal cache before loading target weights.
- **Unified Fine-Tuned MLX Prompting vs. Public Base Fallback:**
  - Both fine-tuned `Cevin 1.5B` and `Cevin 3B` were fine-tuned on the exact same dataset with `mask_prompt: true` and `max_seq_length: 1024`. Both route through byte-identical `CEVIN_MLX_SYSTEM_PROMPT` and exact `TASK:` prompts with **zero** extra JSON schema injections and **zero** chat-turn few-shot examples (`fewShotStyle: 'inline'`).
  - Public un-tuned instruct models (`mlx-community/*`) resolve to `base_instruct_mlx` (`fewShotStyle: 'chat-turns'`) and receive explicit JSON key hints via `getUntunedJsonSchemaHint(task)`.

Therefore, Cevin's harness enforces:
> **Domain pre-filtering of job descriptions and Experience Bank slices to fit within 1,024 tokens, unified fine-tuned MLX prompting, 6 domain validators, 1-shot targeted repair, and content-addressed caching (keyed by model ID).**

### Target Budgets
| Budget | Target | How the Harness Achieves It |
| :--- | :--- | :--- |
| **Per-request sequence cap** | **≤ 1,024 tokens** (`maxSeqLength: 1024`) | Domain pre-processors strip HR boilerplate and pass only task-relevant Experience Bank items |
| **Unhandled JSON / validation errors** | **0** | Sanitizer + CoT JSON extractor + 6 validators + 1-shot targeted repair + deterministic baseline fallback |
| **Offline / Demo usability** | **100%** | Every task has a deterministic zero-token baseline in `src/core/domain/` |

---

## 2. Model Profiles (`profiles.ts`)

1. **Recommended Default (`qwen25_1_5b_mlx` — `Cevin 1.5B`):**
   - Model ID: `Qwen2.5-1.5B-Instruct-4bit` (~1.15 GB RAM)
   - `maxSeqLength: 1024`, `parallelRecommended: 1`, `disableRawPromptTrimming: true`, `fewShotStyle: 'inline'`.
2. **Higher-Capacity Option (`cevin_3b_mlx` — `Cevin 3B`):**
   - Model ID: `cevin-3b-4bit-fused` (~2.73 GB RAM)
   - `maxSeqLength: 1024`, `parallelRecommended: 1`, `disableRawPromptTrimming: true`, `fewShotStyle: 'inline'`.
3. **Public Base Instruct Fallback (`base_instruct_mlx`):**
   - Matches `mlx-community/*`; uses `fewShotStyle: 'chat-turns'` and appends explicit JSON key definitions in `mlxFastApi.ts`.
4. **Generic Fallback (`generic`):**
   - Used for any other user-specified model name; retains `fewShotStyle: 'chat-turns'` and raw prompt trimming.

---

## 3. Prompt & Domain Pre-Filtering Architecture

Every task in `src/core/application/tasks/index.ts` splits its messages into:
1. **`prefixMessages` & `fewShotStyle` Routing (`LlmGateway`):**
   - Both fine-tuned MLX profiles (`qwen25_1_5b_mlx` and `cevin_3b_mlx`) set `fewShotStyle: 'inline'`, so `LlmGateway` strips `user`/`assistant` few-shot turns and sends only the concise `system` instruction alongside the payload—leaving `chat-turns` few-shot examples isolated to `base_instruct_mlx` and `generic`.
2. **`buildSuffixMessage(input)`:**
   - Contains only the specific item's verified facts (`action`, `result`, `metric`, `tools`, and matched job keywords) in `<= 200` tokens.
3. **Model-Isolated Cache Keys (`ResultCache`):**
   - Every cached entry is keyed by `modelName` + `profile.id` + `taskId` + `voice` + `inputHash`, so switching models never serves stale outputs from another model.

---

## 4. Sanitizer, 6 Validators, 1-Shot Repair, and Baseline Fallback

Every LLM output passes through a deterministic 4-stage pipeline in `LlmGateway.runTask`:

```text
Raw LLM Output
   │
   ▼
1. sanitizeLlmOutput()       Strips conversational preambles, quotes, fences, bullet glyphs, and internal CoT keys
   │
   ▼
2. 6 Domain Validators       - numbers: normalized number multiset must equal source's (no dropped/invented metrics)
                             - protectedTerms: proper nouns/tools must exist in Bank item or allowed skills (rejects JD-only terms)
                             - lengthBand: word count within voice band
                             - startsWithPastVerb: first word is a past-tense action verb
                             - noFirstPerson: rejects I / me / my / we / our
                             - clicheLint: rejects banned clichés for active voice
   │
   ├─► Pass ──► Write to ResultCache & return
   │
   ▼ Fail (Attempt 1)
3. 1-Shot Targeted Repair    Appends assistant output + specific violation prompt (e.g. "Restore missing metric 38%")
   │
   ├─► Pass ──► Write to ResultCache & return (repaired: true)
   │
   ▼ Fail (Attempt 2)
4. Deterministic Baseline    Returns assembleBullet() / formatAchievementInVoice() with keptOriginalWording: true
```

---

## 5. Two-Stage Voice Dial & Priority Scheduling

When the user clicks a Voice detent (`Polished`, `Professional`, `Balanced`, `Natural`, `Plain-spoken`) in Studio:
1. **Stage 1 — Instant Deterministic Lexicon Pass (`< 10 ms`)**:
   - `applyVoiceLexiconPass` swaps verbs and strips formulaic phrasing immediately so the user sees instant visual feedback and a brief row highlight.
2. **Stage 2 — Progressive Queued Refinement**:
   - `LlmGateway` cancels any superseded in-flight requests from the previous voice detent via `AbortController`, prioritizes visible bullets (`interactive` > `visible` > `background`), and streams completed bullets into the document one by one.
   - All results are stored in `ResultCache` (`cevin_local_studio_db.resultCache`, LRU up to 5,000 entries), so switching back to a previously visited Voice detent is instantaneous (`0 ms` LLM time).

---

## 6. Declared Harness Tasks (`HARNESS_TASK_CATALOG`)

| Task ID | Format | Max Input / Output Tokens | Temp | Validator & Fallback |
| :--- | :--- | :--- | :--- | :--- |
| `rewriteBullet` | CoT JSON / Plain text | `≤ 380` in / `≤ 180` out | `0.25` | 6-validator suite + 1-shot repair → `assembleBullet()` |
| `writeSummary` | CoT JSON / Plain text | `≤ 360` in / `≤ 180` out | `0.25` | Grounding + length + cliché lint → deterministic summary |
| `writeLetterBlock` (`v2.2`) | CoT JSON / Plain text | `≤ 420` in / `≤ 220` out | `0.25` | Bans generic openers, requires concrete proof hook → `buildGroundedCoverLetterBlocks()` |
| `refineJobBrief` | JSON | `≤ 350` in / `≤ 220` out | `0.0` | Zod schema check → `extractDeterministicJobBrief()` |
| `classifyImportBlocks` | JSON | `≤ 400` in / `≤ 260` out | `0.0` | Zod schema check → rule-based section splitter |
| `extractJobFact` (`v1.0`) | JSON | `≤ 220` in / `≤ 120` out | `0.0` | Invoked **only** when EN/FR rules mark a snippet as `'review'`. Verifies allowed enum value + verbatim substring quote in the raw posting → rule baseline (`not-stated`). |
