import {FlatMapPicker} from './FlatMap'
import {hasWebGL} from '../lib/mapSupport'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as LibreMap, MapMouseEvent } from 'maplibre-gl'
import { LocateFixed, MapPinned, RotateCcw, Undo2, Check } from 'lucide-react'
import { closedPolygon, formatCoord, formatHa, isValidPolygon, polygonDetails, UBERABA } from '../lib/geo'
import type { GeoPolygon } from '../types'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useI18n } from '../lib/i18n'

type Props = { value: GeoPolygon|null; onChange:(value:GeoPolygon|null)=>void; target?:{lon:number;lat:number;zoom?:number}|null }
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

function MapPickerGL({value,onChange,target}:Props) {
  const {t}=useI18n()
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LibreMap|null>(null)
  const onChangeRef = useRef(onChange)
  const [points,setPoints] = useState<number[][]>(() => value?.coordinates[0]?.slice(0,-1)??[])
  const [finished,setFinished] = useState(Boolean(value))
  const [mapReady,setMapReady] = useState(false)
  const [error,setError] = useState('')
  onChangeRef.current = onChange
  const pointRef=useRef(points);pointRef.current=points
  const finishedRef=useRef(finished);finishedRef.current=finished

  const reset=useCallback(()=>{setPoints([]);setFinished(false);onChangeRef.current(null);setError('')},[])
  const undo=useCallback(()=>{
    if(finishedRef.current){setFinished(false);onChangeRef.current(null)}
    else setPoints(p=>p.slice(0,-1))
  },[])
  const close=useCallback(()=>{
    if(!isValidPolygon(pointRef.current))return setError('Marque pelo menos 3 pontos em uma área válida.')
    setFinished(true);onChangeRef.current(closedPolygon(pointRef.current));setError('')
  },[])

  useEffect(()=>{
    if(!divRef.current)return
    const map = new maplibregl.Map({ container:divRef.current, style:MAP_STYLE, center:value?polygonDetails(value).centroid:UBERABA, zoom:value?14.3:12.6, pitch:0, bearing:0, maxPitch:0, dragRotate:false, pitchWithRotate:false,  attributionControl:{compact:true} })
    mapRef.current=map
    map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-right')
    map.doubleClickZoom.disable()
    const handleMapClick=(ev:MapMouseEvent)=>{
      if(finishedRef.current)return
      setPoints(p=>[...p,[Number(ev.lngLat.lng.toFixed(7)),Number(ev.lngLat.lat.toFixed(7))]])
      setError('')
    }
    map.on('click',handleMapClick)
    map.on('load',()=>{
      map.addSource('farm-line',{type:'geojson',data:{type:'FeatureCollection',features:[]}})
      map.addLayer({id:'farm-fill',type:'fill',source:'farm-line',paint:{'fill-color':'#3E7C4F','fill-opacity':0.19}})
      map.addLayer({id:'farm-outline',type:'line',source:'farm-line',paint:{'line-color':'#3E7C4F','line-width':3,'line-dasharray':[1.5,1]}})
      map.addSource('farm-vertices',{type:'geojson',data:{type:'FeatureCollection',features:[]}})
      map.addLayer({id:'farm-vertices',type:'circle',source:'farm-vertices',paint:{'circle-radius':6,'circle-color':'#F2EDE4','circle-stroke-color':'#3E7C4F','circle-stroke-width':2.7}})
      setMapReady(true)
    })
    return ()=>{map.off('click',handleMapClick);map.remove();mapRef.current=null}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!mapReady)return
    const coordinates = points.length>=3 && finished ? closedPolygon(points).coordinates : []
    const features: any[] = []
    if(coordinates.length) features.push({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates}})
    else if(points.length>=2)features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points}})
    ;(map.getSource('farm-line') as maplibregl.GeoJSONSource)?.setData({type:'FeatureCollection',features} as any)
    ;(map.getSource('farm-vertices') as maplibregl.GeoJSONSource)?.setData({type:'FeatureCollection',features:points.map((point,i)=>({type:'Feature',properties:{i},geometry:{type:'Point',coordinates:point}}))} as any)
  },[points,finished,mapReady])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!mapReady||!target)return
    map.flyTo({center:[target.lon,target.lat],zoom:target.zoom??12.2,pitch:0,bearing:0,essential:true})
  },[target?.lon,target?.lat,target?.zoom,mapReady])

  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement
      if(target.matches('input,textarea,select,button') || target.isContentEditable)return
      if(e.key==='Enter'&&!finishedRef.current){e.preventDefault();close()}
      if(e.key==='Backspace' &&!finishedRef.current){e.preventDefault();undo()}
    }
    window.addEventListener('keydown',handler)
    return()=>window.removeEventListener('keydown',handler)
  },[close,reset,undo])

  const locate=()=>navigator.geolocation?.getCurrentPosition(
    p=>mapRef.current?.flyTo({center:[p.coords.longitude,p.coords.latitude],zoom:15}),
    ()=>setError('Localização negada. Você pode navegar pelo mapa manualmente.'),
    {enableHighAccuracy:false,timeout:10000}
  )
  const area = points.length>=3 && isValidPolygon(points)?polygonDetails(closedPolygon(points)).areaHa:null
  return <div className="picker-shell">
    <div className="picker-topbar"><span><MapPinned size={16}/> {t('Delimite sua área de cultivo')}</span><span className="map-status">{finished?t('Área selecionada'):`${points.length} ponto(s)`}</span></div>
    <div className="picker-map-wrap">
      <div className="picker-map" ref={divRef} tabIndex={0} aria-label="Mapa de seleção em vista superior. Clique para adicionar vértices; Enter para concluir."/>
      <div className="picker-tools">
        <button type="button" onClick={locate} className="map-tool" title="Usar minha localização"><LocateFixed size={17}/><span>{t('Localizar')}</span></button>
      </div>
      <div className="picker-map-tip">{t('Clique para marcar vértices · Enter para concluir · Backspace desfaz')}</div>
    </div>
    <div className="picker-footer">
      <div><span className="eyebrow muted">{t('ÁREA ESTIMADA')}</span><strong>{area!==null?formatHa(area):'—'}</strong><small>{points.length>=3?`${points.length} vértices · WGS84`:t('Marque ao menos 3 pontos')}</small></div>
      <div className="picker-actions"><button className="btn btn-muted btn-small" type="button" onClick={undo} disabled={!points.length}><Undo2 size={15}/> {t('Desfazer')}</button><button className="btn btn-muted btn-small" type="button" onClick={reset}><RotateCcw size={15}/> {t('Limpar')}</button>{!finished&&<button className="btn btn-primary btn-small" type="button" onClick={close} disabled={points.length<3}><Check size={15}/> {t('Concluir área')}</button>}</div>
    </div>
    {finished&&value&&<p className="selection-confirm"><Check size={14}/> Perímetro definido · Centro: {formatCoord(polygonDetails(value).centroid[1])}, {formatCoord(polygonDetails(value).centroid[0])}</p>}
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>
}

export function MapPicker(props:Parameters<typeof MapPickerGL>[0]){return hasWebGL()?<MapPickerGL {...props}/>:<FlatMapPicker {...props}/>}
