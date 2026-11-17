# Dataset Card (`docs/DATASET.md`)

> **Status:** Cevin's full training dataset is private and **not public**. A **50-example synthetic sample dataset** using the exact production chat schema is provided in [`data/sample/cevin_sample.jsonl`](../data/sample/cevin_sample.jsonl).

---

## 1. Overview & Purpose

The dataset trains small 4-bit Apple Silicon language models (`1.5B` and `3B`) to perform strict, evidence-grounded career tasks without fabricating companies, tools, dates, or quantitative metrics. Both fine-tuned models share the exact same dataset format.

---

## 2. Chat JSONL Format

Each line in the JSONL file contains three messages rendered via the Qwen2.5 chat template (`mask_prompt: true`, `max_seq_length: 1024`):

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are Cevin's specialized Career Intelligence Engine. You operate strictly on structured career evidence. Never invent metrics, technologies, or experience not grounded in the source data. Always respond in valid JSON."
    },
    {
      "role": "user",
      "content": "TASK: ..."
    },
    {
      "role": "assistant",
      "content": "{\"task\": \"...\", ...}"
    }
  ]
}
```

---

## 3. Task Mix & Key Order

The training schema covers 5 structured JSON tasks defined in `src/core/application/ports/outbound/careerIntelligence.ts`:

| Task ID | Assistant JSON Keys (Ordered) | Notes |
| :--- | :--- | :--- |
| `experience_extraction` | `task`, `evidence_quote`, `domain`, `company`, `role_context`, `timeframe`, `project`, `action`, `technologies`, `scale`, `impact` | Extracts structured records strictly from raw text. |
| `experience_matching` | `task`, `experience_id`, `direct_evidence`, `missing_evidence`, `reasoning`, `confidence`, `match_level` | Evaluates direct vs. partial (`related`) vs. gap evidence. |
| `hallucination_audit` | `task`, `violations`, `explanation`, `factual_consistency_score`, `verdict`, `corrected_bullet` | Flags invented metrics/tools and rewrites safely. |
| `bullet_evaluation_and_rewrite` | `task`, `critique`, `draft_scores`, `missing_evidence_questions`, `grounded_rewrite` | Uses **Header A** when `scale` and `impact` are present, or **Header B** when either is `null` (must ask follow-up questions instead of inventing numbers). |
| `executive_summary_synthesis` | `task`, `jd_sentiment_and_pain_point`, `ideal_candidate_archetype`, `selected_skills`, `omitted_jd_skills`, `verified_metrics_used`, `tailored_summary` | Paired at runtime with numeric verification + audit fallback. |

---

## 4. Synthetic Sample Dataset (`data/sample/`)

- **Path:** `data/sample/cevin_sample.jsonl`
- **Size:** 50 synthetic examples (10 per task; 5 Header A + 5 Header B for bullet evaluation/rewrite).
- **Contents:** 100% invented people, companies, metrics, and projects (`Elena Rostova`, `Vanguard Telemetry`, `Kestrel Pay`, etc.). Contains zero real personal data.
- **Validation command:**
  ```bash
  npm run validate:sample-data
  ```

---

## 5. Provenance, PII & Owner-Verified Metadata

The following details about the private production training dataset are **not present in this repository** and must be filled in by the maintainer before any dataset release:

- **Total training / validation / test example counts:** `[to be filled by the owner]`
- **Exact task distribution percentages:** `[to be filled by the owner]`
- **Dataset construction method & synthetic generator model (if any):** `[to be filled by the owner]`
- **Terms-of-service & redistribution review (if synthetic data used third-party LLMs):** `[to be filled by the owner]`
- **PII scrubbing & human audit procedure for private data:** `[to be filled by the owner]`
- **Dataset license:** `[to be filled by the owner]`
