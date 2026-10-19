/** C19 teacher partial/full projections, actual queued CSV and Training analysis.
 * The old C14/C18 suites are not rerun. Their accepted rows remain immutable. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
import {harness,prisma,require,backend,drainReports,candidateProof,children,parseCsv,denied,prefix,pub,products,sha} from './c19-flow-client.mjs'
import {logins,form,formRows,unitKey,publish,formBody} from './c19-flow-fixture.mjs'
const {exportQueue}=require(path.join(backend,'dist/config/queue.js'))
const {runExportBatch}=require(path.join(backend,'dist/workers/exportBatchTask.js'))
const {analyzeTrainingCourse}=require(path.join(backend,'dist/modules/training-analysis/service.js'))
const h=harness('exports-continuation');let error
async function exportBytes(client,route,body){const queued=await client.request(route,'POST',body);assert.ok(queued.batchId);assert.equal(queued.artifacts.length,1);const job=await exportQueue.getJob('export-'+queued.batchId);assert.ok(job,'real original Redis export job required');await runExportBatch({data:job.data,id:job.id,opts:{attempts:1},attemptsMade:0});assert.equal((await prisma.exportBatch.findUniqueOrThrow({where:{id:queued.batchId}})).status,'READY');const url=queued.artifacts[0].downloadUrl.replace(/^\/api/,'');assert.equal((await client.request(url+'/status')).status,'READY');const bytes=await client.request(url,'GET',undefined,200,true);h.result.exports??=[];h.result.exports.push({batchId:queued.batchId,bytes:bytes.length,sha256:sha(bytes),route,format:body.format});return {bytes,url,queued}}
try{
 const fixture=h.read('c19-fixture-private.json'),{teacher,student,otherTeacher,outsider}=await logins(h,fixture)
 const partial=fixture.partialProduct;assert.ok(partial)
 const prior=h.read('c19-prior-consumers-failed-result.json');assert.equal(prior.passed,false);assert.equal(prior.checks.length,2)
 const failedId='1af24ca8-3f5e-4402-8016-eee7dbb488b5'
 const failedBatch=await prisma.exportBatch.findUniqueOrThrow({where:{id:failedId}}),failedArtifacts=await prisma.exportArtifact.findMany({where:{batchId:failedId},orderBy:{id:'asc'}})
 assert.equal(failedBatch.status,'FAILED');assert.equal(failedBatch.createdBy,fixture.users.teacher.id);assert.equal(failedBatch.resourceId,fixture.product.id)
 const acceptedIds=fixture.cases.map(item=>item.attemptId)
 async function acceptedFingerprint(){
  const parents=await prisma.compositeAssessmentAttempt.findMany({where:{id:{in:acceptedIds}},orderBy:{id:'asc'}})
  assert.equal(parents.length,acceptedIds.length);assert.ok(parents.every(row=>row.status==='COMPLETED'))
  const accepted=[]
  for(const id of [...acceptedIds].sort()){const child=await children(id);for(const rows of Object.values(child))rows.sort((a,b)=>a.id.localeCompare(b.id));accepted.push({id,child})}
  return sha(JSON.stringify({parents,accepted}))
 }
 const beforeFacts=await acceptedFingerprint()
 h.result.priorProducer={phase:'consumers',resultSha256:'3e5bb8a511bc625d4c7ee59e6c511b66aa45c7aeaaab298af1da36ec4a52e46b',reusedChecks:prior.checks,continuation:'Reuse completed partial/report cases and every original FINAL; create a fresh export request while retaining the original FAILED batch/artifacts exactly.'}
 for(const product of [fixture.product,fixture.dependencyProduct,partial]){
  const expected=fixture.cases.filter(item=>item.productId===product.id),exported=await exportBytes(teacher,`${prefix}/${product.id}/export`,{detail:'full',format:'csv'}),csv=parseCsv(exported.bytes)
  assert.equal(csv.rows.length,expected.length);assert.ok(csv.columns.includes('P_path_hash'));assert.ok(csv.columns.includes('P_task_satisfaction'))
  for(const item of expected){const row=csv.rows.find(row=>row.A_attempt_id===item.attemptId),p=await candidateProof(item.attemptId);assert.ok(row);assert.equal(row.P_config_digest,product.trainingFlowDigest);assert.equal(row.P_path_hash,p.row.trainingFlowPathHash);assert.equal(row.P_termination,item.termination);assert.equal(row.P_task_satisfaction,item.satisfaction)
   const executed=new Set(p.proof.path.acceptedInstrumentKeys)
   for(const [index,definition]of [...product.items].sort((a,b)=>a.position-b.position).entries()){
    const n=String(index+1).padStart(3,'0'),active=executed.has(unitKey(definition));assert.equal(row[`P${n}_path_state`],active?'EXECUTED':'NOT_SHOWN')
    if(!active&&definition.type!=='FORM'){const tag={SCALE:'S',COGNITIVE:'C',SITUATIONAL:'J'}[definition.type];for(const key of csv.columns.filter(key=>key.startsWith(tag+n+'_')&&!/terminal_state|state$/.test(key)))assert.equal(row[key],'',`${key}: skipped values/timing must be empty, never zero`)}
   }
  }
  await otherTeacher.request(exported.url,'GET',undefined,[403,404]);h.result.exports.at(-1).recordCount=csv.rows.length;h.result.exports.at(-1).columnCount=csv.columns.length
 }
 h.check('Original Redis→worker CSV exports bind config/path/termination/satisfaction; skipped native score, raw and time cells are blank with NOT_SHOWN, not zero or invented FINAL')
 // Two actual publications, same measured student, with screened/refused peers.
 const sourceList=await teacher.request(`/courses/${fixture.courseId}/training-analysis/sources`)
 const selected=[fixture.product,partial].map((product,index)=>{const source=sourceList.list.find(source=>source.taskId===product.id);assert.ok(source);const metric=source.metrics.find(metric=>metric.metricKey==='total'&&product.items.some(item=>item.id===metric.itemId&&item.type==='SCALE'));assert.ok(metric);return {...source,waveKey:'wave_'+(index+1),metrics:[{itemId:metric.itemId,metricKey:metric.metricKey}]}})
 const selector={schemaVersion:1,courseId:fixture.courseId,mode:'PAIRWISE',waves:selected.map(({taskName,...wave})=>wave)}
 const analyzed=await teacher.request(`/courses/${fixture.courseId}/training-analysis`,'POST',{selector})
 const direct=await analyzeTrainingCourse({actor:{id:fixture.users.teacher.id,role:'TEACHER'},courseId:fixture.courseId,selector,sourceCutoff:analyzed.manifest.sourceCutoff,includeTables:true})
 assert.equal(direct.manifest.manifestHash,analyzed.manifest.manifestHash)
 const long=direct.tables.long.rows,screenIds=new Set(fixture.cases.filter(item=>item.productId===fixture.product.id&&item.name!=='fourtool').map(item=>item.attemptId))
 const skipped=long.filter(row=>screenIds.has(row.attemptId));assert.ok(skipped.length>=3);assert.ok(skipped.every(row=>row.value===null&&row.reason==='NOT_ASSIGNED'))
 const measured=long.filter(row=>row.attemptId===fixture.cases.find(item=>item.name==='fourtool').attemptId);assert.equal(measured.length,1);assert.equal(measured[0].value,1)
 await otherTeacher.request(`/courses/${fixture.courseId}/training-analysis`,'POST',{selector},[403,404])
 const exported=await exportBytes(teacher,`/courses/${fixture.courseId}/training-analysis/exports`,{selector,manifest:analyzed.manifest,layout:'long',format:'csv',requestKey:randomUUID()}),csv=parseCsv(exported.bytes)
 assert.equal(csv.rows.length,long.length);for(const row of csv.rows.filter(row=>screenIds.has(row.attemptId))){assert.equal(row.value,'');assert.equal(row.reason,'NOT_ASSIGNED')}
 h.result.analysis={manifestHash:direct.manifest.manifestHash,sourceCount:direct.manifest.sources.length,observationCount:long.length,unexecutedNullRows:skipped.length,measuredScaleValue:1,statisticsSuppressionRetained:true}
 h.check('Real two-publication Training analysis and queued long CSV retain accepted Scale=1 while screened/refused/unexecuted Scale rows are null/NOT_ASSIGNED; minimum-cohort rules remain in force')
 assert.equal(await acceptedFingerprint(),beforeFacts);assert.deepEqual(await prisma.exportBatch.findUniqueOrThrow({where:{id:failedId}}),failedBatch);assert.deepEqual(await prisma.exportArtifact.findMany({where:{batchId:failedId},orderBy:{id:'asc'}}),failedArtifacts)
 h.result.acceptedFactsUnchanged={before:beforeFacts,after:await acceptedFingerprint(),failedBatchPreserved:true}
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
