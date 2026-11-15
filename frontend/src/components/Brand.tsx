import {Link} from 'react-router-dom'
export default function Brand({compact=false,onDark=false}:{compact?:boolean;onDark?:boolean}){
 return <Link to="/app" className={`brand ${onDark?'on-dark':''} ${compact?'compact':''}`} aria-label="TerraTurn — início"><img className="brand-mark-img" src="/brand-mark.svg" alt=""/><span className="brand-word">terra<span>turn</span></span></Link>
}
