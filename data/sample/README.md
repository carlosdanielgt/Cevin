# Synthetic Sample Dataset (`data/sample/`)

This folder contains **50 synthetic, fictional training examples** in Cevin's chat-formatted JSONL structure (`cevin_sample.jsonl`).

## What Is Included
- **All 5 structured career tasks (10 examples each):**
  1. `experience_extraction`
  2. `experience_matching`
  3. `hallucination_audit`
  4. `bullet_evaluation_and_rewrite` (5 complete-evidence Header A + 5 partial-evidence Header B)
  5. `executive_summary_synthesis`
- **Zero personal data:** Every person, company, metric, and project is synthetic and invented for schema demonstration only.
- **Note:** The full training dataset used for Cevin's fine-tuned models is private and not distributed in this repository.

## Validate Locally

```bash
npm run validate:sample-data
```
