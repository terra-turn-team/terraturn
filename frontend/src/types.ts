export type User={id:string;name:string;email:string;can_edit_farms?:boolean}
export type GeoPolygon={type:'Polygon';coordinates:number[][][]}
export type Soil={texture:'unknown'|'sandy'|'loamy'|'clayey'|'silty';ph:number|null;organic_matter_percent:number|null;irrigation:'rainfed'|'irrigated'|'mixed'|'unknown'}
export type Goal='water'|'soil'|'resilience'|'yield'|'cost'|'fertility'|'erosion'|'phytosanitary'|'diversity'|'margin'
export type Indicator='rainfall'|'temperature'|'water_balance'|'soil_moisture'|'ph'|'organic_matter'|'cover'|'ndvi'|'erosion_risk'|'pest_risk'|'yield'|'cost'|'margin'
export type Planning={start_month:string;horizon_months:number;crop_status:'established'|'planned'|'unspecified';crop_start_month:string|null;crop_end_month:string|null}
export type FarmInput={name:string;locality:string;municipality:string;state:string;country:string;crop:string;previous_crop:string;planting_month:number|null;soil:Soil;goals:Goal[];indicators:Indicator[];planning:Planning;notes:string;geometry:GeoPolygon}
export type Farm=FarmInput&{id:string;area_ha:number;centroid:number[];created_at:string;updated_at:string}
export type {WeatherLayer} from './lib/layers'
export type ChatItem={id:string;role:'assistant'|'user';text:string;time:string}
export type AgronomyMetric={id:Indicator;value:number|null;unit:string;source:string;kind:'observed'|'estimated';date:string;resolution?:string;uncertainty?:string}
export type ClimateMonth={month:string;precipitation_mm:number|null;temperature_c:number|null}
export type RotationCycle={crop:string;kind:'commercial'|'cover';start_month:string;end_month:string;rationale:string;uncertainty:string}
export type RotationPlan={status:'not_connected'|'processing'|'ready';model_version?:string;generated_at?:string;cycles:RotationCycle[];warnings:string[]}
export type AgronomyContext={schema_version:'1.0';farm_id:string;status:'pending'|'partial'|'ready';history:{start_date:string;end_date:string;observed_through:string|null;completeness_percent:number;source:string;resolution:string|null;monthly:ClimateMonth[]};metrics:AgronomyMetric[];plan:RotationPlan}
