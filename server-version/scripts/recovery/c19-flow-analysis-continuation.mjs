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
const h=harness('analysis-continuation');let error
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
 const priorExports=h.read('c19-prior-exports-failed-result.json');assert.equal(priorExports.passed,false);assert.equal(priorExports.exports.length,3);assert.equal(priorExports.checks.length,1)
 const priorExportIds=priorExports.exports.map(row=>row.batchId)
 const retainedBatches=await prisma.exportBatch.findMany({where:{id:{in:priorExportIds}},orderBy:{id:'asc'}})
 const retainedArtifacts=await prisma.exportArtifact.findMany({where:{batchId:{in:priorExportIds}},orderBy:{id:'asc'}})
 assert.equal(retainedBatches.length,3);assert.equal(retainedArtifacts.length,3);assert.ok(retainedBatches.every(row=>row.status==='READY'));assert.ok(retainedArtifacts.every(row=>row.status==='READY'))
 // Read original immutable bytes; never enqueue/reprocess successful exports.
 for(const accepted of priorExports.exports){const artifact=retainedArtifacts.find(row=>row.batchId===accepted.batchId);assert.ok(artifact);const bytes=await teacher.request(`${prefix}/${artifact.resourceId}/export/artifacts/${artifact.id}`,'GET',undefined,200,true);assert.equal(bytes.length,accepted.bytes);assert.equal(sha(bytes),accepted.sha256)}
 h.result.priorProducer={phase:'exports-continuation',resultSha256:'7befacb3128c86e7a48b7bedeccd601d0412974e628ef4fa8d9b00ccccb32669',reusedChecks:priorExports.checks,exports:priorExports.exports,continuation:'Only missing analysis and analysis CSV execute; original three READY exports and original FAILED export remain unchanged.'}
 h.check('Original three successful CSV artifacts match their accepted producer bytes/SHA without rerunning export or FINAL')
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
 assert.deepEqual(await prisma.exportBatch.findMany({where:{id:{in:priorExportIds}},orderBy:{id:'asc'}}),retainedBatches);assert.deepEqual(await prisma.exportArtifact.findMany({where:{batchId:{in:priorExportIds}},orderBy:{id:'asc'}}),retainedArtifacts)
 h.result.acceptedFactsUnchanged={before:beforeFacts,after:await acceptedFingerprint(),failedBatchPreserved:true}
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
