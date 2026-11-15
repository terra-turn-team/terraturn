import {Link} from 'react-router-dom'
export default function Brand({compact=false,onDark=false}:{compact?:boolean;onDark?:boolean}){
 return <Link to="/app" className={`brand ${compact?'compact':''}`} aria-label="TerraTurn"><img className="brand-lockup" src={onDark?'/brand/lockup-on-dark.svg':'/brand/lockup.svg'} alt="TerraTurn"/></Link>
}
