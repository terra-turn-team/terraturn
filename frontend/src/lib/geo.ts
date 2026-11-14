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
export type PolygonIssue = 'not-enough-points'|'invalid-coordinates'|'duplicate-points'|'self-intersection'|'area-too-small'

function segmentsIntersect(a:number[],b:number[],c:number[],d:number[]):boolean {
  const orient=(p:number[],q:number[],r:number[]) => (q[1]-p[1])*(r[0]-q[0])-(q[0]-p[0])*(r[1]-q[1])
  const onSegment=(p:number[],q:number[],r:number[]) => q[0]>=Math.min(p[0],r[0])&&q[0]<=Math.max(p[0],r[0])&&q[1]>=Math.min(p[1],r[1])&&q[1]<=Math.max(p[1],r[1])
  const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b)
  if(o1===0&&onSegment(a,c,b)||o2===0&&onSegment(a,d,b)||o3===0&&onSegment(c,a,d)||o4===0&&onSegment(c,b,d))return true
  return o1*o2<0&&o3*o4<0
}
export function polygonIssue(points:number[][]):PolygonIssue|null {
  if(points.length<3)return 'not-enough-points'
  if(points.some(p=>p.length!==2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90))return 'invalid-coordinates'
  const unique=new Set(points.map(p=>`${p[0]},${p[1]}`))
  if(unique.size!==points.length)return 'duplicate-points'
  for(let i=0;i<points.length;i++){
    const next=(i+1)%points.length
    for(let j=i+1;j<points.length;j++){
      const otherNext=(j+1)%points.length
      if(i===j||next===j||otherNext===i)continue
      if(segmentsIntersect(points[i],points[next],points[j],points[otherNext]))return 'self-intersection'
    }
  }
  try{return polygonDetails(closedPolygon(points)).areaHa>.001?null:'area-too-small'}
  catch{return 'invalid-coordinates'}
}
export function isValidPolygon(points: number[][]): boolean {
  return polygonIssue(points)===null
}
export const formatHa = (n: number) => `${new Intl.NumberFormat(localeFor(useLanguage.getState().language), { maximumFractionDigits: 2 }).format(n)} ha`
export const formatSquareMeters = (n:number) => `${new Intl.NumberFormat(localeFor(useLanguage.getState().language), { maximumFractionDigits: 0 }).format(n)} m²`
export const formatCoord = (n: number) => new Intl.NumberFormat(localeFor(useLanguage.getState().language), { minimumFractionDigits: 5, maximumFractionDigits: 5 }).format(n)
