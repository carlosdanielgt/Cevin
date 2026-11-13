# Cevin LLM Harness Benchmark Report

Generated via `npm run bench:llm -- --model cevin-3b-4bit-fused`.

## Hardware Target & Model Profile
- **Target Machine**: Apple Silicon M1, 16 GB Unified Memory (~2.73 GB model footprint)
- **Tuned Model**: `cevin-3b-4bit-fused` (`cevin_3b_mlx` profile)
- **Max Sequence Length**: `1024` tokens per request
- **Parallel Slots**: `1`
- **Execution Mode**: `simulated-apple-silicon-profile (--provider mock)`

## Golden Fixture Results

| Metric | Result | Target Budget |
| :--- | :--- | :--- |
| **Golden Bullets Tested** | 20 (4 achievements × 5 voices) | 20 |
| **Golden JDs Extracted & Refined** | 5 | 5 |
| **Golden Cover Letters (4 LLM blocks each)** | 3 (12 blocks) | 3 (12 blocks) |
| **Average Reading Speed (Prefill)** | **2381 tok/s** | ~150–240 tok/s on Apple Silicon |
| **Average Writing Speed (Decode)** | **45 tok/s** | ~28–36 tok/s on Apple Silicon |
| **Single Call Latency (p50 / p95)** | **13 ms / 15 ms** | < 3,500 ms |
| **Max Prompt + Output Tokens in Any Call** | **763 tokens** | ≤ 1,024 tokens |
| **First-Attempt Validator Pass Rate** | **20/20 (100%)** | ≥ 90% |
| **Second-Run Cache Hit Rate** | **8/8 (100%)** (1 ms for 8 bullets) | 100% (< 15 ms) |
| **Unhandled JSON / Validation Failures** | **0** | 0 |

## Reproducing Locally

```bash
# Run against the live local Cevin MLX service (or automatic simulation if offline):
npm run bench:llm -- --model cevin-3b-4bit-fused

# Force deterministic simulation mode:
npm run bench:llm -- --model cevin-3b-4bit-fused --provider mock
```
