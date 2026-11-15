import os
import threading
from pathlib import Path

PASTA = Path(__file__).parent
WORKDIR = Path(os.getenv("IA_WORKDIR", str(PASTA / "cache_demo"))).resolve()
_LOCK = threading.Lock()
_MOTOR = None

DEMO_FARMS = {
    "rio_campim_norte": (-3.5579336371350903, -48.64693953925579),
    "dom_pedro_sementec_nordeste": (-12.4410, -45.7890),
    "fazenda_da_toca_sudeste": (-22.2155, -47.7685),
    "tucunareamaggi_centro_oeste": (-13.476743708024967, -58.89937692739597),
    "guatambu_sul": (-30.918010035468342, -54.79330880597324),
    "pergamino_argentina": (-33.9500, -60.6500),
    "boone_iowa_eua": (42.1000, -93.8000),
    "uberaba_fazenda_agronelli": (-19.56025585465233, -47.97707805316747),
    "uberaba_fazenda_umuarama": (-19.72264807226605, -48.033074121347155),
}


def motor():
    global _MOTOR
    with _LOCK:
        if _MOTOR is None:
            (WORKDIR / "data").mkdir(parents=True, exist_ok=True)
            (WORKDIR / "saidas").mkdir(parents=True, exist_ok=True)
            os.environ["TERRATURN_TABELA"] = str(PASTA / "tabela_culturas_oficial_v2.json")
            os.chdir(WORKDIR)
            from app.ia import llm_v17
            for nome, (lat, lon) in DEMO_FARMS.items():
                if nome not in llm_v17.DADOS and list((WORKDIR / "saidas").glob(f"mesclado_mensal_{nome}_*.csv")):
                    llm_v17.registrar(nome, lat, lon, llm_v17.carregar_csv(nome))
            _MOTOR = llm_v17
        return _MOTOR


def llm_disponivel() -> bool:
    return "anthropic" in motor().CLIENTES


def ponto_em_cache(lat: float, lon: float) -> bool:
    m = motor()
    return m.fazenda_mais_proxima(lat, lon) is not None
