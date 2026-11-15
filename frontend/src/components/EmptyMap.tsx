import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as LibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { LocateFixed, Plus, Sprout } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { hasWebGL, SATELLITE_ATTRIBUTION, SATELLITE_TILES } from '../lib/mapSupport'

const BRAZIL: [number, number] = [-51.9, -14.2]

export default function EmptyMap({ onRegister }: { onRegister: () => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null), map = useRef<LibreMap | null>(null)
  const [msg, setMsg] = useState('')
  const webgl = hasWebGL()
  useEffect(() => {
    if (!ref.current || !webgl) return
    const m = new maplibregl.Map({
      container: ref.current, center: BRAZIL, zoom: 3.4, attributionControl: { compact: true },
      style: { version: 8, sources: { sat: { type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: SATELLITE_ATTRIBUTION } }, layers: [{ id: 'sat', type: 'raster', source: 'sat' }] },
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [webgl])
  const locate = () => {
    if (!navigator.geolocation) return setMsg(t('Localização indisponível neste navegador.'))
    setMsg('')
    navigator.geolocation.getCurrentPosition(
      p => map.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 13 }),
      () => setMsg(t('Localização negada. Você pode navegar pelo mapa manualmente.')),
      { enableHighAccuracy: false, timeout: 10000 })
  }
  return <div className="empty-map-live">
    {webgl ? <div ref={ref} className="empty-map-canvas" /> : <div className="empty-map-canvas empty-map-fallback" />}
    <div className="empty-map-card" role="region" aria-label={t('Sua próxima safra começa aqui.')}>
      <span className="empty-map-icon"><Sprout size={22} /></span>
      <h2>{t('Sua próxima safra começa aqui.')}</h2>
      <p>{t('Desenhe sua área e prepare seu planejamento.')}</p>
      <div className="empty-map-actions">
        <button className="btn btn-primary" onClick={onRegister}><Plus size={16} />{t('Cadastrar propriedade')}</button>
        {webgl && <button className="btn btn-outline" onClick={locate}><LocateFixed size={16} />{t('Usar minha localização')}</button>}
      </div>
      {msg && <small className="empty-map-msg">{msg}</small>}
    </div>
  </div>
}
