import { create } from 'zustand'
import type { WeatherLayer } from '../types'
type ViewState = {
  selectedFarmId: string|null
  setSelectedFarmId: (id:string|null)=>void
  monthIndex: number
  setMonthIndex: (n:number)=>void
  layer: WeatherLayer
  setLayer: (layer:WeatherLayer)=>void
  selectedTab: 'timeline'|'assistant'
  setSelectedTab: (tab:'timeline'|'assistant')=>void
  rainfallPct: number
  setRainfallPct: (percent:number)=>void
  tempDeltaC: number
  setTempDeltaC: (delta:number)=>void
  latestAction: string
  showAction: (text:string)=>void
}
export const useViewStore = create<ViewState>((set)=>({
  selectedFarmId: null, setSelectedFarmId: id => set({ selectedFarmId:id }),
  monthIndex: new Date().getMonth(), setMonthIndex: n => set({monthIndex:((n%12)+12)%12}),
  layer: 'cultivo', setLayer: layer => set({layer}),
  selectedTab: 'timeline', setSelectedTab: selectedTab=>set({selectedTab}),
  rainfallPct: 0, setRainfallPct: rainfallPct => set({rainfallPct}),
  tempDeltaC: 0, setTempDeltaC: tempDeltaC => set({tempDeltaC}),
  latestAction: '', showAction: latestAction => set({latestAction})
}))
