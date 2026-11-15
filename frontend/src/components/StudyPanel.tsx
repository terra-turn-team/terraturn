import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import type { Farm } from '../types'
import { useI18n } from '../lib/i18n'
import { ApiError } from '../lib/api'
import { cropLabel, useStudy } from '../lib/ai'
import { useViewStore } from '../lib/viewStore'
import StudyInsight from './StudyInsight'

type Dict = Record<string, [string, string, string]>
const TXT: Dict = {
  eyebrow: ['AI ROTATION ANALYSIS · NASA DATA', 'ANÁLISE DE ROTAÇÃO COM IA · DADOS NASA', 'ANÁLISIS DE ROTACIÓN CON IA · DATOS NASA'],
  title: ['Which rotation fits this farm?', 'Qual rotação combina com esta fazenda?', '¿Qué rotación conviene a esta finca?'],
  intro: ['TerraTurn crosses 20 years of NASA satellite data for this field with a table of 31 crops and compares your current rotation with 2 alternatives.', 'O TerraTurn cruza 20 anos de dados de satélite da NASA desta área com uma tabela de 31 culturas e compara sua rotação atual com 2 alternativas.', 'TerraTurn cruza 20 años de datos satelitales de la NASA de esta área con una tabla de 31 cultivos y compara su rotación actual con 2 alternativas.'],
  analyze: ['Analyze this farm', 'Analisar esta fazenda', 'Analizar esta finca'],
  again: ['Run again', 'Analisar de novo', 'Analizar de nuevo'],
  timeNew: ['First analysis of a new area: NASA satellite data can take a few minutes to download. You can keep using the app.', 'Primeira análise de uma área nova: os dados de satélite da NASA podem levar alguns minutos para baixar. Você pode continuar usando o app.', 'Primer análisis de un área nueva: los datos satelitales de la NASA pueden tardar unos minutos. Puede seguir usando la app.'],
  queued: ['Starting the analysis…', 'Iniciando a análise…', 'Iniciando el análisis…'],
  downloading_nasa_data: ['Downloading NASA data (POWER, MODIS NDVI and evapotranspiration)… this can take a few minutes the first time.', 'Baixando dados da NASA (POWER, NDVI e evapotranspiração MODIS)… na primeira vez pode levar alguns minutos.', 'Descargando datos de la NASA (POWER, NDVI y evapotranspiración MODIS)… la primera vez puede tardar unos minutos.'],
  nasa_data_cached: ['Reading NASA data for this farm…', 'Lendo os dados da NASA desta fazenda…', 'Leyendo los datos de la NASA de esta finca…'],
  analyzing: ['Comparing rotations with the AI (about 30 seconds)…', 'Comparando rotações com a IA (cerca de 30 segundos)…', 'Comparando rotaciones con la IA (unos 30 segundos)…'],
  failed: ['The analysis could not be completed.', 'Não foi possível concluir a análise.', 'No se pudo completar el análisis.'],
  suggestion: ['Our suggestion', 'Nossa sugestão', 'Nuestra sugerencia'],
  current: ['Current', 'Atual', 'Actual'],
  alternative: ['Alternative', 'Alternativa', 'Alternativa'],
  recommended: ['Recommended', 'Recomendada', 'Recomendada'],
  evidence: ['See NASA evidence', 'Ver evidências da NASA', 'Ver evidencias de la NASA'],
  why: ['Why', 'Por quê', 'Por qué'],
  benefits: ['Benefits', 'Benefícios', 'Beneficios'],
  risks: ['Risks', 'Riscos', 'Riesgos'],
  temp: ['Temperature', 'Temperatura', 'Temperatura'],
  general: ['General knowledge (not from NASA data)', 'Conhecimento geral (não vem dos dados da NASA)', 'Conocimiento general (no proviene de datos de la NASA)'],
  uncertainty: ['Uncertainty', 'Incerteza', 'Incertidumbre'],
  low: ['low', 'baixa', 'baja'], medium: ['medium', 'média', 'media'], high: ['high', 'alta', 'alta'],
  onset: ['Rain onset (avg.)', 'Início das chuvas (média)', 'Inicio de lluvias (prom.)'],
  dryspell: ['Seasons with dry spells', 'Safras com veranico', 'Temporadas con veranillo'],
  deficit: ['Water-deficit months', 'Meses com déficit hídrico', 'Meses con déficit hídrico'],
  bare: ['Bare-soil months (NDVI)', 'Meses de solo descoberto (NDVI)', 'Meses de suelo desnudo (NDVI)'],
  none: ['none', 'nenhum', 'ninguno'],
  irrigated: ['You marked this farm as irrigated. TerraTurn assumes rainfed farming, so treat this analysis as a rainfed reference.', 'Você marcou esta fazenda como irrigada. O TerraTurn considera lavoura de sequeiro; use esta análise como referência de sequeiro.', 'Marcó esta finca como regada. TerraTurn asume secano; use este análisis como referencia de secano.'],
  otherLang: ['This analysis was generated in another language. Run it again to see it in English.', 'Esta análise foi gerada em outro idioma. Analise de novo para ver em português.', 'Este análisis se generó en otro idioma. Analice de nuevo para verlo en inglés.'],
  disclaimerLocal: ['Decision support only. Validate with a local agronomist before deciding.', 'Apoio à decisão. Valide com um agrônomo local antes de decidir.', 'Apoyo a la decisión. Valide con un agrónomo local antes de decidir.'],
  sources: ['Sources', 'Fontes', 'Fuentes'],
  slowNote: ['We are fetching this area from the NASA APIs (POWER daily climate since 2005, MODIS NDVI and evapotranspiration). It only happens the first time and can take a few minutes. You can keep using the app.', 'Estamos buscando os dados desta área nas APIs da NASA (clima diário POWER desde 2005, NDVI e evapotranspiração MODIS). Isso só acontece na primeira vez e pode levar alguns minutos. Você pode continuar usando o app.', 'Estamos obteniendo los datos de esta área en las APIs de la NASA (clima diario POWER desde 2005, NDVI y evapotranspiración MODIS). Solo ocurre la primera vez y puede tardar unos minutos. Puede seguir usando la app.'],
  elapsed: ['Elapsed', 'Tempo decorrido', 'Tiempo transcurrido'],
  etaSlow: ['usually 3–8 min', 'normalmente 3–8 min', 'normalmente 3–8 min'],
  stepQueue: ['Queue', 'Fila', 'Cola'],
  stepData: ['NASA data', 'Dados NASA', 'Datos NASA'],
  stepDownload: ['Downloading NASA data', 'Baixando dados NASA', 'Descargando datos NASA'],
  stepAi: ['AI comparison', 'Comparação com IA', 'Comparación con IA'],
  retry: ['Try again', 'Tentar novamente', 'Intentar de nuevo'],
  etaFast: ['usually ~30 s', 'normalmente ~30 s', 'normalmente ~30 s'],
  viewFull: ['View full analysis', 'Ver análise completa', 'Ver análisis completo'],
  langNote: ['The AI writes in English or Portuguese; Spanish shows the English answer.', 'A IA escreve em inglês ou português; em espanhol, a resposta aparece em inglês.', 'La IA escribe en inglés o portugués; en español se muestra la respuesta en inglés.'],
}
function Progress({ stage, startedAt }: { stage: string; startedAt?: string }) {
  const { x } = useTxt()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const t0 = startedAt ? Date.parse(startedAt) : now
  const secs = Math.max(0, Math.round((now - t0) / 1000))
  const slow = stage === 'downloading_nasa_data'
  const mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0')
  const current = stage === 'analyzing' ? 2 : stage === 'downloading_nasa_data' || stage === 'nasa_data_cached' ? 1 : 0
  const steps = ['stepQueue', slow ? 'stepDownload' : 'stepData', 'stepAi']
  return <div className={`study-progress ${slow ? 'slow' : ''}`}>
    <div className="study-progress-row"><Loader2 size={18} className="spin" /><span>{x(TXT[stage] ? stage : 'queued')}</span></div>
    {slow && <p className="study-progress-note">{x('slowNote')}</p>}
    <ol className="study-steps">{steps.map((k, i) => <li key={k} className={i < current ? 'done' : i === current ? 'active' : ''} aria-current={i === current ? 'step' : undefined}>{i < current ? <CheckCircle2 size={14} /> : <span className="dot" />}{x(k)}</li>)}</ol>
    <div className="progress-meta"><span>{x('elapsed')} {mm}:{ss}</span><span>{x(slow ? 'etaSlow' : 'etaFast')}</span></div>
  </div>
}

function useTxt() {
  const { language } = useI18n()
  const i = language === 'en' ? 0 : language === 'pt-BR' ? 1 : 2
  return { language, x: (k: string) => (TXT[k] || [k, k, k])[i] }
}

export default function StudyPanel({ farm, compact = false }: { farm: Farm; compact?: boolean }) {
  const { x, language } = useTxt()
  const { study, loading, start, isRunning } = useStudy(farm.id)
  const result = study?.status === 'complete' ? study.result : null
  const startError = start.error instanceof ApiError ? start.error.message : start.error ? x('failed') : ''
  const rec = result?.analysis.recommendation
  const openSheet = useViewStore(s => s.setAiSheetOpen)
  if (compact && !study && !isRunning) return null
  if (compact) return <section className="study-panel compact" aria-live="polite">
    <div className="study-top"><div><span className="eyebrow">{x('eyebrow')}</span><h2>{x('title')}</h2></div></div>
    {isRunning && <Progress stage={study?.stage ?? 'queued'} startedAt={study?.created_at} />}
    {study?.status === 'failed' && !isRunning && <><p className="form-error" role="alert">{x('failed')} {study.error}</p><button type="button" className="btn btn-outline btn-wide" disabled={start.isPending} onClick={() => start.mutate(language)}><RefreshCw size={15} /> {x('retry')}</button></>}
    {startError && <p className="form-error" role="alert">{startError}</p>}
    {result && rec && <div className="study-recommendation"><span className="eyebrow">{x('suggestion')}</span><h3>{cropLabel(rec.suggested_crop, result.crop_names, language)}</h3><p>{rec.message_to_farmer}</p></div>}
    <button type="button" className="btn btn-primary btn-wide" onClick={() => openSheet(true)}><Sparkles size={16} /> {x('viewFull')}</button>
  </section>
  const stage = isRunning ? (study?.stage && TXT[study.stage] ? study.stage : 'queued') : ''
  return <section className={`study-panel ${compact ? 'compact' : ''}`} aria-live="polite">
    <div className="study-top">
      <div><span className="eyebrow">{x('eyebrow')}</span><h2>{x('title')}</h2>{!result && !isRunning && <p>{x('intro')}</p>}</div>
      {!compact && !isRunning && !loading && <button type="button" className={`btn ${result ? 'btn-outline btn-small' : 'btn-primary'}`} onClick={() => start.mutate(language)}>
        {result ? <><RefreshCw size={15} /> {x('again')}</> : <><Sparkles size={17} /> {x('analyze')}</>}
      </button>}
    </div>
    {!compact && !result && !isRunning && !loading && <p className="study-hint">{x('timeNew')}</p>}
    {isRunning && <Progress stage={stage} startedAt={study?.created_at} />}
    {startError && <p className="form-error" role="alert">{startError}</p>}
    {study?.status === 'failed' && !isRunning && <p className="form-error" role="alert">{x('failed')} {study.error}</p>}
    {result && rec && <>
      {study && study.language !== (language.startsWith('pt') ? 'pt' : 'en') && <p className="study-warning"><AlertTriangle size={15} /> {x('otherLang')} <button type="button" className="btn btn-outline btn-small" disabled={start.isPending} onClick={() => start.mutate(language)}><RefreshCw size={14} /> {x('again')}</button></p>}
      {result.irrigated_warning && <p className="study-warning"><AlertTriangle size={15} /> {x('irrigated')}</p>}
      <StudyInsight result={result} />
      <p className="study-disclaimer">{result.analysis.disclaimer} {x('disclaimerLocal')}</p>
      <p className="study-sources">{x('sources')}: {result.farm_data.sources.join(' · ')} · {result.engine}{language === 'es' ? ` · ${x('langNote')}` : ''}</p>
    </>}
  </section>
}
