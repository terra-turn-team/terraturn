import type { Farm, FarmInput, User } from '../types'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
const BASE = '/api/v1'
export async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${url}`, {
      ...options,
      credentials: 'include',
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
  list: () => api<Farm[]>('/farms'),
  create: (farm: FarmInput) => api<Farm>('/farms', { method: 'POST', body: JSON.stringify(farm) }),
  update: (id: string, farm: FarmInput) => api<Farm>(`/farms/${id}`, { method: 'PUT', body: JSON.stringify(farm) }),
  remove: (id: string) => api<void>(`/farms/${id}`, { method: 'DELETE' }),
  geocode: (lon: number, lat: number) => api<{municipality:string;state:string;country:string;country_code:string;locality:string;source:string}>(`/geocode/reverse?lon=${lon}&lat=${lat}`),
  forward: (city:string,state:string,country:string) => api<{lon:number;lat:number;label:string;source:string}>(`/geocode/search?${new URLSearchParams({city,state,country})}`),
}

export type Choice={code:string;name:string}
export const locationApi = {
  countries:()=>api<Choice[]>('/locations/countries'),
  states:(country:string)=>api<Choice[]>(`/locations/states?${new URLSearchParams({country})}`),
  cities:(country:string,state:string)=>api<Choice[]>(`/locations/cities?${new URLSearchParams({country,state})}`),
}
