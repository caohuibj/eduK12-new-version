import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createReportOutboxFixture} from './report-outbox-fixture'
import * as study from '../../modules/anonymous-study/service'
import * as composite from '../../modules/composite/composite.service'
import * as whole from '../../modules/composite/whole-questionnaire.service'
import {hashRecoveryToken} from '../../services/anonymousAccess'
import {ensureScaleAdmissionAtDelivery} from '../../modules/scale/scale-admission.service'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {ensureCognitiveAdmissionAtDelivery} from '../../modules/cognitive/cognitive-admission.service'
import {submitCognitiveSessionFinalForPublic} from '../../modules/cognitive/final-submit.service'
import {createUnifiedCognitiveSessionConfigSnapshot,readCognitiveSessionConfig} from '../../modules/cognitive/session.service'
import {createTrialEnvelope} from '../../modules/cognitive/v2/trial-envelope'
import {createFrozenActiveSlotSet,decryptFrozenActiveSlotSet,encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {freezeCompositeActiveSlotSet} from '../../modules/assessment-runtime/attempt-runtime'
const url=integrationDatabaseUrl('TRAINING_PARTICIPATION_TEST_DATABASE_URL')
const suite=url?describe:describe.skip
suite('Training stable identity real instrument consumers',()=>{
 beforeAll(()=>{requireIsolatedReleaseDatabase(url!);process.env.DATA_ENCRYPTION_KEY='45'.repeat(32);process.env.DATA_PSEUDONYM_KEY='56'.repeat(32)})
 afterEach(()=>vi.unstubAllEnvs())
 // This isolated fixture creates the same immutable relation as the real start
 // transaction, before any unit delivery. Existing datasets are never rewritten.
 async function fixture(){
  const f=await createReportOutboxFixture(prisma,2)
  await prisma.compositeAssessment.update({where:{id:f.composite.id},data:{publicEnabled:true,expiresAt:new Date(Date.now()+86400000)}})
  const s=await study.createStudy(f.owner.id,'Stable instrument synthetic')
  await study.configureParticipation(f.owner.id,s.id,{revision:0,mode:'MEMORABLE_CODE',label:'编号',instructions:'',shortCodes:['001']})
  const token=await composite.createAccessTokenForComposite(f.owner.id,'TEACHER',f.composite.id,new Date(Date.now()+43200000).toISOString(),0)
  const waveId=randomUUID()
  await prisma.$executeRaw`INSERT INTO anonymous_study_waves(id,study_id,access_token_id,title,ordinal) VALUES(${waveId},${s.id},${token.id},'Synthetic wave',1)`
  const joined=await study.joinStudy(waveId,token.token!,true,{prefix:'001',suffix:'SKY7'})
  const rows=await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM anonymous_study_participants WHERE study_id=${s.id}`
  const oldHash=hashRecoveryToken('synthetic-initial-wave-'+randomUUID())
  await prisma.compositeAssessmentAttempt.update({where:{id:f.parent.id},data:{userId:null,accessTokenId:token.id,recoveryTokenHash:oldHash}})
  await prisma.assessment.updateMany({where:{compositeAttemptId:f.parent.id},data:{userId:null}})
  await prisma.$executeRaw`INSERT INTO anonymous_study_attempts(study_id,wave_id,participant_id,attempt_id,admission_credential_hash,admission_attempt_epoch) VALUES(${s.id},${waveId},${rows[0].id},${f.parent.id},${oldHash},1)`
  const inputs=f.inputs.map(({userId:_,...input})=>({...input,recoveryTokenHash:oldHash}))
  const rotate=async()=>{const reset=await study.resetParticipationCode(f.owner.id,s.id,'001');const proof=await study.completeParticipationReset(s.id,reset.resetCode,'MOON8');const restored=await study.recoverStudyWave(s.id,waveId,proof.credential);return hashRecoveryToken(restored.recoveryToken)}
  return {...f,s,waveId,joined,oldHash,inputs,rotate}
 }
 it('SCALE frozen before reset accepts current proof, rejects old FINAL and completed replay, and preserves admission',async()=>{
  const f=await fixture(),input=f.inputs[0]
  await ensureScaleAdmissionAtDelivery(input.assessmentId)
  const before=await prisma.assessment.findUniqueOrThrow({where:{id:input.assessmentId}})
  const fresh=await f.rotate()
  await expect(submitScaleAssessmentFinal(input)).rejects.toThrow()
  await submitScaleAssessmentFinal({...input,recoveryTokenHash:fresh})
  await expect(submitScaleAssessmentFinal(input)).rejects.toThrow()
  await submitScaleAssessmentFinal({...input,recoveryTokenHash:fresh})
  const after=await prisma.assessment.findUniqueOrThrow({where:{id:input.assessmentId}})
  expect(after.status).toBe('COMPLETED');expect(after.frozenAdmissionSnapshotHash).toBe(before.frozenAdmissionSnapshotHash)
  expect(after.frozenAdmissionSnapshotEncrypted).toBe(before.frozenAdmissionSnapshotEncrypted)
  // A unit delivered only after rotation still freezes the original identity.
  const late=await ensureScaleAdmissionAtDelivery(f.inputs[1].assessmentId)
  expect(late.principal.recoveryTokenHash).toBe(f.oldHash)
  await submitScaleAssessmentFinal({...f.inputs[1],recoveryTokenHash:fresh})
 })
 async function cognitive(f:Awaited<ReturnType<typeof fixture>>){
  const configData={trialCount:3,trialDurationMs:1000,allowPractice:false,maxRtMs:60000}
  let config=await prisma.cognitiveTestConfig.findUnique({where:{testType_configVersion:{testType:'fake',configVersion:'1.0.0'}}})
  if(!config)config=await prisma.cognitiveTestConfig.create({data:{testType:'fake',configVersion:'1.0.0',name:'Stable synthetic',status:'PUBLISHED',engineVersion:'1.0.0',scoringVersion:'1.0.0',accessPolicy:'OPEN',publishedAt:new Date(),config:configData}})
  const frozen=await createUnifiedCognitiveSessionConfigSnapshot({testType:'fake',configVersion:'1.0.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:configData,db:prisma as any})
  const snapshot=readCognitiveSessionConfig(frozen.encrypted).snapshot!
  const assignment=await prisma.cognitiveAssignment.create({data:{configId:config.id,createdBy:f.owner.id,title:'Stable cognitive',status:'PUBLISHED',resolvedConfigSnapshotEncrypted:frozen.encrypted,resolvedConfigHash:snapshot.configHash}})
  const item=await prisma.compositeAssessmentItem.create({data:{compositeAssessmentId:f.composite.id,type:'COGNITIVE',position:2,required:true,cognitiveAssignmentId:assignment.id}})
  const old=decryptFrozenActiveSlotSet(f.parent.frozenActiveSlotSetEncrypted!)
  const added=freezeCompositeActiveSlotSet({attemptEpoch:1,scales:[],formSections:[],cognitive:[{compositeItemId:item.id,testType:'fake',instrumentVersion:'1.0.0',sourceDefinitionHash:frozen.compiledRuntime.sourceDefinitionHash,compiledRuntimeHash:frozen.compiledRuntime.compiledRuntimeHash}]})
  const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[...old.slots,...added.slots].sort((a,b)=>a.slotKey.localeCompare(b.slotKey))})
  await prisma.compositeAssessmentAttempt.update({where:{id:f.parent.id},data:{frozenActiveSlotSetEncrypted:encryptFrozenActiveSlotSet(slots),frozenActiveSlotSetHash:slots.snapshotHash}})
  const session=await prisma.cognitiveSession.create({data:{userId:null,participantKey:'stable-'+randomUUID(),assignmentId:assignment.id,compositeAttemptId:f.parent.id,compositeItemId:item.id,configId:config.id,testType:'fake',attemptNo:1,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',configVersion:'1.0.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',configSnapshotEncrypted:frozen.encrypted,compiledRuntimeHash:frozen.compiledRuntime.compiledRuntimeHash,randomSeed:'synthetic-'+randomUUID()}})
  return {session,input:{sessionId:session.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:snapshot.configHash,contextSnapshotHash:null,trials:Array.from({length:3},(_,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',payload:{correct:trialIndex%2===0,rtMs:400+trialIndex},startedAtPerfMs:trialIndex*1000,endedAtPerfMs:trialIndex*1000+400}))}}
 }
 it('COGNITIVE preserves frozen admission across reset and rejects old proof including completed replay',async()=>{
  const f=await fixture(),c=await cognitive(f)
  await ensureCognitiveAdmissionAtDelivery(c.session.id)
  const before=await prisma.cognitiveSession.findUniqueOrThrow({where:{id:c.session.id}}),fresh=await f.rotate()
  await expect(submitCognitiveSessionFinalForPublic(c.input,f.oldHash)).rejects.toThrow()
  await submitCognitiveSessionFinalForPublic(c.input,fresh)
  await expect(submitCognitiveSessionFinalForPublic(c.input,f.oldHash)).rejects.toThrow()
  await submitCognitiveSessionFinalForPublic(c.input,fresh)
  const after=await prisma.cognitiveSession.findUniqueOrThrow({where:{id:c.session.id}})
  expect(after.status).toBe('COMPLETED');expect(after.frozenAdmissionSnapshotHash).toBe(before.frozenAdmissionSnapshotHash)
  expect(after.frozenAdmissionSnapshotEncrypted).toBe(before.frozenAdmissionSnapshotEncrypted)
  expect(await prisma.cognitiveRawSubmission.count({where:{sessionId:c.session.id}})).toBe(1)
 })
 it('serializes identity revocation behind a Cognitive FINAL parent lock without child-parent inversion',async()=>{
  const f=await fixture(),c=await cognitive(f)
  await ensureCognitiveAdmissionAtDelivery(c.session.id)
  const parsed=new URL(url!);parsed.searchParams.set('connection_limit','1')
  const observer=new PrismaClient({datasources:{db:{url:parsed.toString()}}})
  let active=true,armed=true,acquired!:()=>void,release!:()=>void
  const ready=new Promise<void>(resolve=>acquired=resolve),gate=new Promise<void>(resolve=>release=resolve)
  // Test-only barrier AFTER the real lock query, never replacing or skipping SQL.
  // The middleware remains inert after this exact newly-created parent is tested.
  prisma.$use(async(params,next)=>{
   const text=JSON.stringify(params.args)
   const selected=active&&armed&&text.includes(f.parent.id)&&text.includes('SELECT id FROM composite_assessment_attempts')&&text.includes('FOR UPDATE')
   if(selected)armed=false
   const result=await next(params)
   if(selected){acquired();await gate}
   return result
  })
  const settle=<T>(promise:Promise<T>)=>promise.then(value=>({ok:true as const,value}),error=>({ok:false as const,error}))
  const final=settle(submitCognitiveSessionFinalForPublic(c.input,f.oldHash))
  let revoked:ReturnType<typeof settle<Awaited<ReturnType<typeof study.revokeStudyIdentity>>>>|undefined
  try{
   let timer:ReturnType<typeof setTimeout>|undefined
   try{await Promise.race([ready,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('FINAL parent barrier was not acquired')),5000)})])}finally{clearTimeout(timer)}
   revoked=settle(study.revokeStudyIdentity(f.s.id,f.joined.credential))
   const deadline=Date.now()+5000;let waiting=false
   while(Date.now()<deadline){
    const rows=await observer.$queryRaw<Array<{count:number}>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%anonymous_study_attempts%' AND query LIKE '%FOR UPDATE OF a%'`
    if(rows[0].count>0){waiting=true;break}
    await new Promise(resolve=>setTimeout(resolve,10))
   }
   expect(waiting).toBe(true)
  }finally{active=false;release();await observer.$disconnect()}
  const result=await final;if(!result.ok)throw result.error
  expect(revoked).toBeDefined();const ended=await revoked!;if(!ended.ok)throw ended.error
  expect(ended.value.status).toBe('REVOKED')
  expect((await prisma.cognitiveSession.findUniqueOrThrow({where:{id:c.session.id}})).status).toBe('COMPLETED')
  await expect(submitCognitiveSessionFinalForPublic(c.input,f.oldHash)).rejects.toThrow()
  await expect(composite.getAttemptState(f.parent.id,{recoveryTokenHash:f.oldHash})).rejects.toThrow()
 },20000)
 it.each(['true','false'])('accepted WHOLE receipt survives reset with batch=%s, while old client access stays denied',async batch=>{
  for(const key of ['ASSESSMENT_REPORT_ASYNC_ENABLED','ASSESSMENT_WHOLE_SUBMIT_ENABLED'])vi.stubEnv(key,'true')
  vi.stubEnv('ASSESSMENT_REPORT_ASYNC_COURSE_IDS','');vi.stubEnv('ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED',batch)
  const f=await fixture(),principal={recoveryTokenHash:f.oldHash}
  const definition=await whole.getWholeQuestionnaireDefinition(f.parent.id,principal)
  const input={submissionId:randomUUID(),attemptEpoch:1,slotSetHash:definition.slotSetHash!,contextSnapshotHash:definition.contextSnapshotHash,units:definition.units.map(unit=>({itemId:unit.itemId,definitionHash:unit.definitionHash,answers:f.inputs.find(x=>x.assessmentId===unit.scaleAssessmentId)!.answers}))}
  expect(await whole.submitWholeQuestionnaire(f.parent.id,input,principal)).toMatchObject({status:'ACCEPTED'})
  const accepted=await prisma.compositeReportJob.findUniqueOrThrow({where:{attemptId_attemptEpoch:{attemptId:f.parent.id,attemptEpoch:1}}})
  const fresh=await f.rotate()
  await expect(whole.submitWholeQuestionnaire(f.parent.id,input,principal)).rejects.toThrow()
  await expect(composite.getAttemptState(f.parent.id,principal)).rejects.toThrow()
  // Claim this test's job only, preserving unrelated queued baseline jobs.
  const job=await prisma.compositeReportJob.update({where:{id:accepted.id},data:{status:'PROCESSING',leaseToken:randomUUID(),leaseExpiresAt:new Date(Date.now()+60000),claimedRevision:accepted.requestedRevision,attemptCount:{increment:1}}})
  expect(await whole.processWholeQuestionnaireAnswers(job)).toBe(true)
  expect(await whole.processWholeQuestionnaireAnswers(job)).toBe(true)
  const after=await prisma.compositeReportJob.findUniqueOrThrow({where:{id:job.id}})
  expect(after.wholeAnswersEncrypted).toBe(accepted.wholeAnswersEncrypted);expect(after.wholePayloadHash).toBe(accepted.wholePayloadHash)
  expect(await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:f.parent.id}})).toBe(2)
  expect(await prisma.assessment.count({where:{compositeAttemptId:f.parent.id,status:'COMPLETED'}})).toBe(2)
  await expect(submitScaleAssessmentFinal(f.inputs[0])).rejects.toThrow()
  await composite.getAttemptState(f.parent.id,{recoveryTokenHash:fresh})
 })
})
