/** Bounded new synthetic Training Scale HTTP acceptance, not a load/CI test.
 * Run against measurement-v10-stack only. Accounts, courses and one legacy
 * custom Scale are fixtures; accepted answers/FINALs/receipts are never seeded.
 * Scientific grants are DB fixtures, NOT evidence of administrator issuance.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const state=path.resolve(process.argv[2]??''),phase=process.argv[3],index=Number(process.argv[4]??0)
assert.ok(['seed','author','final','reference','reinterpret','reference_context','cognitive_sjt','cognitive_disclosure'].includes(phase))
assert.ok(state.startsWith('/workspace/scratch/5a77e8bdc1ae/measurement-v10-connected-'))
assert.equal(process.version,'v24.21.0');assert.equal(process.env.NODE_ENV,'test');assert.equal(process.env.MEASUREMENT_V10_FIXTURE,'1')
const status=JSON.parse(fs.readFileSync(path.join(state,'status.json')))
const sourceRoot=process.env.MEASUREMENT_V10_SOURCE_ROOT??path.join(state,'source')
const candidate=sourceRoot===path.join(state,'source')?null:JSON.parse(fs.readFileSync(path.join(state,'candidate-inputs.json')))
assert.equal(candidate?.head??status.head,process.env.MEASUREMENT_V10_HEAD)
if(candidate){assert.equal(sourceRoot,candidate.sourceRoot);assert.equal(candidate.baseHead,status.head)}
const database=new URL(process.env.DATABASE_URL)
assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'39403');assert.equal(database.pathname,'/eduk12_measurement_v10_test')
assert.match(database.username,/^v10_runtime_[a-f0-9]{8}$/)
assert.equal(status.apiUrl,'http://127.0.0.1:39991')
const backend=path.join(sourceRoot,'server-version/backend'),require=createRequire(path.join(backend,'package.json'))
const {Prisma,PrismaClient}=require('@prisma/client')
const {prisma}=require(path.join(backend,'src/config/database.ts'))
const owner=new PrismaClient({datasources:{db:{url:process.env.MEASUREMENT_V10_OWNER_DATABASE_URL}}})
const {canonicalHash}=require(path.join(backend,'src/modules/assessment-runtime/canonical.ts'))
const databaseRowHash=value=>canonicalHash(JSON.parse(JSON.stringify(value)))
const {closeQueues}=require(path.join(backend,'src/config/queue.ts'))
const fixturePath=path.join(state,'training-fixture-private.json'),resultPath=path.join(state,`training-${phase}${phase==='final'?'-'+index:''}-result.json`)
const write=(name,value)=>fs.writeFileSync(name,JSON.stringify(value,null,2),{mode:0o600})
let fixture=fs.existsSync(fixturePath)?JSON.parse(fs.readFileSync(fixturePath)):null
const saved=()=>write(fixturePath,fixture)
const result={head:process.env.MEASUREMENT_V10_HEAD,baseHead:status.head,candidate,phase,index,scriptSha256:createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  sourcePatches:fs.existsSync(path.join(state,'source-patches.json'))?JSON.parse(fs.readFileSync(path.join(state,'source-patches.json'))):[],
  candidatePatches:fs.existsSync(path.join(state,'candidate-patches.json'))?JSON.parse(fs.readFileSync(path.join(state,'candidate-patches.json'))):[],
  scientificGrants:'SYNTHETIC_DB_FIXTURE_NOT_ADMIN_ISSUANCE',checks:[],requests:[],passed:false}
const check=name=>{result.checks.push(name);write(resultPath,result);console.log('PASS',name)}
function client(){
  const cookies=new Map()
  return {async request(route,method='GET',body,expected=200,{csrf=true}={}){
    const response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(20000),
      headers:{'content-type':'application/json',...(cookies.size?{cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')}:{}),
        ...(csrf&&cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})})
    for(const raw of response.headers.getSetCookie()){const pair=raw.split(';',1)[0],split=pair.indexOf('=');cookies.set(pair.slice(0,split),pair.slice(split+1))}
    const bytes=Buffer.from(await response.arrayBuffer()),value=JSON.parse(bytes.toString())
    result.requests.push({route,method,status:response.status,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
    write(resultPath,result)
    assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),`${method} ${route}: ${response.status} ${bytes.toString().slice(0,1000)}`)
    if(response.status!==200)return value
    assert.equal(value.code,0,`${route}: ${value.message}`);return value.data
  },async login(actor){
    await this.request('/auth/csrf')
    await this.request('/auth/training-login','POST',{username:actor.username,password:fixture.password,expectedRole:actor.role})
  }}
}
async function grant(id,kind,capabilities,keys){
  // Explicit synthetic fixture, never a product authorizing itself.
  await owner.$executeRaw(Prisma.sql`INSERT INTO content_capability_grants
    (id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,delegable_capabilities,
     remaining_delegation_depth,valid_from,expires_at,ancestry)
    VALUES (${id},${fixture.teacher.id},${fixture.otherTeacher.id},'TRAINING','COURSE',${fixture.courseId},${kind},
      ${keys}::text[],${capabilities}::text[],ARRAY[]::text[],0,clock_timestamp()-interval '1 minute',
      clock_timestamp()+interval '2 hours',ARRAY[${id}]) ON CONFLICT(id) DO NOTHING`)
}
async function seed(){
  if(fixture){
    assert.ok(!fixture.resourcesSeeded&&!fixture.conversion,'Seed has already committed; do not replay it')
    assert.equal(await owner.user.count({where:{id:{in:[fixture.teacher.id,fixture.otherTeacher.id,...fixture.students.map(row=>row.id)]}}}),0,
      'Prior uncertain seed must be reconciled, never replayed')
  }
  const user=role=>({id:randomUUID(),username:'v10-'+randomBytes(6).toString('hex'),role})
  fixture??={label:'NEW SYNTHETIC ONLY; NO ACCEPTED FACT SEED',password:randomBytes(18).toString('hex')+'Az9',
    teacher:user('TEACHER'),otherTeacher:user('TEACHER'),students:Array.from({length:5},()=>user('STUDENT')),
    courseId:randomUUID(),scaleId:randomUUID(),conversionRequestId:randomUUID(),productRequestId:randomUUID(),
    reportGrantId:randomUUID(),referenceGrantId:randomUUID(),dataGrantId:randomUUID(),reportDraftId:randomUUID(),finals:[]}
  saved()
  const {hashPassword}=require(path.join(backend,'src/utils/password.ts')),passwordHash=await hashPassword(fixture.password)
  await owner.$transaction(async tx=>{
    for(const actor of [fixture.teacher,fixture.otherTeacher,...fixture.students])await tx.user.create({data:{...actor,passwordHash,accountDomain:'TRAINING',teacherApproved:true}})
    await tx.course.create({data:{id:fixture.courseId,creatorId:fixture.teacher.id,title:'V10 synthetic measured course',
      courseCode:'V10-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
    await tx.courseStudent.createMany({data:fixture.students.map(actor=>({courseId:fixture.courseId,studentId:actor.id,status:'ACTIVE'}))})
    const {compileResearchScale}=require(path.join(backend,'src/modules/survey/builder.compiler.ts'))
    const {hashScaleDefinition}=require(path.join(backend,'src/modules/scale/scale-definition.ts'))
    const definition=compileResearchScale('V10 synthetic descriptive Scale',{schemaVersion:1,respondentType:'student_self_report',
      aggregation:'mean',responseOptions:[{optionKey:'low',label:'Low',score:1},{optionKey:'high',label:'High',score:2}],
      dimensions:[{dimensionKey:'effort',label:'Synthetic effort',direction:'descriptive'}],
      items:[{itemKey:'v10-item',prompt:'Synthetic response',required:true,reverse:false,dimensionKeys:['effort']}]})
    await tx.scale.create({data:{id:fixture.scaleId,creatorId:fixture.teacher.id,code:'V10-'+randomUUID(),name:'V10 synthetic Scale',
      status:'PUBLISHED',visibility:'COURSE',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'2.0.0',
      definition,definitionHash:hashScaleDefinition(definition),itemCount:1,dimensionCount:1}})
  })
  fixture.resourcesSeeded=true;saved()
  const {planLegacyScaleMeasurementConversion,convertLegacyScaleMeasurement}=require(path.join(backend,'src/modules/scale/onboarding/measurement-conversion.ts'))
  const input={requestId:fixture.conversionRequestId,scaleId:fixture.scaleId,actorUserId:fixture.teacher.id,
    recoveryPoint:'DISPOSABLE_EMPTY_SYNTHETIC_CLUSTER; NO HISTORICAL USER DATA'}
  const plan=await planLegacyScaleMeasurementConversion(prisma,input)
  fixture.conversion=await convertLegacyScaleMeasurement(prisma,{...input,expectedProofHash:plan.proofHash});saved()
  assert.equal(await prisma.assessment.count(),0);assert.equal(await prisma.compositeAssessmentAttempt.count(),0)
  check('Fresh five-person Training fixture; original custom Scale converter publishes exact measurement without any accepted fact seed')
}
async function author(){
  assert.ok(fixture&&!fixture.authorComplete,'Passed author phase is not repeated')
  const teacher=client();await teacher.login(fixture.teacher)
  let product=fixture.product
  if(!product){
    await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'CSRF negative',questionnaireType:'COURSE',courseIds:[fixture.courseId]},403,{csrf:false})
    product=await teacher.request('/questionnaire-products','POST',{requestId:fixture.productRequestId,name:'V10 measured Scale with frozen report',
      questionnaireType:'COURSE',courseIds:[fixture.courseId],publicEnabled:false})
    fixture.product=product;saved()
  }
  if(!fixture.itemId){
    product=await teacher.request(`/questionnaire-products/${product.id}/items`,'POST',{revision:product.revision,item:{type:'SCALE',scaleId:fixture.scaleId,required:true}})
    fixture.product=product;fixture.itemId=product.items[0].id;saved()
  }
  const itemId=fixture.itemId
  const base=`/questionnaire-products/${product.id}/content-reports/courses/${fixture.courseId}`
  if(!fixture.reportDraft){
    const other=client();await other.login(fixture.otherTeacher)
    await teacher.request(`${base}/measurements?grantId=${fixture.reportGrantId}`,'GET',undefined,403)
    await grant(fixture.reportGrantId,'report',['report.edit','report.publish'],[product.id])
    await other.request(`${base}/measurements?grantId=${fixture.reportGrantId}`,'GET',undefined,403)
    const measurements=await teacher.request(`${base}/measurements?grantId=${fixture.reportGrantId}`)
    assert.equal(measurements.length,1);assert.equal(measurements[0].id,fixture.conversion.measurementReleaseId)
    const payload={measurementReleaseId:measurements[0].id,metricKeys:['effort'],audience:'teacher',language:'zh-CN',
      template:{title:'V10 synthetic frozen report',blocks:[{type:'METRIC',metricKey:'effort',display:'RAW'}],limitations:['Synthetic acceptance data only']},assets:[]}
    await teacher.request(`${base}?grantId=${fixture.reportGrantId}`,'POST',{requestId:randomUUID(),reportKey:'unsafe',version:'1',
      payload:{...payload,template:{blocks:[{type:'SCRIPT',expression:'1+1'}]}}},400)
    fixture.reportDraft=await teacher.request(`${base}?grantId=${fixture.reportGrantId}`,'POST',{requestId:fixture.reportDraftId,reportKey:'v10',version:'1',payload});saved()
    check('Actual cookies/CSRF and current teacher ownership enforced; no-capability and foreign-owner reads denied')
  }
  const draft=fixture.reportDraft
  if(!fixture.report){
    fixture.report=await teacher.request(`${base}/${draft.id}/publish?grantId=${fixture.reportGrantId}`,'POST',{revision:draft.revision,publicationNote:'Synthetic V10 report publication'});saved()
  }
  const release=fixture.report
  if(!fixture.reportSelected){
    product=await teacher.request(`/questionnaire-products/${product.id}/content-report-selection`,'POST',{revision:product.revision,
      selection:{schemaVersion:1,units:[{itemId,reportReleaseId:release.releaseId}]}})
    fixture.product=product;fixture.reportSelected=true;saved()
  }
  if(!fixture.preflightComplete){
    const preflight=await teacher.request(`/questionnaire-products/${product.id}/preflight`,'POST',{revision:product.revision})
    assert.equal(preflight.ok,true,JSON.stringify(preflight));fixture.preflightComplete=true;saved()
  }
  product=await teacher.request(`/questionnaire-products/${product.id}/publish`,'POST',{revision:product.revision})
  fixture.product=product;fixture.authorComplete=true;saved()
  const stored=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:product.id}})
  assert.ok(stored.trainingContentSnapshot&&stored.trainingContentSnapshotHash)
  assert.equal(stored.trainingContentSnapshot.units[0].measurement.releaseId,fixture.conversion.measurementReleaseId)
  assert.equal(stored.trainingContentSnapshot.units[0].report.releaseId,release.releaseId)
  check('Strict declarative report HTTP author/publish/selection and parent publication freeze exact measurement/report identities')
}
async function final(){
  assert.ok(fixture.authorComplete&&Number.isInteger(index)&&index>=0&&index<5)
  assert.ok(!fixture.finals[index]?.complete,'Already passed FINAL is not repeated')
  const student=client();await student.login(fixture.students[index])
  let attempt,child,job
  if(fixture.finals[index]?.attemptId){
    // Reconcile the exact saved operation, never create/resubmit another attempt
    // after a transport/assertion failure whose writes may already have committed.
    attempt=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:fixture.finals[index].attemptId}})
    child=await prisma.assessment.findFirstOrThrow({where:{compositeAttemptId:attempt.id}})
    job=await prisma.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:attempt.id,attemptEpoch:1}}})
    assert.equal(attempt.status,'COMPLETED','Partial FINAL requires separate explicit diagnosis')
    assert.equal(job.status,'READY');assert.equal(child.submissionId,fixture.finals[index].submission.submissionId)
    result.reconciledPreviouslyCommittedFinal=true
  }else{
  const created=await student.request(`/composite-assessments/${fixture.product.id}/attempts`,'POST',{})
  attempt=created.attempt
  fixture.finals[index]={attemptId:attempt.id};saved()
  assert.equal(attempt.currentItem.type,'SCALE')
  child=await prisma.assessment.findFirstOrThrow({where:{compositeAttemptId:attempt.id}})
  const body={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:attempt.currentItem.definitionHash,
    contextSnapshotHash:attempt.contextSnapshotHash,answers:[{itemCode:'v10-item',responseValue:index%2?'high':'low',responseTimeMs:20}]}
  fixture.finals[index].submission=body;saved()
  await student.request(`/scales/assessments/${child.id}`)
  await student.request(`/scales/assessments/${child.id}/submit`,'POST',body)
  const replay=await student.request(`/scales/assessments/${child.id}/submit`,'POST',body);assert.equal(replay.replayed,true)
  await student.request(`/composite-assessments/attempts/${attempt.id}`)
  const {claimCompositeReportJob}=require(path.join(backend,'src/modules/assessment-runtime/report-outbox.service.ts'))
  const {processCompositeReportJob}=require(path.join(backend,'src/workers/compositeReportWorker.ts'))
  job=await claimCompositeReportJob();assert.ok(job);assert.equal(job.attemptId,attempt.id)
  if(index===4){
    assert.match(attempt.id,/^[a-f0-9-]{36}$/)
    const before=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}})
    const select=row=>({status:row.status,completedAt:row.completedAt,aggregateInputHash:row.aggregateInputHash,
      receipt:row.trainingContentInterpretationEncrypted,receiptHash:row.trainingContentInterpretationHash})
    // Add only a stricter, target-specific failure trigger to this disposable
    // cluster. Never disable or alter any original immutability/authorization.
    await owner.$executeRawUnsafe(`CREATE FUNCTION v10_receipt_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id='${attempt.id}' AND NEW.training_content_interpretation_encrypted IS NOT NULL
        THEN RAISE EXCEPTION 'V10_CONTROLLED_RECEIPT_FAILURE'; END IF; RETURN NEW; END $$`)
    await owner.$executeRawUnsafe('CREATE TRIGGER v10_receipt_fault BEFORE UPDATE ON composite_assessment_attempts FOR EACH ROW EXECUTE FUNCTION v10_receipt_fault()')
    try{
      await processCompositeReportJob(job)
      const after=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}})
      assert.deepEqual(select(after),select(before),'Receipt write failure must roll back parent FINAL in the owning transaction')
      assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:attempt.id}}),1)
      const retry=await prisma.compositeReportJob.findUniqueOrThrow({where:{id:job.id}})
      assert.equal(retry.status,'PENDING');assert.equal(retry.errorCode,'REPORT_GENERATION_FAILED')
      fixture.finals[index].receiptRollbackVerified=true;saved()
      check('Controlled receipt-write failure rolls back original aggregate FINAL atomically while accepted child fact remains durable')
      await new Promise(resolve=>setTimeout(resolve,Math.max(0,retry.nextAttemptAt.getTime()-Date.now())+80))
    }finally{
      await owner.$executeRawUnsafe('DROP TRIGGER v10_receipt_fault ON composite_assessment_attempts')
      await owner.$executeRawUnsafe('DROP FUNCTION v10_receipt_fault()')
    }
    job=await claimCompositeReportJob();assert.ok(job);assert.equal(job.attemptId,attempt.id)
  }
  await processCompositeReportJob(job)
  const jobAfter=await prisma.compositeReportJob.findUniqueOrThrow({where:{id:job.id}})
  assert.equal(jobAfter.status,'READY',JSON.stringify({status:jobAfter.status,error:jobAfter.lastError}))
  }
  const parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}})
  assert.equal(parent.status,'COMPLETED');assert.ok(parent.trainingContentInterpretationEncrypted&&parent.trainingContentInterpretationHash)
  const {decodeTrainingFinalReceipt}=require(path.join(backend,'src/modules/composite/training-content-final.ts'))
  const receipt=decodeTrainingFinalReceipt(parent)
  assert.equal(receipt.sources.length,1);assert.equal(receipt.interpretation.units[0].report.status,'READY')
  const snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attempt.id}})
  assert.equal(snapshots.length,1)
  const compact=process.env.ASSESSMENT_COMPACT_FACTS_ENABLED==='true'
  assert.equal(await prisma.assessmentResultFact.count({where:{assessmentId:child.id}}),compact?1:0)
  result.scaleStorageMode=compact?'COMPACT_FACT_ROW':'EXISTING_INLINE_ENCRYPTED_RESULT'
  const storedChild=await prisma.assessment.findUniqueOrThrow({where:{id:child.id}})
  assert.equal(storedChild.status,'COMPLETED');assert.equal(storedChild.submissionId,fixture.finals[index].submission.submissionId)
  const {loadStoredCanonicalUnitResult}=require(path.join(backend,'src/modules/assessment-runtime/compact-assessment-storage.ts'))
  const canonical=await loadStoredCanonicalUnitResult(snapshots[0].canonicalResultEncrypted,prisma)
  assert.equal(canonical.resultHash,receipt.sources[0].resultHash)
  assert.equal(canonical.core.metrics.find(metric=>metric.key==='effort').value,index%2?2:1)
  const storedBefore=databaseRowHash({parent,snapshots})
  await student.request(`/composite-assessments/attempts/${attempt.id}/report`)
  const parentAfter=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attempt.id}})
  assert.equal(databaseRowHash({parent:parentAfter,snapshots:await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attempt.id}})}),storedBefore)
  fixture.finals[index]={...fixture.finals[index],complete:true,childId:child.id,receiptHash:parent.trainingContentInterpretationHash,
    aggregateHash:parent.aggregateInputHash,sourceResultHash:receipt.sources[0].resultHash,jobId:job.id};saved()
  check('Actual Scale start, native FINAL/replay, original durable outbox claim/process and frozen FINAL receipt; report GET preserves stored parent/facts')
}
async function reference(){
  assert.equal(fixture.finals.filter(row=>row.complete).length,5)
  const teacher=client();await teacher.login(fixture.teacher)
  await grant(fixture.referenceGrantId,'reference',['reference.analyze','reference.review','reference.publish'],[fixture.product.id])
  const base=`/questionnaire-products/${fixture.product.id}/reference-candidates/courses/${fixture.courseId}`
  const input={requestId:randomUUID(),selector:{itemId:fixture.itemId,scoreKey:'effort',publication:fixture.product.publishedAt,
    configDigest:null,variantKey:null},referenceVersion:'1',evidence:{methodRationale:'Synthetic descriptive sample',inclusionRule:'Five distinct synthetic learners',
    missingness:'No missing accepted response',repeatResponses:'One FINAL per person',organizationClustering:'One synthetic course',
    administrationDifferences:'Same frozen publication',uncertainty:'Not a population norm',applicability:'Isolated fixture only',sampleAdequacy:'Five for contract floor only'}}
  fixture.referenceCreateInput=input;saved()
  const candidate=await teacher.request(`${base}?grantId=${fixture.referenceGrantId}`,'POST',input)
  fixture.candidate=candidate;saved()
  assert.equal(candidate.sampleSize,5);assert.equal(candidate.definition.entries[0].referenceKind,'descriptive_sample')
  for(const item of fixture.finals)assert.ok(!JSON.stringify(candidate).includes(item.attemptId))
  const recovered=await teacher.request(`${base}/request-status/CREATE?grantId=${fixture.referenceGrantId}`,'POST',input)
  assert.equal(recovered.status,'COMPLETED')
  const review=await teacher.request(`${base}/${candidate.candidateId}/review?grantId=${fixture.referenceGrantId}`,'POST',{
    requestId:randomUUID(),candidateHash:candidate.candidateHash,decision:'APPROVED',statement:'Synthetic exact source reviewed; not formal norms'})
  const published=await teacher.request(`${base}/${candidate.candidateId}/publish?grantId=${fixture.referenceGrantId}`,'POST',{
    requestId:randomUUID(),reviewId:review.reviewId,localKey:'v10-private',version:'1'})
  fixture.reference=published;saved()
  check('Five real HTTP FINALs feed current-authorized candidate/review/private publication; exact request status recovers without source ID disclosure')
}
async function reinterpret(){
  const original=fixture.finals[0];assert.ok(original?.complete)
  const teacher=client(),other=client();await teacher.login(fixture.teacher);await other.login(fixture.otherTeacher)
  const base=`/questionnaire-products/${fixture.product.id}/courses/${fixture.courseId}/attempts/${original.attemptId}/interpretations`
  const input={requestId:randomUUID(),itemId:fixture.itemId,reason:'Synthetic explicit historical interpretation',reportReleaseId:fixture.report.releaseId,references:[]}
  fixture.reinterpretInput=input;saved()
  await teacher.request(`${base}?grantId=${fixture.dataGrantId}`,'POST',input,403)
  await grant(fixture.dataGrantId,'data',['data.reinterpret'],[original.attemptId])
  const before=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:original.attemptId}})
  const artifact=await teacher.request(`${base}?grantId=${fixture.dataGrantId}`,'POST',input)
  fixture.artifact=artifact;saved()
  await other.request(`${base}/${artifact.artifactId}?grantId=${fixture.dataGrantId}`,'GET',undefined,403)
  const replay=await teacher.request(`${base}?grantId=${fixture.dataGrantId}`,'POST',input)
  assert.equal(replay.artifactId,artifact.artifactId);assert.equal(replay.artifactHash,artifact.artifactHash)
  const exported=await teacher.request(`${base}/${artifact.artifactId}/export?grantId=${fixture.dataGrantId}`)
  assert.equal(databaseRowHash(await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:original.attemptId}})),databaseRowHash(before))
  fixture.artifactExport=exported;saved()
  await assert.rejects(prisma.$executeRaw`DELETE FROM training_interpretation_artifacts WHERE id=${artifact.artifactId}`)
  check('Explicit reinterpretation requires exact current data capability; same UUID replays immutable artifact/export and original FINAL stays unchanged')
}
async function reference_context(){
  assert.ok(candidate&&fixture.reference&&!fixture.referenceContext?.complete)
  fixture.referenceContext??={requestId:randomUUID()};const f=fixture.referenceContext;saved()
  const teacher=client(),student=client(),other=client()
  await teacher.login(fixture.teacher);await student.login(fixture.students[0]);await other.login(fixture.otherTeacher)
  let product=f.product
  if(!product){
    product=await teacher.request('/questionnaire-products','POST',{requestId:f.requestId,name:'V10 explicit same-course reference and context',
      questionnaireType:'COURSE',courseIds:[fixture.courseId],publicEnabled:false});f.product=product;saved()
  }
  if(!f.contextItemId){
    product=await teacher.request(`/questionnaire-products/${product.id}/items`,'POST',{revision:product.revision,item:{
      type:'FORM',formType:'single_choice',formLabel:'Synthetic grade',required:true,contextKey:'gradeLevel',formOptions:[{value:'1',label:'One'}]}})
    f.product=product;f.contextItemId=product.items.find(item=>item.type==='FORM').id;saved()
  }
  if(!f.scaleItemId){
    product=await teacher.request(`/questionnaire-products/${product.id}/items`,'POST',{revision:product.revision,item:{type:'SCALE',scaleId:fixture.scaleId,required:true}})
    f.product=product;f.scaleItemId=product.items.find(item=>item.type==='SCALE').id;saved()
  }
  if(!f.selected){
    await other.request(`/questionnaire-products/${product.id}/content-reference-choices`,'GET',undefined,403)
    const choices=await teacher.request(`/questionnaire-products/${product.id}/content-reference-choices`)
    const unit=choices.units.find(unit=>unit.itemId===f.scaleItemId)
    const reference=unit.choices.find(choice=>choice.releaseId===fixture.reference.releaseId)
    assert.ok(reference,'Actual producer release must be normally reachable on a new same-owner/same-course draft')
    for(const source of fixture.finals)assert.ok(!JSON.stringify(choices).includes(source.attemptId))
    f.choice=reference;saved()
    product=await teacher.request(`/questionnaire-products/${product.id}/content-reference-selection`,'POST',{revision:product.revision,
      selection:{schemaVersion:1,units:[{itemId:f.scaleItemId,choices:[{releaseId:reference.releaseId,entryKey:reference.entryKey,priority:0}]}]}})
    f.product=product;f.selected=true;saved()
    check('Actual same-owner/course draft explicitly selects original published aggregate reference; foreign owner denied and source attempts hidden')
  }
  if(!f.published){
    const preflight=await teacher.request(`/questionnaire-products/${product.id}/preflight`,'POST',{revision:product.revision})
    assert.equal(preflight.ok,true,JSON.stringify(preflight))
    product=await teacher.request(`/questionnaire-products/${product.id}/publish`,'POST',{revision:product.revision})
    f.product=product;f.published=true;saved()
  }
  if(!f.attemptId){
    const created=await student.request(`/composite-assessments/${product.id}/attempts`,'POST',{})
    const attempt=created.attempt;assert.equal(attempt.currentItem.type,'FORM_SECTION')
    f.attemptId=attempt.id;f.sectionId=attempt.currentItem.formSectionId
    f.contextSubmission={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:attempt.currentItem.definitionHash,
      contextSnapshotHash:attempt.contextSnapshotHash,answers:[{formItemId:f.contextItemId,value:'1'}]};saved()
  }
  const route=`/composite-assessments/attempts/${f.attemptId}/form-sections/${f.sectionId}/submit`
  if(!f.rollbackVerified){
    const before=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.attemptId}})
    assert.equal(before.trainingReferenceBindingHash,null);assert.equal(before.contextSnapshotHash,null)
    assert.match(f.attemptId,/^[a-f0-9-]{36}$/)
    await owner.$executeRawUnsafe(`CREATE FUNCTION v10_reference_context_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id='${f.attemptId}' AND NEW.training_reference_binding IS NOT NULL
       THEN RAISE EXCEPTION 'V10_CONTROLLED_REFERENCE_CONTEXT_FAILURE'; END IF; RETURN NEW; END $$`)
    await owner.$executeRawUnsafe('CREATE TRIGGER v10_reference_context_fault BEFORE UPDATE ON composite_assessment_attempts FOR EACH ROW EXECUTE FUNCTION v10_reference_context_fault()')
    try{
      await student.request(route,'POST',f.contextSubmission,[409,500])
      const after=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.attemptId}})
      assert.equal(after.contextSnapshotHash,null);assert.equal(after.contextSnapshotEncrypted,null)
      assert.equal(after.trainingReferenceBindingHash,null);assert.equal(after.trainingReferenceBinding,null)
      assert.equal(await prisma.compositeFormAnswer.count({where:{attemptId:f.attemptId}}),0)
      assert.equal(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:f.attemptId}}),0)
      const section=await prisma.compositeFormSectionAttempt.findUniqueOrThrow({where:{attemptId_sectionId:{attemptId:f.attemptId,sectionId:f.sectionId}}})
      assert.equal(section.status,'IN_PROGRESS');assert.equal(section.submissionId,null)
      assert.equal(after.status,'IN_PROGRESS');f.rollbackVerified=true;saved()
      check('UNIFIED context/reference write failure rolls back accepted answer, section FINAL, canonical fact, context and reference binding together')
    }finally{
      await owner.$executeRawUnsafe('DROP TRIGGER v10_reference_context_fault ON composite_assessment_attempts')
      await owner.$executeRawUnsafe('DROP FUNCTION v10_reference_context_fault()')
    }
  }
  if(!f.contextComplete){
    const prior=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.attemptId}})
    if(!prior.contextSnapshotHash)await student.request(route,'POST',f.contextSubmission)
    else{
      const section=await prisma.compositeFormSectionAttempt.findUniqueOrThrow({where:{attemptId_sectionId:{attemptId:f.attemptId,sectionId:f.sectionId}}})
      assert.equal(section.status,'COMPLETED');assert.equal(section.submissionId,f.contextSubmission.submissionId)
      result.reconciledPreviouslyCommittedContext=true
    }
    const bound=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.attemptId}})
    assert.ok(bound.contextSnapshotHash&&bound.trainingReferenceBindingHash)
    assert.equal(bound.trainingReferenceBinding.contextHash,bound.contextSnapshotHash)
    assert.deepEqual(bound.trainingReferenceBinding.units[0].references[0],{metricKey:'effort',referenceKind:'descriptive_sample',
      status:'SELECTED',releaseId:fixture.reference.releaseId,contentHash:fixture.reference.contentHash,entryKey:f.choice.entryKey})
    f.bindingHash=bound.trainingReferenceBindingHash;f.contextHash=bound.contextSnapshotHash;saved()
    const replay=await student.request(route,'POST',f.contextSubmission)
    assert.equal(replay.replayed,true)
    assert.equal((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.attemptId}})).trainingReferenceBindingHash,f.bindingHash)
    await assert.rejects(prisma.$executeRaw`UPDATE composite_assessment_attempts SET training_reference_binding=NULL,training_reference_binding_hash=NULL WHERE id=${f.attemptId}`)
    f.contextComplete=true;saved()
    check('Original UUID retry commits exact context-selected reference once; replay preserves binding hash and runtime cannot erase immutable selection')
  }
  if(!f.scaleComplete){
    const stateResponse=await student.request(`/composite-assessments/attempts/${f.attemptId}`)
    const attempt=stateResponse.attempt??stateResponse;assert.equal(attempt.currentItem.type,'SCALE')
    const child=await prisma.assessment.findFirstOrThrow({where:{compositeAttemptId:f.attemptId}})
    f.scaleSubmission??={submissionId:randomUUID(),attemptEpoch:attempt.attemptEpoch,definitionHash:attempt.currentItem.definitionHash,
      contextSnapshotHash:attempt.contextSnapshotHash,answers:[{itemCode:'v10-item',responseValue:'high',responseTimeMs:20}]};saved()
    await student.request(`/scales/assessments/${child.id}/submit`,'POST',f.scaleSubmission)
    f.scaleComplete=true;f.childId=child.id;saved()
  }
  if(!f.finalComplete){
    await student.request(`/composite-assessments/attempts/${f.attemptId}`)
    const {claimCompositeReportJob}=require(path.join(backend,'src/modules/assessment-runtime/report-outbox.service.ts'))
    const {processCompositeReportJob}=require(path.join(backend,'src/workers/compositeReportWorker.ts'))
    const job=await claimCompositeReportJob();assert.ok(job);assert.equal(job.attemptId,f.attemptId)
    await processCompositeReportJob(job)
    assert.equal((await prisma.compositeReportJob.findUniqueOrThrow({where:{id:job.id}})).status,'READY')
    f.finalComplete=true;saved()
  }
  const final=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.attemptId}})
  const {decodeTrainingFinalReceipt}=require(path.join(backend,'src/modules/composite/training-content-final.ts'))
  const receipt=decodeTrainingFinalReceipt(final)
  assert.equal(final.status,'COMPLETED');assert.equal(receipt.schemaVersion,2);assert.equal(receipt.referenceBindingHash,f.bindingHash)
  assert.equal(receipt.interpretation.units[0].references[0].status,'AVAILABLE')
  assert.equal(final.trainingReferenceBinding.units[0].references[0].releaseId,fixture.reference.releaseId)
  const frozen=databaseRowHash(final);await student.request(`/composite-assessments/attempts/${f.attemptId}/report`)
  assert.equal(databaseRowHash(await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.attemptId}})),frozen)
  if(!f.noContextComplete){
    // A second tiny new delivery checks the distinct absent-context START path.
    // It does not resubmit or rescore any already accepted FINAL.
    assert.ok(!f.noContextProductId,'A partial no-context delivery needs explicit reconciliation, never a replacement fixture')
    let bare=await teacher.request('/questionnaire-products','POST',{requestId:randomUUID(),name:'V10 explicit reference without context',
      questionnaireType:'COURSE',courseIds:[fixture.courseId],publicEnabled:false})
    f.noContextProductId=bare.id;saved()
    bare=await teacher.request(`/questionnaire-products/${bare.id}/items`,'POST',{revision:bare.revision,item:{type:'SCALE',scaleId:fixture.scaleId,required:true}})
    bare=await teacher.request(`/questionnaire-products/${bare.id}/content-reference-selection`,'POST',{revision:bare.revision,
      selection:{schemaVersion:1,units:[{itemId:bare.items[0].id,choices:[{releaseId:fixture.reference.releaseId,entryKey:f.choice.entryKey,priority:0}]}]}})
    bare=await teacher.request(`/questionnaire-products/${bare.id}/publish`,'POST',{revision:bare.revision})
    const started=await student.request(`/composite-assessments/${bare.id}/attempts`,'POST',{})
    f.noContextAttemptId=started.attempt.id;saved()
    assert.equal(started.attempt.currentItem.type,'SCALE')
    const bound=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:started.attempt.id}})
    assert.equal(bound.contextSnapshotHash,null);assert.ok(bound.trainingReferenceBindingHash)
    assert.equal(bound.trainingReferenceBinding.contextHash,null)
    assert.equal(bound.trainingReferenceBinding.units[0].references[0].releaseId,fixture.reference.releaseId)
    assert.equal(bound.trainingReferenceBinding.units[0].references[0].status,'SELECTED')
    f.noContextComplete=true;saved()
    check('Absent-context START freezes exact selection with null context before returning actual Scale delivery')
  }
  f.complete=true;f.receiptHash=final.trainingContentInterpretationHash;saved()
  check('Actual context then native Scale FINAL carries frozen reference hash in V2 immutable receipt; report GET does not mutate accepted history')
}
/** Two original-protocol consumers only. Synthetic timings/answers prove HTTP
 * persistence and frozen identity, not human performance or browser clock quality.
 * Source system actor, source license and capability are explicit fixture rows;
 * no admin session proof/WebAuthn signature is fabricated or claimed as tested. */
async function cognitive_sjt(){
  assert.ok(candidate&&fixture.resourcesSeeded&&!fixture.cognitiveSjt?.complete)
  fixture.cognitiveSjt??={adminId:randomUUID(),configId:randomUUID(),configVersion:'1.0.0-v10-http-'+randomUUID(),
    sourceGrantId:randomUUID(),cognitive:{requestId:randomUUID()},sjt:{requestId:randomUUID()}}
  const f=fixture.cognitiveSjt;saved()
  const teacher=client(),student=client();await teacher.login(fixture.teacher);await student.login(fixture.students[0])
  const {getContentRelease}=require(path.join(backend,'src/modules/measurement-content/repository.ts'))
  const {decodeTrainingFinalReceipt}=require(path.join(backend,'src/modules/composite/training-content-final.ts'))
  const {loadStoredCanonicalUnitResult}=require(path.join(backend,'src/modules/assessment-runtime/compact-assessment-storage.ts'))
  const {decryptCognitivePayload}=require(path.join(backend,'src/modules/cognitive/cognitive.security.ts'))
  const {createInstrumentAuthorizationDraft,approveInstrumentAuthorization,hashInstrumentAuthorizationRecord}=require(path.join(backend,'src/modules/assessment-authorization/records.ts'))
  const {GENERATED_SITUATIONAL_INSTRUMENT_SOURCES}=require(path.join(backend,'src/modules/situational/onboarding/instruments.generated.ts'))
  const {createSituationalInstrumentRegistry}=require(path.join(backend,'src/modules/situational/onboarding/instrument-registry.ts'))
  const {ensureStaticSjtRegistryMapping,publishStaticSjtMeasurement,readStaticSjtMeasurementForStart}=require(path.join(backend,'src/modules/situational/static-measurement-release.ts'))
  const {assertContentAuthority}=require(path.join(backend,'src/modules/measurement-content/content-authority.repository.ts'))
  const installed=createSituationalInstrumentRegistry(GENERATED_SITUATIONAL_INSTRUMENT_SOURCES).sources
  if(!f.sjtSourceIdentity){
    assert.ok(!f.sjtPublished&&!f.sjt.product,'Source choice is frozen before any consumer exists')
    const occupied=await prisma.$queryRaw`SELECT instrument_key,instrument_version FROM static_sjt_measurement_mappings`
    const available=installed.find(source=>source.publication.releaseStatus==='PUBLISHED'&&!occupied.some(row=>
      row.instrument_key===source.content.identity.instrumentKey&&row.instrument_version===source.content.identity.instrumentVersion))
    assert.ok(available,'No unused installed source remains; never rewrite another phase immutable mapping')
    if(f.sourcesSeeded){
      // The first attempted source collided with an already-published race fixture.
      // Keep its authorization/grant/mapping untouched and separately identify the
      // replacement source fixture before creating any actual consumer attempt.
      f.previousSourceFixture={identity:{instrumentKey:'sjt-assertiveness-golden',instrumentVersion:'1.0.0'},
        authorizationId:f.authorizationId,authorizationHash:f.authorizationHash,sourceGrantId:f.sourceGrantId,mappingId:f.mappingId,
        outcome:'CONTENT_STATIC_SJT_DEPLOYMENT_IMMUTABLE; no consumer attempt created'}
      f.sourceGrantId=randomUUID();f.reselectedSourceNeedsAuthorization=true
    }
    f.sjtSourceIdentity=available.content.identity;saved()
  }
  const source=installed.find(s=>s.content.identity.instrumentKey===f.sjtSourceIdentity.instrumentKey&&
    s.content.identity.instrumentVersion===f.sjtSourceIdentity.instrumentVersion)
  assert.ok(source,'Must be an installed generated source, never a development listSituationPackages fixture')
  assert.equal(source.publication.releaseStatus,'PUBLISHED')
  const identity=source.content.identity,deployment={locale:'zh-CN',territory:'CN',commercialNature:'NON_COMMERCIAL',grantee:'V10 disposable synthetic deployment'}
  if(!f.sourcesSeeded){
    assert.equal(await owner.user.count({where:{id:f.adminId}}),0,'Uncertain fixture setup must be reconciled, not replaced')
    const draft=createInstrumentAuthorizationDraft({...identity,grantor:'Synthetic source-license fixture only',grantee:deployment.grantee,
      scope:{electronicAdministration:true,scoring:true,translation:false,display:true,territories:['CN'],locales:['zh-CN'],commercialNature:'NON_COMMERCIAL'},
      validFrom:new Date(Date.now()-60000).toISOString(),validTo:new Date(Date.now()+7200000).toISOString(),
      basis:'Disposable HTTP acceptance only; not evidence of a real license or administrator issuance',createdByUserId:fixture.otherTeacher.id})
    const {record}=approveInstrumentAuthorization({record:draft,actorUserId:f.adminId})
    f.authorizationId=record.authorizationId;f.authorizationHash=hashInstrumentAuthorizationRecord(record);saved()
    await owner.$transaction(async tx=>{
      await tx.user.create({data:{id:f.adminId,username:'v10-source-'+randomUUID(),passwordHash:'unusable-synthetic-source-fixture',
        role:'ADMIN',platformRole:'SYSTEM_ADMIN',isActive:true,isFrozen:false}})
      await tx.cognitiveTestConfig.create({data:{id:f.configId,testType:'gonogo',configVersion:f.configVersion,name:'V10 original Go/No-Go protocol fixture',
        config:{totalTrials:120,nogoRatio:0.25,stimulusMs:800,isiMs:500,validRtFloorMs:100,report:{reportVersion:'1.0.0',referenceMode:'none'}},
        status:'DRAFT',engineVersion:'1.0.0',scoringVersion:'1.0.0',accessPolicy:'OPEN'}})
      await tx.instrumentAuthorization.create({data:{id:record.authorizationId,authorizationKey:record.authorizationId,version:record.version,
        ...identity,grantor:record.grantor,grantee:record.grantee,...record.scope,validFrom:new Date(record.validFrom),validTo:new Date(record.validTo),
        basis:record.basis,status:record.status,evidenceAssetId:record.evidenceAssetId,evidenceSha256:record.evidenceSha256,
        selfApprovalDeclaration:record.selfApprovalDeclaration,approvedByUserId:record.approvedByUserId,approvedAt:new Date(record.approvedAt),
        createdByUserId:record.createdByUserId,recordHash:f.authorizationHash,createdAt:new Date(record.createdAt),updatedAt:new Date(record.updatedAt)}})
    })
    f.sourcesSeeded=true;saved()
  }
  if(f.reselectedSourceNeedsAuthorization){
    const draft=f.pendingSourceAuthorization??createInstrumentAuthorizationDraft({...identity,grantor:'Synthetic source-license fixture only',grantee:deployment.grantee,
      scope:{electronicAdministration:true,scoring:true,translation:false,display:true,territories:['CN'],locales:['zh-CN'],commercialNature:'NON_COMMERCIAL'},
      validFrom:new Date(Date.now()-60000).toISOString(),validTo:new Date(Date.now()+7200000).toISOString(),
      basis:'Separate unused-source fixture; preserve prior occupied source and license unchanged',createdByUserId:fixture.otherTeacher.id})
    f.pendingSourceAuthorization=draft;saved()
    const {record}=approveInstrumentAuthorization({record:draft,actorUserId:f.adminId,now:draft.createdAt})
    const recordHash=hashInstrumentAuthorizationRecord(record)
    const prior=await owner.instrumentAuthorization.findUnique({where:{id:record.authorizationId}})
    if(prior)assert.equal(prior.recordHash,recordHash)
    else await owner.instrumentAuthorization.create({data:{id:record.authorizationId,authorizationKey:record.authorizationId,version:record.version,
      ...identity,grantor:record.grantor,grantee:record.grantee,...record.scope,validFrom:new Date(record.validFrom),validTo:new Date(record.validTo),
      basis:record.basis,status:record.status,evidenceAssetId:record.evidenceAssetId,evidenceSha256:record.evidenceSha256,
      selfApprovalDeclaration:record.selfApprovalDeclaration,approvedByUserId:record.approvedByUserId,approvedAt:new Date(record.approvedAt),
      createdByUserId:record.createdByUserId,recordHash,createdAt:new Date(record.createdAt),updatedAt:new Date(record.updatedAt)}})
    f.authorizationId=record.authorizationId;f.authorizationHash=recordHash;f.reselectedSourceNeedsAuthorization=false;saved()
  }
  if(!f.configPublished){
    const stored=await prisma.cognitiveTestConfig.findUniqueOrThrow({where:{id:f.configId}})
    if(stored.status==='DRAFT'){
      const {publishCognitiveConfig}=require(path.join(backend,'src/modules/cognitive/release.service.ts'))
      await publishCognitiveConfig(f.configId,f.adminId)
    }else assert.equal(stored.status,'PUBLISHED')
    f.configPublished=true;saved()
  }
  if(!f.sjtPublished){
    const mapping=await prisma.$transaction(tx=>ensureStaticSjtRegistryMapping(tx,identity))
    f.mappingId=mapping.id;saved()
    await owner.$executeRaw(Prisma.sql`INSERT INTO content_capability_grants
      (id,subject_id,issuer_id,product,scope_kind,scope_id,resource_kind,resource_keys,capabilities,delegable_capabilities,
       remaining_delegation_depth,valid_from,expires_at,ancestry)
      VALUES(${f.sourceGrantId},${f.adminId},${fixture.otherTeacher.id},'TRAINING','PLATFORM','situational-registry','measurement',
        ${[mapping.id]}::text[],ARRAY['measurement.publish'],ARRAY[]::text[],0,clock_timestamp()-interval '1 minute',
        clock_timestamp()+interval '2 hours',ARRAY[${f.sourceGrantId}]) ON CONFLICT(id) DO NOTHING`)
    f.sjtPublished=await prisma.$transaction(async tx=>{
      // This explicit fixture caller is not the strongly authenticated admin route.
      const actor=await tx.user.findUniqueOrThrow({where:{id:f.adminId}})
      assert.equal(actor.platformRole,'SYSTEM_ADMIN');assert.equal(actor.isActive,true);assert.equal(actor.isFrozen,false)
      const authority={actorId:f.adminId,grantId:f.sourceGrantId,capability:'measurement.publish',scope:{product:'TRAINING',
        scopeKind:'PLATFORM',scopeId:'situational-registry',resourceKind:'measurement',resourceKeys:[mapping.id]}}
      await assertContentAuthority(tx,authority)
      const published=await publishStaticSjtMeasurement(tx,{actorId:f.adminId,mappingId:mapping.id,deployment})
      await assertContentAuthority(tx,authority)
      assert.equal(published.release.provenance.sourceAuthorization.authorizationId,f.authorizationId)
      assert.equal(published.release.provenance.sourceAuthorization.recordHash,f.authorizationHash)
      return {releaseId:published.release.releaseId,contentHash:published.release.contentHash,
        measurementHash:published.release.content.measurementHash,scoringVersion:published.release.content.scoringVersion}
    });saved()
    check('Installed PUBLISHED static SJT source passes real mapping/license/capability/publication services under explicit synthetic permissions, not WebAuthn issuance')
  }
  if(f.previousSourceFixture&&!f.previousSourceFixture.expiryVerified){
    const [mapping]=await prisma.$queryRaw(Prisma.sql`SELECT measurement_release_id FROM static_sjt_measurement_mappings WHERE id=${f.previousSourceFixture.mappingId}`)
    assert.ok(mapping?.measurement_release_id)
    const release=await getContentRelease(prisma,mapping.measurement_release_id)
    const sourceAuthorization=release.provenance.sourceAuthorization
    const oldLicense=await prisma.instrumentAuthorization.findFirstOrThrow({where:{authorizationKey:sourceAuthorization.authorizationId,version:sourceAuthorization.authorizationVersion}})
    const [clock]=await prisma.$queryRaw`SELECT clock_timestamp() AS now`
    assert.equal(oldLicense.recordHash,sourceAuthorization.recordHash);assert.ok(oldLicense.validTo<clock.now,'Do not replace a still-current source license')
    await assert.rejects(prisma.$transaction(tx=>readStaticSjtMeasurementForStart(tx,f.previousSourceFixture.identity)),/CONTENT_STATIC_SJT_SOURCE_LICENSE_DENIED/)
    f.previousSourceFixture={...f.previousSourceFixture,expiryVerified:true,originalSourceAuthorizationId:sourceAuthorization.authorizationId,
      originalSourceAuthorizationHash:sourceAuthorization.recordHash,validTo:oldLicense.validTo.toISOString(),checkedAt:clock.now.toISOString()};saved()
    result.priorSourceFixture=f.previousSourceFixture
    check('Previously occupied source original pinned authorization is expired by real database clock and original START license resolver denies reuse; old mapping remains untouched')
  }
  async function product(part,item){
    let p=part.product
    if(!p){p=await teacher.request('/questionnaire-products','POST',{requestId:part.requestId,name:'V10 '+item.type+' frozen HTTP consumer',
      questionnaireType:'COURSE',courseIds:[fixture.courseId],publicEnabled:false});part.product=p;saved()}
    if(!part.itemId){p=await teacher.request(`/questionnaire-products/${p.id}/items`,'POST',{revision:p.revision,item});part.product=p;part.itemId=p.items[0].id;saved()}
    if(!part.published){p=await teacher.request(`/questionnaire-products/${p.id}/publish`,'POST',{revision:p.revision});part.product=p;part.published=true;saved()}
    return part.product
  }
  async function start(part){
    if(!part.attemptId){const started=await student.request(`/composite-assessments/${part.product.id}/attempts`,'POST',{});part.attemptId=started.attempt.id;saved()}
    const response=await student.request(`/composite-assessments/attempts/${part.attemptId}`)
    return response.attempt??response
  }
  async function finish(part,family){
    await student.request(`/composite-assessments/attempts/${part.attemptId}`)
    let job=await prisma.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:part.attemptId,attemptEpoch:1}}})
    if(job.status!=='READY'){
      assert.equal(job.status,'PENDING','Uncertain worker outcome needs diagnosis, never another attempt')
      const {claimCompositeReportJob}=require(path.join(backend,'src/modules/assessment-runtime/report-outbox.service.ts'))
      const {processCompositeReportJob}=require(path.join(backend,'src/workers/compositeReportWorker.ts'))
      job=await claimCompositeReportJob();assert.ok(job);assert.equal(job.attemptId,part.attemptId)
      await processCompositeReportJob(job)
      const after=await prisma.compositeReportJob.findUniqueOrThrow({where:{id:job.id}})
      assert.equal(after.status,'READY',JSON.stringify({status:after.status,error:after.lastError}))
    }
    const parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:part.attemptId}})
    assert.equal(parent.status,'COMPLETED');assert.equal(parent.attemptEpoch,1)
    const binding=parent.trainingContentBinding;assert.equal(canonicalHash(binding),parent.trainingContentBindingHash)
    assert.equal(binding.units.length,1);assert.equal(binding.units[0].family,family)
    const publication=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:part.product.id}})
    assert.equal(binding.publicationHash,publication.trainingContentSnapshotHash)
    assert.equal(canonicalHash(publication.trainingContentSnapshot),binding.publicationHash)
    assert.deepEqual(binding.units,publication.trainingContentSnapshot.units)
    const measurement=await getContentRelease(prisma,binding.units[0].measurement.releaseId)
    assert.ok(measurement);assert.equal(measurement.family,family);assert.equal(measurement.status,'PUBLISHED')
    assert.deepEqual(binding.units[0].measurement,{releaseId:measurement.releaseId,contentHash:measurement.contentHash,measurementHash:measurement.content.measurementHash})
    const snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:part.attemptId}})
    assert.equal(snapshots.length,1);assert.equal(snapshots[0].sourceAttemptId,part.childId)
    const canonical=await loadStoredCanonicalUnitResult(snapshots[0].canonicalResultEncrypted,prisma)
    assert.equal(canonical.core.unitType,family==='SJT'?'SITUATIONAL':family)
    assert.equal(canonical.core.scorerVersion,measurement.content.scoringVersion)
    assert.equal(canonical.core.contextHash,parent.contextSnapshotHash)
    const receipt=decodeTrainingFinalReceipt(parent);assert.ok(receipt)
    assert.equal(receipt.sources.length,1);assert.equal(receipt.sources[0].itemId,part.itemId)
    assert.equal(receipt.sources[0].resultHash,canonical.resultHash);assert.equal(receipt.contentBindingHash,parent.trainingContentBindingHash)
    assert.equal(receipt.aggregateInputHash,parent.aggregateInputHash);assert.equal(receipt.interpretation.units[0].report.status,'NOT_SELECTED')
    const unchanged=databaseRowHash({parent,snapshots})
    const participant=await student.request(`/composite-assessments/attempts/${part.attemptId}/report`)
    const teacherReport=await teacher.request(`/composite-assessments/${part.product.id}/attempts/${part.attemptId}/report`)
    assert.equal(databaseRowHash({parent:await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:part.attemptId}}),
      snapshots:await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:part.attemptId}})}),unchanged)
    for(const report of [participant,teacherReport]){
      assert.equal(report.unitReports.length,1)
      const prohibited=new Set(['rawAnswers','rawResponses','trials','payloadEncrypted','runtimeSnapshotEncrypted','configSnapshotEncrypted','expertKey','choiceScores'])
      const inspect=value=>{if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){assert.ok(!prohibited.has(key),`Report discloses ${key}`);inspect(child)}}
      inspect(report)
    }
    part.evidence={attemptId:part.attemptId,childId:part.childId,measurementReleaseId:measurement.releaseId,contentHash:measurement.contentHash,
      measurementHash:measurement.content.measurementHash,scoringVersion:measurement.content.scoringVersion,instrumentVersion:measurement.content.instrumentVersion,
      sourceResultHash:canonical.resultHash,receiptHash:parent.trainingContentInterpretationHash,contentBindingHash:parent.trainingContentBindingHash,
      aggregateInputHash:parent.aggregateInputHash,reportJobId:job.id};saved()
    return {canonical,measurement,binding,participant,teacherReport}
  }
  if(!f.cognitive.complete){
    const c=f.cognitive
    if(!c.assignmentId){
      const assignment=await teacher.request('/cognitive/assignments','POST',{courseId:fixture.courseId,configId:f.configId,
        title:'V10 standard 120-trial protocol',profile:'standard',maxAttempts:1})
      c.assignmentId=assignment.id;saved()
    }
    const sourceAssignment=await prisma.cognitiveAssignment.findUniqueOrThrow({where:{id:c.assignmentId}})
    if(sourceAssignment.status==='DRAFT')await teacher.request(`/cognitive/assignments/${c.assignmentId}/publish`,'POST',{})
    await product(c,{type:'COGNITIVE',cognitiveAssignmentId:c.assignmentId,required:true})
    const attempt=await start(c)
    let child=await prisma.cognitiveSession.findFirstOrThrow({where:{compositeAttemptId:c.attemptId}})
    c.childId=child.id;saved()
    const session=await student.request(`/cognitive/sessions/${child.id}`)
    assert.equal(session.profile,'standard');assert.equal(session.engineVersion,'1.0.0');assert.equal(session.scoringVersion,'1.0.0')
    assert.equal(session.configVersion,f.configVersion);assert.equal(session.config.totalTrials,120)
    assert.equal(session.config.nogoRatio,0.25);assert.equal(session.config.stimulusMs,800);assert.equal(session.config.isiMs,500)
    if(!c.submission){
      assert.equal(attempt.currentItem.type,'COGNITIVE')
      const {gonogoSequence}=require(path.join(backend,'src/modules/cognitive/randomization.ts'))
      const {createTrialEnvelope}=require(path.join(backend,'src/modules/cognitive/v2/trial-envelope.ts'))
      c.submission={submissionId:randomUUID(),attemptEpoch:session.attemptEpoch,definitionHash:session.definitionHash,contextSnapshotHash:session.contextSnapshotHash,
        trials:gonogoSequence(session.randomSeed,120,0.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',
          startedAtPerfMs:trialIndex*1300,endedAtPerfMs:trialIndex*1300+800,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}}))};saved()
    }
    const route=`/cognitive/sessions/${child.id}/submit`
    if(child.status!=='COMPLETED')await student.request(route,'POST',c.submission)
    else assert.equal(child.submissionId,c.submission.submissionId)
    const before=await prisma.cognitiveRawSubmission.findMany({where:{sessionId:child.id}})
    assert.equal(before.length,1);assert.equal(before[0].trialCount,120)
    if(!c.evidence){const replay=await student.request(route,'POST',c.submission);assert.equal(replay.replayed,true)}
    else result.reusedAcceptedCognitiveFinalAndReplay=true
    assert.equal(databaseRowHash(await prisma.cognitiveRawSubmission.findMany({where:{sessionId:child.id}})),databaseRowHash(before))
    assert.equal(await prisma.cognitiveTrial.count({where:{sessionId:child.id}}),0)
    const {decryptUnifiedRuntimePayload}=require(path.join(backend,'src/modules/assessment-runtime/security.ts'))
    const raw=decryptUnifiedRuntimePayload(before[0].payloadEncrypted)
    const {parseUnifiedCognitiveRawSubmissionPayload}=require(path.join(backend,'src/modules/cognitive/unified-raw-submission.ts'))
    assert.deepEqual(parseUnifiedCognitiveRawSubmissionPayload(raw).trials,c.submission.trials)
    const evidence=await finish(c,'COGNITIVE')
    const assignment=await prisma.cognitiveAssignment.findUniqueOrThrow({where:{id:child.assignmentId}})
    const boundAssignment=await prisma.cognitiveAssignment.findUniqueOrThrow({where:{id:evidence.binding.units[0].source.assignmentId}})
    assert.equal(evidence.measurement.provenance.assignmentId,boundAssignment.id)
    assert.equal(evidence.binding.units[0].source.id,child.configId)
    assert.equal(evidence.binding.units[0].source.ownerId,fixture.teacher.id)
    // createCognitiveChild makes a per-course delivery wrapper from the published
    // null-course wrapper. Preserve both identities; prove exact frozen content
    // and ownership rather than pretending the wrapper IDs must be identical.
    assert.equal(boundAssignment.courseId,null);assert.equal(boundAssignment.listedStandalone,false)
    assert.equal(assignment.courseId,fixture.courseId);assert.equal(assignment.listedStandalone,false)
    assert.equal(assignment.quotaSourceAssignmentId,boundAssignment.quotaSourceAssignmentId??boundAssignment.id)
    for(const key of ['createdBy','configId','profile','profileDefinitionVersion','resolvedConfigHash','status'])assert.equal(assignment[key],boundAssignment[key])
    assert.equal(assignment.createdBy,fixture.teacher.id);assert.equal(assignment.configId,f.configId)
    assert.deepEqual(decryptCognitivePayload(assignment.resolvedConfigSnapshotEncrypted),decryptCognitivePayload(boundAssignment.resolvedConfigSnapshotEncrypted))
    assert.deepEqual(decryptCognitivePayload(assignment.resolvedReportSnapshotEncrypted),decryptCognitivePayload(boundAssignment.resolvedReportSnapshotEncrypted))
    assert.equal(evidence.measurement.provenance.resolvedConfigHash,assignment.resolvedConfigHash)
    assert.equal(evidence.canonical.core.scientificProvenance.profileKey,'standard')
    assert.equal(evidence.canonical.core.scientificProvenance.resolvedConfigHash,assignment.resolvedConfigHash)
    const {loadCognitiveSessionConfig}=require(path.join(backend,'src/modules/cognitive/session.service.ts'))
    const storedRuntime=await loadCognitiveSessionConfig(child.configSnapshotEncrypted)
    assert.equal(storedRuntime.snapshot.configHash,session.definitionHash)
    assert.equal(storedRuntime.snapshot.configHash,boundAssignment.resolvedConfigHash)
    assert.deepEqual(storedRuntime.config,decryptCognitivePayload(boundAssignment.resolvedConfigSnapshotEncrypted))
    assert.equal(evidence.canonical.core.sourceDefinitionHash,storedRuntime.compiledRuntime.sourceDefinitionHash)
    assert.equal(evidence.canonical.core.compiledRuntimeHash,storedRuntime.compiledRuntime.compiledRuntimeHash)
    assert.equal(evidence.canonical.core.instrumentVersion,'1.0.0')
    assert.equal(evidence.canonical.core.metrics.find(m=>m.key==='hitRate').value,1)
    assert.equal(evidence.canonical.core.metrics.find(m=>m.key==='commissionRate').value,0)
    const {readFrozenReport}=require(path.join(backend,'src/modules/cognitive/profile-freeze.ts'))
    const frozen=readFrozenReport(assignment.resolvedReportSnapshotEncrypted)
    const completedChild=await prisma.cognitiveSession.findUniqueOrThrow({where:{id:child.id}})
    const storedResult=decryptCognitivePayload(completedChild.resultSnapshotEncrypted)
    assert.equal(storedResult.profile,'standard')
    for(const caveat of frozen.reportCaveats)assert.ok(storedResult.report.reading.methodCaveats.includes(caveat))
    for(const report of [evidence.participant,evidence.teacherReport]){
      const unit=report.unitReports[0],single=unit.singleTaskReport
      assert.equal(single.profile,'standard');assert.equal(single.productIndex,null);assert.equal(single.reference,null)
      assert.ok(!('metrics' in unit)&&!('score' in unit))
      const metrics=[single.headline,...single.primaryMetrics,...single.secondaryMetrics].filter(Boolean)
      assert.ok(metrics.length>0)
      for(const metric of metrics){const definition=frozen.metricDefinitions[metric.key];assert.ok(definition)
        assert.notEqual(definition.role,'research_only');if(definition.availableProfiles)assert.ok(definition.availableProfiles.includes('standard'))}
      assert.equal(single.profileLabel,'标准协议');assert.ok(single.disclaimer.length>0)
    }
    c.complete=true;c.evidence.rawFactCount=1;c.evidence.trialCount=120;c.evidence.profile='standard';c.evidence.publishedSourceAssignmentId=boundAssignment.id;c.evidence.deliveryWrapperAssignmentId=assignment.id;
    c.evidence.resolvedConfigHash=assignment.resolvedConfigHash;c.evidence.frozenReportHash=canonicalHash(frozen);saved()
    check('One real Cognitive HTTP START/native 120-trial FINAL/replay produces exact frozen measurement/profile/scorer receipt; participant/teacher reports exclude raw and research-only data')
  }
  if(!f.sjt.complete){
    const s=f.sjt
    await product(s,{type:'SITUATIONAL',situationalInstrumentKey:identity.instrumentKey,situationalInstrumentVersion:identity.instrumentVersion,required:true})
    const attempt=await start(s)
    const child=await prisma.situationalAttempt.findFirstOrThrow({where:{compositeAttemptId:s.attemptId}})
    s.childId=child.id;saved()
    const route=`/composite-assessments/attempts/${s.attemptId}/items/${s.itemId}/situational/${child.id}`
    const runtime=await student.request(route)
    assert.equal(runtime.instrument.key,identity.instrumentKey);assert.equal(runtime.instrument.version,identity.instrumentVersion)
    assert.equal(runtime.instrument.scoringVersion,source.content.definition.scoring.scoringVersion);assert.ok(!runtime.instrument.online)
    assert.ok(!JSON.stringify(runtime.instrument.definition).includes('choiceScores'))
    if(!s.submission){assert.equal(attempt.currentItem.type,'SITUATIONAL')
      s.submission={submissionId:randomUUID(),attemptEpoch:runtime.attempt.attemptEpoch,definitionHash:runtime.attempt.definitionHash,
        compiledRuntimeHash:runtime.attempt.compiledRuntimeHash,scoringVersion:runtime.attempt.scoringVersion,
        instrumentVersion:identity.instrumentVersion,responses:source.content.goldenCases[0].responses};saved()}
    if(child.status!=='COMPLETED')await student.request(route+'/submit','POST',s.submission)
    else assert.equal(child.submissionId,s.submission.submissionId)
    const before=await prisma.situationalRawSubmission.findMany({where:{attemptId:child.id}})
    assert.equal(before.length,1);assert.equal(before[0].responseCount,source.content.goldenCases[0].responses.length)
    const {decryptUnifiedRuntimePayload}=require(path.join(backend,'src/modules/assessment-runtime/security.ts'))
    const {parseSituationalRawSubmissionPayload}=require(path.join(backend,'src/modules/situational/situational-raw-submission.ts'))
    assert.deepEqual(parseSituationalRawSubmissionPayload(decryptUnifiedRuntimePayload(before[0].payloadEncrypted)).responses,s.submission.responses)
    const replay=await student.request(route+'/submit','POST',s.submission);assert.equal(replay.replayed,true)
    assert.equal(databaseRowHash(await prisma.situationalRawSubmission.findMany({where:{attemptId:child.id}})),databaseRowHash(before))
    const evidence=await finish(s,'SJT')
    assert.equal(evidence.binding.units[0].source.kind,'STATIC_SJT_REGISTRY');assert.equal(evidence.binding.units[0].source.id,f.mappingId)
    assert.equal(evidence.measurement.releaseId,f.sjtPublished.releaseId);assert.equal(evidence.measurement.contentHash,f.sjtPublished.contentHash)
    assert.equal(evidence.measurement.content.measurementHash,f.sjtPublished.measurementHash)
    assert.equal(evidence.measurement.provenance.sourceAuthorization.authorizationId,f.authorizationId)
    assert.equal(evidence.canonical.core.instrumentKey,identity.instrumentKey);assert.equal(evidence.canonical.core.instrumentVersion,identity.instrumentVersion)
    assert.equal(evidence.canonical.core.sourceDefinitionHash,runtime.attempt.definitionHash)
    assert.equal(evidence.canonical.core.compiledRuntimeHash,runtime.attempt.compiledRuntimeHash)
    assert.equal(evidence.canonical.core.scorerVersion,source.content.definition.scoring.scoringVersion)
    for(const [key,value] of Object.entries(source.content.goldenCases[0].expected.metrics))assert.equal(evidence.canonical.core.metrics.find(m=>m.key===key).value,value)
    for(const report of [evidence.participant,evidence.teacherReport]){
      const unit=report.unitReports[0];assert.equal(unit.instrumentVersion,identity.instrumentVersion);assert.equal(unit.scienceMaturity,'PILOT')
      assert.equal(unit.resultHash,evidence.canonical.resultHash)
      for(const [key,value] of Object.entries(source.content.goldenCases[0].expected.metrics))assert.equal(unit.metrics.find(m=>m.key===key).value,value)
    }
    s.complete=true;s.evidence.rawFactCount=1;s.evidence.responseCount=source.content.goldenCases[0].responses.length;s.evidence.instrumentKey=identity.instrumentKey;saved()
    check('One licensed installed SJT HTTP START/original native FINAL/replay keeps exact static source and scorer receipt, one raw fact and PILOT report disclosure')
  }
  f.complete=true;saved()
  result.protocolEvidence={sourceAuthorization:'SYNTHETIC_SOURCE_LICENSE_AND_CAPABILITY_FIXTURES_NOT_REAL_ISSUANCE',
    timing:'SYNTHETIC_PROTOCOL_ENVELOPES_NOT_BROWSER_CLOCK_OR_HUMAN_PERFORMANCE',cognitive:f.cognitive.evidence,sjt:f.sjt.evidence}
}

async function cognitive_disclosure(){
  // Reuse the exact accepted Cognitive child. This phase never STARTs, submits,
  // claims an outbox job, rewrites FINAL, or changes its original report selection.
  const c=fixture?.cognitiveSjt?.cognitive
  assert.ok(candidate&&c?.complete&&!fixture.cognitiveDisclosure?.complete)
  fixture.cognitiveDisclosure??={reportGrantId:randomUUID(),dataGrantId:randomUUID(),
    reportDraftRequestId:randomUUID(),interpretationRequestId:randomUUID()}
  const f=fixture.cognitiveDisclosure;saved()
  const teacher=client();await teacher.login(fixture.teacher)
  const {loadTrainingMetricDisclosure}=require(path.join(backend,'src/modules/composite/training-metric-disclosure.ts'))
  const {loadStoredCanonicalUnitResult}=require(path.join(backend,'src/modules/assessment-runtime/compact-assessment-storage.ts'))
  const accepted=async()=>({
    parent:await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:c.attemptId}}),
    child:await prisma.cognitiveSession.findUniqueOrThrow({where:{id:c.childId}}),
    snapshots:await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:c.attemptId},orderBy:{id:'asc'}}),
    raw:await prisma.cognitiveRawSubmission.findMany({where:{sessionId:c.childId},orderBy:{id:'asc'}}),
    publication:await prisma.compositeAssessment.findUniqueOrThrow({where:{id:c.product.id}}),
    assignments:await prisma.cognitiveAssignment.findMany({where:{id:{in:[c.evidence.publishedSourceAssignmentId,
      c.evidence.deliveryWrapperAssignmentId]}},orderBy:{id:'asc'}}),
  })
  const before=await accepted(),{parent,child,snapshots}=before
  assert.equal(parent.status,'COMPLETED');assert.equal(child.status,'COMPLETED')
  assert.equal(before.raw.length,1);assert.equal(snapshots.length,1);assert.equal(before.assignments.length,2)
  assert.equal(parent.trainingContentInterpretationHash,c.evidence.receiptHash)
  assert.equal(parent.trainingContentBindingHash,c.evidence.contentBindingHash)
  assert.equal(parent.aggregateInputHash,c.evidence.aggregateInputHash)
  assert.equal(canonicalHash(parent.trainingContentBinding),c.evidence.contentBindingHash)
  assert.equal(child.assignmentId,c.evidence.deliveryWrapperAssignmentId)
  assert.notEqual(child.assignmentId,c.evidence.publishedSourceAssignmentId)
  const unit=parent.trainingContentBinding.units.find(row=>row.itemId===c.itemId)
  assert.equal(unit.source.assignmentId,c.evidence.publishedSourceAssignmentId)
  const canonical=await loadStoredCanonicalUnitResult(snapshots[0].canonicalResultEncrypted,prisma)
  assert.equal(canonical.resultHash,c.evidence.sourceResultHash)
  const acceptedHash=databaseRowHash(before)
  if(f.acceptedHash)assert.equal(acceptedHash,f.acceptedHash,'Original accepted facts changed since this read-only phase began')
  else{f.acceptedHash=acceptedHash;saved()}
  const metricKeys=['hitRate','commissionRate']
  const withFacts=await loadTrainingMetricDisclosure(prisma,{parent,unit,source:snapshots[0],audience:'teacher',core:canonical.core})
  const withoutFacts=await loadTrainingMetricDisclosure(prisma,{parent,unit,source:snapshots[0],audience:'teacher',metricKeys})
  for(const key of metricKeys){assert.ok(withFacts.metricKeys.has(key));assert.ok(withoutFacts.metricKeys.has(key))}
  assert.deepEqual([...withFacts.metricKeys].sort(),[...withoutFacts.metricKeys].sort())
  assert.ok(!withFacts.metricKeys.has('productIndex')&&!withFacts.metricKeys.has('product_index'))
  check('Real disclosure guard accepts only the existing exact frozen COURSE delivery wrapper with and without canonical facts; original FINAL is unchanged')

  const reportBase=`/questionnaire-products/${c.product.id}/content-reports/courses/${fixture.courseId}`
  await grant(f.reportGrantId,'report',['report.edit','report.publish'],[c.product.id])
  const measurements=await teacher.request(`${reportBase}/measurements?grantId=${f.reportGrantId}`)
  assert.ok(measurements.some(row=>row.id===c.evidence.measurementReleaseId))
  if(!f.reportDraft){
    f.reportDraft=await teacher.request(`${reportBase}?grantId=${f.reportGrantId}`,'POST',{
      requestId:f.reportDraftRequestId,reportKey:'v10-frozen-cognitive-disclosure',version:'1',
      payload:{measurementReleaseId:c.evidence.measurementReleaseId,metricKeys,audience:'teacher',language:'zh-CN',
        template:{title:'Synthetic frozen Cognitive disclosure',
          blocks:metricKeys.map(metricKey=>({type:'METRIC',metricKey,display:'RAW'})),
          limitations:['Synthetic protocol data only; not human performance or browser-clock validation']},assets:[]}});saved()
  }
  if(!f.report){
    f.report=await teacher.request(`${reportBase}/${f.reportDraft.id}/publish?grantId=${f.reportGrantId}`,'POST',{
      revision:f.reportDraft.revision,publicationNote:'Synthetic explicit historical frozen Cognitive report'});saved()
  }
  const interpretationBase=`/questionnaire-products/${c.product.id}/courses/${fixture.courseId}/attempts/${c.attemptId}/interpretations`
  await grant(f.dataGrantId,'data',['data.reinterpret'],[c.attemptId])
  f.input??={requestId:f.interpretationRequestId,itemId:c.itemId,reason:'Synthetic explicit frozen Cognitive report disclosure',
    reportReleaseId:f.report.releaseId,references:[]};saved()
  if(!f.artifact){
    f.artifact=await teacher.request(`${interpretationBase}?grantId=${f.dataGrantId}`,'POST',f.input);saved()
  }
  const artifact=f.artifact
  const replay=await teacher.request(`${interpretationBase}?grantId=${f.dataGrantId}`,'POST',f.input)
  const read=await teacher.request(`${interpretationBase}/${artifact.artifactId}?grantId=${f.dataGrantId}`)
  const exported=await teacher.request(`${interpretationBase}/${artifact.artifactId}/export?grantId=${f.dataGrantId}`)
  for(const response of [artifact,replay,read]){
    assert.equal(response.artifactId,f.interpretationRequestId);assert.equal(response.artifactHash,artifact.artifactHash)
    assert.equal(canonicalHash(response.artifact),response.artifactHash);assert.equal(response.currentUseStatus,'AVAILABLE')
    assert.deepEqual(response.lifecycleNotices,[])
  }
  assert.equal(exported.exportHash,canonicalHash(exported.document))
  assert.deepEqual(exported.document.artifact,artifact.artifact);assert.equal(exported.document.artifactHash,artifact.artifactHash)
  assert.equal(exported.currentUseStatus,'AVAILABLE');assert.deepEqual(exported.lifecycleNotices,[])
  const value=artifact.artifact
  assert.equal(value.sourceResultHash,c.evidence.sourceResultHash);assert.equal(value.sourceReceiptHash,c.evidence.receiptHash)
  assert.equal(value.sourceBindingHash,c.evidence.contentBindingHash);assert.equal(value.sourceAggregateHash,c.evidence.aggregateInputHash)
  assert.deepEqual(value.previous,{kind:'FINAL_RECEIPT',hash:c.evidence.receiptHash})
  assert.deepEqual(value.versions.measurement,{...unit.measurement,
    version:measurements.find(row=>row.id===c.evidence.measurementReleaseId).version,scoringVersion:c.evidence.scoringVersion})
  assert.equal(value.versions.report.releaseId,f.report.releaseId);assert.equal(value.versions.report.contentHash,f.report.contentHash)
  assert.deepEqual(value.versions.references,[]);assert.equal(value.interpretation.units[0].report.status,'READY')
  assert.equal(value.report.generatorVersion,'DECLARATIVE_REPORT_V1');assert.equal(value.report.blocks.length,2)
  for(const block of value.report.blocks){
    assert.equal(block.type,'METRIC');assert.ok(metricKeys.includes(block.metricKey));assert.equal(block.display,'RAW')
    const metric=canonical.core.metrics.find(row=>row.key===block.metricKey);assert.ok(metric)
    const metricAvailable=metric.quality===undefined||['calculated','OK','interpretable'].includes(metric.quality)
    const expectedStatus=canonical.core.quality.status==='interpretable'&&metricAvailable?'INTERPRETABLE'
      :canonical.core.quality.status==='invalid'?'INVALID':'UNAVAILABLE'
    assert.equal(block.status,expectedStatus)
    assert.equal(block.value,expectedStatus==='INTERPRETABLE'?metric.value:null)
  }
  assert.equal(databaseRowHash(await accepted()),f.acceptedHash)
  const prohibited=new Set(['rawAnswers','rawResponses','trials','payloadEncrypted','configSnapshotEncrypted','expertKey'])
  const inspect=value=>{if(value&&typeof value==='object')for(const [key,nested] of Object.entries(value)){
    assert.ok(!prohibited.has(key),`Disclosure artifact leaks ${key}`);inspect(nested)}}
  inspect(artifact.artifact);inspect(exported.document)
  f.complete=true;f.evidence={attemptId:c.attemptId,childId:c.childId,sourceAssignmentId:unit.source.assignmentId,
    deliveryWrapperAssignmentId:child.assignmentId,sourceResultHash:c.evidence.sourceResultHash,sourceReceiptHash:c.evidence.receiptHash,
    sourceBindingHash:c.evidence.contentBindingHash,measurement:artifact.artifact.versions.measurement,report:artifact.artifact.versions.report,
    artifactId:artifact.artifactId,artifactHash:artifact.artifactHash,exportHash:exported.exportHash,acceptedFactsHash:f.acceptedHash,
    rawFactCount:1,metricKeys,metricStatuses:value.report.blocks.map(row=>({metricKey:row.metricKey,status:row.status}))};saved()
  result.protocolEvidence={purpose:'EXISTING_FINAL_REAL_DISCLOSURE_GUARD_AND_EXPLICIT_HISTORICAL_REPORT_ONLY',
    sourceAuthorization:'SYNTHETIC_REPORT_AND_DATA_CAPABILITY_FIXTURES_NOT_REAL_ISSUANCE',...f.evidence}
  check('Historical declarative Cognitive report CREATE/replay/GET/export pass real HTTP and frozen disclosure; no new attempt, FINAL, raw fact, source mutation or rescoring')
}

try{
  await ({seed,author,final,reference,reinterpret,reference_context,cognitive_sjt,cognitive_disclosure}[phase])()
  result.passed=true
}catch(error){
  result.error={name:error.name,message:error.message};console.error(error);process.exitCode=1
}finally{
  write(resultPath,result);await closeQueues();await Promise.all([prisma.$disconnect(),owner.$disconnect()])
}
