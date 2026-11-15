import json
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from app.database import SessionLocal
from app.db_models import AiStudy, IaFileCache, Property
from app.ia.motor import WORKDIR, motor

logger = logging.getLogger("terraturn.ia")
EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ia")

GOAL_TO_PRIORITY = {"water": "agua", "soil": "solo", "yield": "renda", "cost": "renda", "resilience": "risco",
                    "fertility": "solo", "erosion": "erosao", "diversity": "solo", "phytosanitary": "risco", "margin": "renda"}
PRIORITY_TO_GOAL = {"agua": "water", "solo": "soil", "renda": "yield", "risco": "resilience", "erosao": "erosion", "forragem": "forage"}
# O motor só traz em português as quatro prioridades originais; as demais ficam aqui.
PRIORIDADES_PT_EXTRA = {"erosao": "Prioridade: reduzir a erosão e manter o solo coberto.",
                        "forragem": "Prioridade: produzir forragem para o gado na seca."}
MAX_PRIORIDADES = 3
# Pede alternativas de fato diferentes entre si; o ranking do motor sozinho tende a repetir as mesmas culturas.
REGRA_ALTERNATIVAS = (
    "\n<alternatives_rule>\nThe farmer has these priorities, in order: {prios}. Weigh all of them together, using the tool data.\n"
    "The two alternatives must be clearly different from each other: each one must use a different second-season or "
    "cover crop (never the same crop in both), taken from different positions of <pre_ranked_crops> (for example #1 and "
    "#3, not only #1). Recommend the alternative that best serves all the priorities with this farm's data; #1 of the "
    "ranking is a starting point, not an obligation. Explain the choice in 'why'.\n</alternatives_rule>")
MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
VAZIOS = {"", "não informado", "nao informado", "outra cultura", "not informed"}

# Regras que corrigem falhas vistas na auditoria (chuva subestimada, safra x safrinha, área perene, coberturas altas).
# O SYSTEM do motor v17 é congelado: estas regras vão no pedido da análise e no prompt do chat.
AGRONOMY_RULES = """<agronomy_rules>
A. Rainfall data: rain comes from NASA POWER (PRECTOTCORR), a satellite/model estimate on a ~50 km grid. In Southeast and
   Center-West Brazil it can underestimate summer convective rain (October-March) compared with local rain gauges. Treat
   those numbers as a conservative lower bound: do not call the area dry or rule out a crop for water reasons because of a
   small summer margin, and say that the local gauge may record more rain. Never adjust, scale or invent rain numbers.
B. Keep the two seasons separate:
   - The rain onset date (start of the rainy season, e.g. 09/10) refers ONLY to the start of the farming year: sowing the
     main summer crop (soybean, first-season maize) and desiccating/managing the previous cover crop.
   - A succession, second-season or cover crop sown in February-April must be justified ONLY by the autumn water balance
     (February-April) and by its drought tolerance through the deficit months that follow (for example April-August).
     Never say that a February-April sowing coincides with, follows or depends on the October rain onset.
C. If <land_use_check> is present, add one short caveat (in 'why' or in the risks) asking the farmer to confirm whether
   the field is already a perennial or semi-perennial use (sugarcane, perennial pasture, citrus or forestry) or is
   cropped all year, before assuming an annual grain crop with fallow. Do not assume the land use; ask.
D. When you recommend a tall or long-cycle cover/legume (pigeon pea / guandu, crotalaria / sunn hemp, or similar), add the
   practical management that avoids woody stems at the next sowing: a dwarf cultivar, intercropping with Brachiaria
   ruziziensis, or mowing/desiccating at full flowering (typically June-July for a February-March sowing) so no-till
   sowing in October is easy. Mark it as general agronomic knowledge, not NASA data, and do not add numbers to it.
</agronomy_rules>"""
LAND_USE_COVER_PCT = 90  # meses com NDVI >= 0,30 acima disso, sem mês de solo descoberto: suspeita de cultura perene
LAND_USE_NOTE = ("NDVI stayed at or above 0.30 in {cover}% of the months (2020-2024) and no month is bare on average. "
                 "Annual grain fields with fallow usually show bare months; this pattern is typical of perennial or "
                 "semi-perennial use (sugarcane, perennial pasture, citrus or forestry) or of year-round double cropping "
                 "(summer crop plus winter crop or cover). Confirm the land use with the farmer.")

CHAT_SYSTEM = """You are TerraTurn's agronomic assistant (NASA Space Apps 2026) inside the farmer's app. You answer the farmer's
question using ONLY the data returned by the tool `analisar_fazenda` and what TerraTurn gives you in <farm_profile>,
<farm_phases> and <crop_table>.
1. If the question needs farm data, call `analisar_fazenda` with the lat/lon from <farm_profile> and the months that matter
   (a period like December to February is 12 -> 2). Use <farm_phases> when the question is about a season.
2. If there is no <farm_profile> and the question needs farm data, do not call the tool: ask for the farm's latitude and
   longitude (or to register the farm in the app).
3. General concepts need no tool call; say it is general knowledge.
4. Use only numbers from the tool, the profile, the phases, the crop table or the question. Never invent numbers: no yields,
   prices, costs, doses, forecasts or frost days. If something is not in the data, say so and say who can answer it
   (local agronomist, extension service, market quote).
5. The data is historical (monthly averages 2020-2024; agro indicators 2005-2024). Never forecast tomorrow or a future year.
6. If the farmer states something the data contradicts, correct it politely with the tool's number.
7. The irrigation signal is only a hypothesis; never state that the farm is irrigated.
8. When suggesting crops, use only crops from <crop_table> and their sow_months; never suggest a crop listed in
   <not_suitable_here> for this farm.
9. Answer in the language given in <answer_language> (Portuguese with correct accents). Short and plain: about 150 words at
   most, no jargon. When the answer supports a decision, recommend a local agronomist.
10. Follow <agronomy_rules> below.
""" + AGRONOMY_RULES
CHAT_MAX_TOKENS = 4000
CHAT_MAX_STEPS = 4
CHAT_DEADLINE_S = 50  # tempo total do chat; o front espera até 65 s


MSG_AI_UNAVAILABLE = "AI is temporarily unavailable. Please try again later."
MSG_AI_BUSY = "The AI service is busy right now. Please try again in a minute."
MSG_NASA = "Could not download NASA data for this area. Please try again later."
MSG_GENERIC = "The analysis could not be completed. Please try again."


# Nomes de campos internos do motor que a IA às vezes copia no texto ("tolera_seca baixa").
_CAMPOS = {"tolera_seca": ("drought tolerance", "tolerância à seca"), "ciclo_dias": ("cycle length", "duração do ciclo"),
           "temp_ideal_c": ("ideal temperature", "temperatura ideal"), "fixa_n": ("nitrogen fixation", "fixação de nitrogênio")}
_PAREN = re.compile(r"\s*\((?:" + "|".join(_CAMPOS) + r")[ _:=]*[^)]*\)")


def clean_text(value, idioma: str = "en"):
    """Remove nomes de campos internos do motor do texto mostrado ao usuário."""
    if isinstance(value, dict):
        return {k: clean_text(v, idioma) for k, v in value.items()}
    if isinstance(value, list):
        return [clean_text(v, idioma) for v in value]
    if not isinstance(value, str):
        return value
    value = _PAREN.sub("", value)
    for campo, (en, pt) in _CAMPOS.items():
        value = value.replace(campo, pt if idioma == "pt" else en)
    return value


def user_message(exc: Exception) -> str:
    import openai
    import requests

    if isinstance(exc, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return MSG_AI_UNAVAILABLE
    if isinstance(exc, RuntimeError) and "ANTHROPIC_API_KEY" in str(exc):
        return MSG_AI_UNAVAILABLE
    if isinstance(exc, (openai.RateLimitError, openai.InternalServerError, openai.APIConnectionError)):
        return MSG_AI_BUSY
    if isinstance(exc, requests.RequestException):
        return MSG_NASA
    return MSG_GENERIC


_STATUS_CACHE = {"at": 0.0, "value": None}


def llm_status() -> str:
    import openai

    m = motor()
    if "anthropic" not in m.CLIENTES:
        return "missing_api_key"
    ttl = 600 if _STATUS_CACHE["value"] == "ready" else 60
    if _STATUS_CACHE["value"] and time.time() - _STATUS_CACHE["at"] < ttl:
        return _STATUS_CACHE["value"]
    try:
        m.CLIENTES["anthropic"].chat.completions.create(model=m.MODELOS_TESTE[0], max_tokens=1,
                                                        messages=[{"role": "user", "content": "ping"}])
        value = "ready"
    except (openai.AuthenticationError, openai.PermissionDeniedError):
        value = "invalid_api_key"
    except Exception:
        logger.exception("AI status check failed")
        value = "unreachable"
    _STATUS_CACHE.update(at=time.time(), value=value)
    return value


def now_utc():
    return datetime.now(timezone.utc)


def motor_language(language: str) -> str:
    return "pt" if (language or "").lower().startswith("pt") else "en"


def priority_from_goals(goals) -> str:
    for g in goals or []:
        if g in GOAL_TO_PRIORITY:
            return GOAL_TO_PRIORITY[g]
    return "agua"


def priorities_from_goals(goals, first: str | None = None) -> list[str]:
    """Todas as metas da fazenda (até 3, sem repetir), começando pela prioridade escolhida na análise."""
    out = [first] if first else []
    for g in goals or []:
        p = GOAL_TO_PRIORITY.get(g)
        if p and p not in out:
            out.append(p)
    return (out or ["agua"])[:MAX_PRIORIDADES]


def land_use_check(nome: str) -> dict | None:
    """Cobertura histórica > 90% (NDVI >= 0,30) e nenhum mês médio de solo descoberto: possível área perene."""
    m = motor()
    ndvi = m.DADOS[nome]["ndvi"].dropna()
    if ndvi.empty:
        return None
    cover = round(float((ndvi >= 0.30).mean() * 100), 1)
    por_mes = ndvi.groupby(ndvi.index.month).mean()
    if cover <= LAND_USE_COVER_PCT or bool((por_mes < 0.30).any()):
        return None
    return {"cover_pct": cover, "bare_months": 0, "note": LAND_USE_NOTE.format(cover=cover)}


def regional_ranking(nome: str, prio) -> list[str]:
    """Ranking do motor restrito às culturas que podem ser semeadas na 2ª safra ou na entressafra desta fazenda.

    O motor filtra pelo clima do ano inteiro; no Sul ou na Argentina isso deixava passar culturas que só cabem no
    verão, quando a área está com a cultura principal.
    """
    m = motor()
    fases = m.FASES_POR[nome]
    livres = set(m.meses_do_periodo(*fases[1])) | set(m.meses_do_periodo(*fases[2]))
    cabem = {c for c, meses in m.JANELAS[nome][0].items() if set(meses) & livres}
    if not cabem:
        return []
    r = m.analisar_fazenda(*m.PONTOS[nome], fases[1][0], fases[2][1])
    if r.get("status") != "ok":
        return []
    return m.ranking_culturas(prio, r["deficit_months"], r["bare_soil_months"], cabem)[:4]


def apply_regional_ranking(pedido: str, nome: str, prio) -> str:
    ordem = regional_ranking(nome, prio)
    if not ordem:
        return pedido
    bloco = ("<pre_ranked_crops>\nComputed by TerraTurn from the crop table, the priority and the deficit/bare-soil months, "
             "keeping only crops whose sow_months fall in this farm's second-crop or dry-season phases (the main season is "
             "already taken by the main crop). Build the 2 alternatives around these crops.\n"
             + "\n".join(f"{i + 1}. {c}" for i, c in enumerate(ordem)) + "\n</pre_ranked_crops>")
    novo, n = re.subn(r"<pre_ranked_crops>.*?</pre_ranked_crops>", lambda _: bloco, pedido, flags=re.S)
    return novo if n else pedido + "\n" + bloco


def priority_text(prio: str, idioma: str) -> str:
    m = motor()
    if idioma == "pt":
        return m.PRIORIDADES_PT.get(prio) or PRIORIDADES_PT_EXTRA.get(prio) or m.PRIORIDADES[prio]
    return m.PRIORIDADES[prio]


def describe_rotation(prop: Property, idioma: str) -> str:
    crop = (prop.crop or "").strip()
    prev = (prop.previous_crop or "").strip()
    crop = "" if crop.lower() in VAZIOS else crop
    prev = "" if prev.lower() in VAZIOS else prev
    month = prop.planting_month
    inicio = (prop.planning or {}).get("crop_start_month")
    if not month and inicio:
        month = int(inicio[5:7])
    if idioma == "pt":
        partes = []
        if crop:
            partes.append(f"Cultura principal: {crop}" + (f", plantada em {MONTHS_PT[month - 1]}" if month else "") + ".")
        if prev:
            partes.append(f"Cultura anterior na área: {prev}.")
        return " ".join(partes) or "Ainda não informei a rotação atual."
    partes = []
    if crop:
        partes.append(f"Main crop: {crop}" + (f", sown in {MONTHS_EN[month - 1]}" if month else "") + ".")
    if prev:
        partes.append(f"Previous crop on this field: {prev}.")
    return " ".join(partes) or "I have not described my current rotation yet."


def build_request(prop: Property, prio, idioma: str) -> str:
    prios = prio if isinstance(prio, (list, tuple)) else [prio]
    texto_prio = " ".join(priority_text(p, idioma) for p in prios)
    rot = describe_rotation(prop, idioma)
    area = round(prop.tamanho_hectares or 0, 1)
    if idioma == "pt":
        return (f"Minha fazenda fica em lat {prop.latitude:.4f}, lon {prop.longitude:.4f}, {area} ha. {rot} "
                f"{texto_prio}")
    return f"My farm is at lat {prop.latitude:.4f}, lon {prop.longitude:.4f}, {area} ha. {rot} {texto_prio}"


def _point_files(lat: float, lon: float, nome: str):
    return [f"data/power_diario_{round(lat, 3):.3f}_{round(lon, 3):.3f}_2005_2024.csv", f"saidas/mesclado_mensal_{nome}_*.csv"]


def _restore_point(lat: float, lon: float, nome: str) -> None:
    with SessionLocal() as db:
        for padrao in _point_files(lat, lon, nome):
            prefixo = padrao.split("*")[0]
            for row in db.query(IaFileCache).filter(IaFileCache.path.like(prefixo + "%")).all():
                alvo = WORKDIR / row.path
                if not alvo.exists():
                    alvo.parent.mkdir(parents=True, exist_ok=True)
                    alvo.write_text(row.content, encoding="utf-8")


def _save_point(lat: float, lon: float, nome: str) -> None:
    with SessionLocal() as db:
        for padrao in _point_files(lat, lon, nome):
            for arq in WORKDIR.glob(padrao):
                rel = str(arq.relative_to(WORKDIR))
                row = db.get(IaFileCache, rel)
                if row is None:
                    db.add(IaFileCache(path=rel, content=arq.read_text(encoding="utf-8"), updated_at=now_utc()))
        db.commit()


def prepare_point(lat: float, lon: float) -> str:
    m = motor()
    achado = m.fazenda_mais_proxima(lat, lon)
    if achado:
        return achado
    nome = f"ponto_{lat:.4f}_{lon:.4f}"
    _restore_point(lat, lon, nome)
    nome = m.obter_ponto(lat, lon, nome)
    m.indicadores_agro(*m.PONTOS[nome], m.INICIO_SAFRA[nome])
    _save_point(lat, lon, nome)
    return nome


def point_overview(nome: str) -> dict:
    m = motor()
    lat, lon = m.PONTOS[nome]
    ano = m.analisar_fazenda(lat, lon, 1, 12)
    janelas, fora = m.JANELAS[nome]
    return {
        "point": nome if not nome.startswith("ponto_") else None,
        "season_start_month": m.INICIO_SAFRA[nome],
        "phases": [{"name": n, "start_month": a, "end_month": b} for n, (a, b) in zip(m.NOMES_FASES, m.FASES_POR[nome])],
        "suitable_crops": {c: meses for c, meses in janelas.items()},
        "not_suitable": fora,
        "monthly": ano.get("monthly_average_2020_2024", []),
        "deficit_months": ano.get("deficit_months", []),
        "bare_soil_months": ano.get("bare_soil_months", []),
        "temperature": ano.get("temperature"),
        "agro_indicators": ano.get("agro_indicators_2005_2024"),
        "irrigation_signal": ano.get("possible_irrigation_signal"),
        "limitations": ano.get("limitations", []),
        "sources": ano.get("sources", []),
    }


def monthly_overview(nome: str) -> dict:
    """Médias mensais 2020-2024 já carregadas do ponto, sem chamar analisar_fazenda.

    analisar_fazenda usa a trava de dados do motor, que fica presa enquanto outra área baixa dados da NASA (minutos);
    o relatório em PDF não pode esperar por isso. Mesmas colunas e regras do motor (déficit: balanço < 0; solo
    descoberto: NDVI < 0,30).
    """
    m = motor()
    df = m.DADOS[nome]
    por_mes = df.groupby(df.index.month).mean(numeric_only=True).reindex(range(1, 13))
    r1 = lambda v: None if v is None or v != v else round(float(v), 1)  # noqa: E731
    monthly = [{"month": int(mes), "rain_mm": r1(row.get("chuva_power_mm")), "temp_mean_c": r1(row.get("temp_c")),
                "evapotranspiration_mm": r1(row.get("et_mm_mes")), "water_balance_mm": r1(row.get("balanco_power_mm")),
                "ndvi": None if row.get("ndvi") != row.get("ndvi") or row.get("ndvi") is None else round(float(row["ndvi"]), 2),
                "root_soil_moisture_pct": r1(row.get("umid_raiz_power") * 100) if row.get("umid_raiz_power") == row.get("umid_raiz_power") and row.get("umid_raiz_power") is not None else None}
               for mes, row in por_mes.iterrows()]
    return {"monthly": monthly,
            "deficit_months": [r["month"] for r in monthly if r["water_balance_mm"] is not None and r["water_balance_mm"] < 0],
            "bare_soil_months": [r["month"] for r in monthly if r["ndvi"] is not None and r["ndvi"] < 0.30],
            "agro_indicators": None}


def crop_traits() -> dict:
    """Características da tabela oficial de culturas usadas na comparação visual das rotações."""
    return {c: {"drought": t.get("tolera_seca"), "cycle_days": t.get("ciclo_dias"), "market": t.get("mercado"),
                "fixes_n": t.get("fixa_n"), "cover": t.get("cobertura")} for c, t in motor().TABELA.items()}


def crop_names() -> dict:
    return {c: (t.get("nomes") or {}) for c, t in motor().TABELA.items()}


def _set(study_id: str, **campos) -> None:
    with SessionLocal() as db:
        s = db.get(AiStudy, study_id)
        if s is None:
            return
        for k, v in campos.items():
            setattr(s, k, v)
        s.updated_at = now_utc()
        db.commit()


def run_study(study_id: str) -> None:
    t0 = time.time()
    try:
        with SessionLocal() as db:
            s = db.get(AiStudy, study_id)
            prop = db.get(Property, s.property_id)
            lat, lon, idioma = prop.latitude, prop.longitude, motor_language(s.language)
            prio = priorities_from_goals(prop.priorities, first=s.priority)
            irrigated = (prop.soil or {}).get("irrigation") == "irrigated"
            pedido_txt = build_request(prop, prio, idioma)
        m = motor()
        cached = m.fazenda_mais_proxima(lat, lon) is not None
        _set(study_id, status="running", stage="nasa_data_cached" if cached else "downloading_nasa_data", request_text=pedido_txt)
        nome = prepare_point(lat, lon)
        overview = point_overview(nome)
        _set(study_id, stage="analyzing")
        if "anthropic" not in m.CLIENTES:
            raise RuntimeError("AI is not configured on the server (missing ANTHROPIC_API_KEY).")
        descobertos = m.analisar_fazenda(*m.PONTOS[nome], *m.FASES_POR[nome][2]).get("bare_soil_months", [])
        janelas = m.JANELAS[nome][0]
        fatos = m.fatos_agro(nome)
        pedido = apply_regional_ranking(m.montar_pedido(pedido_txt, prio, nome, idioma), nome, prio)
        pedido += REGRA_ALTERNATIVAS.format(prios=", ".join(prio)) + "\n" + AGRONOMY_RULES
        uso = land_use_check(nome)
        if uso:
            pedido += f"\n<land_use_check>\n{json.dumps(uso, ensure_ascii=False)}\n</land_use_check>"
        texto, via, chamadas, seg, tin, tout, _, corr, _ = m.rodar(
            "anthropic", m.MODELOS_TESTE[0], pedido, prio, descobertos, janelas, fatos, idioma)
        if not texto:
            raise RuntimeError("The AI did not return an answer.")
        resposta, _ = m.ler_json(texto)
        erros = m.validar_resposta(resposta, prio, descobertos, janelas, fatos, idioma)
        result = {
            "analysis": resposta,
            "farm_data": overview,
            "priority": PRIORITY_TO_GOAL.get(prio[0], prio[0]),
            "priorities": [PRIORITY_TO_GOAL.get(p, p) for p in prio],
            "language": idioma,
            "irrigated_warning": irrigated,
            "land_use_warning": land_use_check(nome),
            "crop_names": crop_names(),
            "validation": {"passed": not erros, "corrections": corr, "remaining_issues": erros},
            "model": m.MODELOS_TESTE[0],
            "engine": "llm_v17 + tabela_culturas_oficial_v2",
            "generated_at": now_utc().isoformat(),
        }
        _set(study_id, status="complete", stage="complete", result=result, seconds=round(time.time() - t0, 1),
             tokens_in=tin, tokens_out=tout)
    except Exception as exc:
        logger.exception("Study %s failed", study_id)
        _set(study_id, status="failed", stage="failed", error=user_message(exc),
             seconds=round(time.time() - t0, 1))


def submit_study(study_id: str) -> None:
    EXECUTOR.submit(run_study, study_id)


def mark_interrupted() -> None:
    with SessionLocal() as db:
        db.query(AiStudy).filter(AiStudy.status.in_(["queued", "running"])).update(
            {"status": "failed", "stage": "failed", "error": "The server restarted during the analysis. Please run it again."},
            synchronize_session=False)
        db.commit()


def _chat_context(nome, prop: Property, idioma: str, question: str) -> str:
    m = motor()
    partes = []
    if nome:
        linhas, fora = m.tabela_do_ponto(nome)
        fases = "\n".join(f"{i + 1}. {n}: mes_inicio={a}, mes_fim={b}"
                          for i, (n, (a, b)) in enumerate(zip(m.NOMES_FASES, m.FASES_POR[nome])))
        prio = m.PRIORIDADES[priority_from_goals(prop.priorities)].replace("Priority: ", "")
        partes.append(f"<farm_profile>\nlat {prop.latitude:.4f}, lon {prop.longitude:.4f}, {round(prop.tamanho_hectares or 0, 1)} ha. "
                      f"{describe_rotation(prop, 'en')} Priority: {prio}\n</farm_profile>")
        partes.append(f"<farm_phases>\n{fases}\n</farm_phases>")
        partes.append(f"<crop_table>\n{json.dumps(linhas, ensure_ascii=False)}\n</crop_table>")
        if fora:
            partes.append(f"<not_suitable_here>\n{json.dumps(fora, ensure_ascii=False)}\n</not_suitable_here>")
        uso = land_use_check(nome)
        if uso:
            partes.append(f"<land_use_check>\n{json.dumps(uso, ensure_ascii=False)}\n</land_use_check>")
    partes.append(f"<answer_language>{m.NOME_IDIOMA[idioma]}</answer_language>")
    partes.append(f"<farmer_question>\n{question}\n</farmer_question>")
    return "\n".join(partes)


def _chat_tool(args):
    m = motor()
    a = m.normalizar_args(args)
    try:
        lat, lon, mi, mf = float(a["lat"]), float(a["lon"]), int(a["mes_inicio"]), int(a["mes_fim"])
    except Exception as e:
        return {"error": f"Invalid arguments {args}: {e}"}
    if m.fazenda_mais_proxima(lat, lon) is None:
        return {"status": "not_available", "message": "No data for this point."}
    return m.analisar_fazenda(lat, lon, mi, mf)


def chat(prop: Property | None, question: str, language: str, history=None) -> dict:
    m = motor()
    if "anthropic" not in m.CLIENTES:
        raise RuntimeError("AI is not configured on the server (missing ANTHROPIC_API_KEY).")
    idioma = motor_language(language)
    nome = None
    if prop is not None:
        nome = m.fazenda_mais_proxima(prop.latitude, prop.longitude)
        if nome is None:
            _restore_point(prop.latitude, prop.longitude, f"ponto_{prop.latitude:.4f}_{prop.longitude:.4f}")
            arquivos = list(WORKDIR.glob(f"saidas/mesclado_mensal_ponto_{prop.latitude:.4f}_{prop.longitude:.4f}_*.csv"))
            if arquivos:
                nome = prepare_point(prop.latitude, prop.longitude)
    msgs = [{"role": "system", "content": CHAT_SYSTEM}]
    for h in (history or [])[-6:]:
        msgs.append({"role": h["role"], "content": h["content"]})
    msgs.append({"role": "user", "content": _chat_context(nome, prop, idioma, question)})
    client = m.CLIENTES["anthropic"]
    t0, tin, tout, retentou = time.time(), 0, 0, False
    for passo in range(CHAT_MAX_STEPS):
        resta = CHAT_DEADLINE_S - (time.time() - t0)
        ultimo = passo == CHAT_MAX_STEPS - 1 or resta < 20
        if resta < 5:
            break
        # Perto do limite de tempo, pede a resposta final sem novas consultas.
        extra = {"tools": [m.TOOLS[0]], "tool_choice": "none" if ultimo else "auto"}
        r = client.chat.completions.create(model=m.MODELOS_TESTE[0], messages=msgs, max_tokens=CHAT_MAX_TOKENS,
                                           timeout=max(resta, 5), **extra)
        u = getattr(r, "usage", None)
        if u:
            tin += u.prompt_tokens or 0
            tout += u.completion_tokens or 0
        msg = r.choices[0].message
        if not msg.tool_calls:
            if (msg.content or "").strip() or retentou:
                return {"answer": (msg.content or "").strip(), "farm_data": bool(nome), "seconds": round(time.time() - t0, 1),
                        "finish_reason": str(r.choices[0].finish_reason)}
            retentou = True
            msgs.append({"role": "user", "content": "Write your answer to the farmer's question now, in the language given in "
                                                    "<answer_language>, using the data you already received."})
            continue
        msgs.append({"role": "assistant", "content": msg.content or "",
                     "tool_calls": [{"id": tc.id, "type": "function",
                                     "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                                    for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            try:
                args = m.decodificar(json.loads(tc.function.arguments or "{}"))
            except json.JSONDecodeError:
                args = {}
            msgs.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(_chat_tool(args), ensure_ascii=False)})
    return {"answer": "", "farm_data": bool(nome), "seconds": round(time.time() - t0, 1), "finish_reason": "max_steps"}
