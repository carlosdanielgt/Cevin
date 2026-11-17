# Contributing to Cevin

Thank you for contributing to Cevin. This guide covers local development, architecture rules, tests, benchmarks, and visual asset scripts.

---

## 1. Local Development Setup

### Prerequisites
- **Node.js 20+** and `npm`
- **Python 3.10+** (optional; only needed to run `mlx_server.py` on an Apple Silicon Mac)
- **Docker with Docker Compose v2** (optional; for containerized production builds)

### Run the App Locally
```bash
npm ci
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in a desktop browser (`1024px` or wider).

To preview the production bundle on port `8080`:
```bash
npm run build
npm run preview
```

---

## 2. Docker Architecture (Host vs. Container)

Running `docker compose up -d --build` builds a two-stage image (`Dockerfile`):
1. **Stage 1 (`node:22-alpine`):** Installs npm dependencies and runs `npm run build` into `dist/`.
2. **Stage 2 (`nginxinc/nginx-unprivileged:alpine`):** Serves the compiled static bundle on port **`8080`**.

Two important consequences:
- **Run `npm` commands on your host machine, not inside the container.** The runtime container has only Nginx and static assets—Node.js and `npm` are not installed there.
- **Run `mlx_server.py` directly on your host Mac.** Linux Docker containers cannot access macOS Metal / Apple Silicon unified memory. When using Docker on macOS, the browser loads Cevin from `http://localhost:8080` and connects to `http://localhost:8000` on your Mac.

---

## 3. Repository Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run dev` | `vite --port=3000 --host=0.0.0.0` | Start the Vite dev server on port 3000 |
| `npm run build` | `vite build` | Build the production SPA bundle into `dist/` |
| `npm run preview` | `vite preview --port=8080 --host=0.0.0.0` | Serve the production build on port 8080 |
| `npm run typecheck` | `tsc --noEmit` | Run strict TypeScript typechecking |
| `npm run lint` | `tsc --noEmit && tsx scripts/lint-architecture.ts` | Check types, hexagonal boundaries, single CSS file, no-`any`, and zero inline styles |
| `npm run test` | `tsx --test src/tests/cevin.test.ts` | Run domain unit tests, adapter contracts, calibration, migrations, and copy guards |
| `npm run test:parity` | `tsx scripts/test-parity.ts` | Verify 100% text, layout, and coordinate parity across PDF and Word (`.docx`) exports |
| `npm run test:golden` | `tsx scripts/test-golden.ts` | Rasterize PDF templates and enforce `< 0.1%` pixel diff against golden PNGs (`-u` updates) |
| `npm run check` | `npm run typecheck && npm run lint && npm run test` | Run typecheck, architecture lint, and unit/integration tests together |
| `npm run test:live-llm` | `tsx scripts/test-live-model.ts` | Smoke-test a live `mlx_server.py` on port 8000 (`-- --record` updates recorded fixtures) |
| `npm run bench:llm` | `tsx scripts/bench-llm.ts` | Benchmark 20 bullets, 5 job descriptions, and 3 cover letters (`--provider mock` for simulation) |
| `npm run screenshots` | `tsx scripts/capture-screenshots.ts` | Capture light/dark screens at `1440×900` and `2560×1440` into `docs/screenshots/` |
| `npm run demo-gif` | `tsx scripts/capture-demo-gif.ts` | Record an interactive demo GIF into `docs/assets/demo.gif` |
| `npm run validate:sample-data` | `tsx scripts/validate-sample-data.ts` | Validate schemas and PII rules on `data/sample/cevin_sample.jsonl` |
| `npm run check:repo` | `tsx scripts/check-repo.ts` | Check Markdown links, anchors, image sizes, README budget, PII, and forbidden terms |

---

## 4. Verification Before Opening a PR

Run the full host verification suite:
```bash
npm run check
npm run test:parity
npm run validate:sample-data
npm run check:repo
```

If you modified PDF layout, typography, templates, or alignment, also run golden raster verification against a running preview or dev server:
```bash
npm run test:golden
```

If you have an Apple Silicon Mac running `mlx_server.py` on port `8000`, run the live harness check:
```bash
npm run test:live-llm
```

### Enable the Weight & Dataset Pre-Commit Guard
To prevent accidentally staging model weights (`.safetensors`, `.bin`, `.gguf`, `cevin-*-4bit-fused/`) or private JSONL datasets:
```bash
git config core.hooksPath .githooks
```

---

## 5. Architecture & Extending Cevin

Cevin uses a strict **Hexagonal Architecture (Ports and Adapters)**:
- **`src/core/domain/`** — Pure TypeScript rules, Zod schemas, scoring, PDF layout engine, Word `.docx` generator, and truth validators. Imports nothing else in the repo.
- **`src/core/application/`** — Use cases, narrow LLM tasks, prompt builders, and `LlmGateway`. Imports `core/domain` only.
- **`src/adapters/driven/`** — MLX FastAPI adapter, Demo mode adapter, IndexedDB (`Dexie`) storage, importers, and exporters.
- **`src/adapters/driving/web/`** — React UI and design system (`src/index.css` only; zero inline `style={...}`).

See these guides before making deeper changes:
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/LLM_HARNESS.md`](docs/LLM_HARNESS.md)
- [`docs/EXTENDING.md`](docs/EXTENDING.md)
- [`docs/SCORING.md`](docs/SCORING.md)
- [`docs/DECISIONS.md`](docs/DECISIONS.md)
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)
