import os
import re
import csv
import glob
import json
import time
import random
import unicodedata
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import pandas as pd
import requests
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

try:
    from json_repair import repair_json
except ImportError:
    repair_json = None

PROVEDORES = {
    "anthropic": ("https://api.anthropic.com/v1/", "ANTHROPIC_API_KEY"),
}
MODELOS = [
    ("anthropic", "claude-haiku-5-5"),
]
MODELOS_TESTE = ["claude-haiku-5-5"]
PRECOS = {"claude-haiku-5-5": (0.10, 0.50)}
RACIOCINIO_BAIXO = False
FAZENDAS = {
    "rio_campim_norte": (-3.5579336371350903, -48.64693953925579),
    "dom_pedro_sementec_nordeste": (-12.4410, -45.7890),
    "fazenda_da_toca_sudeste": (-22.2155, -47.7685),
    "tucunareamaggi_centro_oeste": (-13.476743708024967, -58.89937692739597),
    "guatambu_sul": (-30.918010035468342, -54.79330880597324),
    "pergamino_argentina": (-33.9500, -60.6500),
    "boone_iowa_eua": (42.1000, -93.8000),
}
PRIORIDADES = {
    "agua": "Priority: save water.",
    "renda": "Priority: extra income.",
    "solo": "Priority: improve soil health (organic matter and nitrogen).",
    "erosao": "Priority: reduce soil erosion and keep the soil covered.",
    "forragem": "Priority: produce forage for my cattle in the dry season.",
    "risco": "Priority: lower climate risk; I want a stable harvest every year.",
}
PRIORIDADES_TESTE = ["agua", "renda", "solo", "risco"]
PRIORIDADES_PT = {
    "agua": "Prioridade: economizar água.",
    "renda": "Prioridade: ter uma renda extra.",
    "solo": "Prioridade: melhorar a saúde do solo (matéria orgânica e nitrogênio).",
    "risco": "Prioridade: diminuir o risco climático; quero uma colheita estável todo ano.",
}
SEMENTE = 2026
FRACAO_BORDA = 0.3
TIPOS_BORDA = ["monocultura", "tres_culturas", "fora_tabela", "fora_janela", "sem_meses", "portugues"]
CHUVA_MES_CHUVOSO_MM = 80
CHUVA_MES_SECO_MM = 50
TEMP_INICIO_SAFRA_C = 20
TEMP_INVERNO_FRIO_C = 15
TEMP_INICIO_FRIO_C = 16
TEMP_MES_FRIO_C = 18
FRACAO_PT = 0.25
FOLGA_TEMP_C = 2
INICIO_DADOS, FIM_DADOS = "2020-01-01", "2024-12-31"
ORNL = "https://modis.ornl.gov/rst/api/v1"
TIMEOUT_DOWNLOAD = 150
TENTATIVAS_DOWNLOAD = 8
RODADAS = 2
PAUSA_SEG = {"anthropic": 1}
MAX_TOKENS = 8000
TEMP_VERAO_CURTO_DELTA_C = 8
FOLGA_PLANTIO_C = 7
TEMP_MIN_PLANTIO_C = 3
TEMP_SECA_QUENTE_C = 18
CHUVA_SECA_QUENTE_MM = 30
UMID_REL_UMIDO = 0.9
FORA_DO_RANKING = ("principal_verao", "perene")
CAMPOS_LLM = ["cultura", "papel", "agua", "ciclo_dias", "temp_ideal_c", "fixa_n", "cobertura", "forragem", "tolera_seca", "mercado"]
ARQ_TABELA = os.getenv("TERRATURN_TABELA", "tabela_culturas_oficial_v2.json")
RE_FAIXA = re.compile(r"(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)")


def usar_tabela(culturas):
    global CULTURAS, TABELA
    CULTURAS = culturas
    TABELA = {c["cultura"]: c for c in culturas}


def faixa_temp(t):
    a, b = RE_FAIXA.fullmatch(str(t["temp_ideal_c"]).strip()).groups()
    return float(a), float(b)


usar_tabela(json.load(open(ARQ_TABELA, encoding="utf-8")))
MES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MES_PT_ABR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def mes_mais(m, n):
    return (m - 1 + n) % 12 + 1


def dist_mes(a, b):
    d = abs(a - b) % 12
    return min(d, 12 - d)


def _combina(prio, c):
    if isinstance(prio, (list, tuple)):
        return not prio or any(_combina(p, c) for p in prio)
    t = TABELA.get(c, {})
    return {
        "agua": t.get("agua") == "baixa" or t.get("tolera_seca") == "alta",
        "renda": t.get("mercado") in ("alto", "medio"),
        "solo": bool(t.get("fixa_n")) or bool(t.get("cobertura")),
        "erosao": bool(t.get("cobertura")),
        "forragem": bool(t.get("forragem")),
        "risco": t.get("tolera_seca") in ("alta", "media"),
    }.get(prio, True)


DIA_SECO_MM = 1.0
VERANICO_DIAS = 10
INICIO_CHUVA_MM_3D = 20
LIMIAR_SOLO_SECO = 0.55
ANOS_RECENTES = 5
_AGRO = {}


def baixar_power_diario(lat, lon):
    cache = f"data/power_diario_{lat:.3f}_{lon:.3f}_2005_2024.csv"
    if os.path.exists(cache):
        return pd.read_csv(cache, parse_dates=["data"]).set_index("data").sort_index()
    params = dict(parameters="PRECTOTCORR,GWETROOT", community="AG", latitude=lat, longitude=lon,
                  start="20050101", end="20241231", format="JSON")
    resp = requests.get("https://power.larc.nasa.gov/api/temporal/daily/point", params=params, timeout=180)
    resp.raise_for_status()
    df = pd.DataFrame(resp.json()["properties"]["parameter"])
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df = df.replace(-999, float("nan")).rename_axis("data")
    os.makedirs("data", exist_ok=True)
    df.to_csv(cache)
    return df.sort_index()


def maior_sequencia_seca(chuva):
    maior = atual = 0
    for v in chuva:
        atual = atual + 1 if v < DIA_SECO_MM else 0
        maior = max(maior, atual)
    return maior


def contar_veranicos(chuva):
    n = atual = 0
    for v in chuva:
        if v < DIA_SECO_MM:
            atual += 1
            if atual == VERANICO_DIAS:
                n += 1
        else:
            atual = 0
    return n


def data_desde(m0, dias):
    d = pd.Timestamp(2001, m0, 1) + pd.Timedelta(days=round(float(dias)))
    return f"{d.day:02d}/{d.month:02d}"


def comparar_recente(serie):
    s = serie.dropna().sort_index()
    if len(s) < ANOS_RECENTES + 5:
        return None
    rec, ant = s.iloc[-ANOS_RECENTES:], s.iloc[:-ANOS_RECENTES]
    return round(float(rec.mean() - ant.mean()), 1)


def recorte(serie, ano, mes, n_meses):
    ini = pd.Timestamp(ano, mes, 1)
    return ini, serie[ini: ini + pd.DateOffset(months=n_meses) - pd.Timedelta(days=1)]


def inicio_chuvas(d, s):
    chuva = d["PRECTOTCORR"]
    m0 = mes_mais(s, -1)
    res = {}
    for ano in sorted(set(d.index.year)):
        ini, janela = recorte(chuva, ano, m0, 4)
        if len(janela) < 100:
            continue
        soma3 = janela.rolling(3).sum()
        for dia in soma3.index[soma3 >= INICIO_CHUVA_MM_3D]:
            prox = chuva[dia + pd.Timedelta(days=1): dia + pd.Timedelta(days=30)]
            if len(prox) < 30:
                break
            if maior_sequencia_seca(prox) < VERANICO_DIAS:
                res[ano] = (dia - ini).days
                break
    return m0, pd.Series(res, dtype=float)


def veranicos_por_safra(d, s):
    chuva = d["PRECTOTCORR"]
    linhas = []
    for ano in sorted(set(d.index.year)):
        _, est = recorte(chuva, ano, mes_mais(s, 1), 5)
        if len(est) < 140:
            continue
        linhas.append({"safra": ano, "n": contar_veranicos(est), "maior": maior_sequencia_seca(est)})
    return pd.DataFrame(linhas).set_index("safra") if linhas else pd.DataFrame(columns=["n", "maior"])


def fim_umidade(d, s):
    solo = d["GWETROOT"].rolling(7).mean()
    m0 = mes_mais(s, 5)
    res = {}
    for ano in sorted(set(d.index.year)):
        ini, janela = recorte(solo, ano, m0, 6)
        abaixo = janela[janela < LIMIAR_SOLO_SECO]
        if len(janela) > 150 and len(abaixo):
            res[ano] = (abaixo.index[0] - ini).days
    return m0, pd.Series(res, dtype=float)


def glossario_agro(s):
    a, b, c = MES_EN[mes_mais(s, -1) - 1], MES_EN[mes_mais(s, 1) - 1], MES_EN[mes_mais(s, 5) - 1]
    return (f"Daily NASA POWER, 20 years. rain_onset: first day after 1 {a} with 3 days >= 20 mm and no dry spell "
            f"in the next 30 days (main-season sowing). dry_spells_main_season: runs of 10+ days with rain < 1 mm in {b}-{c}. "
            f"soil_moisture_end_second_crop: first day after 1 {c} when root-zone soil moisture drops below 0.55 "
            f"(second crop must be sown well before). recent_5y_shift: last 5 years minus earlier years; positive days = later.")


def indicadores_agro(lat, lon, s=10):
    chave = (round(lat, 3), round(lon, 3), s)
    if chave in _AGRO:
        return _AGRO[chave]
    try:
        d = baixar_power_diario(chave[0], chave[1])
        (m_ini, ini), ver, (m_fim, fim) = inicio_chuvas(d, s), veranicos_por_safra(d, s), fim_umidade(d, s)
        out = {"status": "ok", "years": "2005-2024"}
        if len(ini):
            tarde = pd.Timestamp(int(ini.idxmax()), m_ini, 1) + pd.Timedelta(days=int(ini.max()))
            out["rain_onset"] = {"mean_date_dd_mm": data_desde(m_ini, ini.mean()),
                                 "spread_days": int(round(float(ini.std()))),
                                 "latest_date": tarde.strftime("%d/%m/%Y"),
                                 "recent_5y_shift_days": comparar_recente(ini)}
        if len(ver):
            out["dry_spells_main_season"] = {"mean_per_season": round(float(ver["n"].mean()), 1),
                                             "pct_seasons_with_dry_spell": int(round(100 * float((ver["n"] > 0).mean()))),
                                             "mean_longest_dry_run_days": round(float(ver["maior"].mean()), 1),
                                             "recent_5y_shift": comparar_recente(ver["n"])}
        if len(fim):
            out["soil_moisture_end_second_crop"] = {"mean_date_dd_mm": data_desde(m_fim, fim.mean()),
                                                    "spread_days": int(round(float(fim.std()))),
                                                    "recent_5y_shift_days": comparar_recente(fim)}
    except Exception as e:
        out = {"status": "not_available", "message": f"Could not compute agro indicators: {type(e).__name__}"}
    _AGRO[chave] = out
    return out


CLIENTES = {p: OpenAI(base_url=url, api_key=os.environ[var])
            for p, (url, var) in PROVEDORES.items() if os.getenv(var)}


def carregar_csv(nome):
    arqs = sorted(glob.glob(f"saidas/mesclado_mensal_{nome}_*.csv"))
    if not arqs:
        raise FileNotFoundError(f"Sem CSV para {nome} em saidas/ (rode o teste_datasets.py antes)")
    return pd.read_csv(arqs[-1], parse_dates=["data"], index_col="data")


def get_json(url, params):
    for i in range(1, TENTATIVAS_DOWNLOAD + 1):
        try:
            r = requests.get(url, params=params, headers={"Accept": "application/json"}, timeout=TIMEOUT_DOWNLOAD)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if i == TENTATIVAS_DOWNLOAD:
                raise
            espera = min(10 * i, 60)
            print(f"    servidor lento ({type(e).__name__}); nova tentativa em {espera}s", flush=True)
            time.sleep(espera)


def power_mensal_base(lat, lon):
    arq = f"data/t_power_{lat}_{lon}_{INICIO_DADOS}_{FIM_DADOS}.csv"
    if os.path.exists(arq):
        return pd.read_csv(arq, parse_dates=["data"], index_col="data")
    p = dict(parameters="T2M,T2M_MIN,PRECTOTCORR,GWETROOT,GWETTOP", community="AG", latitude=lat, longitude=lon,
             start=INICIO_DADOS.replace("-", ""), end=FIM_DADOS.replace("-", ""), format="JSON")
    df = pd.DataFrame(get_json("https://power.larc.nasa.gov/api/temporal/daily/point", p)["properties"]["parameter"])
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df = df.replace(-999, float("nan")).rename_axis("data")
    os.makedirs("data", exist_ok=True)
    df.to_csv(arq)
    return df


def modis_ornl(produto, banda, banda_qual, lat, lon):
    nome = f"t_{produto}_{lat}_{lon}_{INICIO_DADOS}_{FIM_DADOS}"
    arq, parcial = f"data/{nome}.csv", f"data/{nome}_parcial.json"
    if os.path.exists(arq):
        return pd.read_csv(arq, parse_dates=["data"], index_col="data")
    linhas = json.load(open(parcial)) if os.path.exists(parcial) else {}
    datas = get_json(f"{ORNL}/{produto}/dates", {"latitude": lat, "longitude": lon})["dates"]
    datas = [d for d in datas if INICIO_DADOS <= d["calendar_date"] <= FIM_DADOS]
    for b in [banda] + ([banda_qual] if banda_qual else []):
        for i in range(0, len(datas), 10):
            bloco = datas[i:i + 10]
            if all(b in linhas.get(d["calendar_date"], {}) for d in bloco):
                continue
            resp = get_json(f"{ORNL}/{produto}/subset", {
                "latitude": lat, "longitude": lon, "band": b,
                "startDate": bloco[0]["modis_date"], "endDate": bloco[-1]["modis_date"],
                "kmAboveBelow": 0, "kmLeftRight": 0})
            for it in resp.get("subset", []):
                linhas.setdefault(it["calendar_date"], {})[b] = it["data"][len(it["data"]) // 2]
            json.dump(linhas, open(parcial, "w"))
            print(f"    {produto}/{b}: {min(i + 10, len(datas))}/{len(datas)}", flush=True)
            time.sleep(0.5)
    df = pd.DataFrame.from_dict(linhas, orient="index")
    df.index = pd.to_datetime(df.index)
    df = df.sort_index().rename_axis("data")
    df.to_csv(arq)
    os.remove(parcial)
    return df


def ndvi_modis(lat, lon):
    df = modis_ornl("MOD13Q1", "250m_16_days_NDVI", "250m_16_days_pixel_reliability", lat, lon)
    v = df["250m_16_days_NDVI"] * 0.0001
    ruim = df["250m_16_days_pixel_reliability"].isin([2, 3]) | (v < -0.2) | (v > 1)
    return pd.DataFrame({"ndvi": v.where(~ruim)})


def et_modis(lat, lon):
    df = modis_ornl("MOD16A2", "ET_500m", None, lat, lon)
    v = df["ET_500m"].astype(float)
    return pd.DataFrame({"et_mm_8d": v.where(v < 32700) * 0.1})


def mensal(res):
    p = res["power"]
    partes = [p.resample("MS").agg({"PRECTOTCORR": "sum", "T2M": "mean", "GWETROOT": "mean", "GWETTOP": "mean"})
              .rename(columns={"PRECTOTCORR": "chuva_power_mm", "T2M": "temp_c",
                               "GWETROOT": "umid_raiz_power", "GWETTOP": "umid_sup_power"})]
    if "ndvi" in res:
        partes.append(res["ndvi"].resample("MS").mean())
    if "et" in res:
        partes.append((res["et"]["et_mm_8d"] / 8).resample("MS").mean().mul(30.4).to_frame("et_mm_mes"))
    m = pd.concat(partes, axis=1)
    for col in ["ndvi", "et_mm_mes"]:
        if col not in m:
            m[col] = float("nan")
    m["balanco_power_mm"] = m["chuva_power_mm"] - m["et_mm_mes"]
    return m.rename_axis("data")


def baixar_ponto(nome, lat, lon):
    print(f"  baixando dados da NASA para {nome} ({lat}, {lon})...", flush=True)
    res = {"power": power_mensal_base(lat, lon)}
    for chave, f in (("ndvi", ndvi_modis), ("et", et_modis)):
        try:
            res[chave] = f(lat, lon)
        except Exception as e:
            print(f"    {chave} indisponível para {nome}: {type(e).__name__}", flush=True)
    m = mensal(res)
    m.to_csv(f"saidas/mesclado_mensal_{nome}_{datetime.now():%Y%m%d_%H%M}.csv")
    return m


def maior_sequencia(marcados):
    melhor, inicio = 0, 10
    for mes in range(1, 13):
        if marcados[mes] and not marcados[mes_mais(mes, -1)]:
            n = 0
            while n < 12 and marcados[mes_mais(mes, n)]:
                n += 1
            if n > melhor:
                melhor, inicio = n, mes
    return inicio


def inicio_safra(df):
    m = df.groupby(df.index.month)[["chuva_power_mm", "temp_c"]].mean().reindex(range(1, 13))
    chuva, temp = m["chuva_power_mm"], m["temp_c"]
    if temp.min() < TEMP_INVERNO_FRIO_C:
        limiar = min(TEMP_INICIO_FRIO_C, temp.max() - TEMP_VERAO_CURTO_DELTA_C)
        fria = int(temp.idxmin())
        quente = next(mes_mais(fria, k) for k in range(1, 12) if temp[mes_mais(fria, k)] >= limiar)
        if any(chuva[mes] >= CHUVA_MES_CHUVOSO_MM for mes in range(1, 13) if temp[mes] >= limiar):
            for k in range(12):
                mes = mes_mais(quente, k)
                if temp[mes] >= limiar and chuva[mes] >= CHUVA_MES_SECO_MM:
                    return mes
        return quente
    if chuva.min() >= CHUVA_MES_SECO_MM:
        return maior_sequencia({mes: chuva[mes] >= chuva.median() for mes in range(1, 13)})
    return maior_sequencia({mes: chuva[mes] >= CHUVA_MES_CHUVOSO_MM for mes in range(1, 13)})


def fases_da(s):
    return [(s, mes_mais(s, 4)), (mes_mais(s, 4), mes_mais(s, 8)), (mes_mais(s, 8), mes_mais(s, -1))]


def meses_ciclo(c):
    return round(TABELA[c]["ciclo_dias"] / 30)


def seco_quente(g, m):
    umid = g["umid_raiz_power"] if "umid_raiz_power" in g else pd.Series(dtype=float)
    umido = pd.notna(umid.get(m)) and umid[m] >= UMID_REL_UMIDO * umid.max()
    return g["temp_c"].get(m, 0) >= TEMP_SECA_QUENTE_C and g["chuva_power_mm"].get(m, 999) < CHUVA_SECA_QUENTE_MM and not umido


def janelas_da(df, s):
    colunas = [c for c in ("temp_c", "chuva_power_mm", "umid_raiz_power") if c in df]
    g = df.groupby(df.index.month)[colunas].mean()
    temp = g["temp_c"]
    janelas, fora = {}, {}
    for c, t in TABELA.items():
        if t.get("perene"):
            fora[c] = "perennial crop: it does not enter an annual rotation"
            continue
        lo, hi = faixa_temp(t)
        a, b = t["plantio_rel"]
        meses, medias, frios, secos = [], [], 0, 0
        for k in range(a, b + 1):
            m = mes_mais(s, k)
            ciclo = [temp.get(mes_mais(m, i)) for i in range(meses_ciclo(c))]
            ciclo = [x for x in ciclo if x is not None and pd.notna(x)]
            media = sum(ciclo) / len(ciclo) if ciclo else None
            if media is not None and not lo - FOLGA_TEMP_C <= media <= hi + FOLGA_TEMP_C:
                medias.append(round(media, 1))
            elif pd.notna(temp.get(m)) and temp[m] < max(lo - FOLGA_PLANTIO_C, TEMP_MIN_PLANTIO_C):
                frios += 1
            elif "chuva_power_mm" in g and seco_quente(g, m):
                secos += 1
            else:
                meses.append(m)
        if meses:
            janelas[c] = meses
        elif medias and not frios and not secos:
            fora[c] = (f"mean temperature over the cycle ({min(medias)}-{max(medias)} °C) is outside "
                       f"its ideal range {t['temp_ideal_c']} °C in every possible sowing month")
        elif secos >= frios:
            fora[c] = "its possible sowing months here are hot and dry (rainfed sowing would fail)"
        else:
            fora[c] = "its possible sowing months here are too cold to sow"
    return janelas, fora


PONTOS, DADOS, INICIO_SAFRA, FASES_POR, JANELAS = {}, {}, {}, {}, {}
_TRAVA_DADOS = threading.Lock()


def registrar(nome, lat, lon, df):
    PONTOS[nome] = (lat, lon)
    DADOS[nome] = df
    INICIO_SAFRA[nome] = inicio_safra(df)
    FASES_POR[nome] = fases_da(INICIO_SAFRA[nome])
    JANELAS[nome] = janelas_da(df, INICIO_SAFRA[nome])


for _nome, (_lat, _lon) in FAZENDAS.items():
    if glob.glob(f"saidas/mesclado_mensal_{_nome}_*.csv"):
        registrar(_nome, _lat, _lon, carregar_csv(_nome))


def meses_do_periodo(a, b):
    return list(range(a, b + 1)) if a <= b else list(range(a, 13)) + list(range(1, b + 1))


def fazenda_mais_proxima(lat, lon):
    if not PONTOS:
        return None
    n = min(PONTOS, key=lambda k: (PONTOS[k][0] - lat) ** 2 + (PONTOS[k][1] - lon) ** 2)
    d = ((PONTOS[n][0] - lat) ** 2 + (PONTOS[n][1] - lon) ** 2) ** 0.5
    return n if d <= 0.05 else None


def obter_ponto(lat, lon, nome=None):
    with _TRAVA_DADOS:
        achado = fazenda_mais_proxima(lat, lon)
        if achado:
            return achado
        nome = nome or f"ponto_{lat:.4f}_{lon:.4f}"
        df = carregar_csv(nome) if glob.glob(f"saidas/mesclado_mensal_{nome}_*.csv") else baixar_ponto(nome, lat, lon)
        registrar(nome, lat, lon, df)
        return nome


def r1(x):
    return None if x is None or pd.isna(x) else round(float(x), 1)


def bloco_temperatura(sel, tabela):
    validos = [t for t in tabela if t["temp_mean_c"] is not None]
    if not validos:
        return {"status": "not_available"}
    quente = max(validos, key=lambda t: t["temp_mean_c"])
    fria = min(validos, key=lambda t: t["temp_mean_c"])
    anual = sel.groupby(sel.index.year)["temp_c"].mean().dropna()
    variacao = r1(anual.iloc[-1] - anual.iloc[0]) if len(anual) >= 2 else None
    tendencia = "not_available" if variacao is None else (
        "warmer" if variacao >= 0.5 else "cooler" if variacao <= -0.5 else "stable")
    return {
        "hottest_month": quente["month"], "hottest_temp_c": quente["temp_mean_c"],
        "coolest_month": fria["month"], "coolest_temp_c": fria["temp_mean_c"],
        "months_above_25c": [t["month"] for t in validos if t["temp_mean_c"] > 25],
        "months_below_18c": [t["month"] for t in validos if t["temp_mean_c"] < 18],
        "change_first_to_last_year_c": variacao,
        "trend": tendencia,
        "how_to_use": "Compare these monthly means with each crop's temp_ideal_c range in the crop table.",
    }


def analisar_fazenda(lat, lon, mes_inicio, mes_fim):
    try:
        nome = obter_ponto(lat, lon)
    except Exception as e:
        return {"status": "not_available",
                "message": f"Could not download NASA data for this point ({type(e).__name__})."}
    df = DADOS[nome]
    meses = meses_do_periodo(mes_inicio, mes_fim)
    sel = df[df.index.month.isin(meses)]
    por_mes = sel.groupby(sel.index.month).mean(numeric_only=True).reindex(meses)

    tabela = [{
        "month": int(m),
        "rain_mm": r1(row.get("chuva_power_mm")),
        "temp_mean_c": r1(row.get("temp_c")),
        "evapotranspiration_mm": r1(row.get("et_mm_mes")),
        "water_balance_mm": r1(row.get("balanco_power_mm")),
        "ndvi": None if pd.isna(row.get("ndvi")) else round(float(row["ndvi"]), 2),
        "root_soil_moisture_pct": r1(row.get("umid_raiz_power") * 100) if pd.notna(row.get("umid_raiz_power")) else None,
    } for m, row in por_mes.iterrows()]

    sinal = sel[(sel["chuva_power_mm"] < 10) & (sel["ndvi"] >= 0.5) & (sel["et_mm_mes"] >= 30)]
    por_ano = [{"year": int(a),
                "rain_mm_total": r1(g["chuva_power_mm"].sum()),
                "temp_mean_c": r1(g["temp_c"].mean()),
                "water_balance_mm_total": r1(g["balanco_power_mm"].sum()) if g["balanco_power_mm"].notna().any() else "not_available",
                "ndvi_mean": None if g["ndvi"].isna().all() else round(float(g["ndvi"].mean()), 2)}
               for a, g in sel.groupby(sel.index.year)]

    return {
        "status": "ok",
        "farm_point": {"lat": lat, "lon": lon},
        "agro_indicators_2005_2024": indicadores_agro(*PONTOS[nome], INICIO_SAFRA[nome]),
        "period_months": meses,
        "monthly_average_2020_2024": tabela,
        "deficit_months": [t["month"] for t in tabela
                           if t["water_balance_mm"] is not None and t["water_balance_mm"] < 0],
        "bare_soil_months": [t["month"] for t in tabela
                             if t["ndvi"] is not None and t["ndvi"] < 0.30],
        "temperature": bloco_temperatura(sel, tabela),
        "by_year": por_ano,
        "possible_irrigation_signal": {
            "detected": bool(len(sinal)),
            "years": sorted({int(a) for a in sinal.index.year}),
            "rule": "month with rain < 10 mm, NDVI >= 0.5 and evapotranspiration >= 30 mm",
            "note": "Hypothesis from satellite data, not a confirmed fact.",
        },
        "glossary": {
            "rain_mm": "Monthly rainfall from NASA POWER (mm), a ~50 km grid estimate that can differ from local rain gauges.",
            "temp_mean_c": "Monthly mean air temperature at 2 m from NASA POWER (°C).",
            "evapotranspiration_mm": "Water used by plants and soil per month, MODIS MOD16A2 (mm). Only from 2021.",
            "water_balance_mm": "Rain minus evapotranspiration (mm). Negative = deficit (field uses more water than it receives).",
            "ndvi": "MODIS vegetation index (0-1). Below 0.30 = bare soil or straw; above 0.6 = dense green crop.",
            "monthly_average_2020_2024": "Average of the same month across 2020-2024. Not a forecast.",
            "agro_indicators_2005_2024": glossario_agro(INICIO_SAFRA[nome]),
            "possible_irrigation_signal": "Green vegetation with high water use in a month with almost no rain: irrigation, perennial crop or pasture.",
        },
        "limitations": [
            "Monthly table: only 5 years (2020-2024); agro indicators use 20 years of daily POWER. The temperature change is between two years, not a long-term trend.",
            "NDVI and evapotranspiration come from one satellite pixel (250-500 m).",
            "Nearby farms share the same NASA POWER climate cell (~50 km).",
            "Validate with the farmer and a local agronomist.",
        ],
        "sources": ["NASA POWER", "MODIS MOD13Q1 (NDVI)", "MODIS MOD16A2 (ET)"],
    }


def normalizar_args(args):
    mapa = {"lat": "lat", "latitude": "lat", "lon": "lon", "lng": "lon", "longitude": "lon",
            "mesinicio": "mes_inicio", "mesfim": "mes_fim", "startmonth": "mes_inicio",
            "endmonth": "mes_fim"}
    return {mapa[re.sub(r"[^a-z]", "", k.lower())]: v for k, v in args.items()
            if re.sub(r"[^a-z]", "", k.lower()) in mapa}


def chamar_ferramenta(args, ja_chamadas):
    try:
        a = normalizar_args(args)
        chave = (round(float(a["lat"]), 3), round(float(a["lon"]), 3), int(a["mes_inicio"]), int(a["mes_fim"]))
    except Exception as e:
        return {"error": f"Invalid arguments {args}: {e}. Use lat, lon, mes_inicio, mes_fim (1-12)."}
    if chave in ja_chamadas:
        return {"status": "already_returned",
                "message": "You already received this phase above. Do not call it again. Call entregar_resposta now if you have all 3 phases."}
    ja_chamadas.add(chave)
    return analisar_fazenda(chave[0], chave[1], chave[2], chave[3])


TEXTO = {"type": "string"}
LISTA = {"type": "array", "items": {"type": "string"}}
SCHEMA_RESPOSTA = {
    "type": "object",
    "properties": {
        "rotations": {
            "type": "array", "minItems": 3, "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {
                    "name": TEXTO,
                    "is_current": {"type": "boolean"},
                    "crops": LISTA,
                    "calendar": {"type": "array", "items": {
                        "type": "object",
                        "properties": {"crop": TEXTO,
                                       "sow_month": {"type": "integer", "minimum": 1, "maximum": 12},
                                       "harvest_month": {"type": "integer", "minimum": 1, "maximum": 12}},
                        "required": ["crop", "sow_month", "harvest_month"]}},
                    "farmer_summary": TEXTO,
                    "why": TEXTO,
                    "evidence": {**LISTA, "maxItems": 4},
                    "temperature_fit": TEXTO,
                    "benefits": {**LISTA, "maxItems": 3},
                    "risks": {**LISTA, "maxItems": 3},
                    "general_knowledge": {**LISTA, "maxItems": 2},
                    "uncertainty": {"type": "string", "enum": ["low", "medium", "high"]},
                },
                "required": ["name", "is_current", "crops", "calendar", "farmer_summary", "why",
                             "evidence", "temperature_fit", "benefits", "risks",
                             "general_knowledge", "uncertainty"],
            },
        },
        "recommendation": {
            "type": "object",
            "properties": {"suggested_crop": {"type": "string", "enum": [c for c, t in TABELA.items() if not t.get("perene")]}, "rotation_name": TEXTO, "message_to_farmer": TEXTO},
            "required": ["suggested_crop", "rotation_name", "message_to_farmer"],
        },
        "disclaimer": TEXTO,
    },
    "required": ["rotations", "recommendation", "disclaimer"],
}

TOOLS = [
    {"type": "function", "function": {
        "name": "analisar_fazenda",
        "description": ("NASA satellite data for a farm and a month range (one crop phase): monthly rain, "
                        "temperature summary, evapotranspiration, water balance (rain - ET), NDVI, soil moisture, "
                        "deficit and bare-soil months, values by year, a possible irrigation signal and 20-year agro indicators "
                        "(rain onset date, dry spells, end of soil moisture for the second crop). "
                        "Call exactly once per crop phase."),
        "parameters": {
            "type": "object",
            "properties": {
                "lat": {"type": "number"}, "lon": {"type": "number"},
                "mes_inicio": {"type": "integer", "minimum": 1, "maximum": 12},
                "mes_fim": {"type": "integer", "minimum": 1, "maximum": 12},
            },
            "required": ["lat", "lon", "mes_inicio", "mes_fim"],
        },
    }},
    {"type": "function", "function": {
        "name": "entregar_resposta",
        "description": "Deliver the final answer. Call it once, after the 3 phases of analisar_fazenda.",
        "parameters": SCHEMA_RESPOSTA,
    }},
]

SYSTEM = f"""You are an agronomic decision-support assistant for TerraTurn (NASA Space Apps 2026).
You SUPPORT farmers; you do not replace them or local agronomists.

TOOL USE
1. Never invent data. Call `analisar_fazenda` EXACTLY ONCE for each of the 3 phases listed in <farm_phases>
   (main season, second crop, dry season / cover crops), then stop calling it. The phases depend on the farm's region.
   You may call the 3 phases in parallel in one turn.
2. Use only numbers returned by the tool. If a value is "not_available", say so.
3. Key evidence: WATER BALANCE (rain minus evapotranspiration), NDVI (below 0.30 = bare soil)
   and TEMPERATURE. Deficit months are vulnerable periods.
4. The irrigation signal is only a HYPOTHESIS: never state the farm is irrigated; ask to confirm.

CROPS AND CALENDAR
5. The 2 ALTERNATIVES use only crops from <crop_table> (computed by TerraTurn for this farm's climate); in "crops" and
   "calendar" use the exact "cultura" id. Never use a crop listed in <not_suitable_here> in an alternative.
6. Every alternative fits in 12 months: sow_month must be one of the crop's "sow_months"; harvest_month = sow_month +
   ciclo_dias/30 (rounded); sow only after the previous harvest.

OUTPUT
7. Exactly 3 rotations: CURRENT first, then 2 alternatives that serve the farmer's PRIORITY.
   The CURRENT rotation repeats exactly what the farmer described (same crops and months), even if a crop is not
   in the table or is sown outside its window; for a crop outside the table use a short lowercase id (e.g. batata, gergelim).
   If the farmer gave no months, use the usual months for this farm's phases.
8. Every evidence item cites one number from the tool, in plain English (no field names). Max 4 per rotation.
9. "temperature_fit": one sentence comparing the tool's monthly temperature (°C) in the crop's months
   with the crop's "temp_ideal_c" range. Always include at least one °C number from the tool.
10. "farmer_summary": one sentence, max 30 words, no jargon.
11. "uncertainty": "high" if a crop with low drought tolerance ("tolera_seca": "baixa") grows in a
    deficit month; "medium" if deficit months exist but crops tolerate them; "low" only with no deficit.
12. Each crop of an alternative must be sown in one of its own "sow_months" (a crop with sow_months [2, 3, 4] cannot be sown in June).
    If the tool shows bare-soil months, AT LEAST ONE alternative must keep the soil covered in
    some of those months (e.g. a long-cycle cover crop or a third crop).
13. Statements from general agronomic knowledge (prices, machinery, pests...) go in
    "general_knowledge", never in "evidence".
14. "recommendation": ONE alternative that best serves the PRIORITY (for income, the suggested crop must have
    "mercado" alto or medio), preferring "medium" or "low"
    uncertainty over "high" when both serve it. "suggested_crop" is ONE crop id from the table. "message_to_farmer": 60-120 words, names the crop
    and when to sow, one number from the data, the main trade-off, ends recommending a local agronomist.
15. Keep texts short. Do not use double quotes inside text values. Write every text in the language given in
    <answer_language> (crop ids stay exactly as in the table); Portuguese must use correct accents (não, água, você, março).
16. In every rotation, "evidence" must include one water-balance number and, when available, one NDVI number.
17. Use "agro_indicators_2005_2024" to check timing: main-season sowing vs. rain onset, second-crop sowing vs. the end of soil moisture,
    and dry-spell risk in the main season. Cite at least one of these dates or numbers in "message_to_farmer" when available.
18. Use <pre_ranked_crops> when present. Deliver the final answer ONLY by calling `entregar_resposta`. Do not write the answer as text."""

CERCA = "`" * 3


def ler_json(texto):
    t = (texto or "").strip()
    m = re.search(CERCA + r"(?:json)?\s*(.*?)" + CERCA, t, re.S)
    if m:
        t = m.group(1).strip()
    try:
        j = json.loads(t)
        if isinstance(j, str):
            j = json.loads(j)
        if not isinstance(j, dict):
            raise ValueError(f"esperado objeto JSON, veio {type(j).__name__}")
        return j, "ok"
    except Exception as e:
        if repair_json:
            try:
                j = json.loads(repair_json(t))
                if isinstance(j, dict) and j:
                    return j, "reparado"
            except Exception:
                pass
        raise ValueError(f"{str(e)[:80]} | início: {t[:120]!r}")


def extras(provedor):
    if provedor == "anthropic":
        return {}
    corpo = {"usage": {"include": True}}
    if RACIOCINIO_BAIXO:
        corpo["reasoning"] = {"effort": "low"}
    return {"temperature": 0.2, "extra_body": corpo}


def decodificar(obj):
    if isinstance(obj, str):
        t = obj.strip()
        if t[:1] in "[{":
            try:
                return decodificar(json.loads(t))
            except Exception:
                return obj
        return obj
    if isinstance(obj, dict):
        return {k: decodificar(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [decodificar(v) for v in obj]
    return obj


def erros_calendario(nome, cal, janelas=None):
    erros = []
    if not cal:
        return [f"{nome}: calendar is empty."]
    ini, fim_ant = cal[0].get("sow_month"), 0
    for it in cal:
        c, s_, h = it.get("crop"), it.get("sow_month"), it.get("harvest_month")
        if c not in TABELA:
            erros.append(f"{nome}: crop '{c}' is not in the table.")
            continue
        if janelas is not None and c not in janelas:
            erros.append(f"{nome}: {c} is not suitable for this farm's climate (see not_suitable_here).")
            continue
        if not isinstance(s_, int) or not isinstance(h, int):
            erros.append(f"{nome}: {c} needs integer sow_month and harvest_month.")
            continue
        if janelas is not None and s_ not in janelas[c]:
            erros.append(f"{nome}: {c} sown in month {s_}, outside its sow_months {janelas[c]} for this farm.")
        ps, ph = (s_ - ini) % 12, (h - ini) % 12 or 12
        if ph < ps:
            ph += 12
        if ps < fim_ant:
            erros.append(f"{nome}: {c} is sown in month {s_} before the previous crop is harvested.")
        fim_ant = max(fim_ant, ph)
    if fim_ant > 12:
        erros.append(f"{nome}: the rotation is longer than 12 months.")
    return erros


RE_BALANCO = re.compile(r"deficit|déficit|water balance|balanço|balanco|evapotranspira|uses more water|falta de água|falta d.água", re.I)
RE_AGRO = re.compile(r"veranico|dry spell|dry run|rain onset|onset|in[ií]cio das chuvas|start of the rain|soil moisture (drops|ends)|fim da umidade|umidade do solo", re.I)
RE_NDVI = re.compile(r"ndvi|bare soil|vegetation index|solo descoberto|solo exposto|índice de vegeta|indice de vegeta", re.I)


def pontos_prioridade(pr, t):
    seca = {"alta": 2, "media": 1}.get(t["tolera_seca"], 0)
    return {
        "agua": seca + (1 if t["agua"] == "baixa" else 0),
        "renda": {"alto": 3, "medio": 2}.get(t["mercado"], 0),
        "solo": 2 * bool(t["fixa_n"]) + 2 * bool(t["cobertura"]),
        "erosao": 3 * bool(t["cobertura"]) + t["ciclo_dias"] / 75,
        "forragem": 3 * bool(t["forragem"]) + t["ciclo_dias"] / 150,
        "risco": 1.5 * seca,
    }.get(pr, 0)


def ranking_culturas(prio, deficit, descobertos, permitidas=None):
    prios = prio if isinstance(prio, (list, tuple)) else ([prio] if prio else [])
    pontos = {}
    for c, t in TABELA.items():
        if t.get("papel") in FORA_DO_RANKING or permitidas is not None and c not in permitidas:
            continue
        p = sum(pontos_prioridade(pr, t) for pr in prios)
        p += 0.5 * {"alta": 2, "media": 1}.get(t["tolera_seca"], 0) if deficit else 0
        p += 0.5 if t["cobertura"] and descobertos else 0
        pontos[c] = round(p, 2)
    return sorted(pontos, key=lambda c: (-pontos[c], list(TABELA).index(c)))


NOMES_FASES = ["main season", "second crop", "dry season / cover crops"]


def tabela_do_ponto(nome):
    janelas, fora = JANELAS[nome]
    linhas = [{**{k: t[k] for k in CAMPOS_LLM if k in t}, "sow_months": janelas[c]}
              for c, t in TABELA.items() if c in janelas]
    return linhas, fora


def montar_pedido(pedido, prio, faz, idioma="en"):
    lat, lon = PONTOS[faz]
    fases = FASES_POR[faz]
    linhas, fora = tabela_do_ponto(faz)
    bloco = "\n".join(f"{i + 1}. {n}: mes_inicio={a}, mes_fim={b}" for i, (n, (a, b)) in enumerate(zip(NOMES_FASES, fases)))
    texto = (f"<farmer_request>\n{pedido}\n</farmer_request>\n"
             f"<answer_language>{NOME_IDIOMA[idioma]}</answer_language>\n"
             f"<farm_phases>\nComputed by TerraTurn from this farm's monthly rainfall and temperature. "
             f"Call analisar_fazenda once for each phase:\n{bloco}\n</farm_phases>\n"
             f"<crop_table>\nComputed by TerraTurn for this farm's climate: sow_months are the months where the crop's "
             f"cycle fits its ideal temperature here.\n{json.dumps(linhas, ensure_ascii=False)}\n</crop_table>")
    if fora:
        texto += f"\n<not_suitable_here>\n{json.dumps(fora, ensure_ascii=False)}\n</not_suitable_here>"
    r = analisar_fazenda(lat, lon, fases[1][0], fases[2][1])
    if r.get("status") != "ok":
        return texto
    ordem = ranking_culturas(prio, r["deficit_months"], r["bare_soil_months"], set(JANELAS[faz][0]))
    return (texto + "\n<pre_ranked_crops>\nComputed by TerraTurn from the crop table, the priority and the deficit/bare-soil months. "
            "Build the 2 alternatives around the top crops and recommend #1 unless the tool data clearly contradicts it "
            "(then explain why in 'why').\n"
            + "\n".join(f"{i + 1}. {c}" for i, c in enumerate(ordem[:4]))
            + "\n</pre_ranked_crops>")


MESES_NOMES = {1: ["january", "janeiro", "jan"], 2: ["february", "fevereiro", "feb", "fev"], 3: ["march", "março", "marco", "mar"],
               4: ["april", "abril", "apr", "abr"], 5: ["may", "maio", "mai"], 6: ["june", "junho", "jun"],
               7: ["july", "julho", "jul"], 8: ["august", "agosto", "aug", "ago"], 9: ["september", "setembro", "sept", "sep", "set"],
               10: ["october", "outubro", "oct", "out"], 11: ["november", "novembro", "nov"], 12: ["december", "dezembro", "dec", "dez"]}


def fatos_agro(nome):
    a = indicadores_agro(*PONTOS[nome], INICIO_SAFRA[nome])
    if a.get("status") != "ok":
        return []
    fatos = []
    for bloco, campo in (("rain_onset", "mean_date_dd_mm"), ("rain_onset", "latest_date"),
                         ("soil_moisture_end_second_crop", "mean_date_dd_mm")):
        v = (a.get(bloco) or {}).get(campo)
        if v:
            dd, mm = int(v[:2]), int(v[3:5])
            fatos.append({"tipo": "data", "dd": dd, "mm": mm, "texto": f"{dd:02d}/{mm:02d}"})
    ver = a.get("dry_spells_main_season") or {}
    if ver.get("pct_seasons_with_dry_spell") is not None:
        fatos.append({"tipo": "pct", "valor": ver["pct_seasons_with_dry_spell"], "texto": f"{ver['pct_seasons_with_dry_spell']}%"})
    if ver.get("mean_longest_dry_run_days") is not None:
        fatos.append({"tipo": "dias", "valor": ver["mean_longest_dry_run_days"], "texto": f"{ver['mean_longest_dry_run_days']} days"})
    return fatos


def cita_fato(msg, fatos):
    for f in fatos:
        if f["tipo"] == "data":
            dd, nomes = f["dd"], "|".join(MESES_NOMES[f["mm"]])
            if (re.search(rf"\b0?{dd}/0?{f['mm']}\b", msg)
                    or re.search(rf"\b0?{dd}(?:st|nd|rd|th|º|°)?\s+(?:de\s+)?(?:{nomes})\b", msg, re.I)
                    or re.search(rf"\b(?:{nomes})\.?\s+0?{dd}(?:st|nd|rd|th)?\b", msg, re.I)):
                return True
        else:
            v = str(f["valor"])
            num = "(?:" + re.escape(v) + "|" + re.escape(v.replace(".", ",")) + ")"
            unidade = r"\s?(?:%|percent|por cento)" if f["tipo"] == "pct" else r"\s?(?:days?|dias?)\b"
            if re.search(rf"(?<![\d.,]){num}{unidade}", msg, re.I):
                return True
    return False


NOME_IDIOMA = {"en": "English", "pt": "Portuguese (Brazil)"}
PALAVRAS_PT = re.compile(r"\b(o|os|de|do|da|dos|das|em|na|para|com|que|não|nao|você|voce|seu|sua|plante|semeie|depois|"
                         r"chuva|safra|água|agua|mês|meses|é|um|uma|por|mais|como|e|ou|até|ate)\b", re.I)
PALAVRAS_EN = re.compile(r"\b(the|and|of|in|on|for|with|that|your|you|plant|sow|after|rain|soil|water|month|months|is|an|"
                         r"by|more|it|this|to|or|until)\b", re.I)
ACENTOS = re.compile(r"[áàâãéêíóôõúç]", re.I)


def idioma_do_texto(t):
    return "pt" if len(PALAVRAS_PT.findall(t)) > len(PALAVRAS_EN.findall(t)) else "en"


def erro_idioma(msg, idioma):
    if not idioma or not msg:
        return ""
    if idioma_do_texto(msg) != idioma:
        return f"message_to_farmer must be written in {NOME_IDIOMA[idioma]}, the language given in <answer_language>."
    if idioma == "pt" and not ACENTOS.search(msg):
        return "message_to_farmer is in Portuguese without accents: write it with correct accents (não, água, você, março)."
    return ""


def validar_resposta(j, prio=None, descobertos=(), janelas=None, fatos=None, idioma=None):
    if not isinstance(j, dict):
        return ["The answer must be a JSON object."]
    erros = []
    rots = j.get("rotations")
    if not isinstance(rots, list) or len(rots) != 3:
        return ["'rotations' must be a list with exactly 3 rotations (current first, then 2 alternatives)."]
    if not isinstance(rots[0], dict) or rots[0].get("is_current") is not True:
        erros.append("The first rotation must be the current one (is_current true).")
    for r in rots:
        if not isinstance(r, dict):
            erros.append("Every rotation must be an object.")
            continue
        nome = r.get("name", "?")
        if r is not rots[0]:
            erros += erros_calendario(nome, r.get("calendar"), janelas)
        if not TEMP_NUM.search(r.get("temperature_fit", "") or ""):
            erros.append(f"{nome}: temperature_fit must cite at least one °C value from the tool.")
    if len({tuple(r.get("crops", [])) for r in rots if isinstance(r, dict)}) < 3:
        erros.append("The 3 rotations must have different crops.")
    rec = j.get("recommendation") or {}
    if not isinstance(rec, dict) or rec.get("suggested_crop") not in TABELA:
        erros.append("recommendation.suggested_crop must be ONE crop id from the table.")
    elif rec.get("rotation_name") not in [r.get("name") for r in rots[1:] if isinstance(r, dict)]:
        erros.append("recommendation.rotation_name must be the exact name of one of the 2 alternatives.")
    elif prio and not _combina(prio, rec.get("suggested_crop")):
        erros.append(f"recommendation.suggested_crop '{rec.get('suggested_crop')}' does not serve the priority {prio}. "
                     f"Pick a crop from the pre-ranked list.")
    desc = set(descobertos or ())
    rot_rec = next((r for r in rots[1:] if isinstance(r, dict) and r.get("name") == rec.get("rotation_name")), None) if isinstance(rec, dict) else None
    falta = sorted(desc - meses_ocupados(rot_rec.get("calendar"))) if desc and rot_rec else []
    if falta:
        erros.append(f"Bare-soil months {sorted(desc)}: the recommended rotation leaves months {falta} without a crop in the field. "
                     f"Every bare-soil month must be covered by the recommended rotation (e.g. extend the harvest_month of the "
                     f"cover crop until month {max(falta)}, before the next main-season crop is sown).")
    msg_agro = (rec.get("message_to_farmer") or "") if isinstance(rec, dict) else ""
    if fatos and not cita_fato(msg_agro, fatos):
        exemplos = ", ".join(f["texto"] for f in fatos[:3])
        erros.append("message_to_farmer must cite at least one agro indicator returned by the tool, as a date or a number "
                     f"(rain onset, end of soil moisture or dry-spell risk; for this farm: {exemplos}).")
    if erro_idioma(msg_agro, idioma):
        erros.append(erro_idioma(msg_agro, idioma))
    tudo = json.dumps(j, ensure_ascii=False)
    if not RE_BALANCO.search(tudo):
        erros.append("Cite the water balance (rain minus evapotranspiration, deficit months) in the evidence.")
    if not RE_NDVI.search(tudo):
        erros.append("Cite NDVI (vegetation index) or bare-soil months in the evidence.")
    return erros


def rodar(provedor, modelo, pedido, prio=None, descobertos=(), janelas=None, fatos=None, idioma=None, max_passos=8, max_correcoes=2):
    client = CLIENTES[provedor]
    msgs = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": pedido}]
    chamadas, ja, tin, tout, custo_api, t0 = [], set(), 0, 0, 0.0, time.time()
    correcoes, forcar, ultimo, erros_corr = 0, False, None, []

    def fim(texto, via):
        return texto, via, chamadas, round(time.time() - t0, 1), tin, tout, custo_api, correcoes, erros_corr

    for passo in range(max_passos):
        escolha = {"type": "function", "function": {"name": "entregar_resposta"}} if forcar else "auto"
        r = client.chat.completions.create(model=modelo, messages=msgs, tools=TOOLS, tool_choice=escolha,
                                           max_tokens=MAX_TOKENS, **extras(provedor))
        if isinstance(r, str) or not getattr(r, "choices", None):
            raise RuntimeError(f"resposta inesperada da API: {str(r)[:200]}")
        u = getattr(r, "usage", None)
        if u:
            tin += u.prompt_tokens or 0
            tout += u.completion_tokens or 0
            custo_api += float(getattr(u, "cost", 0) or 0)
        msg = r.choices[0].message
        if not msg.tool_calls:
            if (msg.content or "").strip():
                return fim(msg.content, "texto")
            forcar = True
            msgs.append({"role": "user", "content": "Call entregar_resposta now with the final answer."})
            continue
        msgs.append({"role": "assistant", "content": msg.content or "",
                     "tool_calls": [{"id": tc.id, "type": "function",
                                     "function": {"name": tc.function.name,
                                                  "arguments": tc.function.arguments}}
                                    for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            try:
                args = decodificar(json.loads(tc.function.arguments or "{}"))
            except json.JSONDecodeError:
                args = {"_bruto": tc.function.arguments}
            if tc.function.name == "entregar_resposta":
                ultimo = json.dumps(args, ensure_ascii=False)
                erros = validar_resposta(args, prio, descobertos, janelas, fatos, idioma)
                if not erros or correcoes >= max_correcoes:
                    return fim(ultimo, "tool")
                correcoes += 1
                forcar = False
                erros_corr.append(f"[{correcoes}] " + " / ".join(erros))
                msgs.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(
                    {"status": "rejected", "errors": erros,
                     "instruction": "Fix only these problems and call entregar_resposta again with the full answer."},
                    ensure_ascii=False)})
                continue
            chamadas.append(normalizar_args(args) or args)
            msgs.append({"role": "tool", "tool_call_id": tc.id,
                         "content": json.dumps(chamar_ferramenta(args, ja), ensure_ascii=False)})
    return fim(ultimo, "tool" if ultimo else "nenhuma")


def calendario_ok(cal, janelas=None):
    if not cal:
        return False
    ini, fim_ant = cal[0].get("sow_month"), 0
    for it in cal:
        c, s, h = it.get("crop"), it.get("sow_month"), it.get("harvest_month")
        if c not in TABELA or not isinstance(s, int) or not isinstance(h, int):
            return False
        if janelas is not None and s not in janelas.get(c, []):
            return False
        ps, ph = (s - ini) % 12, (h - ini) % 12 or 12
        if ph < ps:
            ph += 12
        if ps < fim_ant:
            return False
        fim_ant = ph
    return fim_ant <= 12


def meses_ocupados(cal):
    occ = set()
    for it in cal or []:
        s, h = it.get("sow_month"), it.get("harvest_month")
        if isinstance(s, int) and isinstance(h, int) and 1 <= s <= 12 and 1 <= h <= 12:
            m = s
            while True:
                occ.add(m)
                if m == h:
                    break
                m = m % 12 + 1
    return occ


HIPOTESE = re.compile(r"\b(possibl\w*|may|might|could|likely|confirm\w*|hypothes\w*|whether|if|signal|suggest\w*|hint\w*|not|cannot|can't|doesn't|no evidence|unknown|unconfirmed|n[ãa]o|talvez|poss[ií]vel|hip[óo]tese|confirm\w*)\b", re.I)
AFIRMA_IRRIG = re.compile(r"\b(is|are) (being )?irrigated\b|\b(uses|has) irrigation\b|\birrigates\b", re.I)
TEMP_NUM = re.compile(r"\d+(\.\d+)?\s*(°|º)?\s*(c|degrees?|celsius)\b", re.I)
CRIT = ["chamou_tool", "fases_ok", "uma_vez_por_fase", "via_tool_final", "json_valido", "tres_rotacoes",
        "atual_primeiro", "so_tabela", "calendario_ok", "cita_balanco", "cita_ndvi", "cita_temperatura",
        "irrigacao_ok", "mensagem_ok", "cobre_solo", "rec_nao_alta", "separa_conhecimento", "prioridade_ok",
        "atual_fiel", "cita_agro", "idioma_ok"]


def sem_acento(t):
    return unicodedata.normalize("NFKD", str(t or "")).encode("ascii", "ignore").decode().lower()


APELIDOS_FIXOS = [("milhet", "milheto"), ("millet", "milheto"), ("soj", "soja"), ("soy", "soja"), ("milho", "milho_verao"),
                  ("corn", "milho_verao"), ("maize", "milho_verao"), ("safrinha", "milho_safrinha"),
                  ("second-crop corn", "milho_safrinha"), ("second crop corn", "milho_safrinha"), ("sorg", "sorgo"),
                  ("crotal", "crotalaria"), ("sunn", "crotalaria"), ("braq", "braquiaria"), ("brach", "braquiaria"),
                  ("feij", "feijao"), ("bean", "feijao"), ("caupi", "feijao_caupi"), ("cowpea", "feijao_caupi"),
                  ("nabo", "nabo_forrageiro"), ("radish", "nabo_forrageiro"), ("algod", "algodao"), ("cotton", "algodao"),
                  ("trigo", "trigo"), ("wheat", "trigo"), ("winter wheat", "trigo_inverno"), ("trigo de inverno", "trigo_inverno"),
                  ("cevada de inverno", "cevada_inverno"), ("canola de inverno", "canola_inverno"), ("mourisco", "trigo_mourisco"),
                  ("buckwheat", "trigo_mourisco"), ("arroz", "arroz"), ("rice", "arroz"), ("girass", "girassol"),
                  ("sunflower", "girassol"), ("amendoim", "amendoim"), ("peanut", "amendoim"), ("groundnut", "amendoim"),
                  ("cevada", "cevada"), ("barley", "cevada"), ("winter barley", "cevada_inverno"), ("aveia preta", "aveia_preta"),
                  ("black oat", "aveia_preta"), ("aveia", "aveia_branca"), ("oat", "aveia_branca"), ("rapeseed", "canola_inverno"),
                  ("rye", "centeio"), ("ryegrass", "azevem"), ("vetch", "ervilhaca"), ("velvet", "mucuna"), ("pigeon", "guandu"),
                  ("cassava", "mandioca"), ("cana", "cana_de_acucar"), ("sugarcane", "cana_de_acucar"), ("coffee", "cafe"),
                  ("batat", "batata"), ("potato", "batata"), ("gergel", "gergelim"), ("sesame", "gergelim"),
                  ("pousio", None), ("fallow", None)]


def montar_apelidos():
    pares = dict(APELIDOS_FIXOS)
    for c, t in TABELA.items():
        for nome in [c, c.replace("_", " ")] + list((t.get("nomes") or {}).values()):
            pares.setdefault(sem_acento(nome), c)
    return sorted(pares.items(), key=lambda kv: -len(kv[0]))


APELIDOS = montar_apelidos()


def normaliza_cultura(c):
    t = sem_acento(c)
    for chave, cid in APELIDOS:
        if chave and chave in t:
            return cid
    return t or None


def atual_confere(rot0, atual):
    cal = []
    for it in rot0.get("calendar") or []:
        if isinstance(it, dict):
            c = normaliza_cultura(it.get("crop"))
            if c:
                cal.append((c, it.get("sow_month"), it.get("harvest_month")))
    esperadas, vieram = sorted({c for c, _, _ in atual}), sorted({c for c, _, _ in cal})
    if esperadas != vieram:
        return False, f"rotação atual diferente: esperado {esperadas}, veio {vieram}"
    for c, s, h in atual:
        if s is None:
            continue
        if not any(c2 == c and isinstance(s2, int) and isinstance(h2, int) and dist_mes(s, s2) <= 1 and dist_mes(h, h2) <= 1
                   for c2, s2, h2 in cal):
            veio = [(s2, h2) for c2, s2, h2 in cal if c2 == c]
            return False, f"meses da rotação atual diferentes em {c}: esperado {s}->{h}, veio {veio}"
    return True, ""


def irrigacao_ok(j):
    frases = re.split(r"(?<=[.!?;])\s+|\n", " ".join(
        s for s in re.findall(r'"([^"]*)"', json.dumps(j, ensure_ascii=False))))
    for f in frases:
        if "irrigat" in f.lower() and AFIRMA_IRRIG.search(f) and not HIPOTESE.search(f):
            return False, f.strip()[:120]
    return True, ""


def avaliar(texto, via, chamadas, prio, descobertos, especial=None, fases_esperadas=None, atual=None, janelas=None, fatos=None,
            idioma=None):
    res = {k: False for k in CRIT}
    res["especial_ok"] = ""
    res["cita_agro"] = False
    res["cita_agro_palavra"] = False
    res.update({"json_status": "", "sugerida": "", "problemas": "", "atual_resposta": ""})
    res["chamou_tool"] = bool(chamadas)
    fases = []
    for c in chamadas:
        try:
            fases.append((int(c["mes_inicio"]), int(c["mes_fim"])))
        except Exception:
            pass
    if fases_esperadas:
        res["fases_ok"] = set(fases) == {tuple(f) for f in fases_esperadas}
    else:
        ini = {f[0] for f in fases}
        res["fases_ok"] = bool(ini & {9, 10, 11}) and bool(ini & {1, 2, 3}) and (1, 12) not in fases
    res["uma_vez_por_fase"] = bool(fases) and len(fases) == len(set(fases))
    res["via_tool_final"] = via == "tool"
    try:
        j, status = ler_json(texto)
        res["json_valido"] = True
        res["json_status"] = status
    except Exception as e:
        res["problemas"] = f"JSON: {e}"
        return res
    rots = j.get("rotations", [])
    rec = j.get("recommendation") or {}
    res["tres_rotacoes"] = len(rots) == 3
    res["atual_primeiro"] = bool(rots) and rots[0].get("is_current") is True
    usadas = {c for r in rots[1:] for c in r.get("crops", [])}
    res["so_tabela"] = bool(usadas) and usadas <= set(TABELA)
    res["calendario_ok"] = len(rots) > 1 and all(calendario_ok(r.get("calendar"), janelas) for r in rots[1:])
    if rots:
        res["atual_resposta"] = json.dumps([[it.get("crop"), it.get("sow_month"), it.get("harvest_month")]
                                            for it in rots[0].get("calendar") or [] if isinstance(it, dict)], ensure_ascii=False)
    if atual is None:
        res["atual_fiel"], motivo_atual = True, ""
    else:
        res["atual_fiel"], motivo_atual = atual_confere(rots[0] if rots else {}, atual)
    tudo = json.dumps(j, ensure_ascii=False).lower()
    res["cita_balanco"] = bool(RE_BALANCO.search(tudo))
    res["cita_ndvi"] = bool(RE_NDVI.search(tudo))
    msg_agro = rec.get("message_to_farmer", "") or ""
    res["cita_agro_palavra"] = bool(RE_AGRO.search(msg_agro))
    res["cita_agro"] = res["cita_agro_palavra"] if fatos is None else (not fatos or cita_fato(msg_agro, fatos))
    motivo_idioma = erro_idioma(msg_agro, idioma)
    res["idioma_ok"] = not motivo_idioma
    res["idioma_mensagem"] = idioma_do_texto(msg_agro) if msg_agro else ""
    res["cita_temperatura"] = bool(rots) and all(TEMP_NUM.search(r.get("temperature_fit", "") or "") for r in rots)
    res["irrigacao_ok"], frase_irrig = irrigacao_ok(j)
    msg = rec.get("message_to_farmer", "") or ""
    res["sugerida"] = rec.get("suggested_crop", "")
    res["mensagem_ok"] = 40 <= len(msg.split()) <= 140 and bool(re.search(r"\d", msg)) and bool(re.search(r"agronom|agrônom", msg, re.I))
    desc = set(descobertos)
    rot_rec = next((r for r in rots[1:] if r.get("name") == rec.get("rotation_name")), None)
    res["cobre_solo"] = (not desc) or (rot_rec is not None and desc <= meses_ocupados(rot_rec.get("calendar")))
    inc = {r.get("name"): r.get("uncertainty") for r in rots[1:]}
    res["rec_nao_alta"] = not (inc.get(rec.get("rotation_name")) == "high" and any(v != "high" for v in inc.values()))
    res["separa_conhecimento"] = bool(rots) and all("general_knowledge" in r for r in rots)
    res["prioridade_ok"] = _combina(prio, res["sugerida"])
    if especial:
        ok, motivo = especial(j, tudo)
        res["especial_ok"] = ok
        if not ok:
            res["problemas"] = motivo
    probs = []
    if not res["so_tabela"]:
        probs.append(f"fora da tabela: {sorted(usadas - set(TABELA))}")
    if motivo_idioma:
        probs.append(f"idioma: {motivo_idioma}")
    if not res["irrigacao_ok"]:
        probs.append(f"afirmou irrigação como fato: {frase_irrig!r}")
    if not res["uma_vez_por_fase"]:
        probs.append(f"fases repetidas: {fases}")
    if not res["cita_temperatura"]:
        probs.append("temperature_fit sem número em °C em alguma rotação")
    if not res["prioridade_ok"]:
        probs.append(f"'{res['sugerida']}' não combina com a prioridade '{prio}'")
    if desc and not res["cobre_solo"]:
        probs.append(f"a rotação recomendada não cobre todos os meses descobertos {sorted(desc)}")
    if motivo_atual:
        probs.append(motivo_atual)
    if res["problemas"]:
        probs.append(res["problemas"])
    res["problemas"] = " | ".join(probs)
    return res


def custo(modelo, tin, tout, custo_api):
    if custo_api:
        return custo_api
    pe, ps = PRECOS.get(modelo, (0, 0))
    return (tin * pe + tout * ps) / 1_000_000



FORA_TABELA_TESTE = {"batata": ("batata", "potato", 4), "gergelim": ("gergelim", "sesame", 3)}
NOME_EN = {**{c: (t.get("nomes") or {}).get("en", c) for c, t in TABELA.items()}, **{c: v[1] for c, v in FORA_TABELA_TESTE.items()}}
NOME_PT = {**{c: (t.get("nomes") or {}).get("pt", c) for c, t in TABELA.items()}, **{c: v[0] for c, v in FORA_TABELA_TESTE.items()}}
CICLO_FORA_TABELA = {c: v[2] for c, v in FORA_TABELA_TESTE.items()}
PAPEIS_SEGUNDA = ("segunda_safra", "inverno", "cobertura", "forrageira")


def meses_ciclo_teste(c):
    return CICLO_FORA_TABELA[c] if c in CICLO_FORA_TABELA else meses_ciclo(c)


def item(c, s):
    return (c, s, mes_mais(s, meses_ciclo_teste(c)))


def na_janela(faz, c, m):
    return m in JANELAS[faz][0].get(c, [])


def sortear_rotacao(rng, faz, tipo):
    s0 = INICIO_SAFRA[faz]
    soja = item("soja", (JANELAS[faz][0].get("soja") or [s0])[0])
    h = soja[2]
    segundas = [c for c, t in TABELA.items() if t.get("papel") in PAPEIS_SEGUNDA and na_janela(faz, c, h)]
    if tipo == "monocultura" or not segundas and tipo in ("plausivel", "sem_meses", "portugues"):
        return [soja]
    if tipo == "fora_tabela":
        temp = DADOS[faz].groupby(DADOS[faz].index.month)["temp_c"].mean()
        if temp.min() < TEMP_MES_FRIO_C:
            return [soja, item("batata", mes_mais(int(temp.idxmin()), -2))]
        return [soja, item("gergelim", h)]
    if tipo == "fora_janela":
        safrinha = item("milho_safrinha", soja[1])
        return [safrinha, item("feijao", safrinha[2])]
    if tipo == "tres_culturas":
        curtas = [c for c in segundas if meses_ciclo(c) <= 3]
        c2 = item(rng.choice(curtas or segundas or ["milheto"]), h)
        terceiras = [c for c, t in TABELA.items() if t.get("papel") in PAPEIS_SEGUNDA and c != c2[0] and na_janela(faz, c, c2[2])]
        return [soja, c2, item(rng.choice(terceiras or ["nabo_forrageiro"]), c2[2])]
    pesos = [3 if c == "milho_safrinha" else 1 for c in segundas]
    return [soja, item(rng.choices(segundas, pesos)[0], h)]


def descrever(cal, idioma, com_meses=True):
    nomes = NOME_PT if idioma == "pt" else NOME_EN
    meses = MES_PT_ABR if idioma == "pt" else MES_EN
    partes = [nomes[c] + (f" ({meses[a - 1]}-{meses[b - 1]})" if com_meses else "") for c, a, b in cal]
    if idioma == "pt":
        if len(partes) == 1:
            return f"Rotação atual: só {partes[0]}; no resto do ano a área fica em pousio."
        return "Rotação atual: " + ", depois ".join(partes) + "."
    if len(partes) == 1:
        return f"Current rotation: {partes[0]} only; the field stays fallow the rest of the year."
    return "Current rotation: " + ", then ".join(partes) + "."


def esp_portugues(j, tudo):
    msg = (j.get("recommendation") or {}).get("message_to_farmer", "")
    ok = bool(re.search(r"\b(você|plante|agrônomo|agronomo|safra|chuva)\b", msg, re.I))
    return ok, "" if ok else "pedido em português, mensagem ao agricultor não veio em português"


def plano_teste():
    combos = [(faz, p) for faz in FAZENDAS for p in PRIORIDADES_TESTE]
    rng = random.Random(SEMENTE)
    ordem = combos[:]
    rng.shuffle(ordem)
    tipos = TIPOS_BORDA[:]
    rng.shuffle(tipos)
    n_borda = round(FRACAO_BORDA * len(combos))
    tipo_de = {c: tipos[i % len(tipos)] for i, c in enumerate(ordem[:n_borda])}
    em_pt = set(random.Random(f"{SEMENTE}-idioma").sample(combos, round(FRACAO_PT * len(combos))))
    plano = []
    for faz, prio in combos:
        if faz not in DADOS:
            continue
        tipo = tipo_de.get((faz, prio), "plausivel")
        cal = sortear_rotacao(random.Random(f"{SEMENTE}-{faz}-{prio}"), faz, tipo)
        lat, lon = PONTOS[faz]
        idioma = "pt" if tipo == "portugues" or (faz, prio) in em_pt else "en"
        if idioma == "pt":
            pedido = (f"Minha fazenda fica em lat {lat:.4f}, lon {lon:.4f}, 50 ha. "
                      f"{descrever(cal, 'pt', tipo != 'sem_meses')} {PRIORIDADES_PT[prio]}")
        else:
            pedido = (f"My farm is at lat {lat:.4f}, lon {lon:.4f}, 50 ha. "
                      f"{descrever(cal, 'en', tipo != 'sem_meses')} {PRIORIDADES[prio]}")
        atual = [(c, None, None) for c, _, _ in cal] if tipo == "sem_meses" else cal
        plano.append({"faz": faz, "prio": prio, "tipo": tipo, "pedido": pedido, "atual": atual,
                      "especial": esp_portugues if idioma == "pt" else None, "idioma": idioma})
    return plano


def preparar_pontos(baixar=True, so=None):
    alvo = [f for f in FAZENDAS if not so or f in so]
    for faz in alvo:
        if faz in DADOS:
            continue
        if not baixar:
            print(f"  {faz}: sem CSV e --so-cache ligado, fica fora do teste", flush=True)
            continue
        try:
            obter_ponto(*FAZENDAS[faz], faz)
        except Exception as e:
            print(f"  {faz}: sem dados ({type(e).__name__}: {str(e)[:120]}), fica fora do teste", flush=True)
    descobertos = {}
    for faz in [f for f in alvo if f in DADOS]:
        descobertos[faz] = analisar_fazenda(*PONTOS[faz], *FASES_POR[faz][2]).get("bare_soil_months", [])
        indicadores_agro(*PONTOS[faz], INICIO_SAFRA[faz])
        janelas, fora = JANELAS[faz]
        print(f"  {faz}: safra começa no mês {INICIO_SAFRA[faz]} | fases {FASES_POR[faz]} | descobertos {descobertos[faz]}")
        print(f"      aptas: {janelas}")
        if fora:
            print(f"      fora: {list(fora)}")
    return descobertos


CENARIOS_TESTE = None
PARALELO = 6

if __name__ == "__main__":
    import sys
    os.makedirs("saidas/llm", exist_ok=True)
    carimbo = f"{datetime.now():%Y%m%d_%H%M}"
    if not repair_json:
        print("(json_repair não instalado: pip install json-repair)")
    print("Preparando dados dos pontos (baixa da NASA o que ainda não estiver em cache)...")
    so = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--pontos=")), None)
    descobertos_por = preparar_pontos("--so-cache" not in sys.argv, so)
    fatos_por = {faz: fatos_agro(faz) for faz in descobertos_por}
    if "--so-dados" in sys.argv:
        raise SystemExit(0)
    ativos = [(p, m) for p, m in MODELOS if m in MODELOS_TESTE and p in CLIENTES]
    plano = [p for p in plano_teste() if p["faz"] in descobertos_por]
    if CENARIOS_TESTE:
        plano = [p for p in plano if p["prio"] in CENARIOS_TESTE]
    for p in plano:
        print(f"  {p['faz'][:27]:<27} {p['prio']:<6} {p['tipo']:<14} {p['pedido']}")

    tarefas = [(provedor, modelo, p, rod) for provedor, modelo in ativos for p in plano for rod in range(1, RODADAS + 1)]
    print(f"\n{len(tarefas)} execuções: {len(plano)} cenários × {RODADAS} rodada(s) | {PARALELO} ao mesmo tempo\n")

    trava = threading.Lock()
    linhas = []
    arq_csv = f"saidas/llm/llm_v17_resultados_{carimbo}.csv"
    arq_txt = f"saidas/llm/llm_v17_respostas_{carimbo}.txt"
    txt = open(arq_txt, "w", encoding="utf-8")
    inicio_total = time.time()

    def executar(t):
        provedor, modelo, p, rod = t
        faz, prio = p["faz"], p["prio"]
        descobertos, janelas = descobertos_por[faz], JANELAS[faz][0]
        try:
            texto, via, chamadas, seg, tin, tout, capi, corr, erros_corr = rodar(
                provedor, modelo, montar_pedido(p["pedido"], prio, faz, p["idioma"]), prio, descobertos, janelas, fatos_por[faz],
                p["idioma"])
            av = avaliar(texto, via, chamadas, prio, descobertos, p["especial"], FASES_POR[faz], p["atual"], janelas,
                         fatos_por[faz], p["idioma"])
        except Exception as e:
            texto, via, chamadas, seg, tin, tout, capi, corr, erros_corr = None, "erro", [], 0, 0, 0, 0, 0, []
            av = avaliar(None, via, [], prio, descobertos)
            av["problemas"] = f"API: {type(e).__name__}: {str(e)[:150]} | {str(getattr(e, 'body', None))[:200]}"
        falhas = [c for c in CRIT if not av[c]] + (["especial"] if av["especial_ok"] is False else [])
        us = custo(modelo, tin, tout, capi)
        linha = {"modelo": modelo, "fazenda": faz, "cenario": prio, "tipo_rotacao": p["tipo"], "idioma_pedido": p["idioma"], "rodada": rod,
                 "semente": SEMENTE, "inicio_safra": INICIO_SAFRA[faz], "fases": json.dumps(FASES_POR[faz]),
                 "culturas_aptas": json.dumps(janelas), "fatos_agro": " ".join(f["texto"] for f in fatos_por[faz]), "rotacao_atual": json.dumps(p["atual"]),
                 "segundos": seg, "tokens_in": tin, "tokens_out": tout,
                 "custo_usd": round(us, 6), "via": via, "correcoes": corr, "falhas": ";".join(falhas),
                 "args_tool": json.dumps(chamadas), "erros_correcao": " || ".join(erros_corr), **av}
        with trava:
            linhas.append(linha)
            print(f"[{len(linhas)}/{len(tarefas)}] {faz} | {prio} | {p['tipo']} | rodada {rod}")
            print("    " + ("✅ tudo ok" if not falhas else "❌ " + ", ".join(falhas))
                  + f" | sugerida: {av['sugerida']} | correções: {corr} | {seg}s | {tin}+{tout} tokens | US$ {us:.4f}")
            if av["problemas"]:
                print(f"    {av['problemas'][:220]}")
            txt.write(f"\n{'=' * 80}\n{modelo} | {faz} | {prio} | rodada {rod} | {seg}s | {tin}+{tout} tokens | tipo {p['tipo']}\n"
                      f"pedido: {p['pedido']}\nrotacao_atual_esperada: {p['atual']}\nfases: {FASES_POR[faz]}\n"
                      f"culturas_aptas: {janelas}\ntool: {chamadas}\nfalhas: {falhas} | {av['problemas']}\n"
                      f"erros_correcao: {' || '.join(erros_corr)}\n"
                      f"{'-' * 80}\n{texto}\n")
            txt.flush()
            with open(arq_csv, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.DictWriter(f, fieldnames=linhas[0].keys())
                w.writeheader()
                w.writerows(linhas)

    with ThreadPoolExecutor(max_workers=PARALELO) as pool:
        futuros = [pool.submit(executar, t) for t in tarefas]
        try:
            for fu in as_completed(futuros):
                fu.result()
        except KeyboardInterrupt:
            for fu in futuros:
                fu.cancel()
            print("\nInterrompido. O que já rodou está salvo em " + arq_csv)
            raise
    txt.close()

    if not linhas:
        raise SystemExit("Nenhum cenário rodou.")

    print("\n================ RESUMO ================")
    ok = sum(not l["falhas"] for l in linhas)
    print(f"{ok}/{len(linhas)} execuções sem falha | {sum(l['segundos'] for l in linhas) / len(linhas):.0f}s médio por execução | "
          f"{time.time() - inicio_total:.0f}s no total | US$ {sum(l['custo_usd'] for l in linhas):.4f} no total | "
          f"{sum(l['correcoes'] > 0 for l in linhas)} precisaram de correção | "
          f"{sum(bool(l.get('cita_agro')) for l in linhas)} citaram um indicador agro na mensagem "
          f"(pela palavra-chave antiga: {sum(bool(l.get('cita_agro_palavra')) for l in linhas)})")
    for idi in ("en", "pt"):
        ls = [l for l in linhas if l["idioma_pedido"] == idi]
        if ls:
            print(f"Pedidos em {idi}: {len(ls)} | mensagem no idioma certo (e com acentos, se pt): {sum(bool(l['idioma_ok']) for l in ls)}/{len(ls)}")
    contagem = {}
    for l in linhas:
        for f_ in filter(None, l["falhas"].split(";")):
            contagem[f_] = contagem.get(f_, 0) + 1
    print("Falhas mais comuns: " + (", ".join(f"{k} ({v})" for k, v in sorted(contagem.items(), key=lambda x: -x[1])) or "nenhuma"))

    print("\n================ POR TIPO DE ROTAÇÃO ATUAL ================")
    for tipo in ["plausivel"] + TIPOS_BORDA:
        ls = [l for l in linhas if l["tipo_rotacao"] == tipo]
        if ls:
            print(f"{tipo:<14} {sum(not l['falhas'] for l in ls)}/{len(ls)} sem falha | "
                  f"rotação atual fiel {sum(bool(l['atual_fiel']) for l in ls)}/{len(ls)}")

    print("\n================ POR CENÁRIO (consistência entre rodadas) ================")
    for p in plano:
        ls = sorted([l for l in linhas if l["fazenda"] == p["faz"] and l["cenario"] == p["prio"]], key=lambda l: l["rodada"])
        sug = [l["sugerida"] or "—" for l in ls]
        estavel = "estável" if len(set(sug)) == 1 else "MUDOU"
        falhas = sorted({f_ for l in ls for f_ in filter(None, l["falhas"].split(";"))})
        print(f"{p['faz'][:27]:<27} {p['prio']:<6} {p['tipo']:<14} {' / '.join(sug):<26} {estavel:<8} {', '.join(falhas) or 'ok'}")
    print(f"\nResultados: {arq_csv}")
    print(f"Respostas: {arq_txt}")
