/** Serial, functional query-budget producer, not a concurrency/capacity test.
 * 51 bounded fresh participants x 2 fresh V2 Scale+Form publications. Every
 * accepted FINAL and report outbox uses real HTTP and original production code.
 * Measure at 10/20/50 completed cost_a participants (plus 0/1 cost_b), never duplicate one attempt to
 * manufacture cardinality. Dynamic execution belongs only to the locked launcher.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {harness,prisma,require,backend,products,prefix,sha,children,drainReports,candidateProof} from './c20-materials-client.mjs'
import {logins,participant,form,formRows,formBody,unitKey,publish} from './c20-materials-fixture.mjs'
const {trainingFlowDraftSchema}=require(path.join(backend,'dist/modules/assessment-core/flow/training.js'))
const {trainingAnalysisSelectorSchema}=require(path.join(backend,'dist/modules/training-analysis/manifest.js'))
const {analyzeTrainingCourse}=require(path.join(backend,'dist/modules/training-analysis/service.js'))
const {getReportForTeacher,getExportContext}=require(path.join(backend,'dist/modules/composite/composite.service.js'))
const {compositeExportService}=require(path.join(backend,'dist/modules/composite/composite-export.service.js'))
const {resolveCompositeExportProjectionBinding,projectCompositeExportData}=require(path.join(backend,'dist/modules/composite/composite-export-projection.js'))
const h=harness('consumer-cost');let error,active=null
// Transparent observation wrappers call the untouched production implementation
// exactly once with original arguments/this; no synthetic return or bypass.
const security=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const allocation=require(path.join(backend,'dist/modules/composite/training-material-allocation.js'))
const originalDecrypt=security.decryptUnifiedRuntimePayload,originalValidate=allocation.assertTrainingMaterialAssignment
security.decryptUnifiedRuntimePayload=function(...args){const value=originalDecrypt.apply(this,args);if(active){active.unifiedDecryptCalls++;active.unifiedCipherBytes+=Buffer.byteLength(args[0]);active.unifiedPlainJsonBytes+=Buffer.byteLength(JSON.stringify(value))}return value}
allocation.assertTrainingMaterialAssignment=function(...args){const value=originalValidate.apply(this,args);if(active)active.assignmentValidations++;return value}
const file='c20-consumer-cost-fixture-private.json',cost={schemaVersion:1,products:[],people:[],stages:[]}
const save=()=>h.write(file,cost)
// Passive observers only: no replacement/mock and no altered returned row/query.
// Parameters and raw SQL are kept out of result; only safe query shape hashes.
prisma.$on('query',event=>{if(active)active.sql.push({shapeHash:sha(event.query.replace(/\$\d+/g,'?')),durationMs:event.duration,query:event.query})})
prisma.$use(async(params,next)=>{
 const observer=active,key=(params.model??'RAW')+'.'+params.action
 if(observer){observer.calls.push({model:params.model??'RAW',action:params.action});if(['AssessmentUnitSnapshot','Assessment','CompositeFormAnswer','CompositeAssessmentAttempt'].includes(params.model)&&['findMany','count','aggregate'].includes(params.action))assert.ok(params.args?.where&&Object.keys(params.args.where).length,'Consumer historical row scan lacks a source bound')}
 const value=await next(params)
 if(observer&&params.model==='CompositeAssessment'&&Array.isArray(value?.attempts)){observer.sourceGraphLoads++;observer.sourceGraphParentRows+=value.attempts.length}
 if(observer&&(['findMany','findFirst','findFirstOrThrow','findUnique','findUniqueOrThrow','queryRaw','queryRawUnsafe'].includes(params.action))){observer.returnedRows[key]=(observer.returnedRows[key]??0)+(Array.isArray(value)?value.length:value==null?0:1)}
 return value
})
async function measure(label,n,fn,metadata={}){
 assert.equal(active,null);const observed={sql:[],calls:[],returnedRows:{},sourceGraphLoads:0,sourceGraphParentRows:0,unifiedDecryptCalls:0,unifiedCipherBytes:0,unifiedPlainJsonBytes:0,assignmentValidations:0};active=observed;const started=performance.now();let value
 try{value=await fn()}finally{active=null}
 assert.ok(observed.sql.length>0,'Real Prisma SQL event collection required');assert.ok(observed.unifiedDecryptCalls>0,'Production decrypt observer must see real bytes');assert.ok(observed.assignmentValidations>0,'Production V2 assignment validation must run for measured consumers')
 const materialQueries=observed.sql.filter(event=>/\btraining_material_(allocation_claims|quota_buckets|subject_bindings|experiments)\b/i.test(event.query))
 assert.equal(materialQueries.length,0,'Consumer reads must validate frozen assignment, never scan allocation history or quota')
 const calls={};for(const call of observed.calls){const key=call.model+'.'+call.action;calls[key]=(calls[key]??0)+1}
 const shapes={};for(const event of observed.sql)shapes[event.shapeHash]=(shapes[event.shapeHash]??0)+1
 const summary={label,selectedMaterialGroup:'cost_a',selectedGroupParticipantsPerWave:n,totalCompletedParticipantsPerWave:cost.people.length,completedParents:cost.people.length*2,sqlCount:observed.sql.length,sqlDurationMs:observed.sql.reduce((sum,event)=>sum+event.durationMs,0),elapsedMs:performance.now()-started,responseJsonBytes:Buffer.byteLength(JSON.stringify(value)),modelCalls:calls,returnedTopLevelRowsByOperation:observed.returnedRows,sourceGraphLoads:observed.sourceGraphLoads,sourceGraphParentRows:observed.sourceGraphParentRows,returnedRowScope:'Actual Prisma top-level rows materialized, including repeated graph reads; excludes nested relation counts and physical PostgreSQL tuples examined',sqlShapeCounts:shapes,materialHistorySqlCount:0,unifiedDecryptCalls:observed.unifiedDecryptCalls,unifiedCipherBytes:observed.unifiedCipherBytes,unifiedPlainJsonBytes:observed.unifiedPlainJsonBytes,assignmentValidations:observed.assignmentValidations,scope:'DIRECT_REAL_PG_PRODUCTION_DIST_SINGLE_SERIAL_OPERATION; NOT_MOCK_OR_CAPACITY',...metadata}
 h.result.measurements.push(summary);h.write('c20-consumer-cost-progress-private.json',h.result)
 return value
}
function boundedAcrossStages(label){
 const rows=h.result.measurements.filter(item=>item.label===label);assert.deepEqual(rows.map(row=>row.selectedGroupParticipantsPerWave),[10,20,50])
 const baseline=rows[0]
 for(const row of rows.slice(1)){
  assert.ok(row.sqlCount<=baseline.sqlCount+2,`${label}: SQL grew from ${baseline.sqlCount} to ${row.sqlCount}; investigate N+1, do not relax silently`)
  for(const [key,count]of Object.entries(row.modelCalls))assert.ok(count<=(baseline.modelCalls[key]??0)+1,`${label}: ${key} grew from ${baseline.modelCalls[key]??0} to ${count}`)
 }
 return {label,sqlCounts:rows.map(row=>row.sqlCount),maxFixedSqlAllowance:2,maxFixedModelCallAllowance:1}
}
try{
 assert.ok(!fs.existsSync(path.join(h.state,file)),'Existing cost fixture must be preserved; explicit continuation required')
 assert.equal(process.env.PERF_ISOLATED_TEST_MODE,'1');assert.equal(process.env.PERF_SQL_EVENT_COUNT,'1')
 const fixture=h.read('c20-fixture-private.json'),{teacher}=await logins(h,fixture)
 cost.experimentKey='cost_'+randomUUID().replaceAll('-','');save()
 for(let wave=0;wave<2;wave++){
  let product=await teacher.request(products,'POST',{requestId:randomUUID(),name:`C20 cost Scale Form wave ${wave+1}`,questionnaireType:'COURSE',courseIds:[fixture.courseId],publicEnabled:false})
  cost.products.push(product);save()
  for(const item of [{type:'SCALE',scaleId:fixture.scaleId,required:true},form('cost_form')])product=await teacher.request(`${products}/${product.id}/items`,'POST',{revision:product.revision,item})
  const scale=product.items.find(item=>item.type==='SCALE'),section=formRows(product)[0]
  const config={schemaVersion:2,experiment:{experimentKey:cost.experimentKey,linkedPolicy:'KEEP_LINKED',groups:[{groupKey:'cost_a',weight:1,materialTitle:'Cost A',materialBody:'Synthetic cost A'},{groupKey:'cost_b',weight:1,materialTitle:'Cost B',materialBody:'Synthetic cost B'}]},quotaPolicy:{schemaVersion:1,groupLimits:{cost_a:50,cost_b:1}},blocks:[{blockKey:'scale',kind:'INSTRUMENT',instrumentKey:unitKey(scale)},{blockKey:'form',kind:'INSTRUMENT',instrumentKey:unitKey(section)}]}
  trainingFlowDraftSchema.parse(config)
  product=await publish(teacher,product,config);cost.products[wave]=product;save()
 }
 const actor={userId:fixture.users.teacher.id,role:'TEACHER'}
 for(let index=0;index<51;index++){
  const {user,client}=await participant(h,fixture,'consumer-cost-'+index),person={user,attempts:[]};cost.people.push(person);save()
  for(const product of cost.products){
   let {attempt}=await client.request(`${prefix}/${product.id}/attempts`,'POST',{});person.attempts.push({productId:product.id,attemptId:attempt.id});save()
   const admitted=await candidateProof(attempt.id),group=admitted.candidate.materialAssignment.groupKey;assert.ok(['cost_a','cost_b'].includes(group));if(person.materialGroupKey)assert.equal(group,person.materialGroupKey,'KEEP_LINKED must preserve group across publications');else person.materialGroupKey=group;person.attempts.at(-1).assignmentHash=admitted.candidate.materialAssignment.assignmentHash;save()
   assert.equal(attempt.currentItem.type,'SCALE');const scale=product.items.find(item=>item.type==='SCALE')
   await client.request(`${prefix}/attempts/${attempt.id}/items/${scale.id}/scale/submit`,'POST',{submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:attempt.currentItem.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:[{itemCode:'mixed-scale-item-1',responseValue:person.materialGroupKey==='cost_a'?'yes':'no',responseTimeMs:13}]})
   attempt=await client.request(`${prefix}/attempts/${attempt.id}`);assert.equal(attempt.currentItem.type,'FORM_SECTION')
   await client.request(`${prefix}/attempts/${attempt.id}/form-sections/${attempt.currentItem.id}/submit`,'POST',formBody(attempt))
   attempt=await client.request(`${prefix}/attempts/${attempt.id}`);assert.equal(attempt.allUnitsSubmitted,true)
   person.attempts.at(-1).finalAccepted=true;save()
  }
  const n=cost.people.filter(person=>person.materialGroupKey==='cost_a').length;if(person.materialGroupKey!=='cost_a'||![10,20,50].includes(n))continue
  const total=cost.people.length,bCount=total-n;assert.ok(bCount===0||bCount===1)
  const ids=cost.people.flatMap(person=>person.attempts.map(item=>item.attemptId))
  assert.equal(new Set(cost.people.map(person=>person.user.id)).size,total);assert.equal(new Set(ids).size,total*2)
  await drainReports(h,ids)
  assert.equal(await prisma.compositeAssessmentAttempt.count({where:{id:{in:ids},status:'COMPLETED'}}),total*2)
  const sourceList=await teacher.request(`/courses/${fixture.courseId}/training-analysis/sources`)
  const selector={schemaVersion:1,courseId:fixture.courseId,mode:'PAIRWISE',waves:cost.products.map((product,index)=>{
   const source=sourceList.list.find(item=>item.taskId===product.id&&item.materialGroupKey==='cost_a');assert.ok(source)
   const metric=source.metrics.find(metric=>metric.metricKey==='total'&&product.items.some(item=>item.id===metric.itemId&&item.type==='SCALE'));assert.ok(metric)
   const {taskName,...wave}=source;return {...wave,waveKey:'cost_wave_'+index,metrics:[{itemId:metric.itemId,metricKey:metric.metricKey}]}
  })}
  trainingAnalysisSelectorSchema.parse(selector)
  const analyzed=await teacher.request(`/courses/${fixture.courseId}/training-analysis`,'POST',{selector})
  const analysis=await measure('full-two-wave-analysis',n,()=>analyzeTrainingCourse({actor:{id:actor.userId,role:actor.role},courseId:fixture.courseId,selector,sourceCutoff:analyzed.manifest.sourceCutoff,includeTables:true}))
  assert.equal(analysis.manifest.manifestHash,analyzed.manifest.manifestHash);assert.equal(analysis.tables.long.rows.length,n*2)
  assert.ok(analysis.tables.long.rows.every(row=>row.materialGroupKey==='cost_a'&&row.value===1&&row.reason===null));assert.equal(new Set(analysis.tables.long.rows.map(row=>row.participantKey)).size,n)
  // V2 currently exposes a per-attempt teacher report, not a batched report API.
  // Probe a different real participant at each database population cardinality.
  const item=person.attempts[0],proof=await candidateProof(item.attemptId)
  const httpReport=await teacher.request(`${prefix}/${item.productId}/attempts/${item.attemptId}/report`)
  const report=await measure('single-teacher-report-at-population',n,()=>getReportForTeacher(actor.userId,actor.role,item.productId,item.attemptId))
  assert.equal(report.trainingFlow.pathHash,httpReport.trainingFlow.pathHash);assert.equal(report.trainingFlow.pathHash,proof.row.trainingFlowPathHash)
  const exported=await measure('full-composite-export-projection',n,async()=>{
   await getExportContext(actor.userId,actor.role,cost.products[0].id)
   const binding=await resolveCompositeExportProjectionBinding(cost.products[0].id,'teacher')
   return projectCompositeExportData(await compositeExportService.getExportData(cost.products[0].id,{actor,anonymize:true,detail:'full'}),binding)
  })
  assert.equal(exported.rows.length,total);assert.equal(new Set(exported.rows.map(row=>row.A_attempt_id)).size,total);assert.equal(exported.rows.filter(row=>row.M_group_key==='cost_a').length,n);assert.equal(exported.rows.filter(row=>row.M_group_key==='cost_b').length,bCount)
  for(const row of exported.rows){assert.match(row.M_assignment_hash,/^[a-f0-9]{64}$/);assert.ok(['cost_a','cost_b'].includes(row.M_group_key))}
  cost.stages.push({selectedMaterialGroup:'cost_a',selectedGroupParticipantsPerWave:n,totalCompletedParticipantsPerWave:total,completedB:bCount,selector,attemptIds:ids,manifestHash:analysis.manifest.manifestHash,measuredScaleValue:1});save()
  h.check(`C20 cost_a ${n} completed per wave; export total ${total} with cost_b ${bCount}: real analysis, authorized full export and individual teacher report measured without allocation-history SQL`)
 }
 h.result.queryBudgets=['full-two-wave-analysis','single-teacher-report-at-population','full-composite-export-projection'].map(boundedAcrossStages)
 assert.equal(cost.people.filter(person=>person.materialGroupKey==='cost_a').length,50);assert.equal(cost.people.filter(person=>person.materialGroupKey==='cost_b').length,1)
 const finalIds=cost.people.flatMap(person=>person.attempts.map(item=>item.attemptId))
 await drainReports(h,finalIds)
 assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:{in:finalIds}}}),204)
 const jobs=await prisma.compositeReportJob.findMany({where:{attemptId:{in:finalIds}}});assert.equal(jobs.length,102);assert.ok(jobs.every(job=>job.status==='READY'&&job.attemptCount===1))
 h.result.finals={participants:51,materialGroupCounts:{cost_a:50,cost_b:1},publications:2,completedParents:102,acceptedSnapshots:204,originalOutboxes:102,claimAttemptsEach:1}
 // Independent hand-calculated B=0 must never pool with A=1. Both selectors
 // use actual discovery group identities, not a client-side row filter.
 const sourceList=await teacher.request(`/courses/${fixture.courseId}/training-analysis/sources`)
 h.result.groupSeparation=[]
 for(const [group,expectedN,expectedValue]of [['cost_a',50,1],['cost_b',1,0]]){
  const selector={schemaVersion:1,courseId:fixture.courseId,mode:'PAIRWISE',waves:cost.products.map((product,index)=>{const source=sourceList.list.find(item=>item.taskId===product.id&&item.materialGroupKey===group);assert.ok(source);const metric=source.metrics.find(metric=>metric.metricKey==='total'&&product.items.some(item=>item.id===metric.itemId&&item.type==='SCALE'));assert.ok(metric);const {taskName,...wave}=source;return {...wave,waveKey:'group_wave_'+index,metrics:[{itemId:metric.itemId,metricKey:metric.metricKey}]}})}
  trainingAnalysisSelectorSchema.parse(selector)
  const http=await teacher.request(`/courses/${fixture.courseId}/training-analysis`,'POST',{selector})
  const direct=await analyzeTrainingCourse({actor:{id:actor.userId,role:actor.role},courseId:fixture.courseId,selector,sourceCutoff:http.manifest.sourceCutoff,includeTables:true})
  assert.equal(direct.manifest.manifestHash,http.manifest.manifestHash);assert.equal(direct.tables.long.rows.length,expectedN*2)
  const allowedIds=new Set(cost.people.filter(person=>person.materialGroupKey===group).flatMap(person=>person.attempts.map(item=>item.attemptId)))
  assert.ok(direct.tables.long.rows.every(row=>row.materialGroupKey===group&&row.value===expectedValue&&row.reason===null&&allowedIds.has(row.attemptId)))
  assert.ok(direct.manifest.sources.every(source=>source.materialGroupKey===group&&allowedIds.has(source.attemptId)))
  h.result.groupSeparation.push({group,participantsPerWave:expectedN,observationCount:direct.tables.long.rows.length,independentExpectedScale:expectedValue,manifestHash:direct.manifest.manifestHash})
 }
 h.check('Bounded 51-person quota population yields exact A50/B1 across both publications; actual group-specific analysis keeps hand-calculated A=1 and B=0 separate')
 // A single-wave single-group request is not part of the supported API.
 // Hold a second-publication A anchor fixed and use FULL_CASE for both runs.
 // The extra target B stratum is intentionally mutually exclusive with target A:
 // this is a consumer-cost probe, not a meaningful paired treatment estimate.
 h.result.sameTaskGroupCost=[]
 for(const targetGroups of [['cost_a'],['cost_a','cost_b']]){
  const requested=[...targetGroups.map(group=>({product:cost.products[0],group})),{product:cost.products[1],group:'cost_a'}]
  const selector={schemaVersion:1,courseId:fixture.courseId,mode:'FULL_CASE',waves:requested.map(({product,group},index)=>{const source=sourceList.list.find(item=>item.taskId===product.id&&item.materialGroupKey===group);assert.ok(source);const metric=source.metrics.find(metric=>metric.metricKey==='total'&&product.items.some(item=>item.id===metric.itemId&&item.type==='SCALE'));assert.ok(metric);const {taskName,...wave}=source;return {...wave,waveKey:'scope_wave_'+index,metrics:[{itemId:metric.itemId,metricKey:metric.metricKey}]}})}
  trainingAnalysisSelectorSchema.parse(selector)
  const http=await teacher.request(`/courses/${fixture.courseId}/training-analysis`,'POST',{selector})
  const metadata={selectedMaterialGroup:null,targetMaterialGroups:targetGroups,targetGroupParticipantCounts:Object.fromEntries(targetGroups.map(group=>[group,group==='cost_a'?50:1])),fixedAnchorParticipants:50,targetParticipants:targetGroups.length===1?50:51,sourcePopulationParticipants:51,comparisonScope:'SAME_TARGET_TASK_PLUS_FIXED_SECOND_PUBLICATION_A_ANCHOR; FULL_CASE_BOTH; NOT_TREATMENT_INFERENCE'}
  const result=await measure('same-target-task-'+targetGroups.length+'-groups-fixed-anchor',50,()=>analyzeTrainingCourse({actor:{id:actor.userId,role:actor.role},courseId:fixture.courseId,selector,sourceCutoff:http.manifest.sourceCutoff,includeTables:true}),metadata)
  assert.equal(result.manifest.manifestHash,http.manifest.manifestHash)
  assert.equal(result.manifest.sources.length,targetGroups.length===1?100:101)
  for(const source of result.manifest.sources)assert.ok(source.taskId===cost.products[0].id?targetGroups.includes(source.materialGroupKey):source.materialGroupKey==='cost_a')
  for(const row of result.tables.long.rows)if(row.value!==null){assert.equal(row.value,row.materialGroupKey==='cost_a'?1:0);assert.equal(row.reason,null)}
  if(targetGroups.length===2)assert.equal(http.analysis.state,'suppressed')
  h.result.sameTaskGroupCost.push({...metadata,observedSourceRows:result.manifest.sources.length,longRowsIncludingNoObservation:result.tables.long.rows.length,analysisState:http.analysis.state,manifestHash:result.manifest.manifestHash})
 }
 h.check('Same target task one-vs-two material groups measured with a fixed A anchor; actual A50/B1 source counts and additional per-wave graph costs remain explicit')
 h.result.reportScope='Real individual teacher report at populations 10/20/50. No V2 flow batch-report endpoint exists; no batch-report throughput claim.'
 h.result.capacityQualification=false
 h.check('C20 measured production SQL budgets stay bounded across 10/20/50 completed participants; no material allocation history queries or per-person analysis/export N+1')
 h.result.passed=true
}catch(e){error=e;throw e}finally{security.decryptUnifiedRuntimePayload=originalDecrypt;allocation.assertTrainingMaterialAssignment=originalValidate;await h.finish(error)}
