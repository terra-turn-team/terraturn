import {Link} from 'react-router-dom'
/** Wordmarks extracted from the official TerraTurn Brand Guidelines PDF (page 3).
 * When the team's separate asset ZIP becomes available, replace these PNG assets.
 */
export default function Brand({compact=false,onDark=false}:{compact?:boolean;onDark?:boolean}){
 return <Link to="/app" className="brand" aria-label="TerraTurn — início"><img className={compact?'brand-image compact':'brand-image'} src={onDark?'/brand-guidelines-dark.png':'/brand-official-guidelines.png'} alt="TerraTurn"/></Link>
}
