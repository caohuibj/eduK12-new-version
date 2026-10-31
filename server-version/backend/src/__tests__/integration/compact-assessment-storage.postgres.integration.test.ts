import { randomUUID, createHash } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { createReportOutboxFixture } from './report-outbox-fixture'
import { prisma } from '../../config/database'
import { loadScaleAnswers, loadScaleResult } from '../../modules/scale/scale-workflow.service'
import { loadScaleFactRecords, persistScaleFactRecords } from '../../modules/assessment-runtime/scale-fact-records'
import { loadStoredCanonicalUnitResult } from '../../modules/assessment-runtime/compact-assessment-storage'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
const url=integrationDatabaseUrl('REPORT_OUTBOX_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,service:typeof import('../../modules/composite/composite.service'),outbox:typeof import('../../modules/assessment-runtime/report-outbox.service')
let processJob:typeof import('../../workers/compositeReportWorker')['processCompositeReportJob']
const qaIds:string[]=[],questionnaireIds:string[]=[]
const fixtures:Array<Awaited<ReturnType<typeof createReportOutboxFixture>>>=[]
const fixture=async(units=1)=>{const f=await createReportOutboxFixture(db,units);fixtures.push(f);return f}
const claim=async()=>{const job=await outbox.claimCompositeReportJob();if(!job)throw new Error('Expected durable job');return job}
const wholeInput=async(f:Awaited<ReturnType<typeof fixture>>)=>{
 const whole=await import('../../modules/composite/whole-questionnaire.service'),definition=await whole.getWholeQuestionnaireDefinition(f.parent.id,{userId:f.participant.id})
 const children=await db.assessment.findMany({where:{compositeAttemptId:f.parent.id},select:{id:true,compositeItemId:true}})
 return {whole,input:{submissionId:'compact-whole-'+randomUUID(),attemptEpoch:1,slotSetHash:definition.slotSetHash!,contextSnapshotHash:definition.contextSnapshotHash,
  units:definition.units.map(unit=>({itemId:unit.itemId,definitionHash:unit.definitionHash,answers:f.inputs.find(input=>input.assessmentId===children.find(row=>row.compositeItemId===unit.itemId)!.id)!.answers.map((a,i)=>({...a,responseTimeMs:1234+i,changeCount:i}))}))}}
}
suite('compact immutable assessment facts on isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  for(const name of ['ASSESSMENT_SHARED_CONTROL_ENABLED','ASSESSMENT_COMPACT_FACTS_ENABLED','ASSESSMENT_COMPACT_VERIFY_WRITES','ASSESSMENT_REPORT_ASYNC_ENABLED','ASSESSMENT_WHOLE_SUBMIT_ENABLED','ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED','ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED','ASSESSMENT_COMPILED_ARTIFACT_CACHE_ENABLED','ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED','ASSESSMENT_REPORT_COMMITTED_CONTEXT_ENABLED','ASSESSMENT_WHOLE_COMPACT_MANIFEST_ENABLED'])vi.stubEnv(name,'true')
  vi.stubEnv('ASSESSMENT_REPORT_ASYNC_COURSE_IDS','');vi.stubEnv('ASSESSMENT_REPORT_MAX_PENDING','200')
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  service=await import('../../modules/composite/composite.service');outbox=await import('../../modules/assessment-runtime/report-outbox.service');const processor=(await import('../../workers/compositeReportWorker')).processCompositeReportJob
  processJob=async job=>{
   await processor(job)
   const saved=await db.compositeReportJob.findUnique({where:{id:job.id}})
   if(saved?.status==='PENDING'&&saved.errorCode){
    const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:job.attemptId},select:{status:true}})
    if(parent.status==='COMPLETED')await service.materializeCompositeQuestionnaireReport(job.attemptId,{attemptEpoch:job.attemptEpoch,slotSetHash:job.slotSetHash,contextHash:job.contextHash})
    throw new Error('Expected one focused worker run to reach READY: '+saved.errorCode+' parent='+parent.status)
   }
  }
 },30000)
 afterAll(async()=>{
  if(db){
   await db.assessment.deleteMany({where:{questionnaireAssessmentId:{in:qaIds}}});await db.questionnaireAssessment.deleteMany({where:{id:{in:qaIds}}});await db.questionnaire.deleteMany({where:{id:{in:questionnaireIds}}})
   const ids=fixtures.map(f=>f.parent.id),held=await db.compositeReportJob.count({where:{attemptId:{in:ids},budgetHeld:true}})
   // The deferred FK permits authorized parent+receipt removal in one transaction,
   // while prohibiting a standalone queue cleanup from erasing the sole original.
   await db.$transaction(async tx=>{await tx.compositeAssessmentAttempt.deleteMany({where:{id:{in:ids}}});await tx.compositeReportJob.deleteMany({where:{attemptId:{in:ids}}});if(held)await tx.compositeReportQueueBudget.update({where:{id:'reports'},data:{pending:{decrement:held}}})})
   await db.compositeAssessment.deleteMany({where:{id:{in:fixtures.map(f=>f.composite.id)}}})
   await db.scale.deleteMany({where:{id:{in:fixtures.flatMap(f=>f.scaleIds)}}})
   await db.user.deleteMany({where:{id:{in:fixtures.flatMap(f=>[f.owner.id,f.participant.id])}}})
  }
  await db?.$disconnect();vi.unstubAllEnvs()
 })
 it('atomically stores one standalone original and result, then replays the same submission',async()=>{
  const f=await fixture(),submit=(await import('../../modules/scale/scale-final-submit.service')).submitScaleAssessmentFinal
  const input={...f.inputs[0],answers:f.inputs[0].answers.map((a,i)=>({...a,responseTimeMs:2345+i,changeCount:i}))}
  const first=await submit(input),saved=await db.assessment.findUniqueOrThrow({where:{id:input.assessmentId}})
  expect(saved.result).toEqual({k:'SFF1',e:1});expect(saved.answers).toEqual({k:'SFR1',e:1})
  const [fact]=await loadScaleFactRecords([{id:saved.id,attemptEpoch:1}],db,true)
  expect(fact.rawReceiptAttemptId).toBeNull();expect(fact.rawAnswersEncrypted).toBeTruthy()
  const raw=await loadScaleAnswers(saved.answers,saved,db),full=await loadScaleResult(saved.result,saved,{full:true},db)
  expect(raw.decryptError).toBe(false);expect(raw.answers).toEqual(expect.arrayContaining(input.answers.map(a=>expect.objectContaining(a))))
  expect(full.decryptError).toBe(false);expect(canonicalHash(full.result)).toBe(fact.sourceResultHash)
  expect(await submit(input)).toMatchObject({replayed:true,payloadHash:first.payloadHash})
  expect(await db.$queryRaw<Array<{n:number}>>`SELECT count(*)::int AS n FROM assessment_result_facts WHERE assessment_id=${saved.id}`).toEqual([{n:1}])
  await processJob(await claim());expect((await service.getReport(f.parent.id,{userId:f.participant.id})).unitReports[0].scores[0].value).toBe(3)
  await expect(submit({...input,answers:input.answers.map(a=>({...a,responseValue:'no'}))})).rejects.toMatchObject({code:'SUBMISSION_PAYLOAD_CONFLICT'})
 })
 it('recovers a partially completed whole receipt under a new lease without copying raw answers',async()=>{
  const f=await fixture(3),{whole,input}=await wholeInput(f),accepted=await whole.submitWholeQuestionnaire(f.parent.id,input,{userId:f.participant.id})
  expect(accepted.status).toBe('ACCEPTED');expect(await db.$queryRaw<Array<{n:number}>>`SELECT count(*)::int AS n FROM assessment_result_facts f JOIN assessments a ON a.id=f.assessment_id WHERE a.composite_attempt_id=${f.parent.id}`).toEqual([{n:0}])
  const old=await claim(),unit=input.units[0],select=(await import('../../modules/scale/scale-admission.service')).UNIFIED_SCALE_CHILD_ADMISSION_SELECT
  const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:f.parent.id,compositeItemId:unit.itemId},select})
  await (await import('../../modules/scale/unified-final-submit.service')).submitUnifiedScaleAssessmentFinal({...unit,assessmentId:child.id,attemptEpoch:1,submissionId:'whole-'+createHash('sha256').update(input.submissionId+'/'+unit.itemId).digest('hex'),compositeAttemptId:f.parent.id,userId:f.participant.id,contextSnapshotHash:null},child,{submissionId:input.submissionId,payloadHash:accepted.payloadHash,leaseToken:old.leaseToken!,acceptedAtMs:accepted.acceptedAt.getTime()})
  await db.compositeReportJob.update({where:{id:old.id},data:{leaseExpiresAt:new Date(0)}})
  const next=await claim();expect(next.leaseToken).not.toBe(old.leaseToken);await processJob(next)
  const saved=await db.assessment.findMany({where:{compositeAttemptId:f.parent.id}}),facts=await loadScaleFactRecords(saved.map(a=>({id:a.id,attemptEpoch:1})),db,true)
  expect(facts).toHaveLength(3);expect(facts.every(row=>row.rawReceiptAttemptId===f.parent.id&&row.rawAnswersEncrypted===null)).toBe(true)
  for(const row of saved){const raw=await loadScaleAnswers(row.answers,row,db),original=input.units.find(u=>u.itemId===row.compositeItemId)!.answers;expect(raw.decryptError).toBe(false);expect(raw.answers).toEqual(expect.arrayContaining(original.map(a=>expect.objectContaining(a))));expect((await loadScaleResult(row.result,row,{full:true},db)).decryptError).toBe(false)}
  expect(await outbox.finishCompositeReportJob(old,{kind:'failed',errorCode:'STALE'})).toBe(false)
  const job=await db.compositeReportJob.findUniqueOrThrow({where:{id:old.id}});expect(job.status).toBe('READY');expect(job.reportEncrypted).toMatch(/^ekc1:/)
  // Ordinary report reads may load compact facts and templates, never raw answers.
  const calls:string[]=[],original=prisma.$queryRaw.bind(prisma),spy=vi.spyOn(prisma,'$queryRaw').mockImplementation(((...args:any[])=>{const q=args[0];calls.push(q?.sql??(Array.isArray(q)?q.join('?'):String(q)));return original(...args as [any])}) as any)
  try{const report=await service.getReport(f.parent.id,{userId:f.participant.id});expect(report.unitReports).toHaveLength(3);expect(report.unitReports.every((u:any)=>u.scores[0].value===3)).toBe(true)}finally{spy.mockRestore()}
  expect(calls.some(sql=>/whole_answers_encrypted|raw_answers_encrypted/.test(sql))).toBe(false)
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','false')
  try{expect((await service.getReport(f.parent.id,{userId:f.participant.id})).unitReports).toHaveLength(3)}finally{vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','true')}
  await expect(whole.submitWholeQuestionnaire(f.parent.id,input,{userId:f.owner.id})).rejects.toMatchObject({statusCode:403})
  expect(await whole.submitWholeQuestionnaire(f.parent.id,input,{userId:f.participant.id})).toMatchObject({replayed:true,payloadHash:accepted.payloadHash})
  await expect(db.compositeReportJob.update({where:{id:job.id},data:{wholeAnswersEncrypted:null}})).rejects.toThrow()
  await expect(db.compositeReportJob.delete({where:{id:job.id}})).rejects.toThrow()
  await expect(db.$executeRaw`UPDATE assessment_result_facts SET source_result_hash=${'f'.repeat(64)} WHERE assessment_id=${saved[0].id}`).rejects.toThrow()
 },30000)

 it('roundtrips a native unified Questionnaire collection without a second persisted score set',async()=>{
  const f=await fixture(),source=await db.assessment.findUniqueOrThrow({where:{id:f.inputs[0].assessmentId},include:{scale:true}})
  const runtime=(await import('../../modules/assessment-runtime/runtime-snapshot')).decryptFrozenScaleRuntimeSnapshot(source.runtimeSnapshotEncrypted!)
  const q=await db.questionnaire.create({data:{code:'compact-qa-'+randomUUID(),name:'Synthetic compact collection',status:'PUBLISHED',creatorId:f.owner.id}});questionnaireIds.push(q.id)
  const link=await db.questionnaireScale.create({data:{questionnaireId:q.id,scaleId:source.scaleId,position:0}})
  const slots=(await import('../../modules/assessment-runtime/attempt-runtime')).freezeQuestionnaireActiveSlotSet({attemptEpoch:1,scales:[{questionnaireScaleId:link.id,code:source.scale.code,instrumentVersion:source.scale.instrumentVersion,sourceDefinitionHash:runtime.sourceDefinitionHash,compiledRuntimeHash:runtime.compiledRuntime.compiledRuntimeHash}],formSections:[]})
  const parent=await db.questionnaireAssessment.create({data:{questionnaireId:q.id,userId:f.participant.id,deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,frozenActiveSlotSetEncrypted:(await import('../../modules/assessment-runtime/slot-set')).encryptFrozenActiveSlotSet(slots),frozenActiveSlotSetHash:slots.snapshotHash}});qaIds.push(parent.id)
  const child=await db.assessment.create({data:{scaleId:source.scaleId,userId:f.participant.id,questionnaireAssessmentId:parent.id,deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,runtimeSnapshotEncrypted:source.runtimeSnapshotEncrypted,compiledRuntimeHash:source.compiledRuntimeHash}})
  await (await import('../../modules/scale/scale-final-submit.service')).submitScaleAssessmentFinal({...f.inputs[0],assessmentId:child.id,submissionId:'compact-qa-submit-'+randomUUID(),compositeAttemptId:undefined})
  const finalizer=await import('../../modules/assessment-runtime/unified-aggregate-finalizer.service');expect((await finalizer.finalizeQuestionnaireAttemptUnifiedIfReady(parent.id))?.status).toBe('COMPLETED')
  const saved=await db.questionnaireAssessment.findUniqueOrThrow({where:{id:parent.id},include:{questionnaire:{include:{questionnaireScales:{include:{scale:true}},formSections:{include:{items:true}}}},scaleAssessments:{include:{scale:true}},formAnswers:true}})
  const manifest=(await import('../../utils/encryption')).decryptField<any>(saved.aggregateReportEncrypted!);expect(manifest.kind).toBe('QUESTIONNAIRE_REPORT_FACTS');expect(manifest.units[0]).toHaveProperty('sourceAttemptId',child.id);expect(JSON.stringify(manifest)).not.toContain('scores')
  const collection=await import('../../modules/reporting/questionnaire-collection-report'),snapshot=await db.assessmentUnitSnapshot.findFirstOrThrow({where:{questionnaireAssessmentId:parent.id}})
  const envelope=await loadStoredCanonicalUnitResult(snapshot.canonicalResultEncrypted!)
  const legacy=collection.collectionReportForStorage(collection.buildQuestionnaireCollectionReportFromUnifiedInput({questionnaireName:q.name,scales:[{itemId:link.id,scaleId:source.scaleId,scaleCode:source.scale.code,scaleName:source.scale.name,completedAt:envelope.completedAt,totalTime:null,core:envelope.core}],formSections:[]}))
  const restored=await (await import('../../modules/reporting/compact-questionnaire-report')).restoreCompactQuestionnaireReport(manifest,saved,collection.buildQuestionnaireCollectionReportFromUnifiedInput)
  const normalized=(value:any)=>JSON.parse(JSON.stringify(value))
  expect(normalized(restored)).toEqual(normalized(legacy));expect(restored.scaleReports[0].scores[0].value).toBe(3)
  const result=await collection.loadQuestionnaireCollectionReport(saved)
  expect(result).toEqual(collection.buildQuestionnaireCollectionReport({...saved,aggregateReportEncrypted:null,aggregateReport:legacy}))
  expect(await collection.loadQuestionnaireCollectionReport({...saved,scaleAssessments:[]})).toEqual(result)
 })
 it('shares only immutable plans and one personal context, rejecting swapped bindings and mutation',async()=>{
  const f=await fixture(3),slots=await import('../../modules/assessment-runtime/slot-set'),runtime=await import('../../modules/assessment-runtime/runtime-snapshot')
  const original=slots.decryptFrozenActiveSlotSet(f.parent.frozenActiveSlotSetEncrypted!)
  const storedSlots=await slots.storeFrozenActiveSlotSet(original);expect(storedSlots).toMatch(/^ekr1:/)
  await db.compositeAssessmentAttempt.update({where:{id:f.parent.id},data:{frozenActiveSlotSetEncrypted:storedSlots}})
  for(const row of await db.assessment.findMany({where:{compositeAttemptId:f.parent.id}})){
   const snapshot=await runtime.loadFrozenScaleRuntimeSnapshot(row.runtimeSnapshotEncrypted!)
   const encrypted=await(await import('../../modules/assessment-runtime/shared-scale-runtime')).sharedScaleRuntimeStore.save(snapshot)
   expect(encrypted).toMatch(/^ekr1:/);expect((await runtime.loadFrozenScaleRuntimeSnapshot(encrypted)).snapshotHash).toBe(snapshot.snapshotHash)
   await db.assessment.update({where:{id:row.id},data:{runtimeSnapshotEncrypted:encrypted}})
  }
  const {whole,input}=await wholeInput(f),rows=await db.assessment.findMany({where:{compositeAttemptId:f.parent.id}})
  const unit=await import('../../modules/assessment-runtime/unit-admission'),admission=await unit.loadStoredVersionedUnitAdmission(rows[0],'unreadable')
  expect(rows.every(r=>r.frozenAdmissionSnapshotEncrypted!.startsWith('ekr1:'))).toBe(true)
  const bindings=await db.$queryRaw<any[]>`SELECT id,binding_hash AS hash FROM assessment_frozen_bindings WHERE composite_attempt_id=${f.parent.id}`
  expect(bindings).toHaveLength(1);expect(Buffer.from(bindings[0].hash)).toHaveLength(32)
  expect(admission?.parent?.parentId).toBe(f.parent.id);expect(admission?.principal.userId).toBe(f.participant.id)
  await expect(unit.loadStoredVersionedUnitAdmission({...rows[0],frozenAdmissionSnapshotEncrypted:rows[1].frozenAdmissionSnapshotEncrypted},'unreadable')).rejects.toThrow()
  await expect(db.$executeRaw`UPDATE assessment_frozen_bindings SET plaintext_bytes=plaintext_bytes+1 WHERE id=${bindings[0].id}`).rejects.toThrow()
  await expect(db.$executeRaw`DELETE FROM assessment_frozen_bindings WHERE id=${bindings[0].id}`).rejects.toThrow()
  vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','false')
  try{expect((await unit.loadStoredVersionedUnitAdmission(rows[0],'unreadable'))?.snapshotHash).toBe(rows[0].frozenAdmissionSnapshotHash)}finally{vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','true')}
  await whole.submitWholeQuestionnaire(f.parent.id,input,{userId:f.participant.id});await processJob(await claim())
  expect((await service.getReport(f.parent.id,{userId:f.participant.id})).unitReports).toHaveLength(3)
 })
 it('reuses an immutable binding inside a request while isolating concurrent requests',async()=>{
  const f=await fixture(3);await wholeInput(f)
  const row=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:f.parent.id}}),unit=await import('../../modules/assessment-runtime/unit-admission'),context=await import('../../modules/assessment-runtime/shared-control-records')
  expect(row.frozenAdmissionSnapshotEncrypted).toMatch(/^ekr1:/)
  const raw=await context.loadSharedUnitAdmission(row.frozenAdmissionSnapshotEncrypted!)as any;expect(Object.isFrozen(raw.principal)).toBe(true);expect(()=>{raw.principal.userId='other'}).toThrow()
  const original=prisma.$queryRaw.bind(prisma);let reads=0
  const monitor=vi.spyOn(prisma,'$queryRaw').mockImplementation(((query:any,...values:any[])=>{const text=Array.isArray(query)?query.join(''):String(query?.sql??'');if(text.includes('FROM assessment_frozen_bindings'))reads++;return original(query,...values)})as any)
  const request=()=>new Promise<void>((resolve,reject)=>{context.sharedControlRequestContext({}as any,{}as any,(error?:unknown)=>{
   if(error){reject(error);return}
   void(async()=>{for(let i=0;i<3;i++){await new Promise<void>(done=>setImmediate(done));expect((await unit.loadStoredVersionedUnitAdmission(row,'unreadable'))?.parent?.parentId).toBe(f.parent.id)}})().then(resolve,reject)
  })})
  try{await Promise.all([request(),request()]);expect(reads).toBe(2);await unit.loadStoredVersionedUnitAdmission(row,'unreadable');await unit.loadStoredVersionedUnitAdmission(row,'unreadable');expect(reads).toBe(4)}finally{monitor.mockRestore()}
 })
 it('does not retain a public plan or personal binding from an aborted transaction',async()=>{
  const f=await fixture(),row=await db.assessment.findUniqueOrThrow({where:{id:f.inputs[0].assessmentId},include:{scale:true}})
  const runtime=await(await import('../../modules/assessment-runtime/runtime-snapshot')).loadFrozenScaleRuntimeSnapshot(row.runtimeSnapshotEncrypted!)
  const snapshot=(await import('../../modules/assessment-runtime/admission-snapshot')).createFrozenUnitAdmission({attemptEpoch:1,scale:{id:row.scaleId,code:row.scale.code,name:row.scale.name,instrumentVersion:row.scale.instrumentVersion},principal:{userId:f.participant.id},parent:{kind:'composite',parentId:f.parent.id,slotKey:'scale:'+row.compositeItemId,sourceDefinitionHash:runtime.sourceDefinitionHash,compiledRuntimeHash:runtime.compiledRuntime.compiledRuntimeHash}})
  const storage=await import('../../modules/assessment-runtime/shared-control-records');let encrypted=''
  await storage.withSharedControlContext(async()=>{
   await expect(db.$transaction(async tx=>{encrypted=await storage.storeSharedUnitAdmission(snapshot,tx);throw new Error('SYNTHETIC_ABORT_BINDING')})).rejects.toThrow('SYNTHETIC_ABORT_BINDING')
   await expect(storage.loadSharedUnitAdmission(encrypted)).rejects.toThrow()
  })
  expect(await db.$queryRaw<any[]>`SELECT count(*)::int AS n FROM assessment_frozen_bindings WHERE composite_attempt_id=${f.parent.id}`).toEqual([{n:0}])
 })
 it('retains immutable prior-epoch results and rolls back failed fact transactions',async()=>{
  const f=await fixture(),submit=(await import('../../modules/scale/scale-final-submit.service')).submitScaleAssessmentFinal;await submit(f.inputs[0]);await processJob(await claim())
  const saved=await db.assessment.findUniqueOrThrow({where:{id:f.inputs[0].assessmentId}}),snapshot=await db.assessmentUnitSnapshot.findFirstOrThrow({where:{sourceAttemptId:saved.id}})
  const before=await loadStoredCanonicalUnitResult(snapshot.canonicalResultEncrypted!),[row]=await loadScaleFactRecords([{id:saved.id,attemptEpoch:1}],db,true)
  await expect(db.$transaction(async tx=>{await persistScaleFactRecords(tx,[{...row,attemptEpoch:2,submissionId:'rolled-back-'+randomUUID()}]);throw new Error('SYNTHETIC_ABORT')})).rejects.toThrow('SYNTHETIC_ABORT')
  expect(await loadScaleFactRecords([{id:saved.id,attemptEpoch:2}],db)).toEqual([])
  await db.assessment.update({where:{id:saved.id},data:{attemptEpoch:2,status:'IN_PROGRESS',submissionId:null,submissionPayloadHash:null,result:undefined}})
  expect(await loadStoredCanonicalUnitResult(snapshot.canonicalResultEncrypted!)).toEqual(before)
  await expect((await import('../../modules/assessment-runtime/compact-assessment-storage')).resolveStoredScaleResult({k:'SFF1',e:1},{record:{...saved,attemptEpoch:2}})).rejects.toThrow()
 })
})
