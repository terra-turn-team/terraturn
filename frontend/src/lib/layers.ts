import {Sprout,CloudRain,ThermometerSun,Layers3,Wind,Mountain,Leaf,Droplets,Sun,ShieldAlert,TestTube2,ChartNoAxesColumnIncreasing,CloudSun,Ruler,Activity,Flower2,FlaskConical,ScanEye} from 'lucide-react'
export const LAYERS = [
 {value:'cultivo',label:'Cultivo',group:'Cultivo',icon:Sprout,source:'Cadastro / modelo botânico',status:'illustrative',description:'Modelo vegetal estilizado da cultura declarada'},
 {value:'cobertura_vegetal',label:'Cobertura vegetal',group:'Cultivo',icon:Leaf,source:'Landsat / MODIS',status:'pending',description:'Porcentagem de solo coberto e períodos descobertos'},
 {value:'ndvi',label:'NDVI / vigor vegetal',group:'Cultivo',icon:ChartNoAxesColumnIncreasing,source:'Landsat / MODIS',status:'pending',description:'Índice de vegetação normalizado (NDVI)'},
 {value:'evi',label:'EVI',group:'Cultivo',icon:Leaf,source:'MODIS',status:'pending',description:'Índice de vegetação realçado'},
 {value:'ndwi',label:'NDWI / água na vegetação',group:'Cultivo',icon:Droplets,source:'Landsat',status:'pending',description:'Índice espectral relacionado à água'},
 {value:'pragas',label:'Risco de pragas',group:'Cultivo',icon:ShieldAlert,source:'Modelos IA + registros locais',status:'pending',description:'Requer modelo validado e dados fitossanitários locais'},
 {value:'solo',label:'Textura do solo',group:'Solo',icon:Layers3,source:'Cadastro do produtor',status:'declared',description:'Textura informada no cadastro da propriedade'},
 {value:'ph',label:'pH do solo',group:'Solo',icon:TestTube2,source:'Análise local declarada',status:'declared',description:'pH declarado pelo usuário, quando preenchido'},
 {value:'materia_organica',label:'Matéria orgânica',group:'Solo',icon:Flower2,source:'Análise local declarada',status:'declared',description:'Teor de matéria orgânica inserido no cadastro'},
 {value:'umidade_solo',label:'Umidade do solo',group:'Solo',icon:Droplets,source:'NASA SMAP / GLDAS',status:'pending',description:'Estimativa regional, sujeita à resolução do produto'},
 {value:'erosao',label:'Susceptibilidade à erosão',group:'Solo',icon:ShieldAlert,source:'DEM + solo + chuva + cobertura',status:'pending',description:'Índice que exigirá validação local'},
 {value:'declividade',label:'Declividade',group:'Relevo',icon:Mountain,source:'DEM / SRTM',status:'pending',description:'Inclinação derivada de elevação geoespacial'},
 {value:'elevacao',label:'Elevação',group:'Relevo',icon:Ruler,source:'DEM / SRTM',status:'pending',description:'Altitude do terreno a partir de modelo digital de elevação'},
 {value:'chuva',label:'Chuva',group:'Clima',icon:CloudRain,source:'NASA POWER / GPM',status:'pending',description:'Precipitação histórica e distribuição temporal'},
 {value:'temperatura',label:'Temperatura',group:'Clima',icon:ThermometerSun,source:'NASA POWER / GEOS-FP',status:'pending',description:'Temperatura histórica e previsão quando disponível'},
 {value:'vento',label:'Ventos',group:'Clima',icon:Wind,source:'NASA POWER / GEOS-FP',status:'pending',description:'Velocidade e direção do vento'},
 {value:'radiacao',label:'Radiação solar',group:'Clima',icon:Sun,source:'NASA POWER',status:'pending',description:'Radiação incidente na superfície'},
 {value:'evapotranspiracao',label:'Evapotranspiração',group:'Clima',icon:CloudSun,source:'NASA POWER / ECOSTRESS',status:'pending',description:'Demanda evaporativa e perdas de água'},
 {value:'seca',label:'Risco de seca',group:'Clima',icon:ShieldAlert,source:'Precipitação + umidade + modelos',status:'pending',description:'Anomalias de chuva/umidade e tendências locais'},
 {value:'geada',label:'Risco de geada',group:'Clima',icon:ThermometerSun,source:'Temperatura + altitude + modelo',status:'pending',description:'Condições potencialmente favoráveis à geada'},
 {value:'calor',label:'Estresse térmico',group:'Clima',icon:Activity,source:'NASA POWER / ECOSTRESS',status:'pending',description:'Exposição da cultura a calor excessivo'},
 {value:'irrigacao',label:'Sistema de irrigação',group:'Manejo',icon:Droplets,source:'Cadastro do produtor',status:'declared',description:'Tipo de irrigação informado pelo usuário'},
] as const
export type WeatherLayer=(typeof LAYERS)[number]['value']
export type LayerDetails=(typeof LAYERS)[number]
export const getLayer=(id:WeatherLayer)=>LAYERS.find(x=>x.value===id)??LAYERS[0]
