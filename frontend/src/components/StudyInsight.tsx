import { useState, type ReactNode } from 'react'
import { AlertTriangle, CalendarDays, Check, CheckCircle2, ChevronDown, Satellite } from 'lucide-react'
import { useI18n, type Language } from '../lib/i18n'
import { cropLabel, type Rotation, type StudyResult } from '../lib/ai'

// Resultado da análise em formato de insight: veredito grande no topo e comparação das 3 rotações.
// Todos os números vêm do resultado do motor, dos dados NASA da fazenda ou da tabela oficial de culturas.

type Dict = Record<string, [string, string, string]>
const TXT: Dict = {
  suggestion: ['Our suggestion', 'Nossa sugestão', 'Nuestra sugerencia'],
  after: ['after', 'depois de', 'después de'],
  sowIn: ['Sow in', 'Semeie em', 'Siembre en'],
  why20: ['Why, in 20 years of data', 'Por quê, em 20 anos de dados', 'Por qué, en 20 años de datos'],
  moistureDrop: ['Soil moisture drops below the limit', 'A umidade do solo cai abaixo do limite', 'La humedad del suelo cae bajo el límite'],
  rainIn: ['Average rainfall in', 'Chuva média em', 'Lluvia media en'],
  tradeoff: ['Trade-off', 'Ponto de atenção', 'Contrapartida'],
  indicators: ['NASA indicators for this farm', 'Indicadores NASA desta fazenda', 'Indicadores NASA de esta finca'],
  indicatorsSub: ['What the satellite data shows about rain, water and soil cover.', 'O que os dados de satélite mostram sobre chuva, água e cobertura do solo.', 'Lo que muestran los datos satelitales sobre lluvia, agua y cobertura del suelo.'],
  onset: ['Rain onset (avg.)', 'Início das chuvas (média)', 'Inicio de lluvias (prom.)'],
  dryspell: ['Seasons with dry spells', 'Safras com veranico', 'Temporadas con veranillo'],
  deficit: ['Water-deficit months', 'Meses com déficit hídrico', 'Meses con déficit hídrico'],
  bare: ['Bare-soil months (NDVI)', 'Meses de solo exposto (NDVI)', 'Meses de suelo desnudo (NDVI)'],
  none: ['None', 'Nenhum', 'Ninguno'],
  compare: ['Compare the three rotations', 'Compare as três rotações', 'Compare las tres rotaciones'],
  compareSub: ['Same farm, same NASA data.', 'Mesma fazenda, mesmos dados NASA.', 'Misma finca, mismos datos NASA.'],
  current: ['Current', 'Atual', 'Actual'],
  alternative: ['Alternative', 'Alternativa', 'Alternativa'],
  recommended: ['Recommended', 'Recomendada', 'Recomendada'],
  uncertainty: ['Uncertainty', 'Incerteza', 'Incertidumbre'],
  uncertaintySub: ['More filled = less certain', 'Mais cheio = menos certeza', 'Más lleno = menos certeza'],
  calendar: ['Calendar and soil cover', 'Calendário e cobertura do solo', 'Calendario y cobertura del suelo'],
  calendarSub: ['Hatched = bare soil. Tinted months = water deficit.', 'Hachurado = solo exposto. Meses destacados = déficit hídrico.', 'Rayado = suelo desnudo. Meses resaltados = déficit hídrico.'],
  bareSoil: ['Bare soil', 'Solo exposto', 'Suelo desnudo'],
  bareIn: ['Bare soil in', 'Solo exposto em', 'Suelo desnudo en'],
  coversIn: ['Covers the soil in', 'Cobre o solo em', 'Cubre el suelo en'],
  coveredAll: ['Soil covered all year', 'Solo coberto o ano todo', 'Suelo cubierto todo el año'],
  drought: ['Drought tolerance', 'Tolerância à seca', 'Tolerancia a la sequía'],
  droughtSub: ['More filled = more tolerant', 'Mais cheio = mais tolerante', 'Más lleno = más tolerante'],
  field: ['Time in the field', 'Tempo no campo', 'Tiempo en el campo'],
  fieldSub: ['Bar = share of the 12-month year', 'Barra = parte do ano de 12 meses', 'Barra = parte del año de 12 meses'],
  months: ['months', 'meses', 'meses'],
  market: ['Grain market', 'Mercado do grão', 'Mercado del grano'],
  marketSub: ['More filled = stronger market', 'Mais cheio = mercado mais forte', 'Más lleno = mercado más fuerte'],
  noData: ['No data', 'Sem dado', 'Sin dato'],
  benefits: ['Benefits', 'Benefícios', 'Beneficios'],
  benefitsSub: ['What this rotation gives you', 'O que esta rotação oferece', 'Lo que ofrece esta rotación'],
  risks: ['Risks', 'Riscos', 'Riesgos'],
  risksSub: ['What to watch', 'O que observar', 'Qué vigilar'],
  evidence: ['NASA evidence', 'Evidências NASA', 'Evidencias NASA'],
  evidenceSub: ['The data behind each rotation', 'Os dados por trás de cada rotação', 'Los datos detrás de cada rotación'],
  seeEvidence: ['See NASA evidence', 'Ver evidências NASA', 'Ver evidencias NASA'],
  why: ['Why', 'Por quê', 'Por qué'],
  temp: ['Temperature', 'Temperatura', 'Temperatura'],
  general: ['General knowledge (not from NASA data)', 'Conhecimento geral (não vem dos dados NASA)', 'Conocimiento general (no proviene de datos NASA)'],
  low: ['Low', 'Baixa', 'Baja'], medium: ['Medium', 'Média', 'Media'], high: ['High', 'Alta', 'Alta'],
  baixa: ['Low', 'Baixa', 'Baja'], media: ['Medium', 'Média', 'Media'], alta: ['High', 'Alta', 'Alta'],
  baixo: ['Low', 'Baixo', 'Bajo'], medio: ['Medium', 'Médio', 'Medio'], alto: ['High', 'Alto', 'Alto'],
  and: ['and', 'e', 'y'],
  more: ['Read full explanation', 'Ler explicação completa', 'Leer explicación completa'],
  less: ['Show less', 'Mostrar menos', 'Mostrar menos'],
}
const MONTH_FULL: Record<Language, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  'pt-BR': ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
}
const MONTH_SHORT: Record<Language, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  'pt-BR': ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
}
const MONTH_LETTER: Record<Language, string[]> = {
  en: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
  'pt-BR': ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
  es: ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
}
const CROP_COLORS = ['#3E7C4F', '#B5835A', '#4C7FA8', '#8A5BA6']
const LEVEL: Record<string, number> = { baixa: 1, baixo: 1, low: 1, media: 2, medio: 2, medium: 2, alta: 3, alto: 3, high: 3 }

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
const covered = (r: Rotation) => new Set(r.calendar.flatMap(c => monthsOf(c.sow_month, c.harvest_month)))
const keyCrop = (r: Rotation) => r.crops[r.crops.length - 1]

function joinList(items: string[], and: string) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`
}
// Junta meses seguidos: [4,5,6,7,8] → "Apr–Aug"; [8,9] → "Aug, Sep".
function monthRange(ms: number[], names: string[]) {
  if (!ms.length) return ''
  const s = [...ms].sort((a, b) => a - b)
  const seq = s.every((m, i) => i === 0 || m === s[i - 1] + 1)
  return seq && s.length > 2 ? `${names[s[0] - 1]}–${names[s[s.length - 1] - 1]}` : s.map(m => names[m - 1]).join(', ')
}
function ddmm(v: string | undefined, language: Language) {
  const m = v?.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!m) return ''
  const name = MONTH_FULL[language][Number(m[2]) - 1]
  return language === 'en' ? `${name.charAt(0).toUpperCase() + name.slice(1)} ${Number(m[1])}` : `${Number(m[1])} ${language === 'pt-BR' ? 'de' : 'de'} ${name}`
}

function Pips({ level, empty }: { level: number; empty?: boolean }) {
  return <span className={`si-pips ${empty ? 'is-empty' : ''}`} aria-hidden="true">{[1, 2, 3].map(i => <i key={i} className={!empty && i <= level ? 'on' : ''} />)}</span>
}

function Calendar({ rotation, result }: { rotation: Rotation; result: StudyResult }) {
  const { x, language } = useTxt()
  const cells: (number | null)[] = Array(12).fill(null)
  rotation.calendar.forEach((c, idx) => monthsOf(c.sow_month, c.harvest_month).forEach(m => { if (cells[m - 1] === null) cells[m - 1] = idx }))
  const deficit = new Set(result.farm_data.deficit_months)
  const farmBare = result.farm_data.bare_soil_months
  const cov = covered(rotation)
  const bare = farmBare.filter(m => !cov.has(m))
  const coversFarmBare = farmBare.filter(m => cov.has(m))
  const short = MONTH_SHORT[language]
  return <div className="si-cal">
    <div className="si-cal-row">{cells.map((c, i) => <span key={i} className={c !== null ? '' : bare.includes(i + 1) ? 'bare' : 'empty'} style={c === null ? undefined : { background: CROP_COLORS[c % CROP_COLORS.length] }} title={c === null ? '' : cropLabel(rotation.calendar[c].crop, result.crop_names, language)} />)}</div>
    <div className="si-cal-months">{MONTH_LETTER[language].map((m, i) => <span key={i} className={deficit.has(i + 1) ? 'deficit' : ''}>{m}</span>)}</div>
    <div className="si-cal-legend">
      {rotation.calendar.map((c, i) => <span key={i}><i style={{ background: CROP_COLORS[i % CROP_COLORS.length] }} />{cropLabel(c.crop, result.crop_names, language)} · {short[c.sow_month - 1]}–{short[c.harvest_month - 1]}</span>)}
      {bare.length > 0 && <span><i className="bare" />{x('bareSoil')} · {monthRange(bare, short)}</span>}
    </div>
    <strong className="si-cal-verdict">{bare.length ? `${x('bareIn')} ${joinList(bare.map(m => MONTH_FULL[language][m - 1]), x('and'))}` : coversFarmBare.length ? `${x('coversIn')} ${joinList(coversFarmBare.map(m => MONTH_FULL[language][m - 1]), x('and'))}` : x('coveredAll')}</strong>
  </div>
}

function Evidence({ rotation }: { rotation: Rotation }) {
  const { x } = useTxt()
  const [open, setOpen] = useState(false)
  return <div className="si-evidence">
    <button type="button" className="si-evidence-btn" aria-expanded={open} onClick={() => setOpen(!open)}><Satellite size={16} /> {x('seeEvidence')} <ChevronDown size={16} className={open ? 'flip' : ''} /></button>
    {open && <div className="si-evidence-body">
      <p><strong>{x('why')}:</strong> {rotation.why}</p>
      {rotation.evidence.length > 0 && <ul>{rotation.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {rotation.temperature_fit && <p><strong>{x('temp')}:</strong> {rotation.temperature_fit}</p>}
      {rotation.general_knowledge.length > 0 && <p className="si-general"><strong>{x('general')}:</strong> {rotation.general_knowledge.join(' ')}</p>}
    </div>}
  </div>
}

// Mostra as 2 primeiras frases da explicação da IA; o resto abre sob demanda.
function Message({ text }: { text: string }) {
  const { x } = useTxt()
  const [open, setOpen] = useState(false)
  const parts = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [text]
  const short = parts.slice(0, 2).join('').trim()
  const long = parts.length > 2
  return <div className="si-message"><p>{open || !long ? text : short}</p>
    {long && <button type="button" className="si-more" aria-expanded={open} onClick={() => setOpen(!open)}>{x(open ? 'less' : 'more')} <ChevronDown size={15} className={open ? 'flip' : ''} /></button>}</div>
}

type Row = { key: string; label: string; sub: string; cell: (r: Rotation) => ReactNode }

export default function StudyInsight({ result }: { result: StudyResult }) {
  const { x, language } = useTxt()
  const a = result.analysis
  const rec = a.recommendation
  const rotations = a.rotations
  const recIndex = rotations.findIndex(r => r.name === rec.rotation_name)
  const recRot = rotations[recIndex] ?? rotations.find(r => !r.is_current)
  const traits = result.crop_traits ?? {}
  const label = (c: string) => cropLabel(c, result.crop_names, language)
  const fd = result.farm_data
  const ind = fd.agro_indicators
  const full = MONTH_FULL[language], short = MONTH_SHORT[language]
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  // Veredito
  const sugIdx = recRot ? recRot.crops.indexOf(rec.suggested_crop) : -1
  const before = recRot && sugIdx > 0 ? recRot.crops[sugIdx - 1] : null
  const sow = recRot?.calendar.find(c => c.crop === rec.suggested_crop)?.sow_month
  const drop = ind?.soil_moisture_end_second_crop?.mean_date_dd_mm
  const dryMonths = fd.monthly.filter(m => m.rain_mm != null && fd.deficit_months.includes(m.month))
  const driest = dryMonths.length ? dryMonths.reduce((p, c) => (c.rain_mm! < p.rain_mm! ? c : p)) : null
  const tradeoff = recRot?.risks[0]

  const rows: Row[] = [
    { key: 'unc', label: x('uncertainty'), sub: x('uncertaintySub'), cell: r => <><Pips level={LEVEL[r.uncertainty] ?? 0} /><strong className="si-val">{x(r.uncertainty)}</strong></> },
    { key: 'cal', label: x('calendar'), sub: x('calendarSub'), cell: r => <Calendar rotation={r} result={result} /> },
    { key: 'dro', label: x('drought'), sub: x('droughtSub'), cell: r => { const v = traits[keyCrop(r)]?.drought; return v ? <><Pips level={LEVEL[v] ?? 0} /><strong className="si-val">{x(v)}</strong></> : <><Pips level={0} empty /><strong className="si-val">{x('noData')}</strong></> } },
    { key: 'fld', label: x('field'), sub: x('fieldSub'), cell: r => { const d = traits[keyCrop(r)]?.cycle_days; if (!d) return <strong className="si-val">{x('noData')}</strong>; const m = Math.round(d / 15) / 2; return <><div className="si-big"><b>{Number.isInteger(m) ? `~${m}` : m}</b> {x('months')}</div><div className="si-meter"><i style={{ width: `${Math.min(100, (m / 12) * 100)}%` }} /></div><small className="si-note">{label(keyCrop(r))}</small></> } },
    { key: 'mkt', label: x('market'), sub: x('marketSub'), cell: r => { const v = traits[keyCrop(r)]?.market; return v ? <><Pips level={LEVEL[v] ?? 0} /><strong className="si-val">{x(v)}</strong><small className="si-note">{label(keyCrop(r))}</small></> : <><Pips level={0} empty /><strong className="si-val">{x('noData')}</strong></> } },
    { key: 'ben', label: x('benefits'), sub: x('benefitsSub'), cell: r => <ul className="si-list ok">{r.benefits.map((b, i) => <li key={i}><Check size={15} />{b}</li>)}</ul> },
    { key: 'rsk', label: x('risks'), sub: x('risksSub'), cell: r => <ul className="si-list warn">{r.risks.map((b, i) => <li key={i}><AlertTriangle size={15} />{b}</li>)}</ul> },
    { key: 'evi', label: x('evidence'), sub: x('evidenceSub'), cell: r => <Evidence rotation={r} /> },
  ]
  const head = (r: Rotation, i: number) => <>
    <div className="si-tags"><span className="si-tag">{r.is_current ? x('current') : `${x('alternative')} ${i}`}</span>{i === recIndex && <span className="si-tag rec"><CheckCircle2 size={14} /> {x('recommended')}</span>}</div>
    <h3>{r.crops.map(label).join(' → ')}</h3>
    <p>{r.farmer_summary}</p>
  </>

  return <div className="study-insight">
    <div className="si-top">
      <section className="si-verdict">
        <div className="si-verdict-main">
          <div className="si-kicker"><span>{x('suggestion')}</span><em>{x('uncertainty')}: {x(recRot?.uncertainty ?? 'medium').toLowerCase()}</em></div>
          <h2>{label(rec.suggested_crop)}</h2>
          {before && <p className="si-after">{x('after')} {label(before).toLowerCase()}</p>}
          {sow && <div className="si-sow"><span><CalendarDays size={20} /> {x('sowIn')} {cap(full[sow - 1])}</span></div>}
          <Message text={rec.message_to_farmer} />
        </div>
        {(drop || driest) && <div className="si-verdict-why">
          <span className="si-label">{x('why20')}</span>
          {drop && <div><b>{drop}</b><p>{x('moistureDrop')}{ddmm(drop, language) ? ` · ${ddmm(drop, language)}` : ''}</p></div>}
          {driest && <div><b>{driest.rain_mm!.toFixed(1)} mm</b><p>{x('rainIn')} {full[driest.month - 1]}</p></div>}
        </div>}
        {tradeoff && <div className="si-tradeoff"><span>{x('tradeoff')}</span><p>{tradeoff}</p></div>}
      </section>
      <aside className="si-indicators">
        <span className="si-label">{x('indicators')}</span>
        <p>{x('indicatorsSub')}</p>
        <div className="si-ind-grid">
          {ind?.rain_onset && <div><small>{x('onset')}</small><b>{ind.rain_onset.mean_date_dd_mm}</b><em>{ddmm(ind.rain_onset.mean_date_dd_mm, language)}</em></div>}
          {ind?.dry_spells_main_season && <div><small>{x('dryspell')}</small><b>{ind.dry_spells_main_season.pct_seasons_with_dry_spell}%</b></div>}
          <div><small>{x('deficit')}</small><b>{fd.deficit_months.length ? monthRange(fd.deficit_months, short) : x('none')}</b><em>{monthRange(fd.deficit_months, full)}</em></div>
          <div><small>{x('bare')}</small><b>{fd.bare_soil_months.length ? monthRange(fd.bare_soil_months, short) : x('none')}</b><em>{monthRange(fd.bare_soil_months, full)}</em></div>
        </div>
        <small className="si-src">{fd.sources.join(' · ')}</small>
      </aside>
    </div>

    <section className="si-compare" style={{ ['--cols' as string]: rotations.length }}>
      <div className="si-row si-row-head">
        <div className="si-rowlabel"><h3>{x('compare')}</h3><small>{x('compareSub')}</small></div>
        {rotations.map((r, i) => <div key={i} className={`si-cell ${i === recIndex ? 'rec' : ''}`}>{head(r, i)}</div>)}
      </div>
      {rows.map(row => <div key={row.key} className={`si-row si-row-${row.key}`}>
        <div className="si-rowlabel"><strong>{row.label}</strong><small>{row.sub}</small></div>
        {rotations.map((r, i) => <div key={i} className={`si-cell ${i === recIndex ? 'rec' : ''}`}><span className="si-mlabel">{row.label}</span>{row.cell(r)}</div>)}
      </div>)}
    </section>
    <div className="si-mobile">{rotations.map((r, i) => <article key={i} className={`si-card ${i === recIndex ? 'rec' : ''}`}>
      {head(r, i)}
      {rows.map(row => <div key={row.key} className="si-card-row"><span className="si-mlabel">{row.label}</span>{row.cell(r)}</div>)}
    </article>)}</div>
  </div>
}
