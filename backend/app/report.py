"""Relatório da fazenda em PDF: cadastro, dados NASA, clima mensal e a última análise da IA.

Só usa dados que o app já tem (cadastro, métricas NASA do motor e a análise salva). Nenhum número é criado aqui.
"""
from datetime import datetime, timezone
from io import BytesIO

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, Polygon, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

GREEN = colors.HexColor("#3E7C4F")
SOIL = colors.HexColor("#B5835A")
INK = colors.HexColor("#1C2B22")
SAND = colors.HexColor("#F2EDE4")
MUTED = colors.HexColor("#6f7a72")
LINE = colors.HexColor("#e2ded5")

MONTHS = {
    "pt": ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
}

T = {
    "title": ("Farm report", "Relatório da fazenda", "Informe de la finca"),
    "generated": ("Generated on", "Gerado em", "Generado el"),
    "farm": ("1. Farm", "1. Fazenda", "1. Finca"),
    "location": ("Location", "Localização", "Ubicación"),
    "coords": ("Center (lat, lon)", "Centro (lat, lon)", "Centro (lat, lon)"),
    "area": ("Area", "Área", "Área"),
    "boundary": ("Boundary", "Contorno", "Contorno"),
    "vertices": ("vertices", "vértices", "vértices"),
    "crop": ("Current crop", "Cultura atual", "Cultivo actual"),
    "previous": ("Previous crop", "Cultura anterior", "Cultivo anterior"),
    "planting": ("Planting month", "Mês de plantio", "Mes de siembra"),
    "soil": ("Soil", "Solo", "Suelo"),
    "irrigation": ("Irrigation", "Irrigação", "Riego"),
    "goals": ("Goals", "Metas", "Objetivos"),
    "notes": ("Notes", "Observações", "Notas"),
    "nasa": ("2. What NASA data shows about this field", "2. O que os dados da NASA mostram sobre a área",
             "2. Lo que muestran los datos de la NASA sobre el área"),
    "indicator": ("Indicator", "Indicador", "Indicador"),
    "value": ("Value", "Valor", "Valor"),
    "type": ("Type", "Tipo", "Tipo"),
    "source": ("Source and period", "Fonte e período", "Fuente y período"),
    "observed": ("Observed", "Observado", "Observado"),
    "estimated": ("Estimate", "Estimativa", "Estimación"),
    "no_metrics": ("NASA data for this area is still being downloaded. Open the farm in the app and try again later.",
                   "Os dados da NASA desta área ainda estão sendo baixados. Abra a fazenda no app e tente de novo mais tarde.",
                   "Los datos de la NASA de esta área aún se están descargando. Abra la finca en la app y vuelva a intentarlo."),
    "climate": ("3. Climate month by month (average 2020-2024)", "3. Clima mês a mês (média 2020-2024)",
                "3. Clima mes a mes (promedio 2020-2024)"),
    "month": ("Month", "Mês", "Mes"),
    "rain": ("Rain (mm)", "Chuva (mm)", "Lluvia (mm)"),
    "temp": ("Temp. (°C)", "Temp. (°C)", "Temp. (°C)"),
    "et": ("ET (mm)", "ET (mm)", "ET (mm)"),
    "balance": ("Balance (mm)", "Balanço (mm)", "Balance (mm)"),
    "soilm": ("Soil moisture (%)", "Umidade do solo (%)", "Humedad del suelo (%)"),
    "chart": ("Average monthly rain (mm)", "Chuva média mensal (mm)", "Lluvia media mensual (mm)"),
    "climate_note": ("Negative balance = the field uses more water than it receives that month. NDVI below 0.30 = bare soil or straw.",
                     "Balanço negativo = a área usa mais água do que recebe naquele mês. NDVI abaixo de 0,30 = solo descoberto ou palha.",
                     "Balance negativo = el área usa más agua de la que recibe ese mes. NDVI bajo 0,30 = suelo desnudo o rastrojo."),
    "facts": ("Key facts (NASA data)", "Fatos principais (dados NASA)", "Datos clave (datos NASA)"),
    "onset": ("Average start of the rains", "Início médio das chuvas", "Inicio medio de las lluvias"),
    "dryspell": ("Seasons with dry spells", "Safras com veranico", "Temporadas con veranillo"),
    "deficit": ("Water-deficit months", "Meses com déficit hídrico", "Meses con déficit hídrico"),
    "bare": ("Bare-soil months (NDVI)", "Meses de solo descoberto (NDVI)", "Meses de suelo desnudo (NDVI)"),
    "none": ("none", "nenhum", "ninguno"),
    "ai": ("4. AI rotation analysis", "4. Análise de rotação com IA", "4. Análisis de rotación con IA"),
    "no_ai": ("No AI analysis yet. Run \"Analyze this farm with AI\" in the app to add it to this report.",
              "Ainda não há análise da IA. Use \"Analisar esta fazenda com IA\" no app para incluí-la neste relatório.",
              "Aún no hay análisis de IA. Use \"Analizar esta finca con IA\" en la app para incluirlo en este informe."),
    "suggestion": ("Our suggestion", "Nossa sugestão", "Nuestra sugerencia"),
    "rotation": ("Rotation", "Rotação", "Rotación"),
    "current": ("current", "atual", "actual"),
    "recommended": ("recommended", "recomendada", "recomendada"),
    "calendar": ("Calendar", "Calendário", "Calendario"),
    "why": ("Why", "Por quê", "Por qué"),
    "benefits": ("Benefits", "Benefícios", "Beneficios"),
    "risks": ("Risks", "Riscos", "Riesgos"),
    "uncertainty": ("Uncertainty", "Incerteza", "Incertidumbre"),
    "unc": ({"low": "low", "medium": "medium", "high": "high"}, {"low": "baixa", "medium": "média", "high": "alta"},
            {"low": "baja", "medium": "media", "high": "alta"}),
    "general": ("General knowledge (not from NASA data)", "Conhecimento geral (não vem dos dados da NASA)",
                "Conocimiento general (no proviene de datos de la NASA)"),
    "analysis_date": ("Analysis generated on", "Análise gerada em", "Análisis generado el"),
    "warnings": ("Warnings", "Avisos", "Avisos"),
    "irrigated": ("You marked this farm as irrigated. TerraTurn assumes rainfed farming; use the analysis as a rainfed reference.",
                  "Você marcou esta fazenda como irrigada. O TerraTurn considera lavoura de sequeiro; use a análise como referência de sequeiro.",
                  "Marcó esta finca como regada. TerraTurn asume secano; use el análisis como referencia de secano."),
    "landuse": ("The field stayed green almost all year in the satellite data (NDVI). Check whether it is already sugarcane, perennial pasture, citrus, forestry or cropped all year.",
                "A área ficou verde quase o ano todo nos dados de satélite (NDVI). Confirme se ela já é cana, pastagem perene, citros, silvicultura ou cultivada o ano inteiro.",
                "El área se mantuvo verde casi todo el año en los datos satelitales (NDVI). Confirme si ya es caña, pastura perenne, cítricos, silvicultura o cultivo todo el año."),
    "about": ("5. About the data", "5. Sobre os dados", "5. Sobre los datos"),
    "about_text": (
        "Rain, temperature and soil moisture: NASA POWER (~50 km grid, daily 2005-2024). It can underestimate summer rain compared with local rain gauges. "
        "Vegetation (NDVI): MODIS MOD13Q1, one 250 m pixel at the field centre. Evapotranspiration: MODIS MOD16A2 (500 m). "
        "This report shows history, not forecasts. Validate decisions with a local agronomist.",
        "Chuva, temperatura e umidade do solo: NASA POWER (grade de ~50 km, diário 2005-2024). Pode subestimar a chuva de verão em relação a pluviômetros locais. "
        "Vegetação (NDVI): MODIS MOD13Q1, um pixel de 250 m no centro da área. Evapotranspiração: MODIS MOD16A2 (500 m). "
        "Este relatório mostra histórico, não previsão. Valide as decisões com um agrônomo local.",
        "Lluvia, temperatura y humedad del suelo: NASA POWER (grilla de ~50 km, diario 2005-2024). Puede subestimar la lluvia de verano frente a pluviómetros locales. "
        "Vegetación (NDVI): MODIS MOD13Q1, un píxel de 250 m en el centro del área. Evapotranspiración: MODIS MOD16A2 (500 m). "
        "Este informe muestra historia, no pronósticos. Valide las decisiones con un agrónomo local."),
    "page": ("Page", "Página", "Página"),
}

METRIC_LABELS = {
    "rainfall": ("Rainfall", "Chuva", "Lluvia"),
    "temperature": ("Average temperature", "Temperatura média", "Temperatura media"),
    "water_balance": ("Water balance", "Balanço hídrico", "Balance hídrico"),
    "soil_moisture": ("Soil moisture", "Umidade do solo", "Humedad del suelo"),
    "ndvi": ("Vegetation vigor (NDVI)", "Vigor vegetal (NDVI)", "Vigor vegetal (NDVI)"),
    "cover": ("Ground cover", "Cobertura do solo", "Cobertura del suelo"),
}
GOALS = {
    "water": ("Save water", "Economizar água", "Ahorrar agua"), "soil": ("Soil health", "Saúde do solo", "Salud del suelo"),
    "resilience": ("Resilience", "Resiliência", "Resiliencia"), "yield": ("Yield", "Produtividade", "Productividad"),
    "cost": ("Costs", "Custos", "Costos"), "fertility": ("Fertility", "Fertilidade", "Fertilidad"),
    "erosion": ("Erosion", "Erosão", "Erosión"), "phytosanitary": ("Plant health", "Fitossanidade", "Fitosanidad"),
    "diversity": ("Diversity", "Diversidade", "Diversidad"), "margin": ("Margin", "Margem", "Margen"),
}
SOIL_TEXTURE = {"sandy": ("Sandy", "Arenoso", "Arenoso"), "loamy": ("Loamy", "Franco", "Franco"),
                "clayey": ("Clayey", "Argiloso", "Arcilloso"), "silty": ("Silty", "Siltoso", "Limoso")}
IRRIGATION = {"rainfed": ("Rainfed", "Sequeiro", "Secano"), "irrigated": ("Irrigated", "Irrigado", "Regado"),
              "mixed": ("Mixed", "Misto", "Mixto")}
NOT_PROVIDED = ("Not provided", "Não informado", "No informado")


def _lang(language: str | None) -> str:
    v = (language or "en").lower()
    return "pt" if v.startswith("pt") else "es" if v.startswith("es") else "en"


def _clean(text) -> str:
    """Texto seguro para as fontes padrão do PDF (cp1252) e para o markup do Paragraph."""
    s = "" if text is None else str(text)
    for a, b in {"≥": ">=", "≤": "<=", "−": "-", "→": "->", "≈": "~", "²": "2", "³": "3", " ": " ", " ": " "}.items():
        s = s.replace(a, b)
    s = s.encode("cp1252", "replace").decode("cp1252")
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _md(text) -> str:
    """Negrito **x** da IA vira <b>x</b>; o resto é texto limpo."""
    import re
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", _clean(text))


def _num(v, d=1) -> str:
    if v is None:
        return "-"
    s = f"{v:,.{d}f}"
    return s


def _boundary_drawing(geometry: dict, width=60 * mm, height=45 * mm) -> Drawing | None:
    try:
        ring = geometry["coordinates"][0]
    except (KeyError, IndexError, TypeError):
        return None
    if len(ring) < 3:
        return None
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    w, h = (max(xs) - min(xs)) or 1e-9, (max(ys) - min(ys)) or 1e-9
    k = min((width - 10) / w, (height - 10) / h)
    pts = []
    for x, y in ring:
        pts += [5 + (x - min(xs)) * k, 5 + (y - min(ys)) * k]
    d = Drawing(width, height)
    d.add(Polygon(pts, fillColor=colors.Color(0.243, 0.486, 0.31, alpha=0.18), strokeColor=GREEN, strokeWidth=1.5))
    d.add(String(width - 6, height - 9, "N", fontSize=8, fillColor=MUTED, textAnchor="end"))
    return d


def _rain_chart(monthly: list, months: list, label: str) -> Drawing | None:
    vals = [r.get("rain_mm") for r in monthly]
    if not monthly or all(v is None for v in vals):
        return None
    d = Drawing(170 * mm, 52 * mm)
    c = VerticalBarChart()
    c.x, c.y, c.width, c.height = 12 * mm, 8 * mm, 155 * mm, 36 * mm
    c.data = [[v or 0 for v in vals]]
    c.categoryAxis.categoryNames = [months[int(r["month"]) - 1] for r in monthly]
    c.categoryAxis.labels.fontSize = 7
    c.valueAxis.labels.fontSize = 7
    c.valueAxis.valueMin = 0
    c.bars[0].fillColor = GREEN
    c.bars[0].strokeColor = None
    c.barSpacing = 2
    d.add(c)
    d.add(String(12 * mm, 48 * mm, label, fontSize=8, fillColor=MUTED))
    return d


def build_farm_report(prop, context: dict, study, language: str | None, farm_data: dict | None = None,
                      land_use: dict | None = None) -> bytes:
    i = {"en": 0, "pt": 1, "es": 2}[_lang(language)]
    lang = ["en", "pt", "es"][i]
    t = lambda k: T[k][i]  # noqa: E731
    months = MONTHS[lang]

    styles = {
        "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK),
        "sub": ParagraphStyle("sub", fontName="Helvetica", fontSize=9.5, leading=13, textColor=MUTED),
        "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=GREEN, spaceBefore=10, spaceAfter=6),
        "h3": ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=INK, spaceBefore=6, spaceAfter=3),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=INK, alignment=TA_LEFT),
        "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=11, textColor=MUTED),
        "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=11, textColor=INK),
        "cellb": ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=INK),
        "hero": ParagraphStyle("hero", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=colors.white),
        "herob": ParagraphStyle("herob", fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=colors.white),
    }
    P = lambda txt, st="body": Paragraph(txt, styles[st])  # noqa: E731

    def table(rows, widths, header=True):
        tb = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
        style = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
                 ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
        if header:
            style += [("BACKGROUND", (0, 0), (-1, 0), SAND)]
        tb.setStyle(TableStyle(style))
        return tb

    story = []
    now = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    story += [P("TerraTurn", "sub"), P(f"{t('title')}: {_clean(prop.nome_propriedade)}", "title"),
              P(f"{t('generated')} {now} · terraturn.work", "sub"), Spacer(1, 6)]

    # 1. Fazenda
    soil = prop.soil or {}
    goals = ", ".join(GOALS.get(g, (g, g, g))[i] for g in (prop.priorities or [])) or NOT_PROVIDED[i]
    local = ", ".join(x for x in [prop.locality, prop.municipio, prop.state, prop.country] if x) or NOT_PROVIDED[i]
    texture = SOIL_TEXTURE.get(soil.get("texture"), NOT_PROVIDED)[i]
    soil_txt = texture + (f" · pH {soil['ph']}" if soil.get("ph") is not None else "") + \
        (f" · MO {soil['organic_matter_percent']}%" if soil.get("organic_matter_percent") is not None else "")
    ring = ((prop.geometry or {}).get("coordinates") or [[]])[0]
    rows = [
        [P(t("location"), "cellb"), P(_clean(local), "cell")],
        [P(t("coords"), "cellb"), P(f"{prop.latitude:.5f}, {prop.longitude:.5f}", "cell")],
        [P(t("area"), "cellb"), P(f"{_num(prop.tamanho_hectares, 2)} ha", "cell")],
        [P(t("boundary"), "cellb"), P(f"{max(len(ring) - 1, 0)} {t('vertices')}", "cell")],
        [P(t("crop"), "cellb"), P(_clean(prop.crop) or NOT_PROVIDED[i], "cell")],
        [P(t("previous"), "cellb"), P(_clean(prop.previous_crop) or NOT_PROVIDED[i], "cell")],
        [P(t("planting"), "cellb"), P(months[prop.planting_month - 1] if prop.planting_month else NOT_PROVIDED[i], "cell")],
        [P(t("soil"), "cellb"), P(_clean(soil_txt), "cell")],
        [P(t("irrigation"), "cellb"), P(IRRIGATION.get(soil.get("irrigation"), NOT_PROVIDED)[i], "cell")],
        [P(t("goals"), "cellb"), P(_clean(goals), "cell")],
    ]
    if prop.notes:
        rows.append([P(t("notes"), "cellb"), P(_clean(prop.notes), "cell")])
    info = table(rows, [32 * mm, 78 * mm], header=False)
    shape = _boundary_drawing(prop.geometry or {})
    story += [P(t("farm"), "h2"), Table([[info, shape or ""]], colWidths=[112 * mm, 62 * mm],
                                         style=[("VALIGN", (0, 0), (-1, -1), "TOP")])]

    # 2. Dados NASA
    story.append(P(t("nasa"), "h2"))
    metrics = [m for m in (context or {}).get("metrics", []) if m.get("value") is not None]
    if metrics:
        rows = [[P(t("indicator"), "cellb"), P(t("value"), "cellb"), P(t("type"), "cellb"), P(t("source"), "cellb")]]
        for m in metrics:
            label = METRIC_LABELS.get(m["id"], (m["id"],) * 3)[i]
            kind = t("estimated") if m.get("kind") == "estimated" else t("observed")
            fonte = " · ".join(x for x in [m.get("source"), m.get("resolution")] if x)
            rows.append([P(label, "cell"), P(f"<b>{_num(m['value'], 2)}</b> {_clean(m.get('unit'))}", "cell"),
                         P(kind, "cell"), P(_clean(fonte), "cell")])
        story.append(table(rows, [40 * mm, 32 * mm, 22 * mm, 80 * mm]))
    else:
        story.append(P(t("no_metrics")))
    if land_use:
        story.append(P("<b>!</b> " + t("landuse"), "body"))

    # 3. Clima mês a mês (média 2020-2024) e fatos de 20 anos, a partir da análise ou do histórico
    result = getattr(study, "result", None) or {}
    fd = result.get("farm_data") or farm_data or {}
    monthly = fd.get("monthly") or []
    if monthly:
        story.append(P(t("climate"), "h2"))
        chart = _rain_chart(monthly, months, t("chart"))
        if chart:
            story.append(chart)
        rows = [[P(x, "cellb") for x in (t("month"), t("rain"), t("temp"), t("et"), t("balance"), t("soilm"), "NDVI")]]
        for r in monthly:
            rows.append([P(months[int(r["month"]) - 1], "cell"), P(_num(r.get("rain_mm")), "cell"), P(_num(r.get("temp_mean_c")), "cell"),
                         P(_num(r.get("evapotranspiration_mm")), "cell"), P(_num(r.get("water_balance_mm")), "cell"),
                         P(_num(r.get("root_soil_moisture_pct")), "cell"), P(_num(r.get("ndvi"), 2), "cell")])
        story += [KeepTogether([table(rows, [18 * mm, 24 * mm, 22 * mm, 22 * mm, 26 * mm, 32 * mm, 18 * mm]), P(t("climate_note"), "small")])]
        ind = fd.get("agro_indicators") or {}
        mes = lambda lst: ", ".join(months[int(x) - 1] for x in lst) if lst else t("none")  # noqa: E731
        fatos = []
        if ind.get("rain_onset"):
            fatos.append([P(t("onset"), "cellb"), P(_clean(ind["rain_onset"].get("mean_date_dd_mm")), "cell")])
        if ind.get("dry_spells_main_season"):
            fatos.append([P(t("dryspell"), "cellb"), P(f"{ind['dry_spells_main_season'].get('pct_seasons_with_dry_spell')}%", "cell")])
        fatos.append([P(t("deficit"), "cellb"), P(mes(fd.get("deficit_months")), "cell")])
        fatos.append([P(t("bare"), "cellb"), P(mes(fd.get("bare_soil_months")), "cell")])
        story += [P(t("facts"), "h3"), table(fatos, [60 * mm, 114 * mm], header=False)]

    # 4. Análise da IA
    story.append(P(t("ai"), "h2"))
    analysis = result.get("analysis") if getattr(study, "status", None) == "complete" else None
    if not analysis:
        story.append(P(t("no_ai")))
    else:
        names = result.get("crop_names") or {}
        crop = lambda c: _clean(((names.get(c) or {}).get(lang) or (names.get(c) or {}).get("en") or c.replace("_", " ")).capitalize())  # noqa: E731
        rec = analysis.get("recommendation") or {}
        hero = Table([[P(f"{t('suggestion')}: {crop(rec.get('suggested_crop', ''))}", "hero")],
                      [P(_md(rec.get("message_to_farmer")), "herob")]], colWidths=[174 * mm])
        hero.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), INK), ("LEFTPADDING", (0, 0), (-1, -1), 10),
                                  ("RIGHTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 7),
                                  ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
        story.append(hero)
        avisos = []
        if result.get("irrigated_warning"):
            avisos.append(t("irrigated"))
        if result.get("land_use_warning") and not land_use:
            avisos.append(t("landuse"))
        if avisos:
            story += [P(t("warnings"), "h3")] + [P("• " + _clean(a)) for a in avisos]
        for rot in analysis.get("rotations", []):
            tag = t("current") if rot.get("is_current") else ""
            if rot.get("name") == rec.get("rotation_name"):
                tag = (tag + " · " if tag else "") + t("recommended")
            cal = "; ".join(f"{crop(c['crop'])}: {months[int(c['sow_month']) - 1]} -> {months[int(c['harvest_month']) - 1]}"
                            for c in rot.get("calendar", []) if c.get("sow_month") and c.get("harvest_month"))
            bloco = [P(f"{t('rotation')}: {_clean(rot.get('name'))}" + (f" <font color='#3E7C4F'>({tag})</font>" if tag else ""), "h3"),
                     P(_md(rot.get("farmer_summary"))),
                     P(f"<b>{t('calendar')}:</b> {cal or '-'}", "body"),
                     P(f"<b>{t('why')}:</b> {_md(rot.get('why'))}", "body")]
            lista = lambda titulo, itens: [P(f"<b>{titulo}:</b>", "body")] + [P("• " + _md(x)) for x in (itens or [])]  # noqa: E731
            bloco += lista(t("benefits"), rot.get("benefits")) + lista(t("risks"), rot.get("risks"))
            if rot.get("general_knowledge"):
                bloco += lista(t("general"), rot.get("general_knowledge"))
            unc = T["unc"][i].get(rot.get("uncertainty"), _clean(rot.get("uncertainty")))
            bloco.append(P(f"<b>{t('uncertainty')}:</b> {unc}" + (f" · {_md(rot.get('temperature_fit'))}" if rot.get("temperature_fit") else "")))
            story += [KeepTogether(bloco[:4]), *bloco[4:], Spacer(1, 4)]
        if analysis.get("disclaimer"):
            story.append(P(_md(analysis["disclaimer"]), "small"))
        if result.get("generated_at"):
            story.append(P(f"{t('analysis_date')} {_clean(result['generated_at'][:16].replace('T', ' '))} UTC", "small"))

    # 5. Sobre os dados
    story += [P(t("about"), "h2"), P(t("about_text"), "small")]

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 10 * mm, f"TerraTurn · {_clean(prop.nome_propriedade)}".replace("&amp;", "&"))
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"{t('page')} {doc.page}")
        canvas.setStrokeColor(SOIL)
        canvas.line(18 * mm, A4[1] - 12 * mm, A4[0] - 18 * mm, A4[1] - 12 * mm)
        canvas.restoreState()

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                            title=f"TerraTurn - {prop.nome_propriedade}", author="TerraTurn")
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
