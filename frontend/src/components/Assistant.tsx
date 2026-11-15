import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowUp, Bot, Check, Sparkles, AlertCircle } from 'lucide-react'
import type { Farm, ChatItem, WeatherLayer } from '../types'
import { useViewStore } from '../lib/viewStore'
import {useI18n} from '../lib/i18n'
import { ApiError } from '../lib/api'
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
  const [waited,setWaited]=useState(0)
  useEffect(()=>{const el=listRef.current;if(el)el.scrollTop=el.scrollHeight},[messages.length,sending])
  // Conta os segundos de espera para avisar quando a resposta da IA demora mais.
  useEffect(()=>{if(!sending){setWaited(0);return}const id=setInterval(()=>setWaited(w=>w+1),1000);return()=>clearInterval(id)},[sending])
  const [pendingCrop,setPendingCrop]=useState('')
  const setLayer=useViewStore(s=>s.setLayer),setMonthIndex=useViewStore(s=>s.setMonthIndex)
  const month=useViewStore(s=>s.monthIndex),setTab=useViewStore(s=>s.setSelectedTab),showAction=useViewStore(s=>s.showAction)
  const add=(role:'assistant'|'user',msg:string)=>addToStore(farm.id,{id:crypto.randomUUID(),role,text:msg,time:now()})
  const send=async(e:FormEvent)=>{
    e.preventDefault();const input=text.trim();if(!input||sending)return
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
        try{const r=await aiApi.chat(input,farm.id,language,history);add('assistant',r.answer||t('Não consegui responder agora. Tente reformular a pergunta.'))}
        catch(err){add('assistant',err instanceof ApiError?err.message:t('O assistente está indisponível no momento.'))}
      }
    }finally{setSending(false)}
  }
  const confirmChange=async()=>{try{await onChangeCrop(pendingCrop);add('assistant',fill(t('Cultura principal alterada para {cultura}. O modelo 3D foi atualizado com aparência ilustrativa.'),{cultura:pendingCrop}));showAction(fill(t('Cultura alterada para {cultura}'),{cultura:pendingCrop}));setPendingCrop('')}catch{add('assistant',t('Não foi possível salvar a alteração. Tente pelo formulário de edição.'))}}
  return <div className="assistant-panel"><div className="chat-messages" aria-live="polite" ref={listRef}>{messages.map(m=><div key={m.id} className={`chat-message ${m.role}`}><div className="chat-avatar">{m.role==='assistant'?<Bot size={16}/>:<span>{t('EU')}</span>}</div><div className="chat-bubble">{m.role==='assistant'?<Markdown text={m.id==='intro'?t(m.text):m.text}/>:<p>{m.text}</p>}<time>{m.time}</time></div></div>)}{sending&&<div className="chat-message assistant chat-typing" role="status" aria-live="polite"><div className="chat-avatar"><Bot size={16}/></div><div className="chat-bubble"><span className="typing-dots" aria-hidden="true"><i/><i/><i/></span><p>{t(waited>=8?'Ainda analisando os dados da NASA… pode levar até 30 segundos.':'A IA está gerando a resposta…')}</p></div></div>}{pendingCrop&&<div className="chat-confirm"><AlertCircle size={16}/><span>{fill(t('Salvar cultura “{cultura}” nesta propriedade?'),{cultura:pendingCrop})}</span><button type="button" className="btn btn-primary btn-small" onClick={confirmChange}><Check size={13}/> {t('Confirmar')}</button><button type="button" className="btn btn-outline btn-small" onClick={()=>setPendingCrop('')}>{t('Cancelar')}</button></div>}</div>
    <form onSubmit={send} className="chat-compose"><Sparkles size={17}/><input value={text} onChange={e=>setText(e.target.value)} placeholder={t('Pergunte, altere ou explore a sua propriedade...')} maxLength={2000} aria-label={t('Mensagem para assistente')}/><button type="submit" disabled={!text.trim()||sending} aria-label={t('Enviar mensagem')}><ArrowUp size={18}/></button></form><p className="chat-disclaimer">{t('Respostas com dados da NASA desta fazenda · valide com um agrônomo local')}</p>
  </div>
}
