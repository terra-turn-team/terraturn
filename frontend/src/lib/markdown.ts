// Markdown mínimo e seguro para as respostas da IA: vira dados, nunca HTML.
export type Inline={type:'text'|'strong'|'em'|'code';text:string}
export type Block={type:'p';lines:Inline[][]}|{type:'h';inline:Inline[]}|{type:'ul'|'ol';items:Inline[][]}

const INLINE=/\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|(?<![\w*])\*(?![\s*])([^*\n]+?)\*(?![\w*])|(?<!\w)_(?!\s)([^_\n]+?)_(?!\w)/g

export function parseInline(text:string):Inline[]{
  const out:Inline[]=[];let last=0
  for(const m of text.matchAll(INLINE)){
    if(m.index>last)out.push({type:'text',text:text.slice(last,m.index)})
    if(m[1]??m[2])out.push({type:'strong',text:(m[1]??m[2])!})
    else if(m[3])out.push({type:'code',text:m[3]})
    else out.push({type:'em',text:(m[4]??m[5])!})
    last=m.index+m[0].length
  }
  if(last<text.length)out.push({type:'text',text:text.slice(last)})
  return out
}

export function parseMarkdown(src:string):Block[]{
  const blocks:Block[]=[]
  let para:Inline[][]|null=null,list:{type:'ul'|'ol';items:Inline[][]}|null=null
  const flush=()=>{if(para)blocks.push({type:'p',lines:para});if(list)blocks.push(list);para=null;list=null}
  for(const raw of src.replace(/\r\n?/g,'\n').split('\n')){
    const line=raw.trim()
    if(!line||/^([-*_])\1{2,}$/.test(line)){flush();continue}
    const h=line.match(/^#{1,6}\s+(.*)$/)
    if(h){flush();blocks.push({type:'h',inline:parseInline(h[1].replace(/\s#+$/,''))});continue}
    const ul=line.match(/^[-*+•]\s+(.*)$/),ol=line.match(/^\d+[.)]\s+(.*)$/)
    const item=ul?.[1]??ol?.[1]
    if(item!==undefined){
      const type=ul?'ul':'ol'
      if(para||(list&&list.type!==type))flush()
      list??={type,items:[]}
      list.items.push(parseInline(item))
      continue
    }
    if(list){flush()}
    para??=[]
    para.push(parseInline(line))
  }
  flush()
  return blocks
}

// Primeiras frases de um texto. Só corta quando há espaço depois de . ! ?, para não partir números como 160.9.
export function firstSentences(text:string,n:number):{short:string;more:boolean}{
  const parts=text.trim().split(/(?<=[.!?])\s+/).filter(Boolean)
  return {short:parts.slice(0,n).join(' '),more:parts.length>n}
}
