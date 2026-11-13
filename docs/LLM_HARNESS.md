# Cevin LLM Harness (`cevin-3b-4bit-fused` on Apple Silicon MLX)

Cevin's LLM Harness (`src/core/domain/harness.ts`, `src/core/application/gateway.ts`, `src/core/application/tasks/`, and `src/adapters/driven/llm/profiles.ts`) is engineered so that Cevin's fine-tuned local model—**`cevin-3b-4bit-fused`** (`Qwen2.5-3B-Instruct-4bit` fused with LoRA weights) running via FastAPI (`mlx_server.py`) on Apple Silicon—delivers fast, grounded, zero-failure resume and cover-letter tailoring.

---

## 1. Hardware Constraints & Design Rule

On Apple Silicon unified memory:
- **Footprint:** `cevin-3b-4bit-fused` uses ~2.73 GB of unified memory with a `1024`-token maximum sequence length (`maxSeqLength: 1024`).
- **Sequential GPU execution:** Metal inference runs sequentially (`parallelRecommended: 1`) via an `asyncio.Lock()` in `mlx_server.py`.
- **Exact task schemas:** The model was fine-tuned with prompt-loss masking (`mask_prompt: true`) on exact `TASK:` headers and strict Chain-of-Thought JSON schemas (`_reasoning_trace`, `_fact_audit`, `_alignment_rationale`).

Therefore, Cevin's harness enforces:
> **Domain pre-filtering of job descriptions and Experience Bank slices to fit within 1,024 tokens, exact task schemas, 6 domain validators, 1-shot targeted repair, and content-addressed caching.**

### Target Budgets
| Budget | Target | How the Harness Achieves It |
| :--- | :--- | :--- |
| **Per-request sequence cap** | **≤ 1,024 tokens** (`maxSeqLength: 1024`) | Domain pre-processors strip HR boilerplate and pass only task-relevant Experience Bank items |
| **Decode speed** | **~32–36 tok/s** on Apple Silicon | 4-bit quantized MLX weights with zero CPU offload |
| **Unhandled JSON / validation errors** | **0** | Sanitizer + CoT JSON extractor + 6 validators + 1-shot targeted repair + deterministic baseline fallback |
| **Offline / Demo usability** | **100%** | Every task has a deterministic zero-token baseline in `src/core/domain/` |

---

## 2. Model Profiles (`profiles.ts`)

1. **Tuned Default (`cevin_3b_mlx` profile)**:
   - Model ID: `cevin-3b-4bit-fused`
   - `maxSeqLength: 1024`, `parallelRecommended: 1`, `isFineTunedCevin3B: true`, `fewShotStyle: 'zero-shot-cot'`.
   - Task-calibrated temperatures (`0.25` for bullet/summary/letter rewrites, `0.0` for JSON extraction/classification).
2. **Fallback Profile (`generic`)**:
   - Used for Demo mode (`mock`) or any custom OpenAI-compatible local endpoint.

---

## 3. Prompt & Domain Pre-Filtering Architecture

Every task in `src/core/application/tasks/index.ts` splits its messages into:
1. **`buildPrefixMessages(voice, profile)`**:
   - For `cevin_3b_mlx` (`isFineTunedCevin3B: true`), emits the exact system instruction and `TASK:` schema header the model was trained on without redundant few-shot turns.
2. **`buildSuffixMessage(input)`**:
   - Contains only the specific item's verified facts (`action`, `result`, `metric`, `tools`, and matched job keywords) in `<= 200` tokens.
3. **Chain-of-Thought JSON Parsing (`mlxFastApi.ts` & `tasks/index.ts`)**:
   - Extracts the target prose or structured fields while discarding internal reasoning keys (`_reasoning_trace`, `_fact_audit`, `_alignment_rationale`).

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
