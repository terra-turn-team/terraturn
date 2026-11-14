export type User = { id: string; name: string; email: string }
export type GeoPolygon = { type: 'Polygon'; coordinates: number[][][] }
export type Soil = { texture: 'unknown'|'sandy'|'loamy'|'clayey'|'silty'; ph: number|null; organic_matter_percent: number|null; irrigation: 'rainfed'|'irrigated'|'mixed'|'unknown' }
export type Goal = 'water' | 'soil' | 'resilience' | 'yield' | 'cost'
export type FarmInput = {
  name: string; locality: string; municipality: string; state: string; country: string;
  crop: string; previous_crop: string; planting_month: number|null;
  soil: Soil; goals: Goal[]; notes: string; geometry: GeoPolygon
}
export type Farm = FarmInput & { id: string; area_ha: number; centroid: number[]; created_at: string; updated_at: string }
export type { WeatherLayer } from './lib/layers'
export type ChatItem = { id: string; role: 'assistant'|'user'; text: string; time: string }
