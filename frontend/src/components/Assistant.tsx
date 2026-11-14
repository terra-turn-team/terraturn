import { useState, type FormEvent } from 'react'
import { ArrowUp, Bot, Check, Sparkles, AlertCircle } from 'lucide-react'
import type { Farm, ChatItem, WeatherLayer } from '../types'
import { useViewStore } from '../lib/viewStore'
import {useI18n} from '../lib/i18n'
import { api, ApiError } from '../lib/api'
const now=()=>new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
const initial:ChatItem[]=[{id:'intro',role:'assistant',text:'Olá! Posso navegar pelo dashboard, mostrar uma camada, avançar a timeline e preparar alterações para sua confirmação. Estudos científicos dependem da futura integração com IA e NASA.',time:now()}]
export function Assistant({farm,onEdit,onNew,onChangeCrop}:{farm:Farm;onEdit:()=>void;onNew:()=>void;onChangeCrop:(crop:string)=>Promise<void>}){
  const {t}=useI18n()
  const [messages,setMessages]=useState<ChatItem[]>(initial)
  const [text,setText]=useState('')
  const [sending,setSending]=useState(false)
  const [pendingCrop,setPendingCrop]=useState('')
  const setLayer=useViewStore(s=>s.setLayer),setMonthIndex=useViewStore(s=>s.setMonthIndex)
  const month=useViewStore(s=>s.monthIndex),setTab=useViewStore(s=>s.setSelectedTab),showAction=useViewStore(s=>s.showAction)
  const add=(role:'assistant'|'user',msg:string)=>setMessages(m=>[...m,{id:crypto.randomUUID(),role,text:msg,time:now()}])
  const send=async(e:FormEvent)=>{
    e.preventDefault();const input=text.trim();if(!input||sending)return
    add('user',input);setText('');setSending(true)
    const lower=input.toLocaleLowerCase('pt-BR')
    try {
      const layers:Record<string,WeatherLayer>={chuva:'chuva',rain:'chuva',precipitação:'chuva',rainfall:'chuva',lluvia:'chuva',temperatura:'temperatura',temperature:'temperatura',calor:'temperatura',heat:'temperatura',vento:'vento',wind:'vento',viento:'vento',solo:'solo',soil:'solo',suelo:'solo',cultivo:'cultivo',crop:'cultivo',plantação:'cultivo',maize:'cultivo'}
      const layerKey=Object.keys(layers).find(k=>lower.includes(k))
      const changing=lower.match(/(?:mudar|alterar|trocar)\s+(?:a\s+)?cultura\s+(?:para\s+)?([a-zà-úç\-\s]+)/i)
      if(changing){setPendingCrop(changing[1].trim().replace(/[.!?]$/,''));add('assistant',`Deseja alterar a cultura de ${farm.crop} para ${changing[1].trim()}? Confirme no painel abaixo antes de gravar.`);showAction('Alteração de cultivo pendente de confirmação')}
      else if(lower.includes('novo estudo')||lower.includes('nova análise')||lower.includes('analisar propriedade')){
        try{await api('/ai/studies',{method:'POST',body:JSON.stringify({farm_id:farm.id,prompt:input})})}
        catch(err){add('assistant',err instanceof ApiError && err.status===501?'O estudo foi solicitado, mas o módulo da equipe de IA ainda não foi conectado. Nenhuma análise científica foi inventada.':'O serviço de estudos está indisponível no momento.')}
        showAction('Solicitação de estudo registrada na interface · aguardando módulo IA')
      }
      else if(lower.includes('next month')||lower.includes('mes siguiente')||lower.includes('próximo mês')||lower.includes('avançar')||lower.includes('mês seguinte')){setMonthIndex(month+1);setTab('timeline');add('assistant','Timeline avançada em um mês. A etapa selecionada foi destacada.');showAction('Timeline avançada')}
      else if(lower.includes('edit property')||lower.includes('editar propiedad')||lower.includes('editar propriedade')||lower.includes('editar cadastro')){onEdit();add('assistant','Abri o formulário de edição da propriedade.');showAction('Edição de propriedade aberta')}
      else if(lower.includes('new property')||lower.includes('nueva propiedad')||lower.includes('nova propriedade')||lower.includes('cadastrar propriedade')){onNew();add('assistant','Abri o cadastro de uma nova propriedade.');showAction('Novo cadastro aberto')}
      else if(layerKey){setLayer(layers[layerKey]);add('assistant',`Camada “${layerKey}” selecionada no visualizador 3D. Os indicadores climáticos reais serão mostrados quando a NASA estiver conectada.`);showAction(`Camada alterada para ${layerKey}`)}
      else {add('assistant','Entendi sua solicitação, mas ainda não tenho um módulo de linguagem natural conectado. Tente: “mostrar chuva”, “avançar mês”, “editar propriedade” ou “mudar cultura para milho”.')}
    }finally{setSending(false)}
  }
  const confirmChange=async()=>{try{await onChangeCrop(pendingCrop);add('assistant',`Cultura principal alterada para ${pendingCrop}. O modelo 3D foi atualizado com aparência ilustrativa.`);showAction(`Cultura alterada para ${pendingCrop}`);setPendingCrop('')}catch{add('assistant','Não foi possível salvar a alteração. Tente pelo formulário de edição.')}}
  return <div className="assistant-panel"><div className="chat-messages" aria-live="polite">{messages.map(m=><div key={m.id} className={`chat-message ${m.role}`}><div className="chat-avatar">{m.role==='assistant'?<Bot size={16}/>:<span>EU</span>}</div><div className="chat-bubble"><p>{m.id==='intro'?t(m.text):m.text}</p><time>{m.time}</time></div></div>)}{pendingCrop&&<div className="chat-confirm"><AlertCircle size={16}/><span>Salvar cultura “{pendingCrop}” nesta propriedade?</span><button type="button" className="btn btn-primary btn-small" onClick={confirmChange}><Check size={13}/> Confirmar</button><button type="button" className="btn btn-outline btn-small" onClick={()=>setPendingCrop('')}>Cancelar</button></div>}</div>
    <form onSubmit={send} className="chat-compose"><Sparkles size={17}/><input value={text} onChange={e=>setText(e.target.value)} placeholder={t('Pergunte, altere ou explore a sua propriedade...')} maxLength={2000} aria-label="Mensagem para assistente"/><button type="submit" disabled={!text.trim()||sending} aria-label="Enviar mensagem"><ArrowUp size={18}/></button></form><p className="chat-disclaimer">{t('Comandos locais disponíveis · IA científica ainda não conectada')}</p>
  </div>
}
