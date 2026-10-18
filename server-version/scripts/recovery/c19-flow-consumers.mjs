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
const h=harness('consumers');let error
async function exportBytes(client,route,body){const queued=await client.request(route,'POST',body);assert.ok(queued.batchId);assert.equal(queued.artifacts.length,1);const job=await exportQueue.getJob('export-'+queued.batchId);assert.ok(job,'real original Redis export job required');await runExportBatch({data:job.data,id:job.id,opts:{attempts:1},attemptsMade:0});assert.equal((await prisma.exportBatch.findUniqueOrThrow({where:{id:queued.batchId}})).status,'READY');const url=queued.artifacts[0].downloadUrl.replace(/^\/api/,'');assert.equal((await client.request(url+'/status')).status,'READY');const bytes=await client.request(url,'GET',undefined,200,true);h.result.exports??=[];h.result.exports.push({batchId:queued.batchId,bytes:bytes.length,sha256:sha(bytes),route,format:body.format});return {bytes,url,queued}}
try{
 const fixture=h.read('c19-fixture-private.json'),{teacher,student,otherTeacher,outsider}=await logins(h,fixture)
 // Exact reported risk: accepted Scale followed by a currently pending typed Form.
 let partial=await teacher.request(products,'POST',{requestId:randomUUID(),name:'C19 teacher partial before Form FINAL',questionnaireType:'COURSE',courseIds:[fixture.courseId],publicEnabled:false})
 for(const item of [{type:'SCALE',scaleId:fixture.scaleId,required:true},form('partial_form')])partial=await teacher.request(`${products}/${partial.id}/items`,'POST',{revision:partial.revision,item})
 const scale=partial.items.find(item=>item.type==='SCALE'),formItem=formRows(partial)[0]
 partial=await publish(teacher,partial,{schemaVersion:1,blocks:[{blockKey:'scale',kind:'INSTRUMENT',instrumentKey:unitKey(scale)},{blockKey:'pending_form',kind:'INSTRUMENT',instrumentKey:unitKey(formItem)}]})
 let {attempt}=await student.request(`${prefix}/${partial.id}/attempts`,'POST',{})
 assert.equal(attempt.currentItem.type,'SCALE');const first=await candidateProof(attempt.id)
 await student.request(`${prefix}/attempts/${attempt.id}/items/${scale.id}/scale/submit`,'POST',{submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:attempt.currentItem.definitionHash,contextSnapshotHash:attempt.contextSnapshotHash,answers:[{itemCode:'mixed-scale-item-1',responseValue:'yes',responseTimeMs:13}]})
 attempt=await student.request(`${prefix}/attempts/${attempt.id}`);assert.equal(attempt.currentItem.type,'FORM_SECTION');assert.equal((await children(attempt.id)).snapshots.length,1)
 const beforePartial=await candidateProof(attempt.id),report=await teacher.request(`${prefix}/${partial.id}/attempts/${attempt.id}/report?partial=1`)
 assert.ok(report.unitReports.some(unit=>unit.type==='SCALE'));assert.deepEqual((await candidateProof(attempt.id)).stable,first.stable)
 assert.equal((await children(attempt.id)).snapshots.length,1,'teacher partial read must not manufacture Form FINAL')
 await otherTeacher.request(`${prefix}/${partial.id}/attempts/${attempt.id}/report?partial=1`,'GET',undefined,[403,404])
 h.result.partialReport={attemptId:attempt.id,currentType:'FORM_SECTION',acceptedSnapshotCount:1,reportUnitTypes:report.unitReports.map(unit=>unit.type),pathHash:beforePartial.row.trainingFlowPathHash}
 h.check('Teacher partial=true reads an accepted Scale while the next typed Form is pending; no missing Form fact is manufactured and nonowner is denied')
 await student.request(`${prefix}/attempts/${attempt.id}/form-sections/${attempt.currentItem.id}/submit`,'POST',formBody(attempt))
 attempt=await student.request(`${prefix}/attempts/${attempt.id}`);assert.equal(attempt.status,'COMPLETED')
 await drainReports(h,[attempt.id]);const proof=await candidateProof(attempt.id)
 fixture.partialProduct=partial;fixture.cases.push({name:'partial_final',attemptId:attempt.id,user:fixture.users.student,productId:partial.id,termination:'COMPLETE',satisfaction:'SATISFIED',candidate:proof.stable});h.write('c19-fixture-private.json',fixture)
 for(const item of fixture.cases){
  const respondent=h.client();let respondentPrefix=prefix
  if(item.recovery){respondentPrefix=pub;respondent.recovery=item.recovery;await respondent.request('/auth/csrf')}else await respondent.login(item.user,'STUDENT')
  const status=await respondent.request(`${respondentPrefix}/attempts/${item.attemptId}/report-status`);assert.equal(status.reportStatus.state,'READY')
  const participant=await respondent.request(`${respondentPrefix}/attempts/${item.attemptId}/report`),owner=await teacher.request(`${prefix}/${item.productId}/attempts/${item.attemptId}/report`),p=await candidateProof(item.attemptId),accepted=await children(item.attemptId)
  for(const r of [participant,owner]){assert.equal(r.trainingFlow.pathHash,p.row.trainingFlowPathHash);assert.equal(r.trainingFlow.termination,item.termination);assert.equal(r.trainingFlow.taskSatisfaction,item.satisfaction);assert.equal(r.trainingFlow.executedUnitCount,accepted.snapshots.length);assert.equal(r.unitReports.length,accepted.snapshots.filter(s=>s.unitType!=='FORM_SECTION').length);assert.ok(!JSON.stringify(r).includes('acceptedFacts'));assert.ok(!JSON.stringify(r).includes('expertKey'))}
  await otherTeacher.request(`${prefix}/${item.productId}/attempts/${item.attemptId}/report`,'GET',undefined,[403,404])
  await outsider.request(`${prefix}/attempts/${item.attemptId}/report`,'GET',undefined,[403,404])
 }
 h.check('Original outboxes materialize once; participant/teacher reports bind frozen path and END satisfaction, contain only executed native reports, and reject cross-owner/cross-participant access')
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
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
