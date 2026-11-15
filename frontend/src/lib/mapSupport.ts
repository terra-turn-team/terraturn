let supported:boolean|undefined
export function hasWebGL(){if(supported!==undefined)return supported;try{const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2');supported=!!gl;gl?.getExtension('WEBGL_lose_context')?.loseContext()}catch{supported=false}return supported}

export const SATELLITE_TILES:string=import.meta.env.VITE_SATELLITE_TILES||'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
export const SATELLITE_ATTRIBUTION:string=import.meta.env.VITE_SATELLITE_ATTRIBUTION||'Imagery © Esri, Maxar, Earthstar Geographics & GIS User Community'
