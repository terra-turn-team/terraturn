import type {Farm,FarmInput,Planning,AgronomyContext,Goal,Indicator} from '../types'
export const monthKey=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`
export const addMonths=(month:string,offset:number)=>{const[y,m]=month.split('-').map(Number);return monthKey(new Date(y,m-1+offset,1))}
export const formatMonth=(month:string,locale='pt-BR',short=false)=>{const[y,m]=month.split('-').map(Number);return new Intl.DateTimeFormat(locale,{month:short?'short':'long',year:'numeric'}).format(new Date(y,m-1,1))}
export const defaultPlanning=():Planning=>({start_month:monthKey(),horizon_months:12,crop_status:'unspecified',crop_start_month:null,crop_end_month:null})
export const DEFAULT_INDICATORS:Indicator[]=['rainfall','temperature','soil_moisture','ph','organic_matter','cover']
export const GOALS:{value:Goal;label:string;description:string}[]=[
{value:'soil',label:'Saúde do solo',description:'Estrutura, atividade biológica e matéria orgânica'},
{value:'water',label:'Conservar água',description:'Uso eficiente e retenção de água'},
{value:'resilience',label:'Resiliência climática',description:'Reduzir vulnerabilidade a eventos extremos'},
{value:'yield',label:'Produtividade',description:'Potencial produtivo da sequência de cultivos'},
{value:'cost',label:'Reduzir custos',description:'Insumos e operações ao longo da rotação'},
{value:'fertility',label:'Fertilidade e ciclagem',description:'Nutrientes e contribuição das culturas de cobertura'},
{value:'erosion',label:'Cobertura e erosão',description:'Manter o solo protegido entre safras'},
{value:'phytosanitary',label:'Riscos fitossanitários',description:'Pragas, doenças e nematoides locais'},
{value:'diversity',label:'Diversificação',description:'Alternar espécies e famílias botânicas'},
{value:'margin',label:'Retorno econômico',description:'Margem da rotação; depende de preços e custos locais'}]
export const INDICATORS:{value:Indicator;label:string;group:string;unit:string;source:string}[]=[
{value:'rainfall',label:'Precipitação',group:'Clima e água',unit:'mm',source:'Histórico NASA'},
{value:'temperature',label:'Temperatura média',group:'Clima e água',unit:'°C',source:'Histórico NASA'},
{value:'water_balance',label:'Balanço hídrico',group:'Clima e água',unit:'mm',source:'Modelo hídrico + dados locais'},
{value:'soil_moisture',label:'Umidade do solo',group:'Clima e água',unit:'m³/m³',source:'Estimativa orbital regional'},
{value:'ph',label:'pH do solo',group:'Solo e vegetação',unit:'',source:'Análise local declarada'},
{value:'organic_matter',label:'Matéria orgânica',group:'Solo e vegetação',unit:'%',source:'Análise local declarada'},
{value:'cover',label:'Cobertura do solo',group:'Solo e vegetação',unit:'%',source:'Sensoriamento + modelo'},
{value:'ndvi',label:'Vigor vegetal · NDVI',group:'Solo e vegetação',unit:'',source:'Sensoriamento remoto'},
{value:'erosion_risk',label:'Risco de erosão',group:'Solo e vegetação',unit:'',source:'Modelo + relevo + manejo'},
{value:'pest_risk',label:'Risco fitossanitário',group:'Produção e economia',unit:'',source:'Modelo + registros locais'},
{value:'yield',label:'Produtividade estimada',group:'Produção e economia',unit:'t/ha',source:'Modelo agronômico'},
{value:'cost',label:'Custo estimado',group:'Produção e economia',unit:'R$/ha',source:'Orçamento local'},
{value:'margin',label:'Margem estimada',group:'Produção e economia',unit:'R$/ha',source:'Preços e custos locais'}]
export function normalizeFarm(f:Farm):Farm{return{...f,crop:['não informado','Não informada'].includes(f.crop)?'':f.crop,planning:{...defaultPlanning(),...f.planning},indicators:f.indicators??DEFAULT_INDICATORS}}
const dateKey=(d:Date)=>`${monthKey(d)}-${String(d.getDate()).padStart(2,'0')}`
export function historyWindow(now=new Date()){const end=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1),start=new Date(now.getFullYear()-5,now.getMonth(),1);start.setDate(Math.min(now.getDate(),new Date(start.getFullYear(),start.getMonth()+1,0).getDate()));return{start_date:dateKey(start),end_date:dateKey(end)}}
export function buildSimulationRequest(f:FarmInput,reference=new Date()){return{schema_version:'1.0',reference_date:dateKey(reference),history_window:{...historyWindow(reference),years:5},location:{geometry:f.geometry,municipality:f.municipality,state:f.state,country:f.country},planning:{...f.planning,end_month:addMonths(f.planning.start_month,f.planning.horizon_months-1),initial_crop:f.crop.trim()||null,initial_crop_mode:f.crop.trim()?'provided':'recommend',previous_crop:f.previous_crop||null},soil:f.soil,priorities:f.goals,indicators:f.indicators,notes:f.notes}}
export function emptyContext(f:Farm):AgronomyContext{return{schema_version:'1.0',farm_id:f.id,status:'pending',history:{...historyWindow(),observed_through:null,completeness_percent:0,source:'Integração NASA',resolution:null,monthly:[]},metrics:[],plan:{status:'not_connected',cycles:[],warnings:[]}}}
export function downloadJson(data:unknown,filename:string){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
