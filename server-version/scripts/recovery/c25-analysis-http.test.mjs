/** New supplement pure fault contracts only. Importing the two modules below
 * does not import application code, open credentials or connect to services. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {MIXED_SCALE_CONTRACT,identityHash,assertScaleContract,screeningForm,supplementFlow,formFinal,scaleFinal,assertFinalRoute,buildSelector,assertAnalysisDrain} from './c25-analysis-http.mjs'
import {childBudget,realExportInvocation} from './c25-analysis-export.mjs'
const copy=value=>structuredClone(value),hash='a'.repeat(64)
const source=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8')
function scale(){return {id:'scale',creatorId:'teacher',status:'PUBLISHED',instrumentVersion:'2.0.0',instrumentClass:'CUSTOM_DESCRIPTIVE',definition:copy(MIXED_SCALE_CONTRACT),definitionHash:identityHash(MIXED_SCALE_CONTRACT)}}
function product(name='A'){
 const scale={id:'scale-'+name,type:'SCALE',required:true},form={id:'form-A',type:'FORM',formLabel:'route',formDefinition:{itemKey:'returned-stable-key'}}
 return {id:'product-'+name,publishedAt:'2026-10-19T00:00:00.000Z',items:name==='A'?[form,scale]:[scale],formSections:name==='A'?[{id:'section-A',items:[form]}]:[]}
}
function fixture(){return {courseId:'course',products:{A:product('A'),B:product('B')},cases:{MA:{attemptId:'MA',attemptEpoch:1,actorId:'M',taskId:'product-A'},SA:{attemptId:'SA',attemptEpoch:1,actorId:'S',taskId:'product-A'},MB:{attemptId:'MB',attemptEpoch:1,actorId:'M',taskId:'product-B'}}}}
function drain(){
 const f=fixture(),old=Array.from({length:148},(_,i)=>({id:'old-'+i,status:'PENDING',attemptCount:i%3})),baseline={queue:{id:'reports',pending:5},otherJobs:old}
 const specs={MA:{types:['FORM_SECTION','SCALE'],forms:1,scales:1,revision:2},SA:{types:['FORM_SECTION'],forms:1,scales:0,revision:1},MB:{types:['SCALE'],forms:0,scales:1,revision:1}}
 const cases=Object.entries(f.cases).map(([name,c])=>{const spec=specs[name];return {parent:{id:name,userId:c.actorId,compositeAssessmentId:c.taskId,deliveryCourseId:'course',attemptEpoch:1,asyncReportEpoch:1,status:'IN_PROGRESS',trainingFlowSnapshotEncrypted:'candidate-'+name,trainingFlowSnapshotHash:hash,trainingFlowPathEncrypted:'path-'+name,trainingFlowPathHash:hash,frozenActiveSlotSetEncrypted:'slots-'+name,frozenActiveSlotSetHash:hash,contextSnapshotHash:hash},job:{id:'job-'+name,attemptId:name,attemptEpoch:1,status:'PENDING',attemptCount:0,budgetHeld:true,requestedRevision:spec.revision,claimedRevision:0},forms:Array.from({length:spec.forms},()=>({id:'form-'+name})),scales:Array.from({length:spec.scales},()=>({id:'scale-'+name})),cognitive:[],sjt:[],checkpoints:[],snapshots:spec.types.map(type=>({id:name+type,compositeAttemptId:name,attemptEpoch:1,unitType:type,terminalState:'COMPLETED',ciphertext:'unchanged-'+type}))}})
 const before={cases,otherJobs:copy(old),queue:{id:'reports',pending:8}},after=copy(before)
 after.queue=copy(baseline.queue)
 for(const c of after.cases){c.parent.status='COMPLETED';c.parent.completedAt='natural';c.parent.taskSatisfaction=c.parent.id==='SA'?'NOT_SATISFIED':'SATISFIED';c.job.status='READY';c.job.attemptCount=1;c.job.budgetHeld=false;c.job.claimedRevision=c.job.requestedRevision}
 return {baseline,before,after,fixture:f}
}

test('prewrite scientific contract pins independent no=0 yes=1 identity weight=1 sum and full definition',()=>{
 const row=scale(),proof=assertScaleContract(row,{scaleId:'scale',teacherId:'teacher'})
 assert.deepEqual(proof.expectedTotals,{MA:1,MB:0});assert.equal(proof.definitionSha256,row.definitionHash)
 for(const change of [v=>v.definition.responseSets[0].options[0].score=1,v=>v.definition.responseSets[0].options[1].score=0,v=>v.definition.scoring.itemRules[0].transform.type='reverse',v=>v.definition.scoring.scores[0].source.items[0].weight=2,v=>v.definition.scoring.scores[0].source.aggregation='mean',v=>v.definition.items.push(copy(v.definition.items[0])),v=>v.definitionHash='b'.repeat(64),v=>v.creatorId='other',v=>v.status='DRAFT']){
  const bad=scale();change(bad);assert.throws(()=>assertScaleContract(bad,{scaleId:'scale',teacherId:'teacher'}))
 }
})
test('minimal V1 flow makes Form unconditional, screen terminal, remaining Scale unconditional',()=>{
 const form=screeningForm();assert.equal(form.required,true);assert.deepEqual(form.formOptions.map(row=>row.value),['full','screen'])
 const a=supplementFlow(product('A'),'A'),b=supplementFlow(product('B'),'B')
 assert.equal(a.schemaVersion,1);assert.deepEqual(a.blocks.map(row=>row.kind),['INSTRUMENT','END','INSTRUMENT'])
 assert.equal(a.blocks[0].when,undefined);assert.equal(a.blocks[1].termination,'SCREEN_OUT');assert.equal(a.blocks[1].when.value,'screen')
 assert.equal(a.blocks[1].when.field.itemKey,'returned-stable-key');assert.equal(a.blocks[2].when,undefined)
 assert.deepEqual(b,{schemaVersion:1,blocks:[{blockKey:'scale',kind:'INSTRUMENT',instrumentKey:'item_scale_B'}]})
 const bad=product('A');delete bad.formSections[0].items[0].formDefinition.itemKey;assert.throws(()=>supplementFlow(bad,'A'))
})
test('FINAL bodies bind actual returned epoch definition context and only legal new routes',()=>{
 const formAttempt={id:'MA',attemptEpoch:2,contextSnapshotHash:hash,currentItem:{id:'section',type:'FORM_SECTION',definitionHash:hash,answers:[{formItemId:'returned-form-id',label:'route'}]}}
 const f=formFinal(formAttempt,'screen');assert.equal(f.attemptEpoch,2);assert.equal(f.definitionHash,hash);assert.equal(f.contextSnapshotHash,hash);assert.deepEqual(f.answers,[{formItemId:'returned-form-id',value:'screen'}])
 const attempt={...formAttempt,currentItem:{id:'scale-item',type:'SCALE',definitionHash:hash,scale:{definition:{items:[{itemCode:'mixed-scale-item-1'}]}}}}
 assert.equal(scaleFinal(attempt,'no').answers[0].responseValue,'no');assert.throws(()=>scaleFinal(attempt,'0'))
 for(const helper of [value=>formFinal({...formAttempt,contextSnapshotHash:value},'full'),value=>scaleFinal({...attempt,contextSnapshotHash:value},'yes')]){assert.equal(helper(null).contextSnapshotHash,null);for(const bad of [undefined,'',false,'x'.repeat(64)])assert.throws(()=>helper(bad))}
 const absent=copy(formAttempt);delete absent.contextSnapshotHash;assert.throws(()=>formFinal(absent,'full'))
 assertFinalRoute('/composite-assessments/attempts/MA/items/scale-item/scale/submit',fixture())
 for(const route of ['/composite-assessments/attempts/old/items/scale-item/scale/submit','/composite-assessments/attempts/MA/checkpoint','/composite-assessments/attempts/MA/whole/submit'])assert.throws(()=>assertFinalRoute(route,fixture()))
})
test('selector uses two actual source scopes and rejects aliases material variants and foreign publication',()=>{
 const f=fixture(),list=['A','B'].map(name=>({taskId:f.products[name].id,taskName:name,publication:f.products[name].publishedAt,configDigest:null,variantKey:null,metrics:[{itemId:'scale-'+name,metricKey:'total',label:'Total'}]}))
 const selector=buildSelector({list},f);assert.deepEqual(selector.waves.map(row=>row.waveKey),['wave_a','wave_b'])
 assert.equal(selector.waves[0].taskId,'product-A');assert.equal(selector.waves[1].taskId,'product-B')
 for(const change of [v=>v.push(copy(v[0])),v=>v[1].taskId='product-A',v=>v[0].publication='wrong',v=>v[0].configDigest=hash,v=>v[0].variantKey='variant',v=>v[0].materialGroupKey='group',v=>v[0].metrics[0].itemId='other']){const bad=copy(list);change(bad);assert.throws(()=>buildSelector({list:bad},f))}
})
test('actual drain proves exact 2/1/1 revision four accepted snapshots no checkpoint and 148 old rows',()=>{
 assertAnalysisDrain(drain())
 const changes=[v=>v.baseline.otherJobs.pop(),v=>v.after.otherJobs[0].status='READY',v=>v.before.queue.pending++,v=>v.after.queue.pending++,v=>v.after.cases[0].job.attemptCount=2,v=>v.after.cases[0].job.id='replacement',v=>v.before.cases[0].job.requestedRevision=1,v=>v.after.cases[1].parent.taskSatisfaction='SATISFIED',v=>v.before.cases[1].scales.push({id:'forged-scale'}),v=>v.after.cases[1].snapshots.push({unitType:'SCALE'}),v=>v.after.cases[0].snapshots[0].ciphertext='changed',v=>v.before.cases[0].checkpoints.push({id:'new-checkpoint'}),v=>v.after.cases[0].parent.trainingFlowPathHash='changed']
 for(const change of changes){const bad=drain();change(bad);assert.throws(()=>assertAnalysisDrain(bad))}
})
test('child aggregate deadline is shorter than remaining phase and reserves kill/reap time',()=>{
 assert.deepEqual(childBudget('report',300000),{aggregate:120000,work:118000,killGrace:2000})
 assert.deepEqual(childBudget('export',300000),{aggregate:60000,work:58000,killGrace:2000})
 assert.deepEqual(childBudget('export',20000),{aggregate:19000,work:17000,killGrace:2000})
 for(const [kind,remaining] of [['unknown',300000],['report',4000],['export',NaN]])assert.throws(()=>childBudget(kind,remaining))
})
test('export wrapper preserves actual Redis payload identity and true attempts metadata',()=>{
 const job={id:'export-batch',data:{batchId:'batch'},opts:{attempts:2,backoff:{type:'fixed',delay:5000}},attemptsMade:1},call=realExportInvocation(job,'batch')
 assert.equal(call.data,job.data);assert.equal(call.id,String(job.id));assert.equal(call.opts.attempts,2);assert.equal(call.attemptsMade,1)
 for(const change of [v=>v.id='export-other',v=>v.data.batchId='other',v=>v.data.extra=true,v=>delete v.opts.attempts,v=>v.attemptsMade=-1]){const bad=copy(job);change(bad);assert.throws(()=>realExportInvocation(bad,'batch'))}
})
test('new driver source cannot use direct analysis, replay, checkpoint, global export processor or detached child',()=>{
 const http=source('c25-analysis-http.mjs'),exp=source('c25-analysis-export.mjs')
 assert.ok(!http.includes('analyzeTrainingCourse'));assert.ok(!http.includes('buildTrainingAnalysis('));assert.ok(!http.includes('assertTerminalBatch('))
 assert.ok(!http.includes("'/checkpoint'"));assert.ok(!http.includes("'/whole/submit'"));assert.ok(!http.includes('checkpointRoute('))
 assert.ok(http.includes("fixture.issued.filter(name=>name.startsWith('final-')).length,4"))
 assert.ok(http.includes("await clients.otherTeacher.request(route,'POST',{selector},404)"));assert.ok(http.includes("await clients.M.request(route,'POST',{selector},403)"))
 assert.equal((exp.match(/await runExportBatch\(call\)/g)||[]).length,1)
 assert.ok(exp.includes("dist/workers/exportBatchTask.js"));assert.ok(!exp.includes('exportProcessor'));assert.ok(!exp.includes('detached:true'));assert.ok(exp.includes('detached:false'))
 assert.ok(exp.includes('await redisJobAfter.getState()'));assert.ok(exp.includes("await teacher.request(status.downloadUrl.slice(4),'GET',undefined,200,true)"))
 assert.ok(exp.includes("await otherTeacher.request(routeFromHttp+'/status','GET',undefined,404)"));assert.ok(exp.includes("await otherTeacher.request(routeFromHttp,'GET',undefined,404)"))
 const entry=exp.slice(exp.indexOf('async function childMain()'))
 assert.ok(entry.indexOf('readAnalysisPrerequisites(state)')<entry.indexOf('api=await runtime()'))
 assert.ok(exp.includes("child.once('close'"));assert.ok(exp.includes("setTimeout(()=>signal('SIGKILL'),budget.killGrace)"))
})
