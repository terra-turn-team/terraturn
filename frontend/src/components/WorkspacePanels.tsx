import {useState} from 'react'
import {AreaChart,Area,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid} from 'recharts'
import {ArrowUpRight,Check,CloudRain,Download,Leaf,RefreshCw,Search,Sprout} from 'lucide-react'
import type {AgronomyContext,Farm} from '../types'
import {INDICATORS,GOALS,historyWindow} from '../lib/planning'
import {useI18n,localeFor} from '../lib/i18n'
import {LAYERS,readLayer} from '../lib/layers'
import {useViewStore} from '../lib/viewStore'
import StudyPanel from './StudyPanel'
export function OverviewPanel({farm,context,onPlan,onEdit}:{farm:Farm;context?:AgronomyContext;onPlan:()=>void;onEdit:()=>void}){
 const {t,language}=useI18n(),locale=localeFor(language)
 return <div className="panel-stack"><div className="section-line"><span>{t('INDICADORES DA ÁREA')}</span><button onClick={onEdit}>{t('Personalizar')} <ArrowUpRight size={13}/></button></div>
 <div className="indicator-grid">{farm.indicators.map(id=>{const def=INDICATORS.find(x=>x.value===id)!;const metric=context?.metrics.find(x=>x.id===id&&x.value!==null);const declared=id==='ph'?farm.soil.ph:id==='organic_matter'?farm.soil.organic_matter_percent:null;const value=metric?.value??declared;return <article className="indicator-card" key={id}><span>{t(def.label)}</span><strong>{value==null?'—':value.toLocaleString(locale,{maximumFractionDigits:2})}<small>{value==null?'':metric?.unit??def.unit}</small></strong><p>{value==null?t('Aguardando dados'):t(metric?.kind==='estimated'?'Estimativa':metric?'Observado':'Análise local declarada')}</p>{metric&&<div className="metric-provenance" title={metric.uncertainty}>{metric.source} · {metric.date}{metric.resolution&&` · ${metric.resolution}`}</div>}</article>})}</div>
 {!farm.indicators.length&&<div className="empty-block">{t('Selecione os indicadores que deseja acompanhar.')}<button className="text-action" onClick={onEdit}>{t('Personalizar')}</button></div>}
 
 
 <article className="workspace-card"><div className="card-heading"><Leaf size={16}/><strong>{t('Prioridades da propriedade')}</strong></div><div className="priority-chips">{farm.goals.map(g=><span key={g}>{t(GOALS.find(x=>x.value===g)?.label??g)}</span>)}</div></article></div>
}
export function LayersPanel({farm,context}:{farm?:Farm;context?:AgronomyContext}){const {t,language}=useI18n(),locale=localeFor(language);const [search,setSearch]=useState('');const layer=useViewStore(s=>s.layer),setLayer=useViewStore(s=>s.setLayer)
 const match=(l:(typeof LAYERS)[number])=>t(l.label).toLocaleLowerCase().includes(search.toLocaleLowerCase())
 const items=LAYERS.filter(match).map(l=>({l,r:readLayer(l,farm,context,t,locale)})),ready=items.filter(x=>x.r.kind!=='none')
 const badge=(k:string)=>t(k==='nasa'?'Dados NASA':k==='declared'?'Dado declarado':'Ilustrativo')
 return <div className="panel-stack"><label className="workspace-search"><Search size={16}/><input aria-label={t('Buscar camada')} placeholder={t('Buscar camada')} value={search} onChange={e=>setSearch(e.target.value)}/></label>
 {['Cultivo','Solo','Relevo','Clima','Manejo'].map(group=>{const list=ready.filter(x=>x.l.group===group);return list.length?<section className="workspace-layer-group" key={group}><h3>{t(group)}<span>{list.length}</span></h3>{list.map(({l,r})=><button className={`workspace-layer ${layer===l.value?'is-active':''}`} aria-pressed={layer===l.value} key={l.value} onClick={()=>setLayer(l.value)}><span className="layer-glyph"><l.icon size={18}/></span><span><strong>{t(l.label)}</strong><b className="layer-value">{r.value??t('Não informado')}</b><small>{t(l.description)}</small><em>{badge(r.kind)} · {r.source}{r.detail?' · '+r.detail:''}</em></span>{layer===l.value?<Check size={16}/>:<span className="layer-circle"/>}</button>)}</section>:null})}
 
 <p className="fine-print">{t('As camadas exibem a disponibilidade e a origem dos dados. Valores ausentes não são substituídos por zero.')}</p></div>}
// Planejamento: resumo da análise de IA e acesso à análise completa.
export function PlanningPanel({farm,onPdf,pdfBusy}:{farm:Farm;context?:AgronomyContext;onPdf:()=>void;pdfBusy:boolean;onEdit:()=>void;onRefresh:()=>void}){
 const {t}=useI18n()
 return <div className="panel-stack"><StudyPanel farm={farm} compact/>
  <button className="btn btn-outline btn-wide" disabled={pdfBusy} onClick={onPdf}><Download size={16}/>{t(pdfBusy?'Gerando PDF…':'Relatório da fazenda (PDF)')}</button></div>
}
export function ClimatePanel({context,onRefresh,isFetching,error}:{context?:AgronomyContext;onRefresh:()=>void;isFetching:boolean;error:boolean}){const {t}=useI18n();const h=context?.history;return <div className="panel-stack"><article className="workspace-card"><div className="card-heading"><CloudRain size={17}/><strong>{t('Histórico climático')}</strong><span className="subtle-pill">5 {t('anos')}</span></div><p>{t('Observações anteriores ao início do planejamento, recebidas pela integração da equipe.')}</p>{h?.monthly.length?<div className="climate-chart"><ResponsiveContainer width="100%" height={190}><AreaChart data={h.monthly}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="month" fontSize={9}/><YAxis width={35} fontSize={10}/><Tooltip/><Area name={t('Precipitação')+' (mm)'} type="monotone" dataKey="precipitation_mm" stroke="#438166" fill="#e2eee5" connectNulls={false}/></AreaChart></ResponsiveContainer><ResponsiveContainer width="100%" height={160}><AreaChart data={h.monthly}><XAxis dataKey="month" fontSize={9}/><YAxis width={35} fontSize={10}/><Tooltip/><Area name={t('Temperatura média')+' (°C)'} type="monotone" dataKey="temperature_c" stroke="#c78e4d" fill="#f4e7d5" connectNulls={false}/></AreaChart></ResponsiveContainer></div>:<div className="climate-empty"><CloudRain size={32}/><strong>{t('Sua série começa aqui.')}</strong><span>{t('Aguardando dados climáticos observados.')}</span></div>}<dl className="data-list"><div><dt>{t('Fonte')}</dt><dd>{h?.source??'NASA · '+t('Aguardando')}</dd></div><div><dt>{t('Período')}</dt><dd>{h?.start_date??historyWindow().start_date}<br/>{h?.end_date??historyWindow().end_date}</dd></div><div><dt>{t('Cobertura recebida')}</dt><dd>{h?.completeness_percent??0}%</dd></div><div><dt>{t('Última observação')}</dt><dd>{h?.observed_through??'—'}</dd></div><div><dt>{t('Resolução espacial')}</dt><dd>{h?.resolution??'—'}</dd></div></dl></article>{error&&<p className="form-error" role="alert">{t('Não foi possível consultar a integração.')}</p>}<button className="btn btn-outline btn-wide" disabled={isFetching} onClick={onRefresh}><RefreshCw size={15} className={isFetching?'spin':''}/>{t('Atualizar dados')}</button><p className="fine-print">{t('Cinco anos ajudam a caracterizar a sazonalidade. O histórico não garante as condições futuras. pH e matéria orgânica dependem de análise local do solo.')}</p></div>}

type EmptyKind='overview'|'planning'|'climate'|'layers'|'assistant'
const EMPTY:Record<EmptyKind,{title:string;text:string;note:string}>={
 overview:{title:'Vamos começar pela sua terra.',text:'Em 3 passos você chega à primeira recomendação de rotação.',note:'Usa NASA POWER, MODIS NDVI e evapotranspiração e uma tabela de 31 culturas.'},
 planning:{title:'Seu plano de rotação aparece aqui.',text:'A IA compara sua rotação atual com 2 alternativas, mês a mês, para até 24 meses.',note:'Usa 20 anos de dados da NASA e 31 culturas.'},
 climate:{title:'Chuva e temperatura da sua área.',text:'O histórico mensal dos últimos anos aparece aqui assim que a área for cadastrada.',note:'Fontes: NASA POWER e MODIS.'},
 layers:{title:'Camadas sobre a sua área.',text:'Cadastre uma propriedade para explorar cultivo, solo, relevo e clima sobre o seu talhão.',note:'Algumas camadas dependem da integração com dados da NASA.'},
 assistant:{title:'Pergunte sobre a sua fazenda.',text:'Cadastre uma propriedade para eu responder com os dados da NASA dela.',note:'Exemplos: Quanto chove em janeiro? Quando devo semear? Qual cobertura combina?'},
}
const STEPS=['Desenhe o perímetro da área no mapa de satélite.','Informe a cultura atual e as prioridades.','Rode a análise: 3 rotações com dados da NASA.']
export function SectionEmpty({kind,onRegister}:{kind:EmptyKind;onRegister:()=>void}){
 const {t}=useI18n(),c=EMPTY[kind]
 return <div className="section-empty"><span className="section-empty-icon"><Sprout size={20}/></span><h2>{t(c.title)}</h2><p>{t(c.text)}</p>
  {kind==='overview'?<ol className="empty-steps">{STEPS.map((s,i)=><li key={i}><span>{String(i+1).padStart(2,'0')}</span>{t(s)}</li>)}</ol>:
   kind==='planning'?<div className="empty-preview" aria-hidden="true">{[0,1,2].map(i=><div key={i} className="ghost-card"><i/><i/><b/></div>)}<div className="ghost-ruler">{Array.from({length:24},(_,i)=><i key={i}/>)}</div></div>:
   kind==='climate'?<div className="empty-preview" aria-hidden="true"><svg viewBox="0 0 240 80" className="ghost-chart"><path d="M0 60 C20 20 40 70 60 40 S100 10 120 45 S160 70 180 30 S220 50 240 35"/></svg></div>:
   kind==='assistant'?<div className="empty-preview" aria-hidden="true">{['Quanto chove em janeiro?','Quando devo semear?','Qual cobertura combina?'].map(q=><span key={q} className="ghost-chip">{t(q)}</span>)}</div>:
   <div className="empty-preview" aria-hidden="true">{[0,1,2,3].map(i=><div key={i} className="ghost-row"><i/><b/></div>)}</div>}
  <button className="btn btn-primary btn-wide" onClick={onRegister}><Sprout size={16}/>{t('Cadastrar propriedade')}</button>
  <small>{t(c.note)}</small></div>
}
