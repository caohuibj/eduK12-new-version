/** Preparation only: production pure schemas, no database/API/queue imports. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {createRequire} from 'node:module'
import {randomUUID,createHash} from 'node:crypto'
const base=path.dirname(new URL(import.meta.url).pathname),backend=path.resolve(base,'../../backend'),require=createRequire(path.join(backend,'package.json'))
const {trainingFlowSchema}=require(path.join(backend,'dist/modules/questionnaire-product/training-flow-authoring.js'))
const {parseTrainingFlowDraft}=require(path.join(backend,'dist/modules/assessment-core/flow/training.js'))
const {materialOnlyExperimentSchema,groupQuotaPolicySchema}=require(path.join(backend,'dist/modules/assessment-core/materials/definition.js'))
const {assessmentKeySchema}=require(path.join(backend,'dist/modules/assessment-core/definition-primitives.js'))
const fixtureSource=fs.readFileSync(path.join(base,'c20-materials-fixture.mjs'),'utf8')
const context={products:"/questionnaire-products",assert,require,path,backend,Date,randomUUID,structuredClone,normalizeProduct:v=>v};vm.createContext(context)
vm.runInContext(fixtureSource.replace(/^import .*$/mg,'').replace(/^export /mg,'')+'\nthis.api={mainConfig,materialProduct,formMaterialProduct,unitKey,formRows};',context)
const section='11111111-1111-4111-8111-111111111111'
const rows=['route','multiple','likert'].map((label,index)=>({id:`22222222-2222-4222-8222-22222222222${index}`,type:'FORM',formLabel:label,formDefinition:{itemKey:'field_'+label},formSectionId:section}))
const items=[...rows,...['SCALE','COGNITIVE','SITUATIONAL'].map((type,index)=>({id:`33333333-3333-4333-8333-33333333333${index}`,type}))]
const product={id:'44444444-4444-4444-8444-444444444444',revision:1,items,formSections:[{id:section,items:rows}]}
const cases=[]
function check(label,config,maxAttempts=100){
 const plain=JSON.parse(JSON.stringify(config));trainingFlowSchema.parse({revision:1,config:plain,maxAttempts});parseTrainingFlowDraft(plain);materialOnlyExperimentSchema.parse(plain.experiment)
 if(plain.quotaPolicy){groupQuotaPolicySchema.parse(plain.quotaPolicy);assert.deepEqual(Object.keys(plain.quotaPolicy.groupLimits).sort(),plain.experiment.groups.map(g=>g.groupKey).sort())}
 assert.ok(Number.isInteger(maxAttempts)&&maxAttempts>=1&&maxAttempts<=100)
 for(const group of plain.experiment.groups){assessmentKeySchema.parse(group.groupKey);assert.ok(group.materialBody.length<=8000&&group.materialTitle.length<=8000)}
 cases.push({label,groups:plain.experiment.groups.length,configurationSha256:createHash('sha256').update(JSON.stringify(plain)).digest('hex')})
}
check('actual mainConfig',context.api.mainConfig(product))
// Capture the real generator's final config instead of retyping its shape.
context.capture=check
vm.runInContext('publish=async (_teacher,_product,config,maxAttempts=100)=>{capture("actual helper publish",config,maxAttempts);return _product}',context)
const teacher={request:async()=>JSON.parse(JSON.stringify(product))},fixture={courseId:'course',scaleId:'scale',assignmentId:'assignment',sjt:{release:{instrumentKey:'instrument',instrumentVersion:'1'}}}
for(const type of ['FORM','SCALE','COGNITIVE','SITUATIONAL'])await context.api.materialProduct(teacher,fixture,{firstType:type,maxAttempts:2})
for(const options of [{},{limits:{a:10,b:10},maxAttempts:2},{limits:null},{linkedPolicy:'RERANDOMIZE'}])await context.api.formMaterialProduct(teacher,fixture,options)
// Extract actual companion config expressions; these files are not imported.
const expression=(file,start)=>{const text=fs.readFileSync(path.join(base,file),'utf8'),begin=text.indexOf(start);assert.ok(begin>=0,file);const tail=text.slice(begin+start.length);return tail.slice(0,tail.indexOf('\n')).replace(/;\s*$/,'')}
const scope={cost:{experimentKey:"cost_same_experiment"},structuredClone,fixture:{product:{...product,trainingFlowFrozen:context.api.mainConfig(product),trainingFlowDraft:context.api.mainConfig(product)}},experimentKey:'cost_same_experiment',costExperimentKey:'cost_same_experiment',product,partial:product,scale:items[3],section:rows[0],formItem:rows[0],unitKey:context.api.unitKey,formRows:context.api.formRows,randomUUID}
for(const file of ['c20-materials-consumers.mjs','c20-materials-consumer-cost.mjs']){
 const code=expression(file,'const config=');check(file,vm.runInNewContext('('+code+')',scope))
}
const revoke=fs.readFileSync(path.join(base,'c20-materials-revocation.mjs'),'utf8').split('\n').find(line=>line.includes('product=await publish(teacher,product,'))
const revokeConfig=revoke.slice(revoke.indexOf('publish(teacher,product,')+'publish(teacher,product,'.length).trim().slice(0,-1)
check('actual revocation config',vm.runInNewContext('('+revokeConfig+')',{...scope,type:'SCALE'}))
for(const count of [2,8]){
 const groups=Array.from({length:count},(_,i)=>({groupKey:String.fromCharCode(97+i),weight:1,materialTitle:'Same title',materialBody:'x'.repeat(8000)}))
 const text=fs.readFileSync(path.join(base,'c20-materials-cost.mjs'),'utf8'),line=text.split('\n').find(line=>line.includes('const groups=')),code=line.slice(line.indexOf(',config=')+8).replace(/;?\s*$/,'')
 check('actual 2-vs-8 cost '+count,vm.runInNewContext('('+code+')',{groups,candidateProduct:product,unitKey:context.api.unitKey,formRows:context.api.formRows}))
}
// Deliberately invalid authoring cases remain negative, never normalized away.
assert.ok(!Object.keys(require.cache).some(file=>/[/]dist[/]config[/](database|queue)[.]js$/.test(file)),'Pure preparation must not import database or queue runtime')
const invalid=JSON.parse(JSON.stringify(context.api.mainConfig(product)));invalid.experiment.groups[0].groupKey='A'
assert.throws(()=>parseTrainingFlowDraft(invalid));assert.throws(()=>materialOnlyExperimentSchema.parse({...invalid.experiment,groups:[invalid.experiment.groups[0]]}))
const sourceFiles=['c20-materials-fixture.mjs','c20-materials-consumers.mjs','c20-materials-consumer-cost.mjs','c20-materials-cost.mjs','c20-materials-revocation.mjs'];const sources=Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(base,file))).digest('hex')]))
console.log(JSON.stringify({passed:true,positiveConfigurationCount:cases.length,sources,scope:'PURE_CONFIG_PREPARATION_ONLY_NOT_FUNCTIONAL_QUALIFICATION',positiveConfigurations:cases,negativeCases:['uppercase group key','one group']},null,2))
