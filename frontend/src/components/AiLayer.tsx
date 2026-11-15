import { useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquare, Sparkles, X } from 'lucide-react'
import type { Farm } from '../types'
import { useI18n } from '../lib/i18n'
import { cropLabel, useStudy } from '../lib/ai'
import StudyPanel from './StudyPanel'
import { Assistant } from './Assistant'

type Props = { farm: Farm; sheetOpen: boolean; setSheetOpen: (v: boolean) => void; hideFab: boolean; onEdit: () => void; onNew: () => void; onChangeCrop: (crop: string) => Promise<void> }

export default function AiLayer({ farm, sheetOpen, setSheetOpen, hideFab, onEdit, onNew, onChangeCrop }: Props) {
  const { t, language } = useI18n()
  const { study, isRunning, start } = useStudy(farm.id)
  const [chatOpen, setChatOpen] = useState(false)
  const prev = useRef<string | undefined>(undefined)
  useEffect(() => {
    if ((prev.current === 'queued' || prev.current === 'running') && study?.status === 'complete') setSheetOpen(true)
    prev.current = study?.status
  }, [study?.status, setSheetOpen])
  useEffect(() => {
    if (!sheetOpen) return
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false) }
    window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn)
  }, [sheetOpen, setSheetOpen])
  useEffect(() => { if (hideFab) setChatOpen(false) }, [hideFab])
  const rec = study?.status === 'complete' ? study.result?.analysis.recommendation : null
  const run = () => { start.mutate(language); setSheetOpen(true) }
  return <>
    <div className="ai-pill" role="status" aria-live="polite">
      <span className="ai-pill-icon">{isRunning ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}</span>
      {isRunning ? <button type="button" onClick={() => setSheetOpen(true)}><small>{t('IA da TerraTurn')}</small><strong>{t('Analisando com dados da NASA…')}</strong></button>
        : rec ? <button type="button" onClick={() => setSheetOpen(true)}><small>{t('A IA recomenda')}</small><strong>{cropLabel(rec.suggested_crop, study?.result?.crop_names, language)} · {t('Ver análise')}</strong></button>
        : <button type="button" onClick={run}><small>{t('IA da TerraTurn')}</small><strong>{t('Analisar esta fazenda com IA')}</strong></button>}
    </div>
    {sheetOpen && <div className="ai-sheet" role="dialog" aria-modal="true" aria-label={t('Análise de rotação com IA')}>
      <div className="ai-sheet-head"><span><Sparkles size={16} /> {t('Análise de rotação com IA')} · {farm.name}</span><button type="button" className="icon-btn" aria-label={t('Fechar')} onClick={() => setSheetOpen(false)}><X size={18} /></button></div>
      <div className="ai-sheet-body"><StudyPanel farm={farm} /></div>
    </div>}
    {!hideFab && <>
      {chatOpen && <div className="ai-chat" role="dialog" aria-label={t('Assistente')}>
        <div className="ai-sheet-head"><span><MessageSquare size={16} /> {t('Pergunte à IA da TerraTurn')}</span><button type="button" className="icon-btn" aria-label={t('Fechar')} onClick={() => setChatOpen(false)}><X size={18} /></button></div>
        <div className="ai-chat-body"><Assistant key={farm.id} farm={farm} onEdit={onEdit} onNew={onNew} onChangeCrop={onChangeCrop} /></div>
      </div>}
      <button type="button" className={`ai-fab ${chatOpen ? 'open' : ''}`} onClick={() => setChatOpen(!chatOpen)} aria-expanded={chatOpen}><Sparkles size={18} /><span>{t('Pergunte à IA')}</span></button>
    </>}
  </>
}
