import threading
from calendar import monthrange
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

from app.db_models import AiStudy, Property
from app.ia import service
from app.ia.motor import motor

SOURCE_POWER = "NASA POWER"
SOURCE_MODIS_NDVI = "MODIS MOD13Q1"
SOURCE_MODIS_ET = "MODIS MOD16A2"
_PREPARANDO: set = set()
_LOCK = threading.Lock()


def today() -> date:
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()


def add_months(month: str, offset: int) -> str:
    y, m = map(int, month.split("-"))
    y, m = divmod(y * 12 + m - 1 + offset, 12)
    return f"{y:04d}-{m + 1:02d}"


def history_window(reference: date) -> dict:
    start = reference.replace(year=reference.year - 5, day=min(reference.day, monthrange(reference.year - 5, reference.month)[1]))
    return {"start_date": start.isoformat(), "end_date": (reference - timedelta(days=1)).isoformat()}


def _prepare_async(lat: float, lon: float) -> None:
    chave = (round(lat, 4), round(lon, 4))
    with _LOCK:
        if chave in _PREPARANDO:
            return
        _PREPARANDO.add(chave)

    def tarefa():
        try:
            service.prepare_point(lat, lon)
        finally:
            with _LOCK:
                _PREPARANDO.discard(chave)

    service.EXECUTOR.submit(tarefa)


def _point_name(prop: Property):
    m = motor()
    nome = m.fazenda_mais_proxima(prop.latitude, prop.longitude)
    if nome is None and list(service.WORKDIR.glob(f"saidas/mesclado_mensal_ponto_{prop.latitude:.4f}_{prop.longitude:.4f}_*.csv")):
        nome = service.prepare_point(prop.latitude, prop.longitude)
    return nome


def _metrics(prop: Property, df: pd.DataFrame, observed: date) -> list:
    wanted = set(prop.indicators or [])
    anos = df.groupby(df.index.year)
    out = []

    def add(ident, value, unit, source, resolution, uncertainty, kind="observed"):
        if ident in wanted and value is not None and pd.notna(value):
            out.append({"id": ident, "value": round(float(value), 2), "unit": unit, "source": source, "kind": kind,
                        "date": observed.isoformat(), "resolution": resolution, "uncertainty": uncertainty})

    add("rainfall", anos["chuva_power_mm"].sum().mean(), "mm/yr", SOURCE_POWER, "~50 km · 2020-2024",
        "Satellite/model estimate; can differ from local rain gauges (about 24% lower than the INMET station in Uberaba).")
    add("temperature", df["temp_c"].mean(), "°C", SOURCE_POWER, "~50 km · 2020-2024", "Regional ~50 km grid.")
    if df["balanco_power_mm"].notna().any():
        add("water_balance", df.groupby(df.index.year)["balanco_power_mm"].sum(min_count=1).dropna().mean(), "mm/yr",
            f"{SOURCE_POWER} − {SOURCE_MODIS_ET}", "rain − ET · 2021-2024", "Mixes a 50 km grid and a 500 m pixel.",
            kind="estimated")
    add("soil_moisture", df["umid_raiz_power"].mean(), "0–1", f"{SOURCE_POWER} GWETROOT", "root zone · 2020-2024",
        "Relative wetness of the root zone, not volumetric m³/m³.", kind="estimated")
    if df["ndvi"].notna().any():
        add("ndvi", df["ndvi"].mean(), "", SOURCE_MODIS_NDVI, "250 m · 2020-2024", "One 250 m pixel at the farm centre.")
        cobertos = (df["ndvi"].dropna() >= 0.30).mean() * 100
        add("cover", cobertos, "%", SOURCE_MODIS_NDVI, "months NDVI ≥ 0.30 · 2020-2024",
            "NDVI below 0.30 is read as bare soil or straw.", kind="estimated")
    return out


def _cycles(prop: Property, result: dict, language: str):
    m = motor()
    analysis = result["analysis"]
    rec = analysis["recommendation"]
    rotations = analysis["rotations"]
    alvo = next((r for r in rotations if r["name"] == rec["rotation_name"]), None) or next((r for r in rotations if not r["is_current"]), rotations[0])
    planning = prop.planning or {}
    start = planning.get("start_month") or today().strftime("%Y-%m")
    horizon = int(planning.get("horizon_months") or 12)
    end = add_months(start, horizon - 1)
    calendario = alvo["calendar"]
    lang = "pt" if language == "pt" else "en"
    cycles, livre = [], start
    for off in range(horizon):
        mes = add_months(start, off)
        if mes < livre:
            continue
        for item in calendario:
            if item["sow_month"] != int(mes[5:7]):
                continue
            fim = add_months(mes, (item["harvest_month"] - item["sow_month"]) % 12)
            if fim > end:
                continue
            papel = (m.TABELA.get(item["crop"]) or {}).get("papel")
            nome = ((m.TABELA.get(item["crop"]) or {}).get("nomes") or {}).get(lang) or item["crop"].replace("_", " ")
            cycles.append({"crop": nome[:1].upper() + nome[1:], "kind": "cover" if papel == "cobertura" else "commercial",
                           "start_month": mes, "end_month": fim,
                           "rationale": f"{alvo['farmer_summary']} {alvo['why']}"[:4000],
                           "uncertainty": f"{alvo['uncertainty']}: {alvo['temperature_fit']}"[:2000]})
            livre = fim
            break
    return cycles, alvo


def plan_from_study(prop: Property, study, scenario=None) -> dict:
    warnings = []
    if scenario and (scenario.get("rainfall_percent") or scenario.get("temperature_delta_c")):
        warnings.append("Scenario sliders are not applied yet: engine v17 uses observed NASA data only.")
    if study is None:
        return {"status": "not_connected", "cycles": [], "warnings": warnings}
    if study.status in ("queued", "running"):
        return {"status": "processing", "cycles": [], "warnings": warnings}
    if study.status == "failed" or not study.result:
        return {"status": "not_connected", "cycles": [], "warnings": warnings + [study.error or "The last analysis failed."]}
    cycles, alvo = _cycles(prop, study.result, study.language)
    rec = study.result["analysis"]["recommendation"]
    warnings.append(f"Recommended: {alvo['name']}. {rec['message_to_farmer']}")
    if not cycles:
        warnings.append("No full crop cycle of the recommended rotation fits the planning horizon; widen the horizon.")
    if study.result.get("irrigated_warning"):
        warnings.append("This farm is marked as irrigated; TerraTurn assumes rainfed farming.")
    warnings.append(study.result["analysis"].get("disclaimer", ""))
    return {"status": "ready", "model_version": study.result.get("engine", "llm_v17"),
            "generated_at": study.result.get("generated_at"), "cycles": cycles, "warnings": [w for w in warnings if w][:50]}


def context_for(prop: Property, study: AiStudy | None) -> dict:
    ref = today()
    janela = history_window(ref)
    base = {"schema_version": "1.0", "farm_id": prop.id, "plan": plan_from_study(prop, study)}
    nome = _point_name(prop)
    if nome is None:
        _prepare_async(prop.latitude, prop.longitude)
        return {**base, "status": "pending",
                "history": {**janela, "observed_through": None, "completeness_percent": 0, "source": "NASA POWER + MODIS (downloading)",
                            "resolution": None, "monthly": []}, "metrics": []}
    df = motor().DADOS[nome]
    ultimo = df["chuva_power_mm"].dropna().index.max()
    observed = date(ultimo.year, ultimo.month, monthrange(ultimo.year, ultimo.month)[1])
    inicio, fim = janela["start_date"][:7], janela["end_date"][:7]
    monthly = []
    for idx, row in df.iterrows():
        mes = idx.strftime("%Y-%m")
        if inicio <= mes <= fim and mes <= observed.strftime("%Y-%m"):
            monthly.append({"month": mes,
                            "precipitation_mm": None if pd.isna(row["chuva_power_mm"]) else round(float(row["chuva_power_mm"]), 1),
                            "temperature_c": None if pd.isna(row["temp_c"]) else round(float(row["temp_c"]), 1)})
    observed_through = observed if janela["start_date"] <= observed.isoformat() <= janela["end_date"] else None
    return {**base, "status": "ready" if len(monthly) >= 60 else "partial",
            "history": {**janela, "observed_through": observed_through.isoformat() if observed_through else None,
                        "completeness_percent": round(100 * len(monthly) / 60, 1),
                        "source": "NASA POWER (~50 km); MODIS MOD13Q1 and MOD16A2 via ORNL DAAC",
                        "resolution": "monthly", "monthly": monthly[-61:]},
            "metrics": _metrics(prop, df, observed)}
