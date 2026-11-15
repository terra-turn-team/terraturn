import {FlatMapView} from './FlatMap'
import {hasWebGL} from '../lib/mapSupport'
import {useEffect,useRef,useState} from 'react'
import * as maplibregl from 'maplibre-gl'
import type {Farm} from '../types'
export type ViewMode='map'|'relief'|'satellite'|'3d'|'hybrid'
const BASE='https://tiles.openfreemap.org/styles/liberty'
const DEM='https://tiles.mapterhorn.com/tilejson.json'
const SATELLITE=import.meta.env.VITE_SATELLITE_TILES || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
function TerrainMapGL({farm,mode,onInspect}:{farm:Farm;mode:Exclude<ViewMode,'3d'>;onInspect?:()=>void}){
 const container=useRef<HTMLDivElement>(null)
 const mapRef=useRef<maplibregl.Map|null>(null)
 const [error,setError]=useState('')
 useEffect(()=>{
  if(!container.current)return
  const m=new maplibregl.Map({container:container.current,style:BASE,center:[farm.centroid[0],farm.centroid[1]],zoom:13.8,pitch:0,bearing:0,maxPitch:65,attributionControl:{compact:true}})
  mapRef.current=m
  m.addControl(new maplibregl.NavigationControl({showCompass:true}),'bottom-right')
  m.once('load',()=>{
   const geo={type:'Feature' as const,properties:{},geometry:farm.geometry}
   m.on('click','parcel-fill',()=>onInspect?.())
   m.addSource('parcel',{type:'geojson',data:geo as any})
   m.addLayer({id:'parcel-fill',type:'fill',source:'parcel',paint:{'fill-color':'#3E7C4F','fill-opacity':.19}})
   m.addLayer({id:'parcel-outline',type:'line',source:'parcel',paint:{'line-color':'#3E7C4F','line-width':3}})
   try{
     m.addSource('dem',{type:'raster-dem',url:DEM,tileSize:256,encoding:'terrarium'});
     m.addLayer({id:'hillshade',type:'hillshade',source:'dem',paint:{'hillshade-shadow-color':'#1C2B22','hillshade-highlight-color':'#F2EDE4','hillshade-exaggeration':.25}},'parcel-fill')
     m.setLayoutProperty('hillshade','visibility','none')
   }catch{setError('Camada de elevação indisponível.')}
   m.addSource('satellite-source',{type:'raster',tiles:[SATELLITE],tileSize:256,maxzoom:19,attribution:import.meta.env.VITE_SATELLITE_ATTRIBUTION||'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'})
   m.addLayer({id:'satellite-raster',type:'raster',source:'satellite-source',layout:{visibility:'none'},paint:{'raster-opacity':.95}},'parcel-fill')
   const pts=farm.geometry.coordinates[0]
   const west=Math.min(...pts.map(p=>p[0])),east=Math.max(...pts.map(p=>p[0])),south=Math.min(...pts.map(p=>p[1])),north=Math.max(...pts.map(p=>p[1]))
   m.fitBounds([[west,south],[east,north]],{padding:{top:120,bottom:185,left:40,right:Math.min(255,m.getContainer().clientWidth*.3)},maxZoom:16,duration:0})
  })
  const ob=new ResizeObserver(()=>m.resize());ob.observe(container.current);return()=>{ob.disconnect();m.remove();mapRef.current=null}
 },[farm.id,farm.updated_at])
 useEffect(()=>{
  const m=mapRef.current
  if(!m)return
  const apply=()=>{
   const relief=mode==='relief'||mode==='hybrid',satellite=mode==='satellite'
   if(m.getLayer('hillshade'))m.setLayoutProperty('hillshade','visibility',relief?'visible':'none')
   if(m.getLayer('satellite-raster'))m.setLayoutProperty('satellite-raster','visibility',satellite?'visible':'none')
   try{m.setTerrain(relief&&m.getSource('dem')?{source:'dem',exaggeration:1}:null)}catch{setError('Não foi possível carregar o relevo.')}
   m.easeTo({pitch:relief?48:0,bearing:0,duration:500})
  }
  if(m.isStyleLoaded())apply();else m.once('load',apply)
 },[mode,farm.id,farm.updated_at])
 return <div className="terrain-map-holder"><div ref={container} className="terrain-map-canvas"/>{error&&<div className="map-data-note map-data-error">{error}</div>}</div>
}

export function TerrainMapView(props:{farm:Farm;mode:Exclude<ViewMode,'3d'>;onInspect?:()=>void}){return hasWebGL()?<TerrainMapGL {...props}/>:<FlatMapView {...props}/>}
