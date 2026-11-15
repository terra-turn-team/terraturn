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

## AI (rotation analysis and chat)

`app/ia/llm_v17.py` and `app/ia/tabela_culturas_oficial_v2.json` are the approved, frozen engine from the AI team
(56/56 rotation runs, 124/124 chat questions, 89% on the SAGE crop calendar). They are copied unchanged; `app/ia/motor.py`
loads them and `app/ia/service.py` adapts the app's farm to the engine.

- `POST /ai/studies {farm_id, language}` starts an analysis in the background; poll `GET /ai/studies/{id}`
  (stages: `downloading_nasa_data` or `nasa_data_cached`, `analyzing`, `complete`/`failed`).
- `GET /farms/{id}/studies/latest` returns the last analysis of a farm.
- `POST /ai/chat {message, farm_id, language, history}` answers free questions with the farm's NASA data.
- `GET /ai/status` tells whether the LLM key is configured.

Set `ANTHROPIC_API_KEY` on the server (never in the repo). Cost measured by the AI team: about US$ 0.006 and 30 s per
analysis, US$ 0.002 and 7 s per chat question. Daily limits per user: `AI_STUDIES_PER_DAY`, `AI_CHAT_PER_DAY`.

`app/ia/cache_demo/` holds NASA data (POWER, MODIS NDVI and ET) for the 9 demo farms, so they answer in seconds.
New areas are downloaded on the first analysis (a few minutes for MODIS) and kept in the `ia_file_cache` table.
