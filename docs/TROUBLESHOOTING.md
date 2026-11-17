# Troubleshooting (`docs/TROUBLESHOOTING.md`)

Common issues and verified fixes when running Cevin locally or with an Apple Silicon MLX model server.

---

## 1. Local AI Connection Issues

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| Sidebar badge shows **`Can't reach the model`** | `mlx_server.py` is not running on `http://localhost:8000`, or the URL in Settings differs | Start the server in your `.venv`: `source .venv/bin/activate && uvicorn mlx_server:app --host 127.0.0.1 --port 8000`, verify `curl http://localhost:8000/v1/models`, and click **Test connection** in **Settings → AI connection** (or click **Use demo mode**). |
| `health` check reports `"loaded": false` or `Model not loaded` | Fine-tuned folders (`./cevin-1.5b-4bit-fused` or `./cevin-3b-4bit-fused`) are missing on disk | Start with the public 4-bit MLX instruct model instead: `CEVIN_MODEL_PATH=mlx-community/Qwen2.5-1.5B-Instruct-4bit uvicorn mlx_server:app --host 127.0.0.1 --port 8000`, or switch to **Demo mode**. |
| Switching to `Cevin 3B` fails or runs slowly on 8 GB Macs | Insufficient free unified memory (~2.73 GB model + macOS overhead) | Switch back to the 1.5B model (`~1.15 GB` RAM), close heavy browser tabs, or unload idle models via `curl -X POST http://localhost:8000/v1/cevin/unload`. |
| First AI request takes several seconds after idle | Model weights cold-load or Metal shader compile on first run | Subsequent requests reuse the in-memory model and cached responses. Check **Settings → Performance → Measure speed (~15s)** to inspect read/write speeds. |

---

## 2. Writing & Verification Behavior

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| Bullet shows **`Original wording kept`** badge | The model output altered a number, dropped a metric, or added a tool not in your Experience Bank twice | Cevin protects your truthfulness by keeping your verified Bank wording. Click **Rewrite** to retry, or edit the bullet directly in **2 Build**. |
| Same stale rewrite returns after changing prompts | Cached response hit for identical model + voice + input | Click **Rewrite** (which bypasses the cache for a fresh variation) or click **Clear cache** in **Settings → Performance**. |
| Quick check shows **`Not stated`** for salary or work permit | The job posting omits those details | Cevin treats unknown facts honestly instead of guessing. Ask the recruiter during your initial screen. |

---

## 3. Docker, Browser & Data Issues

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `docker exec -it ... npm test` fails (`npm: not found`) | The Docker runtime container only runs `nginx-unprivileged` serving static files in `/usr/share/nginx/html` | Run all `npm` commands (`npm test`, `npm run check`, `npm run test:live-llm`) on your **host machine**, outside Docker. |
| Docker app (`localhost:8080`) cannot talk to MLX inside a container | Linux containers cannot access Apple Metal GPU | Run `uvicorn mlx_server:app --host 127.0.0.1 --port 8000` natively on your **host Mac**. Your browser connects from `localhost:8080` to `localhost:8000` directly. |
| App shows **"Desktop screen recommended (1024px+)"** | Browser window or viewport is narrower than `1024px` | Expand your browser window to `1024px` or wider (`1440px`–`2560px` recommended for side-by-side preview). |
| Moving to another browser or clearing browser site data | Data lives in your browser's local IndexedDB (`cevin_local_studio_db`) | Before clearing site data, open **Settings → Your data → Export backup (.json)**, then use **Import backup (.json)** to restore. |
