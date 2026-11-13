# Cevin Scoring & Practical Fit Reference (`docs/SCORING.md`)

Cevin computes four distinct signals to help you evaluate a job posting and tailor your resume or cover letter:

1. **Job match (estimate)** — *Fit for the role* (`0–100`)
2. **Recruiter appeal (estimate)** — *10-second skim* (`0–100`) for resumes, or **Letter appeal (estimate)** (`0–100`) + **Checks `n/6`** for cover letters
3. **ATS readiness (estimate)** — *Machine read* (`0–100`)
4. **Practical fit** — *Your preferences vs. stated job facts* (`Fits` / `Conflict` / `Not stated`)

Every score is deterministic, reproducible, and runs locally in your browser in `< 15 ms` with zero LLM calls.

---

## 1. Design Principles

1. **Honest estimates, never hiring predictions.**
   - Every heuristic score is labeled **`estimate`** with a *"How this is calculated"* tooltip.
   - Scores reflect measurable properties of your document and Experience Bank against the job posting—they **never** predict hiring outcomes or claim to replicate a proprietary vendor algorithm.
2. **Quiet success, loud exceptions.**
   - Requirements that are already covered recede into a collapsible group (`Covered (n)`).
   - Missing requirements (`Gaps`), partial matches (`Partials`), and practical conflicts (`No visa sponsorship`, `3 days on-site in New York`) stand out at the top with actionable controls.
3. **Unknown is a first-class answer.**
   - When a job posting does not state salary, work mode, or sponsorship policy, Cevin reports **`Not stated`**—never a penalty or a guess.

---

## 2. Job Match (Estimate) — `"Fit for the role"` (`0–100`)

**What it measures (`src/core/domain/scoring.ts` & `src/core/domain/coverage/index.ts`):**
- **Must-have coverage (65% weight):** Share of non-dismissed must-have requirements from the job posting that are proven by your Experience Bank and present in your tailored draft (`covered` = `1.0`, `partial` = `0.5`, `gap` = `0.0`).
- **Nice-to-have coverage (20% weight):** Share of nice-to-have requirements covered in the draft.
- **Role & seniority alignment (15% weight):** Token and synonym overlap between your document's target headline / experience titles and the posting's role title.
- **Synonyms (`aliases`) vs. Adjacent Skills (`related`):** True synonyms (`JS`/`JavaScript`, `k8s`/`Kubernetes`, `Postgres`/`PostgreSQL`) count as `'covered'`. Related or adjacent skills (`JavaScript` ↔ `TypeScript`, `Kafka` ↔ `RabbitMQ`) produce `'partial'` coverage and never count as `'covered'`.

**Interactive Coverage Controls:**
- **Dismiss (`Not relevant`):** Marks a requirement as not relevant to this role, removing it from the denominator with an instant undo link (`"1 dismissed · Undo"`).
- **Quick-add (`I have this`):** Adds a skill you actually have (plus optional aliases and achievement attachment) directly to your Experience Bank and immediately rescores the application.

---

## 3. Recruiter Appeal (Estimate) — `"10-second skim"` (`0–100`)

**What it measures (`src/core/domain/appeal/index.ts`):**
Recruiter appeal models what a human reviewer notices during a 6–10 second initial pass across four weighted lenses (weights are shown in each lens tooltip, e.g., `"35% of Recruiter appeal"`):

| Lens | Weight | Sub-checks |
| :--- | :--- | :--- |
| **Skim** | **35%** | **Top-third fold** (`extractFirstThirdPageText` using PDF `PositionedText[]` coordinates when available, or template line metrics marked `"layout estimated"`): headline aligns with target role (`25`), `≥ 3` of top 5 must-have terms appear in the top third (`30`), `≥ 2` quantified outcomes appear in the top third (`25`), and recent roles lead with their strongest bullet (`20`). |
| **Proof** | **30%** | Share of bullets containing a concrete number/delta/unit (`40`, target `≥ 60%`), share of bullets pairing an action verb with a measurable outcome (`35`, target `≥ 75%`), and active verb variety with zero consecutive duplicate lead verbs (`25`). |
| **Clarity** | **20%** | Share of bullets within `12–28` words and `≤ 2` visual lines (`30`), bullet count per role (`2–5` for recent roles, `≤ 3` for roles older than 5 years, `25`), summary `≤ 60` words and `≤ 3` lines (`20`), consistent date formatting (`10`), and comfortable page density (`15`). |
| **Voice** | **15%** | Inverse of `machineMadeScore` (`60` pts: clichés, stacked adverbs, uniform sentence cadence) plus `40` pts for zero banned buzzwords (`synergized`, `spearheaded`, `world-class`, `passionate`). |

### Actionable Fixes on Lens Verdicts
Whenever any lens scores under `80` and has a corresponding actionable fix (for example, `"Trim long bullets"` when Clarity is below `80`), Cevin renders a one-click fix button directly next to that lens's verdict.

### Calibration Curves & 4 Reference Fixtures (`poor`, `average`, `good`, `gold`)
Every lens reserves its top ~10% (`90–100`) for a stretch criterion. Standard well-tailored drafts land in `78–92`, preventing premature `100` saturation.

`src/core/domain/appeal/index.ts` exports four deterministic calibration fixtures (`APPEAL_CALIBRATION_FIXTURES` for resumes and `LETTER_APPEAL_CALIBRATION_FIXTURES` for cover letters) verified in `npm test`:
- **`poor` (`< 55`):** Sparse, unquantified duties with generic openers and weak keyword alignment.
- **`average` (`55–75`):** Mixed bullets with partial quantification and moderate keyword coverage.
- **`good` (`75–90`):** Quantified action-outcome bullets aligned with target role requirements.
- **`gold` (`88–96`):** Strong top-third fold density, rich metrics with units and context (`p99 420→68 ms`), varied verbs, and zero machine-made clichés.

### Skim View, SVG Overlay & First-Impression Takeaway
- **Skim view toggle (preview toolbar):** Renders an SVG `PreviewOverlay` directly over the PDF.js `<canvas>` using `PositionedText[]` coordinates from the PDF engine, dimming non-anchor lines while highlighting skim anchors. Never alters exported PDFs.
- **First-impression takeaway (`TakeawayCard`):** Summarizes what a 10-second skim communicates and flags with `✓` or `!` whether the headline matches the target role.
- **Version Deltas (`DeltaChip`):** In Studio Review, each gauge displays a compact `+n` / `-n` delta chip directly underneath when compared against the **previous saved version** (`vs v2`), or hides the chip when the delta is zero or no prior version exists.

---

## 4. Letter Appeal (Estimate), Checks `n/6` & Quick Check Estimate Band

For cover letters (`src/core/domain/coverLetter.ts` & `src/core/domain/appeal/index.ts`), Cevin shows two complementary signals:
1. **Checks `n/6`** (always shown as a fraction, never `100`):
   - Concrete opening (no banned clichés like *"I am writing to apply"* or *"I'm excited to apply"*)
   - Specific company & role mention
   - `≥ 2` quantified proof points grounded in your Experience Bank
   - Target word-count band (`Short` 130–230w, `Standard` 220–360w, `Detailed` 330–470w)
   - Low `"I "` sentence-starter ratio (`≤ 35%`)
   - Human-sounding voice (low machine-made score)
2. **Letter appeal (estimate) (`0–100`)**:
   - Combines opening hook strength (`30%`), grounded proof specificity (`30%`), conciseness & paragraph rhythm (`20%`), and natural voice (`20%`) with stretch calibration (`poor` `< 55`, `average` `55–75`, `good` `75–90`, `gold` `88–96`).
3. **Quick Check Estimate Band (`Prospect` status):**
   - Because a `Prospect` has not yet been tailored, `evaluateQuickCheckPosting` caps its raw estimate at `95` and formats it as a **5-point band** (`"85–90"`, never `"100"`) inside a dashed `EstimateRing` labeled **`Est.`**

---

## 5. ATS Readiness (Estimate) — `"Machine read"` (`0–100`)

**What it measures (`src/core/domain/ats/engine.ts`):**
- **Keyword coverage (30%):** Exact and canonical-alias presence of job keywords across your Experience and Skills sections.
- **Structure & parseability (25%):** Standard section headings (`Summary`, `Experience`, `Skills`, `Projects`, `Education`), chronological date order, and 2-line clean contact block.
- **Content quality (20%):** Action-result bullet structure and absence of unverified claims.
- **Length & density (15%):** Clean 1–2 page fit without orphan lines.
- **Title alignment (10%):** Target headline alignment with the posting's role title.
- **PDF Round-Trip Verification:** Re-parses the generated PDF binary via `pdfjs-dist` to verify that selectable text, headings, contact info, and top-to-bottom reading order survive export intact.

---

## 6. Practical Fit & Scalable Salience Hierarchy (`Fits` / `Conflict` / `Not stated`)

**What it measures (`src/core/domain/jobfacts/index.ts` & `src/core/domain/jobfacts/registry.ts`):**
- Extracts structured **Job facts** from the posting (`workPermits`, `location`, `salary`, `employmentType`, `languages`, plus extensible registry kinds in `FACT_KIND_REGISTRY`).
- Each fact kind has a user-configurable `FactImportance` (`'dealbreaker' | 'important' | 'nice-to-know'`).
- Pure `deriveSalience(status, importance)` maps every evaluated fact to `'critical' | 'notable' | 'quiet'`:
  - `conflict` + `dealbreaker` → **`critical`**
  - `conflict` + `important` OR `not-stated` + `dealbreaker` → **`notable`**
  - Everything else → **`quiet`**
- **Fixed Attention Budgets per Surface:**
  - **Applications list row:** At most **1 `AttentionToken`** (`✕ Work permit` -> `! 3d office` -> `2 gaps`), with a single icon and short text.
  - **Applications detail:** **Score row always first** (`Job match`, `Appeal`, `ATS`, `Fit` on one tabular baseline), followed by a 1-line **`FitStrip`**.
  - **Job step, Quick check & expanded detail:** Dense **`JobFactsTable`** (`Needs a look` rows first, `Fits (n)` collapsed into a single summary line).
