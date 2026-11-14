import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { useI18n } from '../lib/i18n'
export type Choice={code:string;name:string}
type Props={label:string;items:Choice[];value:string;onChange:(item:Choice)=>void;placeholder:string;disabled?:boolean;busy?:boolean;required?:boolean}
export default function SearchableSelect({label,items,value,onChange,placeholder,disabled,busy,required}:Props){
 const id=useId(),{t}=useI18n(),ref=useRef<HTMLDivElement>(null)
 const chosen=items.find(i=>i.code===value)
 const [search,setSearch]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(0)
 const list=items.filter(i=>i.name.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(search.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))).slice(0,150)
 useEffect(()=>{setSearch('')},[value])
 useEffect(()=>{
  const fn=(e:PointerEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node)){setOpen(false);setSearch('')}}
  document.addEventListener('pointerdown',fn);return()=>document.removeEventListener('pointerdown',fn)
 },[])
 const commit=(choice:Choice)=>{onChange(choice);setSearch('');setOpen(false);setActive(0)}
 return <div ref={ref} className="combobox-field"><label htmlFor={id} className="input-label">{label}{required?' *':''}</label>
  <div className="combobox-wrap"><input id={id} role="combobox" aria-expanded={open} aria-controls={id+'-choices'} aria-autocomplete="list" autoComplete="off" disabled={disabled||busy} required={required&&!chosen} placeholder={busy?t('Carregando localidades...'):placeholder} value={open?search:(chosen?.name||'')} onFocus={()=>{setOpen(true);setSearch('')}} onChange={e=>{setSearch(e.target.value);setActive(0);setOpen(true)}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(v=>Math.min(v+1,list.length-1))}if(e.key==='ArrowUp'){e.preventDefault();setActive(v=>Math.max(v-1,0))}if(e.key==='Enter'&&open&&list.length){e.preventDefault();commit(list[active]||list[0])}if(e.key==='Escape'){setOpen(false);setSearch('')}}}/><ChevronDown className="combobox-chevron" size={16}/></div>
  {open&&!disabled&&<div className="combobox-options" role="listbox" id={id+'-choices'}>{list.length?list.map((item,i)=><button className={`combobox-option ${i===active?'active':''}`} type="button" role="option" aria-selected={item.code===value} key={item.code} onMouseDown={e=>e.preventDefault()} onClick={()=>commit(item)}>{item.name}{item.code===value&&<Check size={15}/>}</button>):<div className="combobox-empty">{t('Nenhum resultado encontrado')}</div>}</div>}
 </div>
}
