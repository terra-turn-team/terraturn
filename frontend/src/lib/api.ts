import {IS_DEMO,demoFarms,demoReverse} from './demo'
import {normalizeFarm,emptyContext} from './planning'
import type { Farm, FarmInput, User, AgronomyContext, RotationPlan } from '../types'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
const BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${url}`, {
      ...options,
      credentials: 'include',
      signal:options.signal??AbortSignal.timeout(url.includes('/simulations')?125000:url.includes('/agronomy')?65000:15000),
      headers: { ...((options.body && !(options.body instanceof FormData)) ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    })
  } catch { throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.') }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, typeof body.detail === 'string' ? body.detail : 'Something went wrong. Please try again.')
  }
  if (res.status === 204) return undefined as T
  return res.json()
}
export const sessionApi = {
  me: () => api<User>('/auth/me'),
  login: (email: string, password: string) => api<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string, acknowledge_privacy: boolean) => api<User>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, acknowledge_privacy }) }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  forgot: (email: string) => api<{message: string}>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  reset: (token: string, password: string) => api<{message: string}>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
}
export const farmApi = {
  list: async () => (IS_DEMO ? await demoFarms.list() : await api<Farm[]>('/farms')).map(normalizeFarm),
  create: (farm: FarmInput) => IS_DEMO?demoFarms.save(farm):api<Farm>('/farms', { method: 'POST', body: JSON.stringify(farm) }),
  update: (id: string, farm: FarmInput) => IS_DEMO?demoFarms.save(farm,id):api<Farm>(`/farms/${id}`, { method: 'PUT', body: JSON.stringify(farm) }),
  remove: (id: string) => IS_DEMO?demoFarms.remove(id):api<void>(`/farms/${id}`, { method: 'DELETE' }),
  geocode: (lon: number, lat: number) => IS_DEMO?demoReverse(lon,lat):api<{municipality:string;state:string;country:string;country_code:string;locality:string;source:string}>(`/geocode/reverse?lon=${lon}&lat=${lat}`),
  forward: (city:string,state:string,country:string) => IS_DEMO?demoForward(city,state,country):api<{lon:number;lat:number;label:string;source:string}>(`/geocode/search?${new URLSearchParams({city,state,country})}`),
}

export type Choice={code:string;name:string}
export const locationApi = {
  countries:()=>IS_DEMO?Promise.resolve([{code:'BR',name:'Brasil'}]):api<Choice[]>('/locations/countries'),
  states:(country:string)=>IS_DEMO?ibge('estados?orderBy=nome'):api<Choice[]>(`/locations/states?${new URLSearchParams({country})}`),
  cities:(country:string,state:string)=>IS_DEMO?ibge(`estados/${encodeURIComponent(state)}/municipios?orderBy=nome`):api<Choice[]>(`/locations/cities?${new URLSearchParams({country,state})}`),
}

async function ibge(path:string):Promise<Choice[]>{const r=await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/${path}`,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('IBGE indisponível');return(await r.json()).map((x:{id:number;sigla?:string;nome:string})=>({code:x.sigla??String(x.id),name:x.nome}))}
async function demoForward(city:string,state:string,country:string){const r=await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({city,state,country:country==='BR'?'Brasil':country,format:'jsonv2',limit:'1'})}`,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Localização indisponível');const f=(await r.json())[0];if(!f)throw Error('Município não encontrado');return{lon:Number(f.lon),lat:Number(f.lat),label:f.display_name,source:'Nominatim'}}
export const agronomyApi={context:(f:Farm)=>IS_DEMO?Promise.resolve(emptyContext(f)):api<AgronomyContext>(`/farms/${f.id}/agronomy`),simulate:(f:Farm,scenario:{rainfall_percent:number;temperature_delta_c:number},language='en')=>IS_DEMO?Promise.reject(new ApiError(503,'Sign in to run the AI analysis.')):api<RotationPlan>(`/farms/${f.id}/simulations`,{method:'POST',body:JSON.stringify({scenario,language})})}
