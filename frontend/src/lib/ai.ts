import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import { useLanguage, type Language } from './i18n'

export type CalendarItem = { crop: string; sow_month: number; harvest_month: number }
export type Rotation = {
  name: string; is_current: boolean; crops: string[]; calendar: CalendarItem[]
  farmer_summary: string; why: string; evidence: string[]; temperature_fit: string
  benefits: string[]; risks: string[]; general_knowledge: string[]; uncertainty: 'low' | 'medium' | 'high'
}
export type Analysis = {
  rotations: Rotation[]
  recommendation: { suggested_crop: string; rotation_name: string; message_to_farmer: string }
  disclaimer: string
}
export type MonthlyRow = {
  month: number; rain_mm: number | null; temp_mean_c: number | null; evapotranspiration_mm: number | null
  water_balance_mm: number | null; ndvi: number | null; root_soil_moisture_pct: number | null
}
export type AgroIndicators = {
  status: string
  rain_onset?: { mean_date_dd_mm: string; spread_days: number; latest_date: string; recent_5y_shift_days: number | null }
  dry_spells_main_season?: { mean_per_season: number; pct_seasons_with_dry_spell: number; mean_longest_dry_run_days: number }
  soil_moisture_end_second_crop?: { mean_date_dd_mm: string; spread_days: number }
}
export type FarmData = {
  point: string | null; season_start_month: number
  phases: { name: string; start_month: number; end_month: number }[]
  monthly: MonthlyRow[]; deficit_months: number[]; bare_soil_months: number[]
  agro_indicators: AgroIndicators | null; limitations: string[]; sources: string[]
}
export type StudyResult = {
  analysis: Analysis; farm_data: FarmData; priority: string; language: string; irrigated_warning: boolean
  crop_names: Record<string, { pt?: string; en?: string; es?: string }>
  validation: { passed: boolean; corrections: number; remaining_issues: string[] }
  model: string; engine: string; generated_at: string
}
export type Study = {
  id: string; farm_id: string; status: 'queued' | 'running' | 'complete' | 'failed'; stage: string
  language: string; error: string | null; result: StudyResult | null; seconds: number | null
  created_at: string; updated_at: string
}

export const aiApi = {
  start: (farm_id: string, language: Language) => api<Study>('/ai/studies', { method: 'POST', body: JSON.stringify({ farm_id, language }) }),
  get: (id: string) => api<Study>(`/ai/studies/${id}`),
  latest: (farmId: string, language: Language) => api<Study>(`/farms/${farmId}/studies/latest?language=${encodeURIComponent(language)}`),
  chat: (message: string, farm_id: string | undefined, language: Language, history: { role: 'user' | 'assistant'; content: string }[]) =>
    api<{ answer: string; farm_data: boolean }>('/ai/chat', { method: 'POST', body: JSON.stringify({ message, farm_id, language, history }) }),
}

const running = (s?: Study | null) => !!s && (s.status === 'queued' || s.status === 'running')

export function useStudy(farmId: string | undefined) {
  const queryClient = useQueryClient()
  const language = useLanguage(s => s.language)
  const key = ['study', farmId, language]
  const query = useQuery({
    queryKey: key,
    enabled: !!farmId,
    queryFn: async () => {
      try { return await aiApi.latest(farmId!, language) } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e }
    },
    refetchInterval: q => running(q.state.data as Study | null) ? 2500 : false,
  })
  const start = useMutation({
    mutationFn: (language: Language) => aiApi.start(farmId!, language),
    onSuccess: s => queryClient.setQueryData(key, s),
  })
  useEffect(() => { start.reset() }, [farmId])
  return { study: query.data ?? null, loading: query.isLoading, error: query.error, start, isRunning: running(query.data) || start.isPending }
}

export function cropLabel(id: string, names: StudyResult['crop_names'] | undefined, language: Language) {
  const n = names?.[id]
  const lang = language === 'pt-BR' ? 'pt' : language
  const label = (n && (n[lang as 'pt' | 'en' | 'es'] || n.en)) || id.replace(/_/g, ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}
