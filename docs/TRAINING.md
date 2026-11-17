# Fine-Tuning Recipe (`docs/TRAINING.md`)

> **Status:** Cevin's fine-tuned weights and private training scripts are not included in this repository. This document records the verified prompt/model configuration encoded in Cevin's runtime harness, with unverified original training parameters marked explicitly for the owner to fill in.

---

## 1. Verified Configuration in Code

| Parameter | `Cevin 1.5B` | `Cevin 3B` | Source in Repo |
| :--- | :--- | :--- | :--- |
| **Base Model** | `Qwen2.5-1.5B-Instruct-4bit` (`mlx-community`) | `Qwen2.5-3B-Instruct-4bit` (`mlx-community`) | `src/adapters/driven/llm/profiles.ts` |
| **Runtime Output Directory** | `./cevin-1.5b-4bit-fused` | `./cevin-3b-4bit-fused` | `mlx_server.py`, `careerIntelligence.ts` |
| **Fine-Tuning Framework** | Apple `mlx-lm` LoRA | Apple `mlx-lm` LoRA | `profiles.ts` |
| **LoRA Rank** | `32` | `[to be filled by the owner]` | `profiles.ts` (`Rank-32 LoRA`) |
| **LoRA Layers / Targets** | `[to be filled by the owner]` | All linear layers (`profiles.ts`) | `profiles.ts` |
| **Prompt Loss Masking** | `mask_prompt: true` | `mask_prompt: true` | `profiles.ts`, `docs/LLM_HARNESS.md` |
| **Max Sequence Length** | `1024` tokens | `1024` tokens | `mlx_server.py`, `profiles.ts` |
| **Chat Template** | `tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)` | Same | `mlx_server.py` |
| **Post-Training Format** | Fused 4-bit MLX directory (`--de-quantize` + fuse / 4-bit) | Fused 4-bit MLX directory | `mlx_server.py` |

---

## 2. Hyperparameters, Hardware & Duration

The following parameters from the owner's training run are not stored in the repository and must be filled in before reproducing exact checkpoints:

- **Learning rate & scheduler:** `[to be filled by the owner]`
- **Batch size & gradient accumulation steps:** `[to be filled by the owner]`
- **LoRA alpha & dropout:** `[to be filled by the owner]`
- **Training iterations / epochs:** `[to be filled by the owner]`
- **Validation split & evaluation cadence:** `[to be filled by the owner]`
- **Random seed:** `[to be filled by the owner]`
- **Hardware used (Apple Silicon chip & unified RAM):** `[to be filled by the owner]`
- **Wall-clock training duration:** `[to be filled by the owner]`
- **`mlx-lm` package version:** `[to be filled by the owner]`

---

## 3. Reproducing Locally with Sample Data (`mlx-lm`)

You can verify the end-to-end LoRA training format on the 50 synthetic examples in `data/sample/cevin_sample.jsonl` using standard `mlx-lm` commands (replace hyperparameters with your own values):

1. **Create a Python environment:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install mlx-lm
   ```
2. **Prepare `train.jsonl` and `valid.jsonl`:**
   Split your JSONL dataset (such as `data/sample/cevin_sample.jsonl` for smoke-testing the pipeline) into `train.jsonl` and `valid.jsonl`.
3. **Train LoRA adapters with `mask_prompt`:**
   ```bash
   python -m mlx_lm.lora \
     --model mlx-community/Qwen2.5-1.5B-Instruct-4bit \
     --train \
     --data ./your-data-dir \
     --max-seq-length 1024 \
     --mask-prompt \
     --adapter-path ./adapters-1.5b
   ```
   *(Pass your chosen `--iters`, `--batch-size`, `--learning-rate`, `--seed`, and LoRA config YAML as needed.)*
4. **Fuse and export 4-bit weights for `mlx_server.py`:**
   ```bash
   python -m mlx_lm.fuse \
     --model mlx-community/Qwen2.5-1.5B-Instruct-4bit \
     --adapter-path ./adapters-1.5b \
     --save-path ./cevin-1.5b-4bit-fused \
     --de-quantize
   ```
   *(If re-quantizing to 4-bit after fusing, see `mlx_lm.convert --quantize --q-bits 4`.)*
5. **Serve locally:**
   ```bash
   uvicorn mlx_server:app --host 127.0.0.1 --port 8000
   ```
