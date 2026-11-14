import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as LibreMap, MapMouseEvent, Marker } from 'maplibre-gl'
import { Check, LocateFixed, MapPinned, Pencil, RotateCcw, Save, Undo2 } from 'lucide-react'
import { closedPolygon, formatCoord, formatHa, formatSquareMeters, polygonDetails, polygonIssue, UBERABA } from '../lib/geo'
import type { GeoPolygon } from '../types'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useI18n } from '../lib/i18n'

type Props = { value: GeoPolygon|null; onChange:(value:GeoPolygon|null)=>void; target?:{lon:number;lat:number;zoom?:number}|null; draftKey?:string }
type MapDraft = { version:1; points:number[][]; finished:boolean; savedAt:string }
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

export const mapDraftStorageKey=(key='new')=>`terraturn-map-draft:${key}`

function isDraftPoints(value:unknown):value is number[][] {
  return Array.isArray(value)&&value.every(point=>Array.isArray(point)&&point.length===2&&Number.isFinite(point[0])&&Number.isFinite(point[1])&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90)
}

export function MapPicker({value,onChange,target,draftKey='new'}:Props) {
  const {t}=useI18n()
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LibreMap|null>(null)
  const onChangeRef = useRef(onChange)
  const [points,setPoints] = useState<number[][]>(() => value?.coordinates[0]?.slice(0,-1).map(point=>[...point])??[])
  const [finished,setFinished] = useState(Boolean(value))
  const [editing,setEditing] = useState(false)
  const [mapReady,setMapReady] = useState(false)
  const [draftAvailable,setDraftAvailable] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const pointRef=useRef(points);pointRef.current=points
  const finishedRef=useRef(finished);finishedRef.current=finished
  const editingRef=useRef(editing);editingRef.current=editing
  const editBackup=useRef<number[][]|null>(null)
  const storageKey=mapDraftStorageKey(draftKey)
  onChangeRef.current = onChange

  const reset=useCallback(()=>{setPoints([]);setFinished(false);setEditing(false);editBackup.current=null;onChangeRef.current(null);setError('');setNotice('')},[])
  const undo=useCallback(()=>{setPoints(p=>p.slice(0,-1));setError('');setNotice('')},[])
  const issueMessage=(issue:NonNullable<ReturnType<typeof polygonIssue>>)=>{
    const messages={
      'not-enough-points':'Marque pelo menos 3 pontos para delimitar a área.',
      'invalid-coordinates':'Confira as coordenadas dos vértices antes de concluir.',
      'duplicate-points':'Há vértices repetidos. Arraste ou desfaça um ponto.',
      'self-intersection':'As linhas do perímetro se cruzam. Ajuste os vértices para evitar cruzamentos.',
      'area-too-small':'A área está muito pequena para ser calculada. Afaste ou ajuste os vértices.'
    }
    return t(messages[issue])
  }
  const close=useCallback(()=>{
    const issue=polygonIssue(pointRef.current)
    if(issue)return setError(issueMessage(issue))
    const polygon=closedPolygon(pointRef.current)
    setFinished(true);setEditing(false);editBackup.current=null;onChangeRef.current(polygon);setError('');setNotice(t('Área validada. Revise as medidas antes de salvar a propriedade.'))
  },[t])
  const startEditing=()=>{
    editBackup.current=pointRef.current.map(point=>[...point])
    setFinished(false);setEditing(true);onChangeRef.current(null);setError('');setNotice(t('Arraste os vértices ou clique no mapa para adicionar pontos.'))
  }
  const cancelEditing=()=>{
    const backup=editBackup.current
    if(!backup)return
    setPoints(backup);setFinished(true);setEditing(false);editBackup.current=null;onChangeRef.current(closedPolygon(backup));setError('');setNotice('')
  }

  useEffect(()=>{
    try{setDraftAvailable(Boolean(window.localStorage.getItem(storageKey)))}
    catch{setError(t('O armazenamento local está indisponível neste navegador.'))}
  },[storageKey,t])

  useEffect(()=>{
    if(!divRef.current)return
    const map = new maplibregl.Map({ container:divRef.current, style:MAP_STYLE, center:value?polygonDetails(value).centroid:UBERABA, zoom:value?14.3:12.6, pitch:0, bearing:0, maxPitch:0, dragRotate:false, pitchWithRotate:false, canvasContextAttributes:{antialias:true}, attributionControl:{} })
    mapRef.current=map
    map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-right')
    map.doubleClickZoom.disable()
    const handleMapClick=(ev:MapMouseEvent)=>{
      if(finishedRef.current&&!editingRef.current)return
      setPoints(p=>[...p,[Number(ev.lngLat.lng.toFixed(7)),Number(ev.lngLat.lat.toFixed(7))]])
      setError('');setNotice('')
    }
    map.on('click',handleMapClick)
    map.on('load',()=>{
      map.addSource('farm-line',{type:'geojson',data:{type:'FeatureCollection',features:[]}})
      map.addLayer({id:'farm-fill',type:'fill',source:'farm-line',paint:{'fill-color':'#3E7C4F','fill-opacity':0.24}})
      map.addLayer({id:'farm-outline',type:'line',source:'farm-line',paint:{'line-color':'#3E7C4F','line-width':3,'line-dasharray':[1.5,1]}})
      setMapReady(true)
    })
    return ()=>{map.off('click',handleMapClick);map.remove();mapRef.current=null}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!mapReady)return
    const valid=polygonIssue(points)===null
    const showPolygon=points.length>=3&&valid&&(finished||editing)
    const features:GeoJSON.Feature[]=[]
    if(showPolygon)features.push({type:'Feature',properties:{},geometry:closedPolygon(points)})
    else if(points.length>=2)features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:points.length>=3?[...points,points[0]]:points}})
    ;(map.getSource('farm-line') as maplibregl.GeoJSONSource)?.setData({type:'FeatureCollection',features})
  },[points,finished,editing,mapReady])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!mapReady)return
    const markers:Marker[]=points.map((point,index)=>{
      const element=document.createElement('button')
      element.type='button'
      element.className='picker-vertex'
      element.textContent=String(index+1)
      element.setAttribute('aria-label',`${t('Vértice')} ${index+1}. ${t('Arraste para ajustar a posição.')}`)
      const marker=new maplibregl.Marker({element,draggable:!finished||editing}).setLngLat([point[0],point[1]]).addTo(map)
      marker.on('dragend',()=>{
        const {lng,lat}=marker.getLngLat()
        setPoints(current=>current.map((item,i)=>i===index?[Number(lng.toFixed(7)),Number(lat.toFixed(7))]:item))
        setError('');setNotice('')
      })
      return marker
    })
    return ()=>markers.forEach(marker=>marker.remove())
  },[points,finished,editing,mapReady,t])

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
      if(e.key==='Backspace'&&!finishedRef.current){e.preventDefault();undo()}
      if(e.key==='Escape'){e.preventDefault();editingRef.current?cancelEditing():reset()}
    }
    window.addEventListener('keydown',handler)
    return()=>window.removeEventListener('keydown',handler)
  },[close,reset,undo])

  const locate=()=>navigator.geolocation?.getCurrentPosition(
    p=>mapRef.current?.flyTo({center:[p.coords.longitude,p.coords.latitude],zoom:15}),
    ()=>setError(t('Não foi possível acessar sua localização. Você pode navegar pelo mapa manualmente.')),
    {enableHighAccuracy:false,timeout:10000}
  )
  const saveDraft=()=>{
    const draft:MapDraft={version:1,points,finished:finished&&!editing,savedAt:new Date().toISOString()}
    try{window.localStorage.setItem(storageKey,JSON.stringify(draft));setDraftAvailable(true);setNotice(t('Rascunho salvo neste navegador.'));setError('')}
    catch{setError(t('Não foi possível salvar o rascunho neste navegador. Verifique o espaço disponível e as permissões.'))}
  }
  const restoreDraft=()=>{
    try{
      const raw=window.localStorage.getItem(storageKey)
      if(!raw){setDraftAvailable(false);setError(t('Nenhum rascunho foi encontrado neste navegador.'));return}
      const draft=JSON.parse(raw) as Partial<MapDraft>
      if(draft.version!==1||!isDraftPoints(draft.points)){setError(t('O rascunho salvo está inválido. Descarte-o e desenhe a área novamente.'));return}
      if(points.length&&!window.confirm(t('Restaurar o rascunho substituirá os pontos atuais. Deseja continuar?')))return
      const valid=Boolean(draft.finished)&&polygonIssue(draft.points)===null
      setPoints(draft.points.map(point=>[...point]));setFinished(valid);setEditing(false);editBackup.current=null
      onChangeRef.current(valid?closedPolygon(draft.points):null);setError('');setNotice(t(valid?'Rascunho restaurado. Confira a área antes de salvar.':'Rascunho restaurado. Complete e valide o perímetro no mapa.'))
    }catch{setError(t('Não foi possível ler o rascunho salvo neste navegador.'))}
  }
  const discardDraft=()=>{
    try{window.localStorage.removeItem(storageKey);setDraftAvailable(false);setNotice(t('Rascunho descartado.'));setError('')}
    catch{setError(t('Não foi possível remover o rascunho deste navegador.'))}
  }
  const issue=polygonIssue(points)
  const area=issue===null?polygonDetails(closedPolygon(points)).areaHa:null
  const center=finished&&area!==null?polygonDetails(closedPolygon(points)).centroid:null
  return <div className="picker-shell">
    <div className="picker-topbar"><span><MapPinned size={16}/> {t('Delimite sua área de cultivo')}</span><span className="map-status">{finished?t('Área selecionada'):editing?t('Editando vértices'):`${points.length} ${t('ponto(s)')}`}</span></div>
    <div className="picker-map-wrap">
      <div className="picker-map" ref={divRef} tabIndex={0} aria-label={t('Mapa de seleção em vista superior. Clique para adicionar vértices e arraste os marcadores para ajustar.')}/>
      <div className="picker-tools">
        <button type="button" onClick={locate} className="map-tool" title={t('Usar minha localização')}><LocateFixed size={17}/><span>{t('Localizar')}</span></button>
      </div>
      <div className="picker-map-tip">{t('Clique para adicionar vértices · Arraste os marcadores para ajustar · Enter conclui · Backspace desfaz')}</div>
    </div>
    <div className="picker-footer">
      <div className="picker-measure"><span className="eyebrow muted">{t('ÁREA ESTIMADA')}</span><strong>{area!==null?formatHa(area):'—'}</strong><small>{area!==null?formatSquareMeters(area*10000):t('Marque ao menos 3 pontos')}</small></div>
      <div className="picker-actions">
        {finished&&!editing&&<button className="btn btn-muted btn-small" type="button" onClick={startEditing}><Pencil size={15}/> {t('Editar vértices')}</button>}
        {!finished&&<button className="btn btn-muted btn-small" type="button" onClick={undo} disabled={!points.length}><Undo2 size={15}/> {t('Desfazer')}</button>}
        {editing&&<button className="btn btn-outline btn-small" type="button" onClick={cancelEditing}>{t('Cancelar edição')}</button>}
        <button className="btn btn-muted btn-small" type="button" onClick={reset} disabled={!points.length}><RotateCcw size={15}/> {t('Limpar')}</button>
        {!finished&&<button className="btn btn-primary btn-small" type="button" onClick={close} disabled={points.length<3}><Check size={15}/> {t(editing?'Concluir edição':'Concluir área')}</button>}
        {!!points.length&&<button className="btn btn-outline btn-small" type="button" onClick={saveDraft}><Save size={15}/> {t('Salvar rascunho')}</button>}
        {draftAvailable&&<><button className="btn btn-outline btn-small" type="button" onClick={restoreDraft}>{t('Restaurar rascunho')}</button><button className="text-action picker-discard" type="button" onClick={discardDraft}>{t('Descartar')}</button></>}
      </div>
    </div>
    {draftAvailable&&<p className="picker-draft-note">{t('Há um rascunho salvo somente neste navegador.')}</p>}
    {finished&&area!==null&&<div className="selection-confirm" role="status" aria-live="polite"><Check size={16}/><div><strong>{t('Perímetro confirmado')}</strong><span>{formatHa(area)} · {formatSquareMeters(area*10000)} · {points.length} {t('vértices')}</span>{center&&<small>{t('Centro')}: {formatCoord(center[1])}, {formatCoord(center[0])}</small>}</div></div>}
    {notice&&<p className="picker-notice" role="status">{notice}</p>}
    {error&&<p className="form-error picker-error" role="alert">{error}</p>}
  </div>
}
