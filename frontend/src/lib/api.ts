import {LOCAL_DEMO,demoFarms,demoReverse} from './demo'
import {normalizeFarm,emptyContext} from './planning'
import type { Farm, FarmInput, User, AgronomyContext, RotationPlan } from '../types'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
const BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'
// O Render grátis dorme sem uso; ao acordar (~50 s) responde 502/503 ou uma página HTML no lugar da API.
// Nesses casos a chamada é repetida algumas vezes antes de mostrar erro.
const WAKE_DELAYS = [3000, 6000, 10000, 15000, 20000]
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(`${BASE}${url}`, {
        ...options,
        credentials: 'include',
        signal:options.signal??AbortSignal.timeout(url.includes('/simulations')?125000:url.includes('/agronomy')||url.includes('/ai/chat')?65000:15000),
        headers: { ...((options.body && !(options.body instanceof FormData)) ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
      })
    } catch {
      if (attempt < WAKE_DELAYS.length && !options.signal) { await sleep(WAKE_DELAYS[attempt]); continue }
      throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.')
    }
    const isJson = (res.headers.get('content-type') || '').includes('application/json')
    const body = !res.ok ? await res.json().catch(() => ({})) : null
    // Repete só quando a API ainda não respondeu: página do Render acordando (não JSON) ou o Worker sem alcançar o servidor.
    const fromWorker = typeof body?.detail === 'string' && /TerraTurn server/.test(body.detail)
    const waking = !res.ok && ((!isJson && res.status !== 204) || ([502, 503, 504].includes(res.status) && fromWorker))
    if (waking && attempt < WAKE_DELAYS.length) { await sleep(WAKE_DELAYS[attempt]); continue }
    if (!res.ok) {
      throw new ApiError(res.status, typeof body.detail === 'string' ? body.detail : 'The server is starting up. Please try again in a minute.')
    }
    if (res.status === 204) return undefined as T
    return res.json()
  }
}
export const sessionApi = {
  me: () => api<User>('/auth/me'),
  demo: () => api<User>('/auth/demo', { method: 'POST' }),
  login: (email: string, password: string) => api<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string, acknowledge_privacy: boolean) => api<User>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, acknowledge_privacy }) }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  forgot: (email: string) => api<{message: string}>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  reset: (token: string, password: string) => api<{message: string}>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
}
// Baixa o relatório da fazenda em PDF gerado pelo servidor (cadastro, dados NASA, clima e análise da IA).
export async function downloadFarmReport(farmId: string, language: string) {
  const res = await fetch(`${BASE}/farms/${farmId}/report.pdf?language=${encodeURIComponent(language)}`, { credentials: 'include' })
  if (!res.ok) throw new ApiError(res.status, 'Could not generate the PDF report. Please try again.')
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'terraturn-relatorio.pdf'
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const farmApi = {
  list: async () => (LOCAL_DEMO ? await demoFarms.list() : await api<Farm[]>('/farms')).map(normalizeFarm),
  create: (farm: FarmInput) => LOCAL_DEMO?demoFarms.save(farm):api<Farm>('/farms', { method: 'POST', body: JSON.stringify(farm) }),
  update: (id: string, farm: FarmInput) => LOCAL_DEMO?demoFarms.save(farm,id):api<Farm>(`/farms/${id}`, { method: 'PUT', body: JSON.stringify(farm) }),
  remove: (id: string) => LOCAL_DEMO?demoFarms.remove(id):api<void>(`/farms/${id}`, { method: 'DELETE' }),
  geocode: (lon: number, lat: number) => LOCAL_DEMO?demoReverse(lon,lat):api<{municipality:string;state:string;country:string;country_code:string;locality:string;source:string}>(`/geocode/reverse?lon=${lon}&lat=${lat}`),
  forward: (city:string,state:string,country:string) => LOCAL_DEMO?demoForward(city,state,country):api<{lon:number;lat:number;label:string;source:string}>(`/geocode/search?${new URLSearchParams({city,state,country})}`),
}

export type Choice={code:string;name:string}
export const locationApi = {
  countries:()=>LOCAL_DEMO?Promise.resolve([{code:'BR',name:'Brasil'}]):api<Choice[]>('/locations/countries'),
  states:(country:string)=>LOCAL_DEMO?ibge('estados?orderBy=nome'):api<Choice[]>(`/locations/states?${new URLSearchParams({country})}`),
  cities:(country:string,state:string)=>LOCAL_DEMO?ibge(`estados/${encodeURIComponent(state)}/municipios?orderBy=nome`):api<Choice[]>(`/locations/cities?${new URLSearchParams({country,state})}`),
}

async function ibge(path:string):Promise<Choice[]>{const r=await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/${path}`,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('IBGE indisponível');return(await r.json()).map((x:{id:number;sigla?:string;nome:string})=>({code:x.sigla??String(x.id),name:x.nome}))}
async function demoForward(city:string,state:string,country:string){const r=await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({city,state,country:country==='BR'?'Brasil':country,format:'jsonv2',limit:'1'})}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Localização indisponível');const f=(await r.json())[0];if(!f)throw Error('Município não encontrado');return{lon:Number(f.lon),lat:Number(f.lat),label:f.display_name,source:'Nominatim'}}
export const agronomyApi={context:(f:Farm,language='en')=>LOCAL_DEMO?Promise.resolve(emptyContext(f)):api<AgronomyContext>(`/farms/${f.id}/agronomy?language=${encodeURIComponent(language)}`),simulate:(f:Farm,scenario:{rainfall_percent:number;temperature_delta_c:number},language='en')=>LOCAL_DEMO?Promise.reject(new ApiError(503,'Sign in to run the AI analysis.')):api<RotationPlan>(`/farms/${f.id}/simulations`,{method:'POST',body:JSON.stringify({scenario,language})})}
