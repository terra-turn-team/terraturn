import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, CircleHelp, Clock3, CloudRain, Wind, Thermometer, Sprout, ShieldAlert } from 'lucide-react'
import type { Farm } from '../types'
import { useViewStore } from '../lib/viewStore'
import {useI18n,useLanguage,localeFor} from '../lib/i18n'

const monthsFor=(lang:string)=>Array.from({length:12},(_,i)=>new Intl.DateTimeFormat(lang,{month:'short'}).format(new Date(2026,i,1)).replace('.','').toUpperCase())
const LINES = [
  {id:'crop',label:'Ciclo do cultivo',icon:Sprout,kind:'plan'},
  {id:'rain',label:'Precipitação',icon:CloudRain,kind:'data'},
  {id:'temp',label:'Temperatura',icon:Thermometer,kind:'data'},
  {id:'wind',label:'Ventos',icon:Wind,kind:'data'},
  {id:'risk',label:'Riscos / pragas',icon:ShieldAlert,kind:'data'}
]
export const monthName=(index:number)=>new Intl.DateTimeFormat(localeFor(useLanguage.getState().language),{month:'long'}).format(new Date(2026,index,1))
export function Timeline({farm}:{farm:Farm}){
  const {t,language}=useI18n()
  const MONTHS=useMemo(()=>monthsFor(localeFor(language)),[language])
  const monthIndex=useViewStore(s=>s.monthIndex)
  const setMonthIndex=useViewStore(s=>s.setMonthIndex)
  const stage=useMemo(()=>{
    if(!farm.planting_month)return null
    const n=(monthIndex-(farm.planting_month-1)+12)%12
    return n===0?'Implantação':n<=2?'Desenvolvimento':n<=4?'Crescimento':n===5?'Pré-colheita':n===6?'Colheita':'Entressafra'
  },[farm.planting_month,monthIndex])
  return <section className="timeline-panel" aria-label="Linha do tempo agrícola">
    <div className="timeline-toolbar"><div className="timeline-title"><Clock3 size={17}/><strong>{t('Linha do tempo agrícola')}</strong><span className="soft-chip">PLANEJAMENTO · {new Date().getFullYear()}</span></div><div className="timeline-controls"><button type="button" className="icon-btn small" onClick={()=>setMonthIndex(monthIndex-1)} aria-label="Mês anterior"><ChevronLeft size={17}/></button><strong>{monthName(monthIndex)}</strong><button type="button" className="icon-btn small" onClick={()=>setMonthIndex(monthIndex+1)} aria-label="Próximo mês"><ChevronRight size={17}/></button></div></div>
    <div className="timeline-grid-wrap"><div className="timeline-grid">
      <div className="timeline-label heading">{t('CAMADAS')}</div>
      {MONTHS.map((m,i)=><button className={`timeline-month ${i===monthIndex?'active':''}`} onClick={()=>setMonthIndex(i)} key={m} type="button">{m}</button>)}
      {LINES.map(line=><div className="timeline-grid-row" key={line.id}>
        <div className="timeline-label"><line.icon size={15}/><span>{t(line.label)}</span></div>
        {MONTHS.map((_,i)=>{
          const elapsed=farm.planting_month?(i-(farm.planting_month-1)+12)%12:-1
          const phase=elapsed===0?'implant':elapsed>=1&&elapsed<=4?'growth':elapsed>=5&&elapsed<=6?'harvest':''
          return <button type="button" onClick={()=>setMonthIndex(i)} className={`timeline-cell ${i===monthIndex?'selected':''}`} key={i} aria-label={`${line.label} — ${monthName(i)}`}>
            {line.id==='crop'&&phase&&<span className={`timeline-bar ${phase}`}/>}
            {line.id!=='crop'&&<span className="timeline-unavailable">·</span>}
          </button>
        })}
      </div>)}
    </div></div>
    <div className="timeline-foot"><p><CircleHelp size={14}/> <strong>{t('Sem séries NASA conectadas.')}</strong> {t('A barra de cultivo representa apenas o calendário informado; outras linhas aguardam dados científicos.')}</p>{stage&&<span>{t('Etapa planejada:')} <strong>{t(stage)}</strong></span>}</div>
  </section>
}
