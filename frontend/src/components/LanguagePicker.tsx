import { Languages } from 'lucide-react'
import { useI18n, useLanguage, type Language } from '../lib/i18n'
import Select from './Select'
const ITEMS=[{code:'en',name:'English'},{code:'pt-BR',name:'Português'},{code:'es',name:'Español'}]
export default function LanguagePicker({full=false}:{full?:boolean}){
 const {language,t}=useI18n(),setLanguage=useLanguage(s=>s.setLanguage)
 if(full)return <div className="language-picker full"><Select label={t('Idioma')} value={language} onChange={v=>setLanguage(v as Language)} items={ITEMS}/></div>
 return <div className="language-picker compact" title={t('Idioma')}><Languages size={16}/><Select label={t('Idioma')} hideLabel value={language} onChange={v=>setLanguage(v as Language)} items={ITEMS.map(i=>({code:i.code,name:i.code==='pt-BR'?'PT':i.code.toUpperCase()}))}/></div>
}
