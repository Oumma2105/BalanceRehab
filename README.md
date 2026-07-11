# BalanceRehab

Low-cost rehabilitation-support prototype for functional balance assessment.

## Stack

- **Backend** — FastAPI + SQLAlchemy + SQLite (`backend/`)
- **Frontend** — React + Vite + Tailwind CSS (`frontend/`)
- **Hardware** — ESP32 + 4 ultrasonic sensors under a balance board (`hardware/`), optional; the app works in webcam/demo mode without it

## Ports

The whole app uses exactly two ports:

| Service | URL |
|---|---|
| Frontend (Vite dev server) | http://127.0.0.1:5173 |
| Backend API (uvicorn) | http://127.0.0.1:8010 |

The frontend reads the API base URL from `VITE_API_BASE_URL` (defaults to `http://127.0.0.1:8010/api`).

## Local Run

One-time backend setup:

```powershell
cd backend
py -3 -m venv venv
venv\Scripts\python -m pip install -r requirements-dev.txt
```

Start the backend:

```powershell
cd backend
venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

Start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Then open http://127.0.0.1:5173 — API health check: http://127.0.0.1:8010/api/health

## Tests

```powershell
cd backend
venv\Scripts\python -m pytest tests -q
```

## Demo Data

Seed the SQLite database with synthetic patients/sessions via the Settings page in the app, or:

```powershell
curl -X POST http://127.0.0.1:8010/api/demo/seed
```
