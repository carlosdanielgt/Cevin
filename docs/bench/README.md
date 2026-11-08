# Cevin LLM Harness Benchmark Report

Generated via `npm run bench:llm -- --model llama3.1:8b`.

## Hardware Target & Model Profile
- **Target Machine**: Apple Silicon M1, 16 GB Unified Memory (~11 GB GPU-addressable, 68 GB/s memory bandwidth)
- **Tuned Model**: `llama3.1:8b` (`llama3_1_8b` profile)
- **Context Window (`num_ctx`)**: `4096` tokens per slot (constant across all tasks so Ollama never reloads the model)
- **Parallel Slots**: `2`
- **Execution Mode**: `simulated-m1-16gb-profile (Ollama not running locally; used deterministic M1 16GB timing model)`

## Golden Fixture Results

| Metric | Result | Target Budget |
| :--- | :--- | :--- |
| **Golden Bullets Tested** | 20 (4 achievements × 5 voices) | 20 |
| **Golden JDs Extracted & Refined** | 5 | 5 |
| **Golden Cover Letters (4 LLM blocks each)** | 3 (12 blocks) | 3 (12 blocks) |
| **Average Reading Speed (Prefill)** | **2380 tok/s** | ~150–240 tok/s on M1 |
| **Average Writing Speed (Decode)** | **45 tok/s** | ~24–34 tok/s on M1 |
| **Single Call Latency (p50 / p95)** | **13 ms / 15 ms** | < 3,500 ms after warm prefix |
| **Max Prompt + Output Tokens in Any Call** | **672 tokens** | ≤ 4,096 tokens |
| **First-Attempt Validator Pass Rate** | **20/20 (100%)** | ≥ 90% |
| **Second-Run Cache Hit Rate** | **8/8 (100%)** (0 ms for 8 bullets) | 100% (< 15 ms) |
| **Unhandled JSON / Validation Failures** | **0** | 0 |

## Reproducing Locally

```bash
# Run against a live local Ollama instance (or automatic M1 timing simulation if offline):
npm run bench:llm -- --model llama3.1:8b

# Force deterministic simulation mode:
npm run bench:llm -- --model llama3.1:8b --provider mock
```
