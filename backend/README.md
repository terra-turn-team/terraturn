# TerraTurn API

FastAPI + SQLAlchemy. Runs on SQLite locally and PostgreSQL in production (`DATABASE_URL`).

The data layer (`app/database.py`, `app/db_models.py`: `users`, `properties`, `crop_histories`) builds on the
`terraturnAPI` work by Gabriela and Calebe. The routes, Argon2id password hashing and cookie sessions come from the
PWA v0.2 backend.

## Run locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then set JWT_SECRET
uvicorn app.main:app --reload
```

Docs at http://localhost:8000/docs. The front (`npm run dev`) proxies `/api` to port 8000.

Generate `JWT_SECRET` with `python -c "import secrets;print(secrets.token_urlsafe(48))"`.

## Tests

```bash
python -m pytest -q
```

## Environment

| Variable | Production value |
|---|---|
| `DATABASE_URL` | Postgres URL (`postgres://...` is accepted) |
| `JWT_SECRET` | 48+ random characters |
| `FRONTEND_ORIGIN` | `https://terraturn.work,https://www.terraturn.work` |
| `COOKIE_SECURE` | `true` |
| `PASSWORD_RESET_ENABLED` | `false` until real SMTP is configured |
| `SMTP_*`, `EMAIL_FROM` | real SMTP, if reset is enabled |

## Endpoints (`/api/v1`)

`health`, `status` · `auth/register|login|logout|me|forgot-password|reset-password` ·
`farms` (CRUD) · `farms/{id}/history` (GET/PUT, crop rotation by season) ·
`locations/countries|states|cities` · `geocode/reverse|search` · `privacy/export|account` ·
`ai/studies` (501 until the AI module is connected).

## How the front reaches the API

The Cloudflare Worker (`frontend/worker/index.ts`) forwards `/api/*` to the URL in the Worker variable
`API_ORIGIN` (for example `https://terraturn-api.onrender.com`). Same domain, so the session cookie works.

## Brazilian states and cities

Served from `app/br_locations.json` (27 states, 5,571 municipalities with IBGE codes), so the form works even when
the IBGE API is unreachable from the server. Data: IBGE codes via
[kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) (MIT).
