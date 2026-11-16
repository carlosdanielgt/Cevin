# Cevin — Local-First Resume & Cover Letter Tailoring Studio

## 1. What Cevin Is
Cevin helps you evaluate job postings and tailor your resume and cover letter from one central **Experience Bank** of verified roles, achievements, and skills. Run a **Quick check** (`⌘N`) on any job posting to inspect **Practical fit** (location, work permits, languages, salary, employment type) and **Coverage** (`Needs attention` gaps/partials vs. `Covered` evidence) before you invest time tailoring. In Studio, shape your prose with a 5-stop **Voice knob**, audit deterministic **Job match**, **Recruiter appeal** (with **Skim view**), **ATS readiness**, and **Letter appeal** (`Checks n/6`), and export clean `First_Last_Company_Resume.pdf`, Word (`.docx`), Markdown, or Plain Text documents. Everything runs locally in your browser against your integrated fine-tuned Apple MLX models (**`Qwen2.5-1.5B-Instruct-4bit`** default and **`cevin-3b-4bit-fused`** via FastAPI) or built-in **Demo mode** with zero telemetry.

See [`docs/SCORING.md`](docs/SCORING.md) for a full breakdown of how Job match, Recruiter appeal, ATS readiness, and Practical fit are calculated.

![Cevin Applications Screen](docs/screenshots/01-applications-list-light-1440x900.png)

---

## 2. Requirements
- **Option A (Docker, recommended):** Docker Engine with Docker Compose v2.
- **Option B (Local Node.js):** Node.js 20+ and npm.
- **Local AI Model (optional for Demo mode):** Apple Silicon Mac with Python 3.10+ (`mlx-lm`, `fastapi`, `uvicorn`) running `mlx_server.py` on port `8000`.

---

## 3. Quick Start (Docker, Recommended)

```bash
git clone <your-repo-url> cevin
cd cevin
docker compose up -d --build
```

Open **[http://localhost:8080](http://localhost:8080)** in a desktop browser (1024px+ width; designed for 1440px–2560px monitors).

- **Stop Cevin:**
  ```bash
  docker compose down
  ```
- **Update and rebuild after pulling changes:**
  ```bash
  git pull
  docker compose up -d --build
  ```

### What runs inside the Docker container?

The Docker container (`cevin`) is a lightweight production image using **`nginxinc/nginx-unprivileged:alpine`** that serves the compiled static Single Page Application (HTML, JS, CSS, PDF engine fonts) on port **8080**.

- **Why doesn't `docker exec -it cevin-cevin-1 npm ...` work?**
  The runtime container does **not** have Node.js or `npm` installed. It only contains the minimal Nginx binary and static assets in `/usr/share/nginx/html`. Node.js and `npm` are only used during Stage 1 (`FROM node:22-alpine AS builder`) to compile the app into static files, then discarded.
- **Where should you run `npm` commands or tests?**
  Run them on your **host machine** (outside Docker), where Node.js is installed:
  ```bash
  npm test
  npm run test:live-llm
  npm run test:live-llm -- --record
  ```
- **Where does the Cevin MLX model run?**
  The AI service (`mlx_server.py`) runs directly on your **host Mac** (outside Docker) because Docker Linux containers cannot access macOS Metal / Apple Silicon unified memory acceleration. Your browser loads the web app from `http://localhost:8080` (or `http://localhost:3000` in dev) and connects directly to `http://localhost:8000` on your host Mac, or runs in built-in **Demo mode** with zero configuration.

---

## 4. Run with npm

```bash
npm ci
npm run dev
```

- **Production build & preview on port 8080:**
  ```bash
  npm run build
  npm run preview
  ```

---

## 5. Start the Cevin Model (Apple Silicon MLX)

`mlx_server.py` serves both integrated local models from the repository root (`./cevin-1.5b-4bit-fused` by default, and `./cevin-3b-4bit-fused` on demand when selected in Settings):

1. **Create and activate a Python virtual environment (first time):**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install mlx-lm fastapi uvicorn pydantic
   ```
2. **Start the local FastAPI inference server on port 8000:**
   ```bash
   source .venv/bin/activate && uvicorn mlx_server:app --host 127.0.0.1 --port 8000
   ```
3. **Verify the model service is ready:**
   ```bash
   curl http://localhost:8000/v1/models
   ```
4. **Connect & switch models in Settings:**
   Open Cevin → **Settings → AI connection** → select **Cevin model (on this Mac)** → choose **Qwen2.5 1.5B Fine-Tuned (4-bit)** (default, ~1.2 GB RAM) or **Cevin 3B Fine-Tuned (4-bit)** (~2.7 GB RAM). The server unloads the previous model from unified memory automatically when you switch.

---

## 6. First-Run Walkthrough in 3 Steps

1. **Connect the model (or use Demo mode):** Start `mlx_server.py` on port `8000` and test the connection, or switch to **Demo mode**.
2. **Add your experience:** Open **Experience Bank** and click **Import resume** (`.md` or `.pdf`) to review extracted roles and achievements side-by-side before adding them, or load the sample workspace.
3. **Create your first application:** Click **+ New application** in the sidebar (`⌘N`), paste the job posting in **1 Job**, tailor bullets in **2 Build** (or switch to **Cover letter** → **2 Write**), and export PDF, Word (`.docx`), Markdown, or Plain text in **3 Review**.

---

## 7. Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run dev` | `vite --port=3000 --host=0.0.0.0` | Starts the Vite development server |
| `npm run build` | `vite build` | Builds the production SPA bundle into `dist/` |
| `npm run preview` | `vite preview --port=8080 --host=0.0.0.0` | Serves the production build on port 8080 |
| `npm run typecheck` | `tsc --noEmit` | Runs strict TypeScript typechecking |
| `npm run lint` | `tsc --noEmit && tsx scripts/lint-architecture.ts` | Enforces TypeScript, hexagonal boundaries, single CSS file, no-any, and zero inline styles |
| `npm run test` | `tsx --test src/tests/cevin.test.ts` | Runs domain unit tests, adapter contract suites, migrations, E2E smoke test, calibration curves, and UI copy scanner |
| `npm run test:parity` | `tsx scripts/test-parity.ts` | Verifies 100% content, typography, and coordinate parity between `ResumeDocument`/`CoverLetterDocument`, PDF bytes, and Word `.docx` files |
| `npm run test:golden` | `tsx scripts/test-golden.ts` | Renders golden PDF rasters across all 3 templates (`classic`, `modern`, `compact`) and alignment modes (`left`, `justify`) and asserts `< 0.1%` pixel diff (`-u` updates baselines) |
| `npm run check` | `npm run typecheck && npm run lint && npm run test` | Runs all verification checks in one command |
| `npm run bench:llm` | `tsx scripts/bench-llm.ts` | Runs the golden LLM harness benchmark (20 bullets, 5 JDs, 3 letters) and writes `docs/bench/latest-report.json` |
| `npm run screenshots` | `tsx scripts/capture-screenshots.ts` | Captures light/dark application screens at `1440×900` and `2560×1440` into `docs/screenshots/` |

---

## 8. Performance on Apple Silicon (`Qwen2.5-1.5B-Instruct-4bit` & `cevin-3b-4bit-fused`)

Cevin's LLM harness (see [`docs/LLM_HARNESS.md`](docs/LLM_HARNESS.md)) integrates both fine-tuned local Apple Silicon MLX models using unified `CEVIN_MLX_SYSTEM_PROMPT` + `TASK:` Chain-of-Thought prompts (`mask_prompt: true`, `1024`-token sequence cap):
- **Default (`Qwen2.5-1.5B-Instruct-4bit`):** ~1.15 GB unified memory, Rank-32 LoRA fine-tuned on the exact Cevin dataset for fast everyday tailoring.
- **Higher-Capacity Option (`cevin-3b-4bit-fused`):** ~2.73 GB unified memory, Qwen2.5-3B LoRA weights fine-tuned on the exact same Cevin dataset.
- **In-App Calibration:** Open **Settings → Performance** and click **Measure speed** to record your Mac's reading speed (prefill), writing speed (decode), and response cache statistics.

### Troubleshooting Local Model Connection

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| Sidebar pill shows **`Can't reach the model`** | `mlx_server.py` is not running on port `8000` | Run `source .venv/bin/activate && uvicorn mlx_server:app --host 127.0.0.1 --port 8000` in the repo root, then click **Test connection**, or click **Use demo mode**. |
| Bullet shows **`Original wording kept`** badge | Model output failed a truthfulness validator twice (e.g., altered a metric) | Cevin kept your verified Bank wording. Click **Rewrite** or edit the bullet inline. |

---

## 9. True WYSIWYG, Scalable Job Facts & Privacy ("Desk, Paper & Ink")
- **True WYSIWYG ("The preview is the PDF"):** A single domain mapper (`mapToResumeDocument` / `mapToCoverLetterDocument`) feeds the embedded-font PDF engine (`Plus Jakarta Sans` + `Fraunces` static TrueType subsets). `PdfPreview` renders the exact `Uint8Array` PDF bytes onto `<canvas>` via `pdfjs-dist` with an SVG `PreviewOverlay` for Skim view, keyword cross-highlighting, and hovered-bullet bounding boxes (`locateBlocks`). Clicking **Export PDF** downloads those exact bytes (`PDF · 1 page · 48 KB`).
- **Word Document (`.docx`) Export:** `renderDocumentToDocxBlob` generates a standards-compliant OpenXML `.docx` archive with real Word paragraph styles (`Heading1`, `Heading2`, `ListBullet`, `Normal`), `word/fontTable.xml` font fallbacks, right-aligned tab stops for dates, and 100% text parity with `documentToPlainText`.
- **100% Local Client-Browser Storage:** All Experience Bank items, job descriptions, applications, saved resume/cover-letter versions (including stored `pdfBytes`), and cached LLM results stay inside your browser's local IndexedDB (`cevin_local_studio_db`, schema v7 via Dexie). Nothing is ever uploaded to an external database or server. Released under the Apache-2.0 License.
