import { Languages } from 'lucide-react'
import { useI18n, useLanguage, type Language } from '../lib/i18n'
export default function LanguagePicker(){
 const {language,t}=useI18n(),setLanguage=useLanguage(s=>s.setLanguage)
 return <label className="language-picker" title={t('Idioma')}><Languages size={16}/><span className="sr-only">{t('Idioma')}</span><select aria-label={t('Idioma')} value={language} onChange={e=>setLanguage(e.target.value as Language)}><option value="pt-BR">PT</option><option value="en">EN</option><option value="es">ES</option></select></label>
}
