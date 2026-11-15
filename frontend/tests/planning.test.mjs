import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
const source=await readFile(new URL('../src/lib/planning.ts',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
const p=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
const farm={id:'test',name:'Teste',crop:'',previous_crop:'Milho',soil:{ph:null},goals:['soil'],indicators:['ph'],planning:{...p.defaultPlanning(),start_month:'2026-11',horizon_months:24},geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]},municipality:'Uberaba',state:'MG',country:'Brasil',notes:''}
test('24-month horizon crosses calendar years without wrapping',()=>assert.equal(p.addMonths('2026-11',23),'2028-10'))
test('history is five years ending yesterday, including leap-day handling',()=>assert.deepEqual(p.historyWindow(new Date(2024,1,29)),{start_date:'2019-02-28',end_date:'2024-02-28'}))
test('optional initial crop asks the integration to recommend it',()=>{const r=p.buildSimulationRequest(farm,new Date(2026,10,14));assert.equal(r.planning.initial_crop,null);assert.equal(r.planning.initial_crop_mode,'recommend');assert.equal(r.planning.end_month,'2028-10');assert.equal(r.history_window.end_date,'2026-11-13')})
test('provided crop and field-release dates are retained',()=>{const f={...farm,crop:'Café',planning:{...farm.planning,crop_status:'established',crop_end_month:'2027-05'}};const r=p.buildSimulationRequest(f);assert.equal(r.planning.initial_crop,'Café');assert.equal(r.planning.initial_crop_mode,'provided');assert.equal(r.planning.crop_end_month,'2027-05')})
test('legacy farms get defaults without changing their boundary',()=>{const f=p.normalizeFarm({...farm,crop:'não informado',planning:undefined,indicators:undefined});assert.equal(f.crop,'');assert.equal(f.planning.horizon_months,12);assert.equal(f.geometry,farm.geometry);assert.equal(f.indicators.length,6)})
test('pending integration never fabricates measurements or crops',()=>{const c=p.emptyContext(farm);assert.equal(c.status,'pending');assert.deepEqual(c.metrics,[]);assert.deepEqual(c.plan.cycles,[]);assert.equal(c.history.observed_through,null);assert.deepEqual(c.history.monthly,[])})
