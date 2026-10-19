/** Resource observations on the original 51 people / 102 parents / 204 FINALs.
 * No admission, FINAL, report outbox replay or allocation change is permitted.
 * Original failed functional cost evidence is never opened for writing.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {harness,prisma,require,backend,prefix,sha,parseCsv} from './c20-materials-client.mjs'
import {createEfficiencyObserver} from './c20-efficiency-observer.mjs'
import {sameIds,exactCompletedCutoff,csvArtifactName,assertStableCsv} from './c20-efficiency-probes-precheck.mjs'
const h=harness('efficiency-consumers'),phase=h.status.efficiencyPhase
const option=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1]}
assert.ok(['before','after'].includes(phase));if(option('--phase'))assert.equal(option('--phase'),phase)
const baselinePath=option('--baseline');if(phase==='after')assert.ok(baselinePath,'After requires the explicitly selected before binding file')
const baseline=baselinePath?JSON.parse(fs.readFileSync(baselinePath)):null
if(baseline){assert.equal(baseline.phase,'before');assert.equal(baseline.passed,true)}
const {getReportForTeacher,getExportContext}=require(path.join(backend,'dist/modules/composite/composite.service.js'))
const {compositeExportService}=require(path.join(backend,'dist/modules/composite/composite-export.service.js'))
const {resolveCompositeExportProjectionBinding,projectCompositeExportData}=require(path.join(backend,'dist/modules/composite/composite-export-projection.js'))
const {analyzeTrainingCourse}=require(path.join(backend,'dist/modules/training-analysis/service.js'))
const {exportQueue}=require(path.join(backend,'dist/config/queue.js'))
const {runExportBatch}=require(path.join(backend,'dist/workers/exportBatchTask.js'))
const security=require(path.join(backend,'dist/modules/assessment-runtime/security.js')),allocation=require(path.join(backend,'dist/modules/composite/training-material-allocation.js'))
const originalDecrypt=security.decryptUnifiedRuntimePayload,originalValidate=allocation.assertTrainingMaterialAssignment
let active=null,observer,error,originalStateHash,ids
const journalName='c20-efficiency-consumers-progress-private.json',bindingName='c20-efficiency-consumers-binding-private.json'
assert.ok(!fs.existsSync(path.join(h.state,journalName)),'Existing consumer progress requires an exact continuation; never repeat an uncertain export enqueue')
const progress={schemaVersion:1,phase,scope:'ORIGINAL_51_READS_AND_NEW_EXPORT_ARTIFACTS_ONLY',operations:[]},binding={schemaVersion:1,phase,passed:false,stages:[]}
const save=()=>{h.write(journalName,progress);h.write(bindingName,binding)}
const record=value=>{progress.operations.push({...value,at:new Date().toISOString()});save()}
security.decryptUnifiedRuntimePayload=function(...args){const value=originalDecrypt.apply(this,args);if(active){active.unifiedDecryptCalls++;active.unifiedCipherBytes+=Buffer.byteLength(args[0]);active.unifiedPlainJsonBytes+=Buffer.byteLength(JSON.stringify(value))}return value}
allocation.assertTrainingMaterialAssignment=function(...args){const value=originalValidate.apply(this,args);if(active)active.assignmentValidations++;return value}
prisma.$on('query',event=>{if(active)active.sql.push({shapeHash:sha(event.query.replace(/\$\d+/g,'?')),durationMs:event.duration,materialHistory:/\btraining_material_(allocation_claims|quota_buckets|subject_bindings|experiments)\b/i.test(event.query)})})
prisma.$use(async(params,next)=>{
 const current=active,key=(params.model??'RAW')+'.'+params.action
 if(current){current.modelCalls[key]=(current.modelCalls[key]??0)+1;if(['AssessmentUnitSnapshot','Assessment','CompositeFormAnswer','CompositeAssessmentAttempt'].includes(params.model)&&['findMany','count','aggregate'].includes(params.action))assert.ok(params.args?.where&&Object.keys(params.args.where).length,'Unbounded historical source scan')}
 const value=await next(params)
 if(current&&params.model==='CompositeAssessment'&&Array.isArray(value?.attempts)){current.sourceGraphLoads++;current.sourceGraphParentRows+=value.attempts.length}
 if(current&&['findMany','findFirst','findFirstOrThrow','findUnique','findUniqueOrThrow','queryRaw','queryRawUnsafe'].includes(params.action))current.returnedTopLevelRowsByOperation[key]=(current.returnedTopLevelRowsByOperation[key]??0)+(Array.isArray(value)?value.length:value==null?0:1)
 if(current){const visit=node=>{if(Array.isArray(node)){for(const child of node)visit(child)}else if(node&&typeof node==='object'){for(const [field,child]of Object.entries(node)){if(['factsEncrypted','rawAnswersEncrypted','canonicalResultEncrypted','collectionFactsEncrypted'].includes(field)&&typeof child==='string')current.returnedCipherBytesByField[field]=(current.returnedCipherBytesByField[field]??0)+Buffer.byteLength(child);else if(child&&typeof child==='object'&&!(child instanceof Date))visit(child)}}};visit(value)}
 return value
})
async function observeConsumer(label,fn,metadata){
 assert.equal(active,null)
 const current={sql:[],modelCalls:{},returnedTopLevelRowsByOperation:{},sourceGraphLoads:0,sourceGraphParentRows:0,unifiedDecryptCalls:0,unifiedCipherBytes:0,unifiedPlainJsonBytes:0,assignmentValidations:0,returnedCipherBytesByField:{}}
 const value=await observer.measure(label,async()=>{active=current;try{return await fn()}finally{active=null}},metadata)
 assert.ok(current.sql.length>0&&current.unifiedDecryptCalls>0&&current.assignmentValidations>0,'Untouched production SQL/decryption/assignment observers required')
 assert.equal(current.sql.filter(row=>row.materialHistory).length,0,'Frozen consumer must not query allocation history')
 const sqlShapeCounts={};for(const row of current.sql)sqlShapeCounts[row.shapeHash]=(sqlShapeCounts[row.shapeHash]??0)+1
 const {sql,...counters}=current
 h.result.consumerMeasurements??=[];h.result.consumerMeasurements.push({label,...metadata,...counters,sqlCount:sql.length,sqlDurationMs:sql.reduce((sum,row)=>sum+row.durationMs,0),sqlShapeCounts,materialHistorySqlCount:0,decryptScope:'UNIFIED_RUNTIME_LAYER_SUBSET_ONLY; NESTED_LOWER_LEVEL_DECRYPT_CALLS_NOT_SUMMED',returnedCipherScope:'Actual materialized facts/raw/snapshot ciphertext bytes by field, including repeated reads; not bytes scanned from disk',returnedRowScope:'Actual top-level Prisma results, not nested rows or physical scanned tuples',responseKind:value===undefined?'void':value===null?'null':typeof value,responseJsonBytes:value===undefined?0:Buffer.byteLength(JSON.stringify(value))});save()
 return value
}
async function acceptedHash(){
 const bound={in:ids},parents=await prisma.compositeAssessmentAttempt.findMany({where:{id:bound},orderBy:{id:'asc'}}),snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:bound},orderBy:{id:'asc'}}),jobs=await prisma.compositeReportJob.findMany({where:{attemptId:bound},orderBy:{id:'asc'}}),forms=await prisma.compositeFormSectionAttempt.findMany({where:{attemptId:bound},orderBy:{id:'asc'}}),scales=await prisma.assessment.findMany({where:{compositeAttemptId:bound},orderBy:{id:'asc'}}),claims=await prisma.trainingMaterialAllocationClaim.findMany({where:{initialAttemptId:bound},orderBy:{id:'asc'}})
 assert.equal(parents.length,102);assert.equal(snapshots.length,204);assert.equal(jobs.length,102);assert.ok(parents.every(row=>row.status==='COMPLETED'));assert.ok(jobs.every(row=>row.status==='READY'&&row.attemptCount===1))
 const facts=await prisma.assessmentResultFact.findMany({where:{assessmentId:{in:scales.map(row=>row.id)}},orderBy:[{assessmentId:'asc'},{attemptEpoch:'asc'}]}),answers=await prisma.compositeFormAnswer.findMany({where:{attemptId:bound},orderBy:{id:'asc'}})
 return sha(JSON.stringify({parents,snapshots,jobs,forms,scales,claims,facts,answers}))
}
try{
 assert.equal(process.env.PERF_ISOLATED_TEST_MODE,'1');assert.equal(process.env.PERF_SQL_EVENT_COUNT,'1')
 const pins={'c20-consumer-cost-fixture-private.json':'6a6d9156dbe41a5f1d2a056a2cdf19030b2683a5d6459e20ca52adb412ff4490','c20-consumer-cost-result.json':'1b3418fe18b511285d12f47926d1d4af896f9d10ddb2b1c66984f96795cb3136','c20-fixture-private.json':'15048b4dc11abc65d8d6be90918454dfeddac58eff3829c6aa376c7e20781b03'}
 for(const [name,hash]of Object.entries(pins))assert.equal(sha(fs.readFileSync(path.join(h.state,name))),hash)
 const cost=h.read('c20-consumer-cost-fixture-private.json'),fixture=h.read('c20-fixture-private.json')
 assert.equal(cost.people.length,51);assert.equal(cost.products.length,2);assert.deepEqual(cost.stages.map(stage=>stage.attemptIds.length),[22,42,102])
 ids=cost.people.flatMap(person=>person.attempts.map(item=>item.attemptId));sameIds(ids,cost.stages.at(-1).attemptIds)
 originalStateHash=await acceptedHash()
 const actor={userId:fixture.users.teacher.id,role:'TEACHER'},flags={detail:'full',anonymize:true,format:'csv'}
 binding.inputs={pins,actor,flags,originalStateHash,warmupRule:'NO_ADDITIONAL_WARMUP; STAGES_ASCENDING_11_21_51; WAVE_0_THEN_1; SAME_SEQUENCE_BEFORE_AFTER',metadataDifferenceAllowances:[]}
 if(baseline)assert.deepEqual(binding.inputs,baseline.inputs,'Fixed source/actor/options changed')
 const teacher=h.client();await teacher.login(fixture.users.teacher,'TEACHER')
 observer=await createEfficiencyObserver({state:h.state,status:h.status,result:h.result})
 record({kind:'started',originalStateHash})
 const allRows=await prisma.compositeAssessmentAttempt.findMany({where:{compositeAssessmentId:{in:cost.products.map(product=>product.id)},status:'COMPLETED'},orderBy:{id:'asc'}})
 for(const stage of cost.stages){
  const n=stage.attemptIds.length/2,sourceCutoff=new Date(Math.max(...allRows.filter(row=>stage.attemptIds.includes(row.id)).map(row=>row.completedAt.getTime()))).toISOString()
  const analysis=await observeConsumer('direct_analysis_'+n,()=>analyzeTrainingCourse({actor:{id:actor.userId,role:actor.role},courseId:fixture.courseId,selector:stage.selector,sourceCutoff,includeTables:true}),{actualCaller:'direct_producer',concurrency:1,selectedPerWave:n,sourceCutoff})
  const expectedA=cost.people.filter(person=>person.materialGroupKey==='cost_a').flatMap(person=>person.attempts.map(item=>item.attemptId)).filter(id=>stage.attemptIds.includes(id))
  sameIds(analysis.manifest.sources.map(source=>source.attemptId),expectedA,'analysis exact selected A ids')
  assert.equal(analysis.tables.long.rows.length,expectedA.length);assert.ok(analysis.tables.long.rows.every(row=>row.value===1&&row.reason===null&&row.materialGroupKey==='cost_a'))
  const reportId=stage.attemptIds.at(-2),reportParent=allRows.find(row=>row.id===reportId);assert.ok(reportParent)
  const report=await observeConsumer('direct_teacher_report_'+n,()=>getReportForTeacher(actor.userId,actor.role,reportParent.compositeAssessmentId,reportId),{actualCaller:'direct_producer',concurrency:1,selectedPerWave:n})
  assert.equal(report.trainingFlow.pathHash,reportParent.trainingFlowPathHash)
  for(let wave=0;wave<2;wave++){
   const product=cost.products[wave],expectedIds=stage.attemptIds.filter(id=>allRows.find(row=>row.id===id)?.compositeAssessmentId===product.id)
   assert.equal(expectedIds.length,n)
   const dateRange=exactCompletedCutoff(expectedIds,allRows.filter(row=>row.compositeAssessmentId===product.id)),options={actor,anonymize:true,detail:'full',dateRange},metadata={actualCaller:'direct_producer',concurrency:1,selectedPerWave:n,wave,selectedIdsSha256:sha(JSON.stringify([...expectedIds].sort())),dateRange}
   const sourceBinding={n,wave,productId:product.id,expectedIds:[...expectedIds].sort(),dateRange,sourceCutoff,selectorHash:sha(JSON.stringify(stage.selector)),manifestHash:analysis.manifest.manifestHash,sourceRowsHash:sha(JSON.stringify(allRows.filter(row=>expectedIds.includes(row.id)))),assignmentHashes:cost.people.flatMap(person=>person.attempts).filter(item=>expectedIds.includes(item.attemptId)).map(item=>({id:item.attemptId,hash:item.assignmentHash})).sort((a,b)=>a.id.localeCompare(b.id))}
   if(baseline)assert.deepEqual(sourceBinding,baseline.stages.find(item=>item.n===n&&item.wave===wave).sourceBinding,'Exact identity/source/assignment binding changed')
   const data=await observeConsumer('direct_export_projection_'+n+'_wave_'+wave,async()=>{await getExportContext(actor.userId,actor.role,product.id);const projection=await resolveCompositeExportProjectionBinding(product.id,'teacher');return projectCompositeExportData(await compositeExportService.getExportData(product.id,options),projection)},metadata)
   sameIds(data.rows.map(row=>row.A_attempt_id),expectedIds,'direct projection membership')
   const directBytes=Buffer.from('\uFEFF'+compositeExportService.exportToCSV(data)),artifactName=csvArtifactName(n,wave),artifactPath=path.join(h.state,artifactName)
   if(baseline)assertStableCsv(directBytes,fs.readFileSync(path.join(path.dirname(baselinePath),artifactName)))
   fs.writeFileSync(artifactPath,directBytes,{mode:0o600,flag:'wx'})
   const item={n,wave,sourceBinding,artifactName,directBytes:directBytes.length,directSha256:sha(directBytes)};binding.stages.push(item);save()
   record({kind:'export-enqueue-issued',n,wave,productId:product.id})
   const queued=await observer.measure('export_enqueue_'+n+'_wave_'+wave,()=>teacher.request(`${prefix}/${product.id}/export`,'POST',{...flags,dateRange}),{...metadata,actualCaller:'api'})
   assert.ok(queued.batchId);assert.equal(queued.artifacts.length,1)
   item.batchId=queued.batchId;item.url=queued.artifacts[0].downloadUrl.replace(/^\/api/,'');record({kind:'export-enqueue-received',n,wave,batchId:item.batchId,url:item.url})
   const job=await exportQueue.getJob('export-'+item.batchId);assert.ok(job,'Original queued export job required')
   await observeConsumer('original_export_worker_'+n+'_wave_'+wave,()=>runExportBatch(job),{...metadata,actualCaller:'export_worker_in_producer'})
   const batch=await prisma.exportBatch.findUniqueOrThrow({where:{id:item.batchId}});assert.equal(batch.status,'READY');assert.equal(batch.recordCount,n)
   const artifacts=await prisma.exportArtifact.findMany({where:{batchId:item.batchId}});assert.equal(artifacts.length,1);assert.equal(artifacts[0].status,'READY')
   record({kind:'export-worker-ready',n,wave,batchId:item.batchId,artifactId:artifacts[0].id})
   const bytes=await observer.measure('artifact_download_'+n+'_wave_'+wave,()=>teacher.request(item.url,'GET',undefined,200,true),{...metadata,actualCaller:'api'})
   sameIds(parseCsv(bytes).rows.map(row=>row.A_attempt_id),expectedIds,'download membership');assertStableCsv(bytes,directBytes)
   item.downloadBytes=bytes.length;item.downloadSha256=sha(bytes);record({kind:'download-verified',n,wave,sha256:sha(bytes)})
  }
 }
 assert.equal(await acceptedHash(),originalStateHash,'Original 102 parents/204 FINALs/outboxes changed')
 const projections=h.result.consumerMeasurements.filter(row=>row.label.startsWith('direct_export_projection_'))
 h.result.observedDirectExportSql=projections.map(row=>({selectedPerWave:row.selectedPerWave,wave:row.wave,sqlCount:row.sqlCount,modelCalls:row.modelCalls}))
 h.result.knownEfficiencyFailure=phase==='before';h.result.efficiencyQualified=false;h.result.originalConsumerCostPassed=false;h.result.observationCompleted=true
 binding.passed=true;h.result.phase=phase;h.result.originalAcceptedStatePreserved=true;h.result.originalAcceptedStateSha256=originalStateHash;h.result.sourceParticipants=51;h.result.capacityQualification=false;h.result.csvComparison='EXACT_BYTES_NO_ALLOWANCES';h.result.passed=true;save()
}catch(e){error=e;throw e}finally{
 security.decryptUnifiedRuntimePayload=originalDecrypt;allocation.assertTrainingMaterialAssignment=originalValidate
 try{if(ids&&originalStateHash)assert.equal(await acceptedHash(),originalStateHash);if(observer)await observer.close()}catch(e){error=e;h.result.passed=false;throw e}finally{if(error){progress.error={name:error.name,message:error.message};binding.passed=false;save()}await h.finish(error)}
}
