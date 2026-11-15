import {useEffect,useMemo,useRef,Suspense} from 'react'
import {Canvas} from '@react-three/fiber'
import {OrbitControls,Html} from '@react-three/drei'
import * as THREE from 'three'
import type {Farm,WeatherLayer} from '../types'
import {useI18n} from '../lib/i18n'

type P2=[number,number]
type Plant={x:number;z:number;seed:number}
type CropKind='soy'|'maize'|'coffee'|'cane'|'wheat'|'bean'|'grass'|'generic'
function cropKind(value:string):CropKind{
 const v=value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 if(v.includes('soja'))return 'soy';if(v.includes('milho'))return 'maize';if(v.includes('cafe'))return 'coffee';if(v.includes('cana'))return 'cane';if(v.includes('trigo'))return 'wheat';if(v.includes('feijao'))return 'bean';if(v.includes('braqui'))return 'grass';return 'generic'
}
const conf:Record<CropKind,{height:number;spacing:number}>= {soy:{height:.53,spacing:.46},maize:{height:1.14,spacing:.7},coffee:{height:.8,spacing:.83},cane:{height:1.25,spacing:.67},wheat:{height:.7,spacing:.35},bean:{height:.44,spacing:.45},grass:{height:.53,spacing:.35},generic:{height:.49,spacing:.6}}
function pointsFor(farm:Farm):P2[]{const ring=farm.geometry.coordinates[0].slice(0,-1),lat0=farm.centroid[1]*Math.PI/180,pts=ring.map(([lon,lat])=>[(lon-farm.centroid[0])*Math.cos(lat0),lat-farm.centroid[1]] as P2),max=Math.max(.0000001,...pts.map(([x,y])=>Math.max(Math.abs(x),Math.abs(y))));return pts.map(([x,y])=>[x/max*4.3,y/max*4.3])}
function inside(x:number,y:number,p:P2[]){let flag=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const [xi,yi]=p[i],[xj,yj]=p[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)flag=!flag}return flag}
const rand=(n:number)=>{const v=Math.sin(n*97.43+34.23)*43758.545;return v-Math.floor(v)}
function Part({plants,geometry,color,growth,transform}:{plants:Plant[];geometry:THREE.BufferGeometry;color:string;growth:number;transform:(p:Plant)=>{x:number;y:number;z:number;sx:number;sy:number;sz:number;ry?:number;rz?:number}}){
 const ref=useRef<THREE.InstancedMesh>(null)
 useEffect(()=>{const mesh=ref.current;if(!mesh)return;const temp=new THREE.Object3D();plants.forEach((p,i)=>{const v=transform(p);temp.position.set(v.x,.57+v.y*growth,v.z);temp.scale.set(v.sx,v.sy*growth,v.sz);temp.rotation.set(0,v.ry??0,v.rz??0);temp.updateMatrix();mesh.setMatrixAt(i,temp.matrix)});mesh.instanceMatrix.needsUpdate=true},[plants,transform,growth])
 return <instancedMesh ref={ref} args={[geometry,undefined,plants.length]} frustumCulled={false} castShadow><meshStandardMaterial color={color} roughness={.78} side={THREE.DoubleSide}/></instancedMesh>
}
function CropModels({plants,crop,growth}:{plants:Plant[];crop:CropKind;growth:number}){
 const stem=useMemo(()=>new THREE.CylinderGeometry(.025,.036,1,5),[])
 const leaf=useMemo(()=>new THREE.SphereGeometry(.5,6,4),[])
 const blade=useMemo(()=>new THREE.ConeGeometry(.5,1,4),[])
 const seed=useMemo(()=>new THREE.SphereGeometry(.5,6,4),[])
 useEffect(()=>()=>{stem.dispose();leaf.dispose();blade.dispose();seed.dispose()},[stem,leaf,blade,seed])
 const h=conf[crop].height
 const trunk=(p:Plant)=>({x:p.x,y:h*.48,z:p.z,sx:1,sy:h,sz:1})
 const leafAt=(a:number,at:number,scale:number)=>(p:Plant)=>({x:p.x+Math.cos(a+p.seed)*scale*.25,y:h*at,z:p.z+Math.sin(a+p.seed)*scale*.25,sx:scale,sy:scale*.25,sz:scale*.6,ry:a+p.seed,rz:a*.2})
 const spike=(p:Plant)=>({x:p.x,y:h*.94,z:p.z,sx:.19,sy:.32,sz:.19})
 const grain=(p:Plant)=>({x:p.x,y:h*.93,z:p.z,sx:.13,sy:.2,sz:.14})
 if(crop==='grass')return <>{[0,1,2,3,4].map(i=><Part key={i} plants={plants} geometry={blade} color={i%2?'#6A9D79':'#3E7C4F'} growth={growth} transform={p=>({x:p.x+Math.sin(i*2.3)*.10,y:h*.4,z:p.z+Math.cos(i*2.3)*.10,sx:.13,sy:h*.8,sz:.13,rz:(i-2)*.15})}/>)}</>
 if(crop==='maize')return <><Part plants={plants} geometry={stem} color="#5A8D68" growth={growth} transform={trunk}/>{[0,1,2,3].map(i=><Part key={i} plants={plants} geometry={leaf} color="#3E7C4F" growth={growth} transform={leafAt(i*1.57,.30+i*.14,.55)}/>)}<Part plants={plants} geometry={blade} color="#B5835A" growth={growth} transform={spike}/><Part plants={plants} geometry={seed} color="#B7A578" growth={growth} transform={p=>({x:p.x+.10,y:h*.58,z:p.z,sx:.21,sy:.28,sz:.16})}/></>
 if(crop==='coffee')return <><Part plants={plants} geometry={stem} color="#B5835A" growth={growth} transform={trunk}/><Part plants={plants} geometry={leaf} color="#3E7C4F" growth={growth} transform={p=>({x:p.x,y:h*.72,z:p.z,sx:.69,sy:.65,sz:.68})}/>{[0,1,2].map(i=><Part key={i} plants={plants} geometry={seed} color="#B5835A" growth={growth} transform={p=>({x:p.x+Math.cos(i*2.1)*.25,y:h*.62,z:p.z+Math.sin(i*2.1)*.21,sx:.18,sy:.18,sz:.18})}/>)}</>
 if(crop==='cane')return <>{[0,1,2].map(i=><Part key={'s'+i} plants={plants} geometry={stem} color={i%2?'#87A98A':'#598B65'} growth={growth} transform={p=>({x:p.x+Math.sin(i*2.1)*.12,y:h*.49,z:p.z+Math.cos(i*2.1)*.12,sx:1.2,sy:h,sz:1.2})}/>)}{[0,1,2,3].map(i=><Part key={i} plants={plants} geometry={blade} color="#3E7C4F" growth={growth} transform={p=>({x:p.x+Math.sin(i*1.57)*.15,y:h*.79,z:p.z+Math.cos(i*1.57)*.15,sx:.19,sy:.7,sz:.13,rz:(i-1.5)*.33})}/>)}</>
 if(crop==='wheat')return <><Part plants={plants} geometry={stem} color="#6C936B" growth={growth} transform={trunk}/>{[0,2].map(i=><Part key={i} plants={plants} geometry={leaf} color="#6A9D79" growth={growth} transform={leafAt(i+.4,.44,.42)}/>)}<Part plants={plants} geometry={blade} color="#B5835A" growth={growth} transform={grain}/></>
 if(crop==='soy'||crop==='bean')return <><Part plants={plants} geometry={stem} color="#5A9065" growth={growth} transform={trunk}/>{[0,2,4].map(i=><Part key={i} plants={plants} geometry={leaf} color={crop==='soy'?'#3E7C4F':'#649A72'} growth={growth} transform={leafAt(i*1.12,.56+(i%2)*.19,crop==='soy'?.31:.37)}/>)}{crop==='soy'&&<Part plants={plants} geometry={seed} color="#84A383" growth={growth} transform={p=>({x:p.x+.10,y:h*.4,z:p.z,sx:.10,sy:.29,sz:.1})}/>}</>
 return <><Part plants={plants} geometry={stem} color="#3E7C4F" growth={growth} transform={trunk}/><Part plants={plants} geometry={leaf} color="#6A9D79" growth={growth} transform={leafAt(1,.65,.3)}/></>
}
function Land({farm,monthIndex,layer,onInspect}:{farm:Farm;monthIndex:number;layer:WeatherLayer;onInspect?:()=>void}){
 const pts=useMemo(()=>pointsFor(farm),[farm]),crop=cropKind(farm.crop)
 const shape=useMemo(()=>{const s=new THREE.Shape();pts.forEach(([x,y],i)=>i===0?s.moveTo(x,y):s.lineTo(x,y));s.closePath();return s},[pts])
 const surface=useMemo(()=>{const g=new THREE.ExtrudeGeometry(shape,{depth:.5,bevelEnabled:true,bevelThickness:.06,bevelSize:.065,bevelSegments:2,steps:1});g.rotateX(-Math.PI/2);return g},[shape])
 useEffect(()=>()=>surface.dispose(),[surface])
 const growth=useMemo(()=>{if(!farm.planting_month)return .72;const elapsed=(monthIndex-(farm.planting_month-1)+12)%12;return [0.18,.35,.56,.80,1,.68,.2][elapsed]??.12},[farm.planting_month,monthIndex])
 const plants=useMemo(()=>{const out:Plant[]=[],space=conf[crop].spacing,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);let k=0;for(let y=Math.min(...ys);y<=Math.max(...ys);y+=space){for(let x=Math.min(...xs);x<=Math.max(...xs);x+=space){if(inside(x,y,pts))out.push({x:x+(rand(k*3)-.5)*space*.2,z:-y+(rand(k*3+1)-.5)*space*.2,seed:rand(k*7)*6.28});k++}}return out.slice(0,430)},[pts,crop])
 return <group><mesh geometry={surface} receiveShadow castShadow onClick={onInspect}><meshStandardMaterial color={layer==='solo'||layer==='ph'||layer==='materia_organica'?'#B5835A':'#85A88B'} roughness={.95}/></mesh><mesh geometry={surface} scale={[1.004,1.004,1.004]}><meshBasicMaterial color="#3E7C4F" wireframe transparent opacity={.08}/></mesh><CropModels plants={plants} crop={crop} growth={growth}/><pointLight position={[-3,8,-1]} intensity={layer==='temperatura'?100:38} color={layer==='temperatura'?'#B5835A':'#F2EDE4'} distance={21}/></group>
}
export default function TerrainPlot({farm,monthIndex,layer,onInspect,transparent=false}:{farm:Farm;monthIndex:number;layer:WeatherLayer;onInspect?:()=>void;transparent?:boolean}){
 const {t}=useI18n()
 return <div className={`terrain-stage layer-${layer} ${transparent?'transparent-terrain':''}`}>
 <Canvas shadows dpr={[1,1.6]} camera={{position:[10,11,12],fov:43,near:.1,far:80}} gl={{antialias:true,alpha:true}}>
 {!transparent&&<color attach="background" args={['#E8E9E0']}/>}<ambientLight intensity={2.3}/><directionalLight position={[8,12,6]} castShadow intensity={2} shadow-mapSize={[1024,1024]}/>
 <Suspense fallback={<Html center>{t('Preparando visualização…')}</Html>}><Land farm={farm} monthIndex={monthIndex} layer={layer} onInspect={onInspect}/></Suspense>
 <OrbitControls enablePan={false} enabled={!transparent} minDistance={8} maxDistance={30} maxPolarAngle={Math.PI*.48} minPolarAngle={.17} enableDamping dampingFactor={.08} target={[0,0,0]}/>
 </Canvas>
 {!transparent&&layer==='chuva'&&<div className="weather-overlay rain-overlay" aria-hidden="true">{Array.from({length:21},(_,i)=><i key={i} style={{left:`${(i*19)%95+2}%`,animationDelay:`${(i%8)*-.31}s`}}/>)}</div>}
 {!transparent&&layer==='vento'&&<div className="weather-overlay wind-overlay" aria-hidden="true">{Array.from({length:12},(_,i)=><i key={i} style={{top:`${(i*23)%81+5}%`,animationDelay:`${(i%7)*-.46}s`}}/>)}</div>}
 {!transparent&&layer==='temperatura'&&<div className="weather-overlay sun-overlay" aria-hidden="true"/>}
 {!transparent&&<div className="terrain-watermark"><span className="plot-dot"/> {t('PLANTAS ESTILIZADAS · NÃO SÃO MEDIÇÕES NASA')}</div>}
 {!transparent&&<div className="terrain-instruction">{t('Arraste para orbitar · Role para aproximar')}</div>}
 {!transparent&&<div className="terrain-axis" aria-hidden="true"><strong>N</strong><span>↑</span></div>}
 </div>
}
