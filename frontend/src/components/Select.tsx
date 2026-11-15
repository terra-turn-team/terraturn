import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export type SelectItem = { code: string; name: string }
type Props = { label: string; items: SelectItem[]; value: string; onChange: (code: string) => void; placeholder?: string; disabled?: boolean }

export default function Select({ label, items, value, onChange, placeholder, disabled }: Props) {
  const id = useId(), ref = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false), [active, setActive] = useState(0)
  const index = Math.max(0, items.findIndex(i => i.code === value))
  const chosen = items.find(i => i.code === value)
  useEffect(() => {
    const fn = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', fn); return () => document.removeEventListener('pointerdown', fn)
  }, [])
  const show = () => { setActive(index); setOpen(true) }
  const commit = (code: string) => { onChange(code); setOpen(false); btn.current?.focus() }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) show(); else setActive(v => Math.min(v + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (!open) show(); else setActive(v => Math.max(v - 1, 0)) }
    else if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); commit(items[active].code) }
    else if (e.key === 'Escape') setOpen(false)
  }
  return <div ref={ref} className="combobox-field">
    <span id={id + '-label'} className="input-label">{label}</span>
    <div className="combobox-wrap">
      <button ref={btn} type="button" className="select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={id + '-label'} aria-controls={id + '-choices'} disabled={disabled} onClick={() => open ? setOpen(false) : show()} onKeyDown={keys}>
        <span className={chosen ? '' : 'placeholder'}>{chosen?.name ?? placeholder ?? ''}</span>
      </button>
      <ChevronDown className="combobox-chevron" size={16} />
    </div>
    {open && !disabled && <div className="combobox-options" role="listbox" id={id + '-choices'} aria-labelledby={id + '-label'}>
      {items.map((item, i) => <button className={`combobox-option ${i === active ? 'active' : ''}`} type="button" role="option" aria-selected={item.code === value} key={item.code} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => commit(item.code)}>{item.name}{item.code === value && <Check size={15} />}</button>)}
    </div>}
  </div>
}
