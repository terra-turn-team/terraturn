import type {AgronomyContext,Farm} from '../types'
import {Sprout,CloudRain,ThermometerSun,Layers3,Wind,Mountain,Leaf,Droplets,Sun,ShieldAlert,TestTube2,ChartNoAxesColumnIncreasing,CloudSun,Ruler,Activity,Flower2,FlaskConical,ScanEye} from 'lucide-react'
export const LAYERS = [
 {value:'cultivo',label:'Cultivo',group:'Cultivo',icon:Sprout,source:'Cadastro / modelo botânico',status:'illustrative',description:'Modelo vegetal estilizado da cultura declarada'},
 {value:'cobertura_vegetal',label:'Cobertura vegetal',group:'Cultivo',icon:Leaf,source:'Landsat / MODIS',status:'pending',description:'Porcentagem de solo coberto e períodos descobertos'},
 {value:'ndvi',label:'NDVI / vigor vegetal',group:'Cultivo',icon:ChartNoAxesColumnIncreasing,source:'Landsat / MODIS',status:'pending',description:'Índice de vegetação normalizado (NDVI)'},
 {value:'evi',label:'EVI',group:'Cultivo',icon:Leaf,source:'MODIS',status:'pending',description:'Índice de vegetação realçado'},
 {value:'ndwi',label:'NDWI / água na vegetação',group:'Cultivo',icon:Droplets,source:'Landsat',status:'pending',description:'Índice espectral relacionado à água'},
 {value:'pragas',label:'Risco de pragas',group:'Cultivo',icon:ShieldAlert,source:'Modelos IA + registros locais',status:'pending',description:'Requer modelo validado e dados fitossanitários locais'},
 {value:'solo',label:'Textura do solo',group:'Solo',icon:Layers3,source:'Cadastro do produtor',status:'declared',description:'Textura informada no cadastro da propriedade'},
 {value:'ph',label:'pH do solo',group:'Solo',icon:TestTube2,source:'Análise local declarada',status:'declared',description:'pH declarado pelo usuário, quando preenchido'},
 {value:'materia_organica',label:'Matéria orgânica',group:'Solo',icon:Flower2,source:'Análise local declarada',status:'declared',description:'Teor de matéria orgânica inserido no cadastro'},
 {value:'umidade_solo',label:'Umidade do solo',group:'Solo',icon:Droplets,source:'NASA SMAP / GLDAS',status:'pending',description:'Estimativa regional, sujeita à resolução do produto'},
 {value:'erosao',label:'Susceptibilidade à erosão',group:'Solo',icon:ShieldAlert,source:'DEM + solo + chuva + cobertura',status:'pending',description:'Índice que exigirá validação local'},
 {value:'declividade',label:'Declividade',group:'Relevo',icon:Mountain,source:'DEM / SRTM',status:'pending',description:'Inclinação derivada de elevação geoespacial'},
 {value:'elevacao',label:'Elevação',group:'Relevo',icon:Ruler,source:'DEM / SRTM',status:'pending',description:'Altitude do terreno a partir de modelo digital de elevação'},
 {value:'chuva',label:'Chuva',group:'Clima',icon:CloudRain,source:'NASA POWER / GPM',status:'pending',description:'Precipitação histórica e distribuição temporal'},
 {value:'temperatura',label:'Temperatura',group:'Clima',icon:ThermometerSun,source:'NASA POWER / GEOS-FP',status:'pending',description:'Temperatura histórica e previsão quando disponível'},
 {value:'vento',label:'Ventos',group:'Clima',icon:Wind,source:'NASA POWER / GEOS-FP',status:'pending',description:'Velocidade e direção do vento'},
 {value:'radiacao',label:'Radiação solar',group:'Clima',icon:Sun,source:'NASA POWER',status:'pending',description:'Radiação incidente na superfície'},
 {value:'evapotranspiracao',label:'Evapotranspiração',group:'Clima',icon:CloudSun,source:'NASA POWER / ECOSTRESS',status:'pending',description:'Demanda evaporativa e perdas de água'},
 {value:'balanco_hidrico',label:'Balanço hídrico',group:'Clima',icon:Droplets,source:'NASA POWER − MODIS MOD16A2',status:'pending',description:'Chuva menos evapotranspiração, média anual'},
 {value:'seca',label:'Risco de seca',group:'Clima',icon:ShieldAlert,source:'Precipitação + umidade + modelos',status:'pending',description:'Anomalias de chuva/umidade e tendências locais'},
 {value:'geada',label:'Risco de geada',group:'Clima',icon:ThermometerSun,source:'Temperatura + altitude + modelo',status:'pending',description:'Condições potencialmente favoráveis à geada'},
 {value:'calor',label:'Estresse térmico',group:'Clima',icon:Activity,source:'NASA POWER / ECOSTRESS',status:'pending',description:'Exposição da cultura a calor excessivo'},
 {value:'irrigacao',label:'Sistema de irrigação',group:'Manejo',icon:Droplets,source:'Cadastro do produtor',status:'declared',description:'Tipo de irrigação informado pelo usuário'},
] as const
export type WeatherLayer=(typeof LAYERS)[number]['value']
export type LayerDetails=(typeof LAYERS)[number]
export const getLayer=(id:WeatherLayer)=>LAYERS.find(x=>x.value===id)??LAYERS[0]

// Camadas ligadas às métricas reais da NASA que o backend calcula para a fazenda (sem valores inventados).
const LAYER_METRIC:Partial<Record<WeatherLayer,string>>={chuva:'rainfall',temperatura:'temperature',umidade_solo:'soil_moisture',ndvi:'ndvi',cobertura_vegetal:'cover',balanco_hidrico:'water_balance'}
const LAYER_MONTHLY:Partial<Record<WeatherLayer,'precipitation_mm'|'temperature_c'>>={chuva:'precipitation_mm',temperatura:'temperature_c'}
const TEXTURE:Record<string,string>={sandy:'Arenoso',loamy:'Franco',clayey:'Argiloso',silty:'Siltoso'}
const IRRIGATION:Record<string,string>={rainfed:'Sequeiro',irrigated:'Irrigado',mixed:'Misto'}
export type LayerReading={kind:'nasa'|'declared'|'illustrative'|'none';value?:string;source?:string;detail?:string}
export function readLayer(l:LayerDetails,farm:Farm|undefined,context:AgronomyContext|undefined,t:(k:string)=>string,locale:string):LayerReading{
 const num=(v:number)=>v.toLocaleString(locale,{maximumFractionDigits:2})
 const metricId=LAYER_METRIC[l.value]
 if(metricId){
  const m=context?.metrics.find(x=>x.id===metricId&&x.value!=null)
  return m?{kind:'nasa',value:`${num(m.value as number)} ${m.unit??''}`.trim(),source:m.source,detail:[m.date,m.resolution].filter(Boolean).join(' · ')}:{kind:'none'}
 }
 if(l.status==='declared'&&farm){
  const s=farm.soil,v=l.value==='solo'?(TEXTURE[s.texture]?t(TEXTURE[s.texture]):null):l.value==='ph'?(s.ph==null?null:num(s.ph)):l.value==='materia_organica'?(s.organic_matter_percent==null?null:num(s.organic_matter_percent)+'%'):l.value==='irrigacao'?(IRRIGATION[s.irrigation]?t(IRRIGATION[s.irrigation]):null):null
  return {kind:'declared',value:v??undefined,source:t(l.source)}
 }
 if(l.status==='illustrative')return {kind:'illustrative',value:farm?.crop?t(farm.crop):undefined,source:t(l.source)}
 return {kind:'none'}
}
// Média histórica (NASA POWER) do mês do calendário (1-12) para chuva e temperatura.
export function monthlyMean(layer:WeatherLayer,context:AgronomyContext|undefined,month:number):number|null{
 const field=LAYER_MONTHLY[layer]
 if(!field||!context)return null
 const vals=context.history.monthly.filter(m=>Number(m.month.slice(5,7))===month).map(m=>m[field]).filter((v):v is number=>v!=null)
 return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null
}
