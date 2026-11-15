# TerraTurn

**20 years of NASA data, one planting decision.**
TerraTurn is a mobile-first web app (PWA) that turns NASA climate and satellite data about a farmer's own field into a
crop-rotation and cover-crop plan they can read in a minute. Built for the NASA Space Apps Challenge 2026 (Field Shift).

**Live demo:** https://terraturn.work — opens a demo with 9 farms (Brazil, Argentina and the United States), no login needed.

## What it does

- **Map your field.** Draw the field boundary on satellite imagery and adjust it by dragging the vertices; country,
  state and municipality are filled from the map.
- **See the field through NASA data.** Rainfall, temperature, water balance, root-zone soil moisture, NDVI and ground
  cover for that field, with source and period on every number, plus 5 years of monthly climate history.
- **Get a rotation plan.** The AI analysis compares the current rotation with two alternatives month by month,
  recommends one and explains why, with benefits, risks, uncertainty and the NASA evidence behind it.
- **Ask questions.** A chat answers questions such as "how much does it rain in May here?" using the field's own data.
- **Explore layers.** Map layers show the field's NASA values (rainfall, temperature, soil moisture, NDVI, ground
  cover, water balance) and the historical average for the month selected in the crop calendar.
- **Works on the phone.** Installable PWA with bottom navigation, in English, Portuguese and Spanish.
- **Privacy.** Data is private to each account; users can export everything or delete their account.

## NASA data used

| Data | Product | Resolution | Used for |
|---|---|---|---|
| Daily rainfall, temperature, soil moisture | NASA POWER (`PRECTOTCORR`, `T2M`, `T2M_MIN`, `GWETROOT`, `GWETTOP`) | ~50 km, 2005–2024 | climate history, rain onset, dry spells, water balance |
| Vegetation index | MODIS MOD13Q1 NDVI (ORNL DAAC) | 250 m | ground cover, bare-soil months |
| Evapotranspiration | MODIS MOD16A2 ET (ORNL DAAC) | 500 m | water balance (rain minus ET) |

The crop table (31 crops with temperature range, cycle, water need, drought tolerance, nitrogen fixation and cover)
decides which crops can be sown in each month of the farm's climate.

## How the AI stays grounded

1. A deterministic engine computes the farm's seasons (main crop, second crop, dry season), the sowing windows of every
   crop and a ranked shortlist for the farmer's goals, keeping only crops that fit the season when the field is free.
2. A Claude model (Anthropic API) writes the plan. It must read the field's data through a tool call and may only use
   numbers returned by that tool.
3. Every answer is validated (calendar fits the sowing windows, recommendation serves the goals, facts are cited,
   answer is in the requested language) and corrected before it reaches the farmer.
4. Rules added after an agronomic audit: NASA POWER rain is treated as a conservative lower bound; the October rain
   onset is only used for the main summer crop; fields that stay green almost all year get a "confirm the land use"
   warning; tall or long-cycle cover crops come with practical management advice.

## Known limitations

- NASA POWER rain is a ~50 km estimate. In Southeast and Center-West Brazil it can underestimate summer convective
  rain compared with local gauges (about 24% lower than the INMET station in Uberaba). Nearby farms share the same cell.
- NDVI and ET come from one 250–500 m pixel at the field centre, which can be larger than a small field.
- Monthly tables cover 2020–2024 and agro indicators 2005–2024. TerraTurn shows history, not forecasts.
- Spanish analyses are written in English (the engine writes English or Portuguese).
- Recommendations support decisions; they must be validated with a local agronomist.

## Next steps

- Rainfall from **GPM IMERG** (~10 km, NASA) instead of the ~50 km POWER grid.
- Field-scale vegetation from **HLS** (Harmonized Landsat Sentinel-2, 30 m, NASA).
- Validation against INMET weather stations in Brazil.

## Architecture

- **Frontend:** React 19 + TypeScript + Vite, PWA, served by a Cloudflare Worker that forwards `/api/*` to the API.
- **Backend:** FastAPI + SQLAlchemy on Render, PostgreSQL on Neon; own auth (Argon2id passwords, JWT in an HttpOnly
  cookie). See [`backend/README.md`](backend/README.md) for endpoints and environment variables.
- **AI engine:** `backend/app/ia/` (frozen engine and crop table; `service.py` adapts the app's farm to the engine).
- **Tests:** backend `pytest`, frontend unit tests and Playwright end-to-end tests on desktop, iPhone (Chrome and
  Safari/WebKit) and Android, run on every pull request with the AI mocked.

## Run locally

From the project root, create a local session key and start the services (PowerShell):

```powershell
$secret = python -c "import secrets; print(secrets.token_urlsafe(48))"
Set-Content .env "JWT_SECRET=$secret"
docker compose up --build
```

Or on macOS/Linux:

```bash
echo "JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')" > .env
docker compose up --build
```

Open http://localhost:5173. The API runs on http://localhost:8000 and the SQLite database is kept in the
`backend-data` volume. The `.env` file is local and ignored by Git; do not reuse the local key in production. To stop,
press `Ctrl+C` and run `docker compose down`.

---

### Em português

TerraTurn é um PWA que usa dados da NASA (POWER e MODIS) sobre o talhão do produtor para sugerir rotação de culturas e
plantas de cobertura, com análise e chat de IA fundamentados nos dados da área. Demo aberta em
https://terraturn.work. Para rodar localmente, veja a seção *Run locally* acima.
