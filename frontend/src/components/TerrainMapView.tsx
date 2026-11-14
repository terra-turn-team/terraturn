import {useEffect,useRef,useState} from 'react'
import * as maplibregl from 'maplibre-gl'
import type {Farm} from '../types'
export type ViewMode='map'|'relief'|'satellite'|'3d'|'hybrid'
const BASE='https://tiles.openfreemap.org/styles/liberty'
const DEM='https://tiles.mapterhorn.com/tilejson.json'
const GIBS='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'
const SATELLITE=import.meta.env.VITE_SATELLITE_TILES || GIBS
export function TerrainMapView({farm,mode}:{farm:Farm;mode:Exclude<ViewMode,'3d'>}){
 const container=useRef<HTMLDivElement>(null)
 const mapRef=useRef<maplibregl.Map|null>(null)
 const [error,setError]=useState('')
 useEffect(()=>{
  if(!container.current)return
  const m=new maplibregl.Map({container:container.current,style:BASE,center:[farm.centroid[0],farm.centroid[1]],zoom:13.8,pitch:0,bearing:0,maxPitch:65,canvasContextAttributes:{antialias:true},attributionControl:{}})
  mapRef.current=m
  m.addControl(new maplibregl.NavigationControl({showCompass:true}),'bottom-right')
  m.once('load',()=>{
   const geo={type:'Feature' as const,properties:{},geometry:farm.geometry}
   m.addSource('parcel',{type:'geojson',data:geo as any})
   m.addLayer({id:'parcel-fill',type:'fill',source:'parcel',paint:{'fill-color':'#3E7C4F','fill-opacity':.19}})
   m.addLayer({id:'parcel-outline',type:'line',source:'parcel',paint:{'line-color':'#3E7C4F','line-width':3}})
   try{
     m.addSource('dem',{type:'raster-dem',url:DEM,tileSize:256,encoding:'terrarium'});
     m.addLayer({id:'hillshade',type:'hillshade',source:'dem',paint:{'hillshade-shadow-color':'#1C2B22','hillshade-highlight-color':'#F2EDE4','hillshade-exaggeration':.25}},'parcel-fill')
     m.setLayoutProperty('hillshade','visibility','none')
   }catch{setError('Camada de elevação indisponível.')}
   m.addSource('satellite-source',{type:'raster',tiles:[SATELLITE],tileSize:256,maxzoom:import.meta.env.VITE_SATELLITE_TILES?18:8,attribution:import.meta.env.VITE_SATELLITE_TILES?'Imagem: provedor configurado':'NASA GIBS / Earthdata · Blue Marble'})
   m.addLayer({id:'satellite-raster',type:'raster',source:'satellite-source',layout:{visibility:'none'},paint:{'raster-opacity':.95}},'parcel-fill')
   const pts=farm.geometry.coordinates[0]
   const west=Math.min(...pts.map(p=>p[0])),east=Math.max(...pts.map(p=>p[0])),south=Math.min(...pts.map(p=>p[1])),north=Math.max(...pts.map(p=>p[1]))
   m.fitBounds([[west,south],[east,north]],{padding:80,maxZoom:16,duration:0})
  })
  return()=>{m.remove();mapRef.current=null}
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
 return <div className="terrain-map-holder"><div ref={container} className="terrain-map-canvas"/>{mode==='satellite'&&!import.meta.env.VITE_SATELLITE_TILES&&<div className="map-data-note">NASA Blue Marble · imagem regional de baixa resolução. Para imagens detalhadas configure VITE_SATELLITE_TILES.</div>}{error&&<div className="map-data-note map-data-error">{error}</div>}</div>
}
