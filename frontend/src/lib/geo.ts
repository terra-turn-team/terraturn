import { area } from '@turf/area'
import { centroid } from '@turf/centroid'
import type { GeoPolygon } from '../types'
import {useLanguage,localeFor} from './i18n'

export const UBERABA: [number,number] = [-47.932, -19.748]
export const closedPolygon = (points: number[][]): GeoPolygon => ({ type: 'Polygon', coordinates: [[...points, [...points[0]]]] })
export function polygonDetails(polygon: GeoPolygon): { areaHa: number; centroid: [number,number] } {
  const feature = { type: 'Feature' as const, geometry: polygon, properties: {} }
  const cp = centroid(feature).geometry.coordinates
  return { areaHa: area(feature) / 10000, centroid: [cp[0],cp[1]] }
}
export function isValidPolygon(points: number[][]): boolean {
  if (points.length < 3) return false
  try { return polygonDetails(closedPolygon(points)).areaHa > .001 } catch { return false }
}
export const formatHa = (n: number) => `${new Intl.NumberFormat(localeFor(useLanguage.getState().language), { maximumFractionDigits: 2 }).format(n)} ha`
export const formatCoord = (n: number) => new Intl.NumberFormat(localeFor(useLanguage.getState().language), { minimumFractionDigits: 5, maximumFractionDigits: 5 }).format(n)
