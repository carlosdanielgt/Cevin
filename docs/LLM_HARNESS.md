# Cevin LLM Harness (`llama3.1:8b` on Apple Silicon M1 16GB)

Cevin's LLM Harness (`src/core/domain/harness.ts`, `src/core/application/gateway.ts`, `src/core/application/tasks/`, and `src/adapters/driven/llm/profiles.ts`) is engineered specifically so that a single small local model—**`llama3.1:8b`** running in Ollama on an Apple Silicon M1 with 16 GB unified memory (~11 GB GPU-addressable, 68 GB/s memory bandwidth)—delivers fast, grounded, zero-failure resume and cover-letter tailoring.

---

## 1. Hardware Constraints & Design Rule

On an M1 16 GB machine:
- **Decode speed** is strictly memory-bandwidth-bound (~25–34 tokens/sec for Q4_K_M 8B weights).
- **Prefill speed** (~160–240 tokens/sec) becomes the dominant latency bottleneck if prompts are long or if the KV prefix cache is invalidated between calls.
- **Model reloads** happen automatically in Ollama whenever `num_ctx` changes between requests, costing 2–4 seconds of disk/memory stall.

Therefore, Cevin's harness enforces a single engineering rule:
> **Fewer tokens in, fewer tokens out, narrower jobs, constant `num_ctx`, and aggressive KV prefix + content-addressed caching.**

### Target Budgets
| Budget | Target | How the Harness Achieves It |
| :--- | :--- | :--- |
| **First bullet visible** | **3–5 s** after click (warm prefix) | Background `warmPrefix` on app/Studio entry + 3-turn few-shot prefix reuse |
| **8 bullets rewritten** | **~18–20 s** | 2 parallel slots (`parallelRecommended: 2`) + plain single-sentence outputs (`maxOutputTokens: 85`) |
| **Per-slot context cap** | **≤ 4,096 tokens** (`numCtx: 4096`) | Constant `num_ctx: 4096` across all 5 tasks; never triggers an Ollama model reload |
| **Unhandled JSON / validation errors** | **0** | Plain-text generation for prose tasks + sanitizer + 6 validators + 1-shot targeted repair + deterministic baseline fallback |
| **Offline / Demo usability** | **100%** | Every task has a deterministic zero-token baseline in `src/core/domain/` |

---

## 2. Single-Model Policy (`llama3.1:8b`)

1. **Tuned Default (`llama3_1_8b` profile)**:
   - Recommended command in Settings: `ollama pull llama3.1:8b`
   - Constant `numCtx: 4096` per slot, `parallelRecommended: 2` (`numCtx * 2 = 8192` total KV allocation, fitting comfortably inside ~6.3 GB VRAM alongside 4.7 GB Q4 weights).
   - Task-calibrated temperatures (`0.25` for bullet/letter rewrites, `0.0` for JSON classification) and `stop: ['\n']` on single-line bullet tasks.
   - `fewShotStyle: 'chat-turns'` so Llama 3.1's instruct template sees real `user`/`assistant` turns rather than a monolithic system wall of text.
2. **Fallback Profile (`generic_small`)**:
   - Any other installed model runs under `generic_small` with a gentle note in Settings: *"Cevin is tuned for llama3.1:8b."*
   - Cevin never alternates between multiple chat models within a session, preventing model-swap thrashing.
3. **Optional Embeddings (`Smarter matching`)**:
   - Lexical + canonical alias matching (`src/core/domain/matching.ts`) is the default.
   - Embeddings (`nomic-embed-text`, ~270 MB) are an opt-in toggle under **Settings → Performance → Advanced**.

---

## 3. Prompt & KV Prefix Architecture

Every task in `src/core/application/tasks/index.ts` splits its messages into:
1. **`buildPrefixMessages(voice, profile)`**:
   - **Byte-identical across all items** for a given `(task, voice)`.
   - Contains the compact system instruction (`<= 120` tokens) plus 3 calibration example pairs formatted as alternating `user` / `assistant` chat turns (`<= 220` tokens).
   - Because the prefix is identical across all 8 bullets in a resume build, Ollama reuses the prefilled KV cache for the prefix on every subsequent bullet.
2. **`buildSuffixMessage(input)`**:
   - Contains only the specific item's facts (`action`, `result`, `metric`, `tools`, and matched job keywords) in `<= 160` tokens.
3. **Plain Single-Sentence Output for Prose Tasks**:
   - `rewriteBullet`, `writeSummary`, and `writeLetterBlock` output plain text—never JSON-wrapped prose—saving ~25% output tokens and eliminating JSON-escaping failures on quotes and percentages.

---

## 4. Sanitizer, 6 Validators, 1-Shot Repair, and Baseline Fallback

Every LLM output passes through a deterministic 4-stage pipeline in `LlmGateway.runTask`:

```text
Raw LLM Output
   │
   ▼
1. sanitizeLlmOutput()       Strips "Here is the rewritten bullet:", quotes, fences, bullet glyphs, trailing notes
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
   - `applyVoiceLexiconPass` swaps verbs and strips formulaic phrasing immediately so the user sees instant visual feedback and a brief row highlight, accompanied by an **ETA chip** (`"about 18 s for 6 bullets"`).
2. **Stage 2 — Progressive Queued Refinement**:
   - `LlmGateway` cancels any superseded in-flight requests from the previous voice detent via `AbortController`, prioritizes visible bullets (`interactive` > `visible` > `background`), and streams completed bullets into the document one by one.
   - All results are stored in `ResultCache` (`cevin_local_studio_db.resultCache`, LRU up to 5,000 entries), so switching back to a previously visited Voice detent is instantaneous (`0 ms` LLM time).

---

## 6. Declared Harness Tasks (`HARNESS_TASK_CATALOG`)

| Task ID | Format | Max Input / Output Tokens | Temp | Validator & Fallback |
| :--- | :--- | :--- | :--- | :--- |
| `rewriteBullet` | Plain text | `≤ 380` in / `≤ 85` out | `0.25` | 6-validator suite + 1-shot repair → `assembleBullet()` |
| `writeSummary` | Plain text | `≤ 360` in / `≤ 95` out | `0.25` | Grounding + length + cliché lint → deterministic summary |
| `writeLetterBlock` (`v2.2`) | Plain text | `≤ 420` in / `≤ 140` out | `0.25` | Bans generic openers (*"I am writing to apply"*), requires concrete proof hook, omits fabricated *"because…"* when no mission/notes exist → `buildGroundedCoverLetterBlocks()` |
| `refineJobBrief` | JSON | `≤ 350` in / `≤ 120` out | `0.0` | Zod schema check → `extractDeterministicJobBrief()` |
| `classifyImportBlocks` | JSON | `≤ 400` in / `≤ 120` out | `0.0` | Zod schema check → rule-based section splitter |
| `extractJobFact` (`v1.0`) | JSON | `≤ 220` in / `≤ 80` out | `0.0` | Invoked **only** when EN/FR rules mark a snippet as `'review'`. Verifies allowed enum value + verbatim substring quote in the raw posting → rule baseline (`not-stated`). Salary is never sent to the LLM. User preferences never appear in any prompt. |

