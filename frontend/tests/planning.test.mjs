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

const mdSource=await readFile(new URL('../src/lib/markdown.ts',import.meta.url),'utf8')
const md=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(mdSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'))
test('chat markdown turns asterisks into bold and lists instead of showing them',()=>{
  const b=md.parseMarkdown('**Rain on your farm**\n- **Monthly average:** May 109 mm\n- Start of rains: *23 April*\n\n1. Soy\n2. Maize')
  assert.deepEqual(b[0],{type:'p',lines:[[{type:'strong',text:'Rain on your farm'}]]})
  assert.equal(b[1].type,'ul');assert.deepEqual(b[1].items[0],[{type:'strong',text:'Monthly average:'},{type:'text',text:' May 109 mm'}])
  assert.deepEqual(b[1].items[1][1],{type:'em',text:'23 April'})
  assert.equal(b[2].type,'ol');assert.equal(b[2].items.length,2)
  assert.equal(JSON.stringify(b).includes('**'),false)
})
test('chat markdown keeps plain math and snake_case untouched',()=>assert.deepEqual(md.parseInline('2 * 3 * 4 and crop_status'),[{type:'text',text:'2 * 3 * 4 and crop_status'}]))
test('summary keeps the first sentence when it has a decimal number',()=>{
  const t='Sow sorghum in February, with February rainfall about 160.9 mm. Sorghum tolerates dry weather. Third sentence.'
  const r=md.firstSentences(t,2)
  assert.equal(r.short,'Sow sorghum in February, with February rainfall about 160.9 mm. Sorghum tolerates dry weather.')
  assert.equal(r.more,true)
  assert.deepEqual(md.firstSentences('Only one.',2),{short:'Only one.',more:false})
})
