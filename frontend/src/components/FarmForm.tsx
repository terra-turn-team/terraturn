import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { X, ArrowRight, LocateFixed, Info, CheckCircle2, LoaderCircle, MapPin, Crosshair } from 'lucide-react'
import { MapPicker, mapDraftStorageKey } from './MapPicker'
import SearchableSelect, {type Choice} from './SearchableSelect'
import { farmApi, ApiError, locationApi } from '../lib/api'
import { polygonDetails, formatCoord } from '../lib/geo'
import { useI18n } from '../lib/i18n'
import { useViewStore } from '../lib/viewStore'
import type { Farm, FarmInput, Goal } from '../types'

const EMPTY: FarmInput = {name:'',locality:'',municipality:'',state:'',country:'Brasil',crop:'Soja',previous_crop:'',planting_month:null,soil:{texture:'unknown',ph:null,organic_matter_percent:null,irrigation:'unknown'},goals:['soil','resilience'],notes:'',geometry:{type:'Polygon',coordinates:[]}}
const GOALS: {value:Goal,label:string}[]=[{value:'soil',label:'Saúde do solo'},{value:'water',label:'Conservar água'},{value:'resilience',label:'Resiliência'},{value:'yield',label:'Produtividade'},{value:'cost',label:'Custos'}]
const MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CROPS=['Soja','Milho','Café','Cana-de-açúcar','Trigo','Feijão','Braquiária','Outra cultura']
const norm=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim()
const match=(items:Choice[],v:string)=>items.find(i=>norm(i.name)===norm(v)||norm(i.code)===norm(v))

type Props={farm?:Farm|null;onClose:()=>void;onSaved:(farm:Farm)=>void;draftKey?:string}
export default function FarmForm({farm,onClose,onSaved,draftKey='new'}:Props){
 const {t}=useI18n()
 const showAction=useViewStore(s=>s.showAction)
 const [data,setData]=useState<FarmInput>(()=>farm?{
  name:farm.name,locality:farm.locality,municipality:farm.municipality,state:farm.state,country:farm.country,crop:farm.crop,previous_crop:farm.previous_crop,planting_month:farm.planting_month,soil:farm.soil,goals:farm.goals,notes:farm.notes,geometry:farm.geometry}:structuredClone(EMPTY))
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
 useEffect(()=>{let alive=true;setLoadingCountries(true);locationApi.countries().then(v=>{if(alive)setCountries(v)}).catch(()=>{if(alive)setLocationError('Lista de países indisponível. Brasil permanece selecionável.')}).finally(()=>{if(alive)setLoadingCountries(false)});return()=>{alive=false}},[])
 useEffect(()=>{let alive=true;setLoadingStates(true);setStates([]);setCities([]);locationApi.states(countryCode).then(v=>{if(alive)setStates(v)}).catch(()=>{if(alive)setLocationError('Estados indisponíveis. Verifique o serviço de localidades.')}).finally(()=>{if(alive)setLoadingStates(false)});return()=>{alive=false}},[countryCode])
 useEffect(()=>{let alive=true;setCities([]);if(!stateCode)return;setLoadingCities(true);locationApi.cities(countryCode,stateCode).then(v=>{if(alive)setCities(v)}).catch(()=>{if(alive)setLocationError('Municípios indisponíveis. Tente novamente.')}).finally(()=>{if(alive)setLoadingCities(false)});return()=>{alive=false}},[countryCode,stateCode])
 useEffect(()=>{if(center){setLon(center[0].toFixed(6));setLat(center[1].toFixed(6))}},[center?.[0],center?.[1]])
 const forward=async(city:string,state:string,country:string)=>{
   const id=++lastCitySearch.current;setFindingCity(true);setLocationError('')
   try {const geo=await farmApi.forward(city,state,country);if(id!==lastCitySearch.current)return;setTarget({lon:geo.lon,lat:geo.lat,zoom:12});setLon(geo.lon.toFixed(6));setLat(geo.lat.toFixed(6))}
   catch(e){if(id===lastCitySearch.current)setLocationError(e instanceof ApiError?e.message:'Não foi possível localizar a cidade no mapa.')}
   finally{if(id===lastCitySearch.current)setFindingCity(false)}
 }
 const chooseCity=(choice:Choice)=>{setField('municipality',choice.name);void forward(choice.name,data.state,countryCode)}
 const reverseCoordinates=async(lonValue:number,latValue:number)=>{
  setGeocoding(true);setLocationError('')
  try {const geo=await farmApi.geocode(lonValue,latValue);setData(p=>({...p,locality:geo.locality||p.locality,municipality:geo.municipality||p.municipality,state:geo.state||p.state,country:match(countries,geo.country_code)?.name||geo.country||p.country}))}
  catch(e){setLocationError(e instanceof ApiError?e.message:'Localidade não identificada. Revise os campos de localização.')}
  finally{setGeocoding(false)}
 }
 const reverse=async()=>{if(center)await reverseCoordinates(center[0],center[1])}
 const gotoCoords=async()=>{
  const latValue=Number(lat.replace(',','.')),lonValue=Number(lon.replace(',','.'))
  if(!lat.trim()||!lon.trim()||!Number.isFinite(latValue)||!Number.isFinite(lonValue)||Math.abs(latValue)>90||Math.abs(lonValue)>180)return setLocationError(t('Coordenadas inválidas.'))
  setTarget({lon:lonValue,lat:latValue,zoom:14});await reverseCoordinates(lonValue,latValue)
 }
 const toggleGoal=(goal:Goal)=>setField('goals',data.goals.includes(goal)?data.goals.filter(g=>g!==goal):[...data.goals,goal])
 const submit=async(e:FormEvent)=>{
  e.preventDefault();setError('')
  if(!hasPolygon)return setError('Conclua a seleção do perímetro no mapa antes de salvar.')
  if(!match(countries,data.country)||!stateCode||!cityCode)return setError('Selecione País, Estado e Município nas listas antes de salvar.')
  setSaving(true)
  try{
   const saved=farm?await farmApi.update(farm.id,data):await farmApi.create(data)
   let draftCleanupFailed=false
   try{window.localStorage.removeItem(mapDraftStorageKey(farm?.id??draftKey))}
   catch{draftCleanupFailed=true}
   onSaved(saved)
   if(draftCleanupFailed)showAction(t('A propriedade foi salva, mas o rascunho local não pôde ser removido deste navegador.'))
  }
  catch(e){setError(e instanceof ApiError?e.message:'Não foi possível salvar a propriedade.')}
  finally{setSaving(false)}
 }
 return <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="farm-title"><div className="farm-modal">
  <header className="farm-modal-header"><div><span className="eyebrow">{t('GERENCIAMENTO DE PROPRIEDADES')}</span><h2 id="farm-title">{t(farm?'Editar propriedade':'Nova propriedade rural')}</h2><p>{t('Cadastre seu terreno e prepare a base para os estudos agronômicos.')}</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label="Fechar"><X/></button></header>
  <form className="farm-modal-form" onSubmit={submit}>
   <div className="farm-form-column">
    <section className="form-section"><div className="section-caption"><span>01</span><div><h3>{t('Identificação')}</h3><p>{t('Dados mínimos necessários para identificar seu terreno.')}</p></div></div>
     <label className="input-label">{t('Nome da propriedade *')}<input required minLength={2} maxLength={120} value={data.name} onChange={e=>setField('name',e.target.value)} placeholder="Ex.: Fazenda Boa Vista" autoFocus/></label>
     <div className="form-3col">
      <SearchableSelect label={t('País')} items={countries} value={countryCode} busy={loadingCountries} required placeholder={t('Selecione um país')} onChange={c=>{setData(p=>({...p,country:c.name,state:'',municipality:'',locality:''}));setTarget(null)}}/>
      <SearchableSelect label={t('Estado')} items={states} value={stateCode} busy={loadingStates} disabled={!countryCode} required placeholder={t('Selecione o estado')} onChange={s=>setData(p=>({...p,state:s.name,municipality:'',locality:''}))}/>
      <SearchableSelect label={t('Município')} items={cities} value={cityCode} busy={loadingCities} disabled={!stateCode} required placeholder={t('Selecione o município')} onChange={chooseCity}/>
     </div>
     <label className="input-label">{t('Localidade / distrito')}<input value={data.locality} maxLength={150} onChange={e=>setField('locality',e.target.value)} placeholder="Área rural / distrito"/></label>
     <div className="coordinate-entry"><div className="coordinate-head"><strong><Crosshair size={15}/> {t('Coordenadas geográficas')}</strong><small>WGS84 · Decimal</small></div><div className="coordinate-fields"><label className="input-label">{t('Latitude')}<input inputMode="decimal" value={lat} onChange={e=>setLat(e.target.value)} placeholder="-19.7489"/></label><label className="input-label">{t('Longitude')}<input inputMode="decimal" value={lon} onChange={e=>setLon(e.target.value)} placeholder="-47.9383"/></label><button type="button" className="btn btn-muted btn-small" disabled={geocoding} onClick={gotoCoords}><MapPin size={14}/>{t('Ir para coordenadas')}</button></div><small>Localizar um ponto não altera automaticamente o perímetro já desenhado.</small></div>
     {findingCity&&<p className="inline-progress"><LoaderCircle size={14} className="spin"/> Centralizando o mapa no município selecionado…</p>}
     {locationError&&<p className="form-error" role="alert">{locationError}</p>}
    </section>
    <section className="form-section"><div className="section-caption"><span>02</span><div><h3>{t('Contexto agrícola')}</h3><p>{t('Ajuda a personalizar análises futuras.')}</p></div></div>
      <div className="form-2col"><label className="input-label">{t('Cultura principal')}<select value={data.crop} onChange={e=>setField('crop',e.target.value)}>{CROPS.map(c=><option key={c} value={c}>{t(c)}</option>)}</select></label><label className="input-label">{t('Cultura anterior')}<input value={data.previous_crop} onChange={e=>setField('previous_crop',e.target.value)} placeholder="Opcional"/></label></div>
      <div className="form-2col"><label className="input-label">{t('Textura do solo')}<select value={data.soil.texture} onChange={e=>setSoil('texture',e.target.value)}><option value="unknown">Não informada</option><option value="sandy">Arenoso</option><option value="loamy">Franco</option><option value="clayey">Argiloso</option><option value="silty">Siltoso</option></select></label><label className="input-label">{t('Sistema hídrico')}<select value={data.soil.irrigation} onChange={e=>setSoil('irrigation',e.target.value)}><option value="unknown">Não informado</option><option value="rainfed">Sequeiro</option><option value="irrigated">Irrigado</option><option value="mixed">Misto</option></select></label></div>
      <div className="form-2col"><label className="input-label">pH do solo (opcional)<input type="number" step="0.1" min="3" max="10" value={data.soil.ph??''} onChange={e=>setSoil('ph',e.target.value?Number(e.target.value):null)} placeholder="Ex.: 5,8"/></label><label className="input-label">Matéria orgânica (%)<input type="number" step="0.1" min="0" max="100" value={data.soil.organic_matter_percent??''} onChange={e=>setSoil('organic_matter_percent',e.target.value?Number(e.target.value):null)} placeholder="Opcional"/></label></div>
      <label className="input-label">{t('Mês previsto de plantio')}<select value={data.planting_month??''} onChange={e=>setField('planting_month',e.target.value?Number(e.target.value):null)}><option value="">Ainda não definido</option>{MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></label>
      <div className="input-label">{t('Prioridades agronômicas')}<div className="goal-pills">{GOALS.map(g=><button type="button" key={g.value} className={data.goals.includes(g.value)?'goal-pill on':'goal-pill'} onClick={()=>toggleGoal(g.value)}>{data.goals.includes(g.value)&&<CheckCircle2 size={14}/>} {t(g.label)}</button>)}</div></div>
      <label className="input-label">{t('Notas técnicas')}<textarea rows={3} maxLength={2000} value={data.notes} onChange={e=>setField('notes',e.target.value)} placeholder="Histórico de manejo, restrições, observações..."/></label>
    </section>
   </div>
   <section className="farm-map-column"><div className="section-caption"><span>03</span><div><h3>{t('Área de cultivo')}</h3><p>{t('Trace o perímetro diretamente no mapa.')}</p></div></div>
    <MapPicker value={hasPolygon?data.geometry:null} target={target} draftKey={farm?.id??draftKey} onChange={v=>setField('geometry',v??{type:'Polygon',coordinates:[]})}/>
    <div className="geocode-card"><Info size={17}/><div><strong>{t('Preenchimento inteligente de localização')}</strong><p>{t('Se você solicitar, enviaremos apenas o centro do perímetro ao Nominatim (OpenStreetMap) para obter município e estado. Revise os campos antes de salvar.')}</p><button type="button" className="text-action" disabled={!hasPolygon||geocoding} onClick={reverse}>{geocoding?<LoaderCircle size={15} className="spin"/>:<LocateFixed size={15}/>} {t(geocoding?'Consultando localidade...':'Preencher localização com o mapa')} <ArrowRight size={14}/></button>{center&&<small>Centro da seleção: {formatCoord(center[1])}, {formatCoord(center[0])}</small>}</div></div>
   </section>
   <footer className="farm-modal-footer"><p>{error?<span className="form-error" role="alert">{error}</span>:<>Os dados da propriedade serão acessíveis apenas à sua conta.</>}</p><div><button type="button" className="btn btn-outline" onClick={onClose}>{t('Cancelar')}</button><button type="submit" disabled={saving||!hasPolygon||!countryCode||!stateCode||!cityCode} className="btn btn-primary">{t(saving?'Salvando...':farm?'Salvar alterações':'Cadastrar propriedade')} <ArrowRight size={16}/></button></div></footer>
  </form>
 </div></div>
}
