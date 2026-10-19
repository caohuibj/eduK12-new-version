/** C20-only real HTTP/PG consumers. Never replays historical C19 FINALs or jobs.
 * Frozen production dist + original queued worker only. Results are false until
 * all assertions finish. An interrupted run requires an explicit continuation;
 * the private operation journal preserves every created batch and publication.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {harness,prisma,require,backend,drainReports,candidateProof,children,parseCsv,prefix,pub,products,sha} from './c20-materials-client.mjs'
import {logins,form,formRows,unitKey,publish,formBody} from './c20-materials-fixture.mjs'
const {exportQueue}=require(path.join(backend,'dist/config/queue.js'))
const {runExportBatch}=require(path.join(backend,'dist/workers/exportBatchTask.js'))
const {analyzeTrainingCourse}=require(path.join(backend,'dist/modules/training-analysis/service.js'))
const {trainingFlowDraftSchema}=require(path.join(backend,'dist/modules/assessment-core/flow/training.js'))
const {trainingAnalysisSelectorSchema}=require(path.join(backend,'dist/modules/training-analysis/manifest.js'))
const {canonicalHash}=require(path.join(backend,'dist/modules/assessment-runtime/canonical.js'))
const h=harness('consumers');let error
const journalName='c20-consumers-operations-private.json',journal={schemaVersion:1,operations:[]}
function record(value){journal.operations.push(value);h.write(journalName,journal)}
function noPrivateKeys(value,extra=[]){
 const forbidden=new Set(['claimId','experimentId','participantKey','algorithm','groups','weight','groupLimits','quotaPolicy','acceptedFacts','expertKey',...extra])
 function visit(node){if(!node||typeof node!=='object')return;for(const [key,value]of Object.entries(node)){assert.ok(!forbidden.has(key),'private material field leaked: '+key);visit(value)}}
 visit(value)
}
function materialProof(p){
 assert.equal(p.candidate.schemaVersion,2);assert.equal(p.proof.schemaVersion,2)
 const assignment=p.candidate.materialAssignment;assert.ok(assignment)
 const {assignmentHash,...unsigned}=assignment;assert.equal(canonicalHash(unsigned),assignmentHash)
 assert.equal(p.proof.assignmentHash,assignmentHash);assert.equal(p.proof.path.assignmentHash,assignmentHash)
 assert.equal(p.row.trainingFlowSnapshotHash,canonicalHash(p.candidate));assert.equal(p.row.trainingFlowPathHash,canonicalHash(p.proof))
 return {assignmentHash,configDigest:assignment.configDigest,groupKey:assignment.groupKey,materialDigest:assignment.materialDigest}
}
/** Independent STORE reader validates ZIP framing, duplicate names and CRC32.
 * It does not reuse production ZIP/CSV serializers for its expectations. */
function unzipStore(bytes){
 const crc32=data=>{let c=0xffffffff;for(const byte of data){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
 const entries=new Map();let offset=0
 while(bytes.readUInt32LE(offset)===0x04034b50){
  assert.equal(bytes.readUInt16LE(offset+6),0);assert.equal(bytes.readUInt16LE(offset+8),0)
  const size=bytes.readUInt32LE(offset+18),plain=bytes.readUInt32LE(offset+22),nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28)
  assert.equal(size,plain);const name=bytes.subarray(offset+30,offset+30+nameLength).toString(),start=offset+30+nameLength+extra,end=start+size
  assert.ok(end<=bytes.length);assert.ok(!entries.has(name));assert.ok(!name.includes('..')&&!name.startsWith('/'))
  const data=bytes.subarray(start,end);assert.equal(crc32(data),bytes.readUInt32LE(offset+14));entries.set(name,data);offset=end
 }
 assert.equal(bytes.readUInt32LE(offset),0x02014b50);assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50)
 assert.equal(bytes.readUInt16LE(bytes.length-12),entries.size);assert.equal(bytes.readUInt32LE(bytes.length-6),offset)
 return entries
}
async function enqueue(client,route,body){
 const queued=await client.request(route,'POST',body);assert.ok(queued.batchId);assert.equal(queued.artifacts.length,1)
 const item={batchId:queued.batchId,url:queued.artifacts[0].downloadUrl.replace(/^\/api/,''),route,format:body.format}
 record({kind:'queued-export',...item});return item
}
async function processQueued(item,expected='READY'){
 const job=await exportQueue.getJob('export-'+item.batchId);assert.ok(job,'Original Redis job required')
 let caught
 try{await runExportBatch({data:job.data,id:job.id,opts:{attempts:1},attemptsMade:0})}catch(e){caught=e}
 const batch=await prisma.exportBatch.findUniqueOrThrow({where:{id:item.batchId}})
 assert.equal(batch.status,expected,caught?.message)
 if(expected==='READY'&&caught)throw caught
 if(expected==='FAILED')assert.ok(caught,'Revoked/stale original worker must reject')
 const artifacts=await prisma.exportArtifact.findMany({where:{batchId:item.batchId}})
 assert.equal(artifacts.length,1);assert.equal(artifacts[0].status,expected)
 record({kind:'processed-export',batchId:item.batchId,status:batch.status,artifactId:artifacts[0].id})
 return artifacts[0]
}
async function exportBytes(client,route,body){
 const item=await enqueue(client,route,body),artifact=await processQueued(item)
 assert.equal((await client.request(item.url+'/status')).status,'READY')
 const bytes=await client.request(item.url,'GET',undefined,200,true)
 h.result.exports??=[];h.result.exports.push({...item,bytes:bytes.length,sha256:sha(bytes),provenanceHash:canonicalHash(artifact.provenance)})
 return {...item,bytes,artifact}
}
async function acceptedFingerprint(ids){
 const parents=await prisma.compositeAssessmentAttempt.findMany({where:{id:{in:ids}},orderBy:{id:'asc'}})
 assert.equal(parents.length,ids.length);const accepted=[]
 for(const id of [...ids].sort()){const rows=await children(id);for(const list of Object.values(rows))list.sort((a,b)=>a.id.localeCompare(b.id));accepted.push({id,rows})}
 return sha(JSON.stringify({parents,accepted}))
}
function assertTable(csv,table){
 assert.deepEqual(csv.columns,table.columns);assert.equal(csv.rows.length,table.rows.length)
 const cell=value=>value==null?'':typeof value==='string'&&/^[\s\u0000-\u001f]*[=+@-]/u.test(value)?"'"+value:String(value)
 for(let index=0;index<table.rows.length;index++)for(const column of table.columns)assert.equal(csv.rows[index][column],cell(table.rows[index][column]),`row ${index} / ${column}`)
}
try{
 assert.ok(!fs.existsSync(path.join(h.state,journalName)),'Prior consumer operations exist: preserve them and use an explicit continuation, never auto-replay')
 record({kind:'started',scope:'NEW_C20_ONLY',historicalC19ClaimsExpanded:false})
 const fixture=h.read('c20-fixture-private.json'),{teacher,student,otherTeacher,outsider}=await logins(h,fixture)
 assert.equal(fixture.product.trainingFlowFrozen.schemaVersion,2)
 // New same-student second publication, also exercises accepted Scale + pending Form.
 let partial=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C20 material partial and analysis second publication',questionnaireType:'COURSE',courseIds:[fixture.courseId],publicEnabled:false})
 record({kind:'created-product',productId:partial.id})
 for(const item of [{type:'SCALE',scaleId:fixture.scaleId,required:true},form('partial_form')])partial=await teacher.request(`${products}/${partial.id}/items`,'POST',{revision:partial.revision,item})
 const scale=partial.items.find(item=>item.type==='SCALE'),formItem=formRows(partial)[0]
 const config={schemaVersion:2,experiment:structuredClone(fixture.product.trainingFlowFrozen.experiment),blocks:[{blockKey:'scale',kind:'INSTRUMENT',instrumentKey:unitKey(scale)},{blockKey:'pending_form',kind:'INSTRUMENT',instrumentKey:unitKey(formItem)}]}
 trainingFlowDraftSchema.parse(config)
 partial=await publish(teacher,partial,config);fixture.analysisProduct=partial;h.write('c20-fixture-private.json',fixture)
 let {attempt}=await student.request(`${prefix}/${partial.id}/attempts`,'POST',{})
 record({kind:'started-attempt',productId:partial.id,attemptId:attempt.id})
 assert.equal(attempt.currentItem.type,'SCALE');const initial=await candidateProof(attempt.id)
 await student.request(`${prefix}/attempts/${attempt.id}/items/${scale.id}/scale/submit`,'POST',{submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:attempt.currentItem.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:[{itemCode:'mixed-scale-item-1',responseValue:'yes',responseTimeMs:13}]})
 attempt=await student.request(`${prefix}/attempts/${attempt.id}`);assert.equal(attempt.currentItem.type,'FORM_SECTION')
 const partialBefore=await children(attempt.id),partialProof=await candidateProof(attempt.id),partialReport=await teacher.request(`${prefix}/${partial.id}/attempts/${attempt.id}/report?partial=1`)
 assert.equal(partialBefore.snapshots.length,1);assert.ok(partialReport.unitReports.some(unit=>unit.type==='SCALE'))
 assert.deepEqual(partialReport.trainingFlow.materialAssignment,materialProof(partialProof));assert.deepEqual((await children(attempt.id)).snapshots,partialBefore.snapshots)
 assert.deepEqual((await candidateProof(attempt.id)).stable,initial.stable)
 await otherTeacher.request(`${prefix}/${partial.id}/attempts/${attempt.id}/report?partial=1`,'GET',undefined,[403,404])
 h.check('C20 V2 teacher partial report binds assignment/path while the next Form is pending; no Form FINAL is manufactured')
 await student.request(`${prefix}/attempts/${attempt.id}/form-sections/${attempt.currentItem.id}/submit`,'POST',formBody(attempt))
 attempt=await student.request(`${prefix}/attempts/${attempt.id}`);assert.equal(attempt.allUnitsSubmitted,true)
 await drainReports(h,[attempt.id]);attempt=await student.request(`${prefix}/attempts/${attempt.id}`);assert.equal(attempt.status,'COMPLETED')
 const p=await candidateProof(attempt.id);assert.deepEqual(p.stable,initial.stable)
 fixture.cases.push({name:'analysis_pair',attemptId:attempt.id,user:fixture.users.student,productId:partial.id,termination:'COMPLETE',satisfaction:'SATISFIED',candidate:p.stable});h.write('c20-fixture-private.json',fixture)
 const cases=fixture.cases.filter(item=>[fixture.product.id,partial.id].includes(item.productId)),ids=cases.map(item=>item.attemptId),beforeFacts=await acceptedFingerprint(ids)
 const proofs=new Map();h.result.reports=[]
 for(const item of cases){
  const respondent=h.client();let routePrefix=prefix
  if(item.recovery){routePrefix=pub;respondent.recovery=item.recovery;await respondent.request('/auth/csrf')}else await respondent.login(item.user??fixture.users.student,'STUDENT')
  const status=await respondent.request(`${routePrefix}/attempts/${item.attemptId}/report-status`);assert.equal(status.reportStatus.state,'READY')
  const report=await respondent.request(`${routePrefix}/attempts/${item.attemptId}/report`),owner=await teacher.request(`${prefix}/${item.productId}/attempts/${item.attemptId}/report`),proof=await candidateProof(item.attemptId),accepted=await children(item.attemptId),minimal=materialProof(proof)
  proofs.set(item.attemptId,proof)
  for(const value of [report,owner]){assert.equal(value.trainingFlow.pathHash,proof.row.trainingFlowPathHash);assert.equal(value.trainingFlow.termination,item.termination);assert.equal(value.trainingFlow.taskSatisfaction,item.satisfaction);assert.equal(value.trainingFlow.executedUnitCount,accepted.snapshots.length);noPrivateKeys(value)}
  assert.deepEqual(owner.trainingFlow.materialAssignment,minimal)
  noPrivateKeys(report,['materialAssignment','groupKey','assignmentHash','materialDigest'])
  await otherTeacher.request(`${prefix}/${item.productId}/attempts/${item.attemptId}/report`,'GET',undefined,[403,404]);await outsider.request(`${prefix}/attempts/${item.attemptId}/report`,'GET',undefined,[403,404])
  h.result.reports.push({attemptId:item.attemptId,pathHash:proof.row.trainingFlowPathHash,...minimal,participantAssignmentRedacted:true})
 }
 h.check('C20 V2 participant reports omit material assignment internals; authorized reports expose exactly four provenance fields bound to persisted V2 path')
 const compositeExports=[]
 for(const product of [fixture.product,partial]){
  const expected=cases.filter(item=>item.productId===product.id)
  for(const format of ['csv','zip']){
   const exported=await exportBytes(teacher,`${prefix}/${product.id}/export`,{detail:'full',format}),entries=format==='zip'?unzipStore(exported.bytes):null,csv=parseCsv(entries?entries.get('data.csv'):exported.bytes)
   assert.equal(csv.rows.length,expected.length)
   for(const column of ['P_config_digest','P_path_hash','M_assignment_hash','M_group_key','M_material_digest'])assert.ok(csv.columns.includes(column),column)
   assert.ok(!csv.columns.some(column=>/claim|weight|quota|experiment_id/i.test(column)))
   for(const item of expected){const row=csv.rows.find(row=>row.A_attempt_id===item.attemptId),proof=proofs.get(item.attemptId),minimal=materialProof(proof);assert.ok(row)
    assert.equal(row.P_config_digest,product.trainingFlowDigest);assert.equal(row.P_path_hash,proof.row.trainingFlowPathHash);assert.equal(row.M_assignment_hash,minimal.assignmentHash);assert.equal(row.M_group_key,minimal.groupKey);assert.equal(row.M_material_digest,minimal.materialDigest);assert.equal(row.P_termination,item.termination);assert.equal(row.P_task_satisfaction,item.satisfaction)
    const executed=new Set(proof.proof.path.acceptedInstrumentKeys)
    for(const [index,definition]of [...product.items].sort((a,b)=>a.position-b.position).entries()){
     const n=String(index+1).padStart(3,'0'),active=executed.has(unitKey(definition));assert.equal(row[`P${n}_path_state`],active?'EXECUTED':'NOT_SHOWN')
     if(!active&&definition.type!=='FORM'){const tag={SCALE:'S',COGNITIVE:'C',SITUATIONAL:'J'}[definition.type];for(const key of csv.columns.filter(key=>key.startsWith(tag+n+'_')&&!/terminal_state|state$/.test(key)))assert.equal(row[key],'',`${key}: skipped score/raw/time must be blank`)}
    }
   }
   if(entries){const dictionary=JSON.parse(entries.get('data_dictionary.json'));assert.deepEqual(dictionary.columns.map(field=>field.name),csv.columns);noPrivateKeys(dictionary)}
   await otherTeacher.request(exported.url,'GET',undefined,[403,404]);await outsider.request(exported.url,'GET',undefined,[403,404]);compositeExports.push(exported)
  }
 }
 h.check('Original Redis jobs and production worker generated C20 CSV/ZIP with exact assignment/path provenance and blank skipped native score/raw/timing values')
 // Fresh C20 assertions only. C19 dynamic suppression / longCSV gaps are not re-labelled.
 const mainCase=cases.find(item=>item.name==='fourtool');assert.ok(mainCase)
 const selectedGroup=proofs.get(mainCase.attemptId).candidate.materialAssignment.groupKey
 assert.equal(proofs.get(attempt.id).candidate.materialAssignment.groupKey,selectedGroup,'same experiment KEEP_LINKED must preserve group for measured student')
 const selectedIds=new Set(cases.filter(item=>proofs.get(item.attemptId).candidate.materialAssignment.groupKey===selectedGroup).map(item=>item.attemptId))
 const sources=await teacher.request(`/courses/${fixture.courseId}/training-analysis/sources`)
 const selector={schemaVersion:1,courseId:fixture.courseId,mode:'PAIRWISE',waves:[fixture.product,partial].map((product,index)=>{
  const source=sources.list.find(source=>source.taskId===product.id&&source.materialGroupKey===selectedGroup);assert.ok(source)
  const metric=source.metrics.find(metric=>metric.metricKey==='total'&&product.items.some(item=>item.id===metric.itemId&&item.type==='SCALE'));assert.ok(metric)
  const {taskName,...wave}=source;return {...wave,waveKey:'wave_'+(index+1),metrics:[{itemId:metric.itemId,metricKey:metric.metricKey}]}
 })}
 trainingAnalysisSelectorSchema.parse(selector)
 const analysisRoute=`/courses/${fixture.courseId}/training-analysis`,analyzed=await teacher.request(analysisRoute,'POST',{selector})
 const direct=await analyzeTrainingCourse({actor:{id:fixture.users.teacher.id,role:'TEACHER'},courseId:fixture.courseId,selector,sourceCutoff:analyzed.manifest.sourceCutoff,includeTables:true})
 assert.equal(direct.manifest.manifestHash,analyzed.manifest.manifestHash)
 for(const source of direct.manifest.sources){assert.equal(source.materialGroupKey,selectedGroup);assert.ok(selectedIds.has(source.attemptId));const proof=proofs.get(source.attemptId);assert.ok(proof);const minimal=materialProof(proof);assert.equal(source.sourceHashes.materialAssignment,minimal.assignmentHash);assert.equal(source.sourceHashes.materialConfig,minimal.configDigest);assert.equal(source.sourceHashes.materialPath,proof.row.trainingFlowPathHash)}
 assert.equal(analyzed.analysis.state,'suppressed');assert.equal(direct.analysis.state,'suppressed')
 assert.ok(analyzed.analysis.metrics.length>0);assert.ok(analyzed.analysis.metrics.every(metric=>metric.state==='suppressed'))
 const long=direct.tables.long.rows,measuredIds=new Set(cases.filter(item=>selectedIds.has(item.attemptId)&&proofs.get(item.attemptId).proof.path.acceptedInstrumentKeys.includes(unitKey((item.productId===partial.id?partial:fixture.product).items.find(item=>item.type==='SCALE')))).map(item=>item.attemptId))
 assert.ok(measuredIds.size>=2);let measuredN=0,skippedN=0
 for(const row of long){if(!row.attemptId)continue;if(measuredIds.has(row.attemptId)){assert.equal(row.value,1);assert.equal(row.reason,null);measuredN++}else if(selectedIds.has(row.attemptId)){assert.equal(row.value,null);assert.equal(row.reason,'NOT_ASSIGNED');skippedN++}}
 assert.ok(measuredN>=2);assert.equal(skippedN,cases.filter(item=>selectedIds.has(item.attemptId)&&!measuredIds.has(item.attemptId)).length)
 for(const row of long)if(row.attemptId)assert.ok(selectedIds.has(row.attemptId),'opposite material group must not enter selected analysis')
 await teacher.request(analysisRoute,'POST',{selector:{...selector,waves:selector.waves.map(({materialGroupKey,...wave})=>wave)}},[400,403,404,409])
 await teacher.request(analysisRoute,'POST',{selector:{...selector,waves:selector.waves.map(wave=>({...wave,materialGroupKey:'unknown_group'}))}},[400,403,404,409])
 await otherTeacher.request(analysisRoute,'POST',{selector},[403,404])
 const analysisExports=[]
 for(const format of ['csv','zip']){
  const exported=await exportBytes(teacher,analysisRoute+'/exports',{selector,manifest:analyzed.manifest,layout:'long',format,requestKey:randomUUID()})
  if(format==='csv')assertTable(parseCsv(exported.bytes),direct.tables.long)
  else {const entries=unzipStore(exported.bytes);for(const name of ['long','wide','dictionary'])assertTable(parseCsv(entries.get(name+'.csv')),direct.tables[name]);const summary=JSON.parse(entries.get('manifest.json'));assert.equal(summary.manifestHash,direct.manifest.manifestHash);assert.ok(!('sources'in summary));assert.ok(!('authorityHash'in summary))}
  // Independently assert actual bytes, not only comparison to the same production table.
  const actual=parseCsv(format==='csv'?exported.bytes:unzipStore(exported.bytes).get('long.csv'))
  for(const row of actual.rows){if(row.attemptId){assert.ok(selectedIds.has(row.attemptId));assert.equal(row.materialGroupKey,selectedGroup);const proof=proofs.get(row.attemptId);assert.ok(proof);const hashes=JSON.parse(row.sourceHashes),minimal=materialProof(proof);assert.equal(hashes.materialAssignment,minimal.assignmentHash);assert.equal(hashes.materialConfig,minimal.configDigest);assert.equal(hashes.materialPath,proof.row.trainingFlowPathHash)}if(measuredIds.has(row.attemptId)){assert.equal(row.value,'1');assert.equal(row.reason,'')}else if(selectedIds.has(row.attemptId)){assert.equal(row.value,'');assert.equal(row.reason,'NOT_ASSIGNED')}}
  assert.equal(exported.artifact.provenance.trainingAnalysis.manifest.manifestHash,direct.manifest.manifestHash)
  await otherTeacher.request(exported.url,'GET',undefined,[403,404]);analysisExports.push(exported)
 }
 h.result.analysis={materialGroupKey:selectedGroup,selectedAttemptCount:selectedIds.size,manifestHash:direct.manifest.manifestHash,measuredN,skippedN,actualDownloadedValuesAsserted:true,dynamicSmallCohortSuppressionAsserted:true,scope:'NEW_C20_FIXTURE_ONLY; NOT_RETROACTIVE_C19_QUALIFICATION'}
 h.check('New C20 two-publication analysis dynamically suppresses small cohorts; actual long CSV and ZIP tables match every cell, including independent Scale=1 and NOT_ASSIGNED assertions')
 // Queue first; change only the new synthetic source quality through its real API.
 const staleJob=await enqueue(teacher,analysisRoute+'/exports',{selector,manifest:analyzed.manifest,layout:'long',format:'csv',requestKey:randomUUID()})
 const quality=analyzed.quality.list.find(row=>measuredIds.has(row.attemptId));assert.ok(quality)
 await teacher.request(analysisRoute+'/quality','POST',{selector,attemptId:quality.attemptId,attemptEpoch:quality.attemptEpoch,sourceHash:quality.sourceHash,expectedRevision:quality.revision,verdict:'EXCLUDE',reason:'C20 synthetic sourceChanged download and generation boundary'})
 record({kind:'quality-source-changed',attemptId:quality.attemptId})
 for(const item of analysisExports){await teacher.request(item.url,'GET',undefined,404);await teacher.request(item.url+'/status','GET',undefined,404)}
 await teacher.request(analysisRoute+'/exports','POST',{selector,manifest:analyzed.manifest,layout:'long',format:'csv',requestKey:randomUUID()},409)
 await processQueued(staleJob,'FAILED');await teacher.request(staleJob.url,'GET',undefined,404)
 h.check('C20 sourceChanged via audited quality API rejects old CSV/ZIP downloads, old manifest enqueue, and the original queued worker generation')
 // Isolated account revocation fixture only; no old authority row is changed.
 const current=await teacher.request(analysisRoute,'POST',{selector}),fresh=await exportBytes(teacher,analysisRoute+'/exports',{selector,manifest:current.manifest,layout:'long',format:'csv',requestKey:randomUUID()})
 const revokeJobs=[await enqueue(teacher,`${prefix}/${partial.id}/export`,{detail:'full',format:'csv'}),await enqueue(teacher,analysisRoute+'/exports',{selector,manifest:current.manifest,layout:'long',format:'csv',requestKey:randomUUID()})]
 const account=await prisma.user.findUniqueOrThrow({where:{id:fixture.users.teacher.id}});assert.ok(account.username.startsWith('c20-'));assert.equal(account.isActive,true)
 record({kind:'synthetic-principal-revocation-start',userId:account.id,restoreIsActive:account.isActive})
 try{
  await prisma.user.update({where:{id:account.id},data:{isActive:false}})
  for(const item of [...compositeExports,fresh]){await teacher.request(item.url,'GET',undefined,[401,403,404]);await teacher.request(item.url+'/status','GET',undefined,[401,403,404])}
  for(const item of revokeJobs)await processQueued(item,'FAILED')
 }finally{await prisma.user.update({where:{id:account.id},data:{isActive:account.isActive}});record({kind:'synthetic-principal-restored',userId:account.id})}
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:account.id}})).isActive,true)
 h.result.revocation={fixtureMethod:'NEW_SYNTHETIC_USER_IS_ACTIVE_PG_TOGGLE_FINALLY_RESTORED',generationFailedBatchIds:revokeJobs.map(item=>item.batchId),downloadDenied:true}
 h.check('C20 original COMPOSITE/analysis queued workers and existing artifact downloads recheck current principal; isolated revoked synthetic principal is restored')
 const afterFacts=await acceptedFingerprint(ids);assert.equal(afterFacts,beforeFacts)
 h.result.acceptedFactsUnchanged={before:beforeFacts,after:afterFacts}
 h.result.costCoverage={consumerCompletedSampleSize:cases.length,completed10_20_50:'SEPARATE_PRODUCER c20-consumer-cost-result.json; this consumer result alone does not grant query-budget or capacity qualification'}
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
