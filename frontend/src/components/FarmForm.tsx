import {AgriculturalFields} from './AgriculturalFields'
import {DEFAULT_INDICATORS,defaultPlanning} from '../lib/planning'
import {useDialog} from '../lib/useDialog'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { X, ArrowRight, LocateFixed, Info, CheckCircle2, LoaderCircle, MapPin, Crosshair } from 'lucide-react'
import { MapPicker } from './MapPicker'
import SearchableSelect, {type Choice} from './SearchableSelect'
import { farmApi, ApiError, locationApi } from '../lib/api'
import { polygonDetails, formatCoord } from '../lib/geo'
import { useI18n } from '../lib/i18n'
import type { Farm, FarmInput, Goal } from '../types'

const EMPTY: FarmInput = {name:'',locality:'',municipality:'',state:'',country:'Brasil',crop:'',previous_crop:'',planting_month:null,soil:{texture:'unknown',ph:null,organic_matter_percent:null,irrigation:'unknown'},goals:['soil','resilience'],indicators:DEFAULT_INDICATORS,planning:defaultPlanning(),notes:'',geometry:{type:'Polygon',coordinates:[]}}
const GOALS: {value:Goal,label:string}[]=[{value:'soil',label:'Saúde do solo'},{value:'water',label:'Conservar água'},{value:'resilience',label:'Resiliência'},{value:'yield',label:'Produtividade'},{value:'cost',label:'Custos'}]
const MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CROPS=['Soja','Milho','Café','Cana-de-açúcar','Trigo','Feijão','Braquiária','Outra cultura']
const norm=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim()
const match=(items:Choice[],v:string)=>items.find(i=>norm(i.name)===norm(v)||norm(i.code)===norm(v))

type Props={farm?:Farm|null;onClose:()=>void;onSaved:(farm:Farm)=>void}
export default function FarmForm({farm,onClose,onSaved}:Props){
 const {t}=useI18n()
 const dialogRef=useDialog(onClose)
 const [statesUnavailable,setStatesUnavailable]=useState(false),[citiesUnavailable,setCitiesUnavailable]=useState(false)
 const [locationSuccess,setLocationSuccess]=useState('')
 const [data,setData]=useState<FarmInput>(()=>farm?{
  name:farm.name,locality:farm.locality,municipality:farm.municipality,state:farm.state,country:farm.country,crop:farm.crop,previous_crop:farm.previous_crop,planting_month:farm.planting_month,soil:farm.soil,goals:farm.goals,indicators:farm.indicators??DEFAULT_INDICATORS,planning:farm.planning??defaultPlanning(),notes:farm.notes,geometry:farm.geometry}:{...structuredClone(EMPTY),planning:defaultPlanning()})
 const [countries,setCountries]=useState<Choice[]>([{code:'BR',name:'Brasil'}])
 const [states,setStates]=useState<Choice[]>([]),[cities,setCities]=useState<Choice[]>([])
 const [loadingCountries,setLoadingCountries]=useState(false),[loadingStates,setLoadingStates]=useState(false),[loadingCities,setLoadingCities]=useState(false)
 const [saving,setSaving]=useState(false),[geocoding,setGeocoding]=useState(false),[findingCity,setFindingCity]=useState(false)
 const [error,setError]=useState(''),[locationError,setLocationError]=useState('')
 const [target,setTarget]=useState<{lon:number;lat:number;zoom?:number}|null>(null)
 const [lat,setLat]=useState(''),[lon,setLon]=useState('')
 const lastCitySearch=useRef(0)
 const countryCode=useMemo(()=>match(countries,data.country)?.code||'BR',[countries,data.country])
 const stateCode=useMemo(()=>match(states,data.state)?.code||'',[states,data.state])
 const cityCode=useMemo(()=>match(cities,data.municipality)?.code||'',[cities,data.municipality])
 const hasPolygon=(data.geometry.coordinates?.[0]?.length??0)>=4
 const center=useMemo(()=>hasPolygon?polygonDetails(data.geometry).centroid:null,[data.geometry,hasPolygon])
 const setField=<K extends keyof FarmInput>(field:K,value:FarmInput[K])=>setData(p=>({...p,[field]:value}))
 const setSoil=(key:keyof FarmInput['soil'],value:string|number|null)=>setData(p=>({...p,soil:{...p.soil,[key]:value}}))
 useEffect(()=>{let alive=true;setLoadingCountries(true);locationApi.countries().then(v=>{if(alive)setCountries(v)}).catch(()=>{if(alive)setLocationError(t('Lista de países indisponível. Brasil permanece selecionável.'))}).finally(()=>{if(alive)setLoadingCountries(false)});return()=>{alive=false}},[])
 useEffect(()=>{let alive=true;setLoadingStates(true);setStatesUnavailable(false);setStates([]);setCities([]);locationApi.states(countryCode).then(v=>{if(alive)setStates(v)}).catch(()=>{if(alive){setStatesUnavailable(true);setLocationError(t('Consulta de localidades indisponível. Informe estado e município manualmente.'))}}).finally(()=>{if(alive)setLoadingStates(false)});return()=>{alive=false}},[countryCode])
 useEffect(()=>{let alive=true;setCities([]);setCitiesUnavailable(false);if(!stateCode||statesUnavailable){setLoadingCities(false);return}setLoadingCities(true);locationApi.cities(countryCode,stateCode).then(v=>{if(alive)setCities(v)}).catch(()=>{if(alive){setCitiesUnavailable(true);setLocationError(t('Consulta de municípios indisponível. Informe o município manualmente.'))}}).finally(()=>{if(alive)setLoadingCities(false)});return()=>{alive=false}},[countryCode,stateCode,statesUnavailable])
 useEffect(()=>{if(center){setLon(center[0].toFixed(6));setLat(center[1].toFixed(6))}},[center?.[0],center?.[1]])
 const forward=async(city:string,state:string,country:string)=>{
   const id=++lastCitySearch.current;setFindingCity(true);setLocationError('')
   try {const geo=await farmApi.forward(city,state,country);if(id!==lastCitySearch.current)return;setTarget({lon:geo.lon,lat:geo.lat,zoom:12});setLon(geo.lon.toFixed(6));setLat(geo.lat.toFixed(6))}
   catch(e){if(id===lastCitySearch.current)setLocationError(e instanceof ApiError?e.message:t('Não foi possível localizar a cidade no mapa.'))}
   finally{if(id===lastCitySearch.current)setFindingCity(false)}
 }
 const chooseCity=(choice:Choice)=>{setField('municipality',choice.name);void forward(choice.name,data.state,countryCode)}
 const reverseCoordinates=async(lonValue:number,latValue:number)=>{
  setGeocoding(true);setLocationError('');setLocationSuccess('')
  try {const geo=await farmApi.geocode(lonValue,latValue);setData(p=>({...p,locality:geo.locality||p.locality,municipality:geo.municipality||p.municipality,state:geo.state||p.state,country:match(countries,geo.country_code)?.name||geo.country||p.country}));setLocationSuccess(t('Município e estado preenchidos. Revise os campos antes de salvar.'))}
  catch(e){setLocationError(e instanceof ApiError?e.message:t('Localidade não identificada. Revise os campos de localização.'))}
  finally{setGeocoding(false)}
 }
 const reverse=async()=>{if(center)await reverseCoordinates(center[0],center[1])}
 // Ao desenhar ou ajustar o perímetro, país, estado e município são preenchidos sozinhos (o botão continua para refazer).
 const centerKey=center?`${center[0].toFixed(5)},${center[1].toFixed(5)}`:''
 const initialCenter=useRef(centerKey)
 useEffect(()=>{if(!center||centerKey===initialCenter.current)return;initialCenter.current=centerKey;const timer=setTimeout(()=>{void reverseCoordinates(center[0],center[1])},700);return()=>clearTimeout(timer)},[centerKey])
 const cleanCoord=(v:string)=>{const x=v.replace(/[\u2212\u2013]/g,'-').replace(/[^0-9.,-]/g,'');const neg=x.startsWith('-');const body=x.replace(/-/g,'');const sep=body.search(/[.,]/);const num=sep<0?body:body.slice(0,sep+1)+body.slice(sep+1).replace(/[.,]/g,'');return (neg?'-':'')+num}
 const pastePair=(e:React.ClipboardEvent<HTMLInputElement>)=>{const m=e.clipboardData.getData('text').match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/);if(m&&/[;\s]|,\s/.test(e.clipboardData.getData('text'))){e.preventDefault();setLat(cleanCoord(m[1]));setLon(cleanCoord(m[2]));setLocationError('')}}
 const gotoCoords=async()=>{
  const latValue=Number(lat.replace(',','.')),lonValue=Number(lon.replace(',','.'))
  if(!lat.trim()||!lon.trim()||!Number.isFinite(latValue)||!Number.isFinite(lonValue)||Math.abs(latValue)>90||Math.abs(lonValue)>180)return setLocationError(t('Coordenadas inválidas. Use latitude entre -90 e 90 e longitude entre -180 e 180.'))
  setTarget({lon:lonValue,lat:latValue,zoom:14})
 }
 const toggleGoal=(goal:Goal)=>setField('goals',data.goals.includes(goal)?data.goals.filter(g=>g!==goal):[...data.goals,goal])
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setError('')
  if(!hasPolygon)return setError(t('Conclua a seleção do perímetro no mapa antes de salvar.'))
  if(!match(countries,data.country)||!(statesUnavailable?data.state.trim():stateCode)||!((statesUnavailable||citiesUnavailable)?data.municipality.trim():cityCode))return setError(t('Selecione País, Estado e Município nas listas antes de salvar.'))
  if(!Number.isInteger(data.planning.horizon_months)||data.planning.horizon_months<1||data.planning.horizon_months>24)return setError(t('Escolha um período entre 1 e 24 meses.'))
  if(data.crop&&data.planning.crop_start_month&&data.planning.crop_end_month&&data.planning.crop_end_month<data.planning.crop_start_month)return setError(t('A liberação da área deve ocorrer após o início do cultivo.'))
  setSaving(true)
  try{const saved=farm?await farmApi.update(farm.id,data):await farmApi.create(data);onSaved(saved)}
  catch(e){setError(e instanceof ApiError?e.message:t('Não foi possível salvar a propriedade.'))}
  finally{setSaving(false)}
 }
 return <div className="modal-overlay" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="farm-title"><div className="farm-modal">
  <header className="farm-modal-header"><div><span className="eyebrow">{t('GERENCIAMENTO DE PROPRIEDADES')}</span><h2 id="farm-title">{t(farm?'Editar propriedade':'Nova propriedade rural')}</h2><p>{t('Cadastre seu terreno e prepare a base para os estudos agronômicos.')}</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label={t('Fechar')}><X/></button></header>
  <form className="farm-modal-form" onSubmit={submit}>
   <div className="farm-form-column">
    <section className="form-section"><div className="section-caption"><span>01</span><div><h3>{t('Identificação')}</h3><p>{t('Dados mínimos necessários para identificar seu terreno.')}</p></div></div>
     <label className="input-label">{t('Nome da propriedade *')}<input required minLength={2} maxLength={120} value={data.name} onChange={e=>setField('name',e.target.value)} placeholder={t('Ex.: Fazenda Boa Vista')} autoFocus/></label>
     <div className="form-3col">
      <SearchableSelect label={t('País')} items={countries} value={countryCode} busy={loadingCountries} required placeholder={t('Selecione um país')} onChange={c=>{setData(p=>({...p,country:c.name,state:'',municipality:'',locality:''}));setTarget(null)}}/>
      {statesUnavailable?<label className="input-label">{t('Estado')} *<input required maxLength={120} value={data.state} onChange={e=>setField('state',e.target.value)}/></label>:<SearchableSelect label={t('Estado')} items={states} value={stateCode} busy={loadingStates} disabled={!countryCode} required placeholder={t('Selecione o estado')} onChange={s=>setData(p=>({...p,state:s.name,municipality:'',locality:''}))}/>}
      {statesUnavailable||citiesUnavailable?<label className="input-label">{t('Município')} *<input required maxLength={120} value={data.municipality} onChange={e=>setField('municipality',e.target.value)} onBlur={()=>{if(data.municipality.trim()&&data.state.trim())void forward(data.municipality,data.state,countryCode)}}/></label>:<SearchableSelect label={t('Município')} items={cities} value={cityCode} busy={loadingCities} disabled={!stateCode} required placeholder={t('Selecione o município')} onChange={chooseCity}/>}
     </div>
     <label className="input-label">{t('Localidade / distrito')}<input value={data.locality} maxLength={150} onChange={e=>setField('locality',e.target.value)} placeholder={t('Área rural / distrito')}/></label>
     <div className="coordinate-entry"><div className="coordinate-head"><strong><Crosshair size={15}/> {t('Coordenadas geográficas')}</strong><small>WGS84 · Decimal</small></div><div className="coordinate-fields"><label className="input-label">{t('Latitude')}<input inputMode="text" autoComplete="off" spellCheck={false} value={lat} onPaste={pastePair} onChange={e=>setLat(cleanCoord(e.target.value))} placeholder="-19.7489"/></label><label className="input-label">{t('Longitude')}<input inputMode="text" autoComplete="off" spellCheck={false} value={lon} onPaste={pastePair} onChange={e=>setLon(cleanCoord(e.target.value))} placeholder="-47.9383"/></label><button type="button" className="btn btn-outline btn-small coordinate-go" disabled={geocoding} onClick={gotoCoords}><MapPin size={14}/>{t('Ir para coordenadas')}</button></div><small>{t('Localizar um ponto não altera automaticamente o perímetro já desenhado.')}</small></div>
     {findingCity&&<p className="inline-progress"><LoaderCircle size={14} className="spin"/> {t('Centralizando o mapa no município selecionado…')}</p>}
     {locationSuccess&&<p className="form-success" role="status">{t(locationSuccess)}</p>}{locationError&&<p className="form-error" role="alert">{locationError}</p>}
    </section>
    <AgriculturalFields data={data} setData={setData}/>
   </div>
   <section className="farm-map-column"><div className="section-caption"><span>03</span><div><h3>{t('Área de cultivo')}</h3><p>{t('Trace o perímetro diretamente no mapa.')}</p></div></div>
    <MapPicker value={hasPolygon?data.geometry:null} target={target} onChange={v=>setField('geometry',v??{type:'Polygon',coordinates:[]})}/>
    <div className="geocode-card"><Info size={17}/><div><strong>{t('Localização pelo perímetro')}</strong><br/><button type="button" className="text-action" disabled={!hasPolygon||geocoding} onClick={reverse}>{geocoding?<LoaderCircle size={15} className="spin"/>:<LocateFixed size={15}/>} {t(geocoding?'Consultando localidade...':'Preencher localização com o mapa')} <ArrowRight size={14}/></button>{center&&<small>{t('Centro da seleção:')} {formatCoord(center[1])}, {formatCoord(center[0])}</small>}</div></div>
   </section>
   <footer className="farm-modal-footer"><p>{error?<span className="form-error" role="alert">{error}</span>:<>{t('Os dados da propriedade serão acessíveis apenas à sua conta.')}</>}</p><div><button type="button" className="btn btn-outline" onClick={onClose}>{t('Cancelar')}</button><button type="submit" disabled={saving||!hasPolygon||!countryCode||!(statesUnavailable?data.state.trim():stateCode)||!((statesUnavailable||citiesUnavailable)?data.municipality.trim():cityCode)} className="btn btn-primary">{t(saving?'Salvando...':farm?'Salvar alterações':'Cadastrar propriedade')} <ArrowRight size={16}/></button></div></footer>
  </form>
 </div></div>
}
