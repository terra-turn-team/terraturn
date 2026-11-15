import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUp, Check, AlertCircle, MapPin, Satellite } from 'lucide-react'
import type { Farm, ChatItem, WeatherLayer } from '../types'
import { useViewStore } from '../lib/viewStore'
import {useI18n,localeFor} from '../lib/i18n'
import { ApiError, agronomyApi } from '../lib/api'
import { aiApi } from '../lib/ai'
import { getLayer } from '../lib/layers'
import Markdown from './Markdown'
import { useChatStore } from '../lib/chatStore'
const fill=(s:string,v:Record<string,string>)=>s.replace(/\{(\w+)\}/g,(_,k:string)=>v[k]??'')
const now=()=>new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
const initial:ChatItem[]=[{id:'intro',role:'assistant',text:'Olá! Pergunte qualquer coisa sobre a sua fazenda: chuva, temperatura, quando plantar ou qual cultura combina com a área. Eu respondo com os dados da NASA desta propriedade.',time:now()}]
export function Assistant({farm,onEdit,onNew,onChangeCrop}:{farm:Farm;onEdit:()=>void;onNew:()=>void;onChangeCrop:(crop:string)=>Promise<void>}){
  const {t,language}=useI18n()
  const saved=useChatStore(s=>s.byFarm[farm.id]),addToStore=useChatStore(s=>s.add)
  const messages=saved?.length?[...initial,...saved]:initial
  const listRef=useRef<HTMLDivElement>(null)
  const [text,setText]=useState('')
  const [sending,setSending]=useState(false)
  // Rola até a última mensagem; a tela inicial (sem conversa) fica no topo.
  useEffect(()=>{const el=listRef.current;if(el&&(saved?.length||sending))el.scrollTop=el.scrollHeight},[messages.length,sending])
  // Mesmos dados NASA do painel (cache compartilhado do react-query) para a tela inicial do chat.
  const context=useQuery({queryKey:['agronomy',farm.id,farm.updated_at,language],queryFn:()=>agronomyApi.context(farm,language)}).data
  const [pendingCrop,setPendingCrop]=useState('')
  const setLayer=useViewStore(s=>s.setLayer),setMonthIndex=useViewStore(s=>s.setMonthIndex)
  const month=useViewStore(s=>s.monthIndex),setTab=useViewStore(s=>s.setSelectedTab),showAction=useViewStore(s=>s.showAction)
  const add=(role:'assistant'|'user',msg:string,data?:boolean)=>addToStore(farm.id,{id:crypto.randomUUID(),role,text:msg,time:now(),...(data?{data}:{})})
  const send=async(e:FormEvent)=>{e.preventDefault();await ask(text)}
  const ask=async(raw:string)=>{
    const input=raw.trim();if(!input||sending)return
    add('user',input);setText('');setSending(true)
    const lower=input.toLocaleLowerCase('pt-BR')
    try {
      const layers:Record<string,WeatherLayer>={chuva:'chuva',rain:'chuva',precipitação:'chuva',rainfall:'chuva',lluvia:'chuva',temperatura:'temperatura',temperature:'temperatura',calor:'temperatura',heat:'temperatura',vento:'vento',wind:'vento',viento:'vento',solo:'solo',soil:'solo',suelo:'solo',cultivo:'cultivo',crop:'cultivo',plantação:'cultivo',maize:'cultivo'}
      const wantsLayer=/^(mostrar|exibir|ver|show|display)\b/.test(lower)
      const layerKey=wantsLayer?Object.keys(layers).find(k=>lower.includes(k)):undefined
      const changing=lower.match(/(?:mudar|alterar|trocar)\s+(?:a\s+)?cultura\s+(?:para\s+)?([a-zà-úç\-\s]+)/i)??lower.match(/change\s+(?:the\s+)?crop\s+(?:to\s+)?([a-z\-\s]+)/i)??lower.match(/cambiar\s+(?:el\s+)?cultivo\s+(?:a\s+|por\s+)?([a-zà-úñ\-\s]+)/i)
      if(changing){setPendingCrop(changing[1].trim().replace(/[.!?]$/,''));add('assistant',fill(t('Deseja alterar a cultura de {de} para {para}? Confirme no painel abaixo antes de gravar.'),{de:t(farm.crop||'—'),para:changing[1].trim()}));showAction(t('Alteração de cultivo pendente de confirmação'))}
      else if(lower.includes('next month')||lower.includes('mes siguiente')||lower.includes('próximo mês')||lower.includes('avançar')||lower.includes('mês seguinte')){setMonthIndex(Math.min(month+1,farm.planning.horizon_months-1));setTab('timeline');add('assistant',t('Timeline avançada em um mês. A etapa selecionada foi destacada.'));showAction(t('Timeline avançada'))}
      else if(lower.includes('edit property')||lower.includes('editar propiedad')||lower.includes('editar propriedade')||lower.includes('editar cadastro')){onEdit();add('assistant',t('Abri o formulário de edição da propriedade.'));showAction(t('Edição de propriedade aberta'))}
      else if(lower.includes('new property')||lower.includes('nueva propiedad')||lower.includes('nova propriedade')||lower.includes('cadastrar propriedade')){onNew();add('assistant',t('Abri o cadastro de uma nova propriedade.'));showAction(t('Novo cadastro aberto'))}
      else if(layerKey){setLayer(layers[layerKey]);const name=t(getLayer(layers[layerKey]).label);add('assistant',fill(t('Camada “{camada}” selecionada no mapa.'),{camada:name}));showAction(fill(t('Camada alterada para {camada}'),{camada:name}))}
      else {
        const history=messages.filter(m=>m.id!=='intro').slice(-6).map(m=>({role:m.role,content:m.text}))
        try{const r=await aiApi.chat(input,farm.id,language,history);add('assistant',r.answer||t('Não consegui responder agora. Tente reformular a pergunta.'),!!(r.answer&&r.farm_data))}
        catch(err){add('assistant',err instanceof ApiError?err.message:t('O assistente está indisponível no momento.'))}
      }
    }finally{setSending(false)}
  }
  const confirmChange=async()=>{try{await onChangeCrop(pendingCrop);add('assistant',fill(t('Cultura principal alterada para {cultura}. O modelo 3D foi atualizado com aparência ilustrativa.'),{cultura:pendingCrop}));showAction(fill(t('Cultura alterada para {cultura}'),{cultura:pendingCrop}));setPendingCrop('')}catch{add('assistant',t('Não foi possível salvar a alteração. Tente pelo formulário de edição.'))}}
  const locale=localeFor(language),hour=new Date().getHours()
  const greeting=t(hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite')
  const facts=([['rainfall','Chuva'],['temperature','Temperatura'],['ndvi','NDVI']] as const).map(([id,label])=>({label,m:context?.metrics.find(x=>x.id===id&&x.value!=null)})).filter(f=>f.m)
  const suggestions=['Quanto chove em cada mês nesta fazenda?','Qual segunda safra combina com esta área?','Em quais meses falta água no solo?']
  const history=saved??[]
  return <div className="assistant-panel tt-chat"><div className="chat-messages" aria-live="polite" ref={listRef}>
    {!history.length&&<div className="chat-empty">
      <img className="chat-empty-mark" src="/brand/logomark.svg" alt=""/>
      <h3>{greeting}</h3>
      <p>{fill(t('Pergunte sobre {fazenda}. Eu respondo com os dados da NASA desta área.'),{fazenda:farm.name})}</p>
      {facts.length>0&&<div className="chat-facts">{facts.map(({label,m})=><div key={label}><small>{t(label)}</small><strong>{(m!.value as number).toLocaleString(locale,{maximumFractionDigits:2})}<em>{m!.unit}</em></strong></div>)}</div>}
      <div className="chat-suggestions">{suggestions.map(q=><button type="button" key={q} disabled={sending} onClick={()=>ask(t(q))}>{t(q)}</button>)}</div>
    </div>}
    {history.map(m=><div key={m.id} className={`chat-message chat-row ${m.role}`}>{m.role==='user'?<p className="chat-user">{m.text}</p>:<><Markdown text={m.text}/>{m.data&&<span className="chat-source"><Satellite size={12}/>{t('Dados NASA desta fazenda')}</span>}</>}</div>)}
    {sending&&<div className="chat-typing" role="status"><span className="typing-dots" aria-hidden="true"><i/><i/><i/></span><span>{t('Pensando…')}</span></div>}
    {pendingCrop&&<div className="chat-confirm"><AlertCircle size={16}/><span>{fill(t('Salvar cultura “{cultura}” nesta propriedade?'),{cultura:pendingCrop})}</span><button type="button" className="btn btn-primary btn-small" onClick={confirmChange}><Check size={13}/> {t('Confirmar')}</button><button type="button" className="btn btn-outline btn-small" onClick={()=>setPendingCrop('')}>{t('Cancelar')}</button></div>}
  </div>
    <form onSubmit={send} className="chat-compose"><input value={text} onChange={e=>setText(e.target.value)} placeholder={t('Pergunte sobre esta fazenda…')} maxLength={2000} aria-label={t('Mensagem para assistente')}/><div className="chat-compose-bar"><span className="chat-compose-farm"><MapPin size={12}/>{farm.name}</span><button type="submit" className="chat-send" disabled={!text.trim()||sending} aria-label={t('Enviar mensagem')}><ArrowUp size={17}/></button></div></form>
    <p className="chat-disclaimer">{t('Respostas com dados da NASA desta fazenda · valide com um agrônomo local')}</p>
  </div>
}
