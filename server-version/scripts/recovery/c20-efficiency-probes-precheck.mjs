/** Pure helpers and positive-schema preparation. No database, HTTP, queue or service startup. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {createHash,randomUUID} from 'node:crypto'
import vm from 'node:vm'
export function sameIds(actual,expected,label='exact source membership'){
 assert.equal(new Set(actual).size,actual.length,label+': duplicate actual id')
 assert.equal(new Set(expected).size,expected.length,label+': duplicate expected id')
 assert.deepEqual([...actual].sort(),[...expected].sort(),label)
}
export function exactCompletedCutoff(expectedIds,allCompletedRows){
 const selected=allCompletedRows.filter(row=>expectedIds.includes(row.id))
 sameIds(selected.map(row=>row.id),expectedIds,'selected completed rows')
 assert.ok(selected.length>0)
 for(const row of selected)assert.ok(row.completedAt&&Number.isFinite(new Date(row.completedAt).getTime()))
 const end=new Date(Math.max(...selected.map(row=>new Date(row.completedAt).getTime()))).toISOString()
 sameIds(allCompletedRows.filter(row=>row.completedAt&&new Date(row.completedAt)<=new Date(end)).map(row=>row.id),expectedIds,'inclusive completedAt cutoff must select exact IDs; ties/extras fail')
 return {end}
}
export function minimalConfig(product,unitKey,formRows){
 return {schemaVersion:2,experiment:{experimentKey:'efficiency_'+product.id.replaceAll('-',''),linkedPolicy:'RERANDOMIZE',groups:[{groupKey:'a',weight:1,materialTitle:'Resource A',materialBody:'Synthetic resource probe A'},{groupKey:'b',weight:1,materialTitle:'Resource B',materialBody:'Synthetic resource probe B'}]},quotaPolicy:{schemaVersion:1,groupLimits:{a:1,b:1}},blocks:[{blockKey:'form',kind:'INSTRUMENT',instrumentKey:unitKey(formRows(product)[0])},{blockKey:'scale',kind:'INSTRUMENT',instrumentKey:unitKey(product.items.find(item=>item.type==='SCALE'))}]}
}
export function csvArtifactName(stage,wave){assert.ok([11,21,51].includes(stage));assert.ok([0,1].includes(wave));return `c20-efficiency-direct-${stage}-wave-${wave}-private.csv`}
export function assertStableCsv(actual,expected){assert.ok(Buffer.isBuffer(actual)&&Buffer.isBuffer(expected));assert.deepEqual(actual,expected,'CSV bytes changed; no automatic metadata/difference allowance')}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend'),require=createRequire(path.join(backend,'package.json'))
 const {trainingFlowSchema}=require(path.join(backend,'dist/modules/questionnaire-product/training-flow-authoring.js'))
 const {parseTrainingFlowDraft,trainingFlowUnitKey,trainingFlowItemKey}=require(path.join(backend,'dist/modules/assessment-core/flow/training.js'))
 const section='11111111-1111-4111-8111-111111111111',form={id:'22222222-2222-4222-8222-222222222222',type:'FORM',formSectionId:section},scale={id:'33333333-3333-4333-8333-333333333333',type:'SCALE'}
 const product={id:'44444444-4444-4444-8444-444444444444',items:[form,scale]},config=minimalConfig(product,item=>item.type==='FORM'?trainingFlowUnitKey(item.formSectionId):trainingFlowItemKey(item.id),p=>p.items.filter(item=>item.type==='FORM'))
 trainingFlowSchema.parse({revision:1,config,maxAttempts:1});parseTrainingFlowDraft(config)
 const fixtureSource=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'c20-materials-fixture.mjs'),'utf8'),context={require,path,backend,assert,randomUUID}
 vm.createContext(context);vm.runInContext(fixtureSource.replace(/^import .*$/mg,'').replace(/^export /mg,'')+'\nthis.makeMain=mainConfig;',context)
 const forms=['route','multiple','likert'].map((formLabel,index)=>({...form,id:'22222222-2222-4222-8222-22222222222'+index,formLabel,formDefinition:{itemKey:'field_'+formLabel}})),native=['SCALE','COGNITIVE','SITUATIONAL'].map((type,index)=>({...scale,id:'33333333-3333-4333-8333-33333333333'+index,type}))
 const four={...product,items:[...forms,...native],formSections:[{id:section,items:forms}]},fallback=JSON.parse(JSON.stringify(context.makeMain(four)))
 trainingFlowSchema.parse({revision:1,config:fallback,maxAttempts:100});parseTrainingFlowDraft(fallback)
 assert.ok(config.experiment.groups.every(group=>/^[a-z][a-z0-9_]*$/.test(group.groupKey)))
 const upper=structuredClone(config);upper.experiment.groups[0].groupKey='A';assert.throws(()=>parseTrainingFlowDraft(upper))
 const rows=[{id:'a',completedAt:'2026-01-01T00:00:01.000Z'},{id:'b',completedAt:'2026-01-01T00:00:02.000Z'}]
 assert.deepEqual(exactCompletedCutoff(['a'],rows),{end:rows[0].completedAt})
 assert.throws(()=>exactCompletedCutoff(['a'],[rows[0],{...rows[1],completedAt:rows[0].completedAt}]))
 assert.throws(()=>sameIds(['a','a'],['a','b']));assert.throws(()=>assertStableCsv(Buffer.from('a'),Buffer.from('b')))
 assertStableCsv(Buffer.from('\uFEFFa\r\n1'),Buffer.from('\uFEFFa\r\n1'))
 assert.ok(!Object.keys(require.cache).some(file=>/[/]dist[/]config[/](database|queue)[.]js$/.test(file)))
 const names=['c20-efficiency-probes-precheck.mjs','c20-efficiency-consumers.mjs','c20-efficiency-chains.mjs','c20-materials-fixture.mjs'],base=path.dirname(fileURLToPath(import.meta.url))
 const sources=Object.fromEntries(names.map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(base,name))).digest('hex')]))
 console.log(JSON.stringify({passed:true,scope:'PURE_SCHEMA_AND_EXACT_SELECTION_PRECHECK_ONLY',sources,positiveCases:4,negativeCases:['uppercase key','timestamp tie extra row','duplicate ids','changed CSV bytes']}))
}
