# BalanceRehab

Low-cost rehabilitation-support prototype for functional balance assessment.

## Current Skeleton

- FastAPI backend with SQLite setup
- React + Tailwind frontend shell
- Demo-first acquisition architecture
- Session/report schema fields for `demo` vs `real` acquisition modes
- Placeholder pages for the approved MVP workflow

## Local Run

In this workspace, ports `8000`, `5173`, and `5174` are already used by another local app, so the verified skeleton runs on:

```powershell
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5199 --strictPort
```

Then open:

```text
http://127.0.0.1:5199
```

The API health check is:

```text
http://127.0.0.1:8010/api/health
```
