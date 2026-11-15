import { Fragment } from 'react'
import { parseMarkdown, type Inline } from '../lib/markdown'

function Inlines({ parts }: { parts: Inline[] }) {
  return <>{parts.map((p, i) => p.type === 'strong' ? <strong key={i}>{p.text}</strong> : p.type === 'em' ? <em key={i}>{p.text}</em> : p.type === 'code' ? <code key={i}>{p.text}</code> : <Fragment key={i}>{p.text}</Fragment>)}</>
}

export default function Markdown({ text }: { text: string }) {
  return <div className="md">{parseMarkdown(text).map((b, i) =>
    b.type === 'h' ? <p key={i} className="md-heading"><Inlines parts={b.inline} /></p>
    : b.type === 'p' ? <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}<Inlines parts={l} /></Fragment>)}</p>
    : b.type === 'ul' ? <ul key={i}>{b.items.map((it, j) => <li key={j}><Inlines parts={it} /></li>)}</ul>
    : <ol key={i}>{b.items.map((it, j) => <li key={j}><Inlines parts={it} /></li>)}</ol>)}</div>
}
