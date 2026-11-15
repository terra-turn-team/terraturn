import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, CloudRain, Droplets, Loader2, RefreshCw, Satellite, Sparkles, Sprout } from 'lucide-react'
import type { Farm } from '../types'
import { useI18n, type Language } from '../lib/i18n'
import { ApiError } from '../lib/api'
import { cropLabel, useStudy, type Rotation, type StudyResult } from '../lib/ai'

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
  disclaimerLocal: ['Decision support only. Validate with a local agronomist before deciding.', 'Apoio à decisão. Valide com um agrônomo local antes de decidir.', 'Apoyo a la decisión. Valide con un agrónomo local antes de decidir.'],
  sources: ['Sources', 'Fontes', 'Fuentes'],
  langNote: ['The AI writes in English or Portuguese; Spanish shows the English answer.', 'A IA escreve em inglês ou português; em espanhol, a resposta aparece em inglês.', 'La IA escribe en inglés o portugués; en español se muestra la respuesta en inglés.'],
}
const MONTHS: Record<Language, string[]> = {
  en: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
  'pt-BR': ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
  es: ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
}
const MONTH_NAMES: Record<Language, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  'pt-BR': ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
}
const COLORS = ['#3E7C4F', '#C58B2A', '#4C7FA8', '#8A5BA6', '#B4533B']

function useTxt() {
  const { language } = useI18n()
  const i = language === 'en' ? 0 : language === 'pt-BR' ? 1 : 2
  return { language, x: (k: string) => (TXT[k] || [k, k, k])[i] }
}

function monthsOf(sow: number, harvest: number) {
  const out: number[] = []
  let m = sow
  for (let i = 0; i < 12; i++) { out.push(m); if (m === harvest) break; m = m === 12 ? 1 : m + 1 }
  return out
}

function CalendarBar({ rotation, names }: { rotation: Rotation; names: StudyResult['crop_names'] }) {
  const { language } = useTxt()
  const cells: (number | null)[] = Array(12).fill(null)
  rotation.calendar.forEach((c, idx) => monthsOf(c.sow_month, c.harvest_month).forEach(m => { if (cells[m - 1] === null) cells[m - 1] = idx }))
  return <div className="study-cal">
    <div className="study-cal-row">{cells.map((c, i) => <span key={i} className={c === null ? 'empty' : ''} style={c === null ? undefined : { background: COLORS[c % COLORS.length] }} title={c === null ? '' : cropLabel(rotation.calendar[c].crop, names, language)} />)}</div>
    <div className="study-cal-months">{MONTHS[language].map((m, i) => <span key={i}>{m}</span>)}</div>
    <div className="study-cal-legend">{rotation.calendar.map((c, i) => <span key={i}><i style={{ background: COLORS[i % COLORS.length] }} />{cropLabel(c.crop, names, language)} · {MONTH_NAMES[language][c.sow_month - 1]}–{MONTH_NAMES[language][c.harvest_month - 1]}</span>)}</div>
  </div>
}

function RotationCard({ rotation, index, recommended, names }: { rotation: Rotation; index: number; recommended: boolean; names: StudyResult['crop_names'] }) {
  const { x, language } = useTxt()
  const [open, setOpen] = useState(false)
  return <article className={`rotation-card ${recommended ? 'recommended' : ''}`}>
    <div className="rotation-head">
      <span className="rotation-tag">{rotation.is_current ? x('current') : `${x('alternative')} ${index}`}</span>
      {recommended && <span className="rotation-tag rec"><CheckCircle2 size={13} /> {x('recommended')}</span>}
      <span className={`uncertainty u-${rotation.uncertainty}`}>{x('uncertainty')}: {x(rotation.uncertainty)}</span>
    </div>
    <h3>{rotation.crops.map(c => cropLabel(c, names, language)).join(' → ')}</h3>
    <p className="rotation-summary">{rotation.farmer_summary}</p>
    <CalendarBar rotation={rotation} names={names} />
    <div className="rotation-lists">
      <div><strong>{x('benefits')}</strong><ul>{rotation.benefits.map((b, i) => <li key={i}>{b}</li>)}</ul></div>
      <div><strong>{x('risks')}</strong><ul>{rotation.risks.map((b, i) => <li key={i}>{b}</li>)}</ul></div>
    </div>
    <button type="button" className="rotation-more" aria-expanded={open} onClick={() => setOpen(!open)}><Satellite size={14} /> {x('evidence')} <ChevronDown size={14} className={open ? 'flip' : ''} /></button>
    {open && <div className="rotation-details">
      <p><strong>{x('why')}:</strong> {rotation.why}</p>
      <ul className="evidence-list">{rotation.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
      <p><strong>{x('temp')}:</strong> {rotation.temperature_fit}</p>
      {rotation.general_knowledge.length > 0 && <p className="general-note"><strong>{x('general')}:</strong> {rotation.general_knowledge.join(' ')}</p>}
    </div>}
  </article>
}

function FarmFacts({ result }: { result: StudyResult }) {
  const { x, language } = useTxt()
  const d = result.farm_data
  const a = d.agro_indicators
  const months = (ms: number[]) => ms.length ? ms.map(m => MONTH_NAMES[language][m - 1]).join(', ') : x('none')
  return <div className="study-facts">
    {a?.rain_onset && <div><CloudRain size={16} /><span><small>{x('onset')}</small><strong>{a.rain_onset.mean_date_dd_mm}</strong></span></div>}
    {a?.dry_spells_main_season && <div><AlertTriangle size={16} /><span><small>{x('dryspell')}</small><strong>{a.dry_spells_main_season.pct_seasons_with_dry_spell}%</strong></span></div>}
    <div><Droplets size={16} /><span><small>{x('deficit')}</small><strong>{months(d.deficit_months)}</strong></span></div>
    <div><Sprout size={16} /><span><small>{x('bare')}</small><strong>{months(d.bare_soil_months)}</strong></span></div>
  </div>
}

export default function StudyPanel({ farm, compact = false }: { farm: Farm; compact?: boolean }) {
  const { x, language } = useTxt()
  const { study, loading, start, isRunning } = useStudy(farm.id)
  const result = study?.status === 'complete' ? study.result : null
  const startError = start.error instanceof ApiError ? start.error.message : start.error ? x('failed') : ''
  const rec = result?.analysis.recommendation
  const recIndex = result ? result.analysis.rotations.findIndex(r => r.name === rec?.rotation_name) : -1
  if (compact && !study && !isRunning) return null
  const stage = isRunning ? (study?.stage && TXT[study.stage] ? study.stage : 'queued') : ''
  return <section className={`study-panel ${compact ? 'compact' : ''}`} aria-live="polite">
    <div className="study-top">
      <div><span className="eyebrow">{x('eyebrow')}</span><h2>{x('title')}</h2>{!result && !isRunning && <p>{x('intro')}</p>}</div>
      {!compact && !isRunning && !loading && <button type="button" className={`btn ${result ? 'btn-outline btn-small' : 'btn-primary'}`} onClick={() => start.mutate(language)}>
        {result ? <><RefreshCw size={15} /> {x('again')}</> : <><Sparkles size={17} /> {x('analyze')}</>}
      </button>}
    </div>
    {!compact && !result && !isRunning && !loading && <p className="study-hint">{x('timeNew')}</p>}
    {isRunning && <div className="study-progress"><Loader2 size={18} className="spin" /><span>{x(stage)}</span></div>}
    {startError && <p className="form-error" role="alert">{startError}</p>}
    {study?.status === 'failed' && !isRunning && <p className="form-error" role="alert">{x('failed')} {study.error}</p>}
    {result && rec && <>
      {result.irrigated_warning && <p className="study-warning"><AlertTriangle size={15} /> {x('irrigated')}</p>}
      <div className="study-recommendation">
        <span className="eyebrow">{x('suggestion')}</span>
        <h3>{cropLabel(rec.suggested_crop, result.crop_names, language)} · <span>{rec.rotation_name}</span></h3>
        <p>{rec.message_to_farmer}</p>
      </div>
      <FarmFacts result={result} />
      <div className="rotation-grid">{result.analysis.rotations.map((r, i) => <RotationCard key={i} rotation={r} index={i} recommended={i === recIndex} names={result.crop_names} />)}</div>
      <p className="study-disclaimer">{result.analysis.disclaimer} {x('disclaimerLocal')}</p>
      <p className="study-sources">{x('sources')}: {result.farm_data.sources.join(' · ')} · {result.engine}{language === 'es' ? ` · ${x('langNote')}` : ''}</p>
    </>}
  </section>
}
