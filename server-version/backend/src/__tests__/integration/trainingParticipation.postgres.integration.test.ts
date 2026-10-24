import {randomUUID} from 'node:crypto'
import {beforeAll,describe,expect,it} from 'vitest'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import * as study from '../../modules/anonymous-study/service'
import * as composite from '../../modules/composite/composite.service'
import {ensureCompositeFormSections,submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {ensureCompositeFormAdmissionAtDelivery} from '../../modules/assessment-runtime/form-admission.service'
import {hashRecoveryToken} from '../../services/anonymousAccess'
const url=integrationDatabaseUrl('TRAINING_PARTICIPATION_TEST_DATABASE_URL')
const suite=url?describe:describe.skip
suite('shared anonymous participation Training adapter in isolated PostgreSQL',()=>{
 let owner:string,other:string,cid:string,itemId:string
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY='45'.repeat(32);process.env.DATA_PSEUDONYM_KEY='56'.repeat(32)
  owner=(await prisma.user.create({data:{username:'participation-'+randomUUID(),passwordHash:'synthetic',role:'TEACHER'}})).id
  other=(await prisma.user.create({data:{username:'participation-other-'+randomUUID(),passwordHash:'synthetic',role:'TEACHER'}})).id
  const course=await prisma.course.create({data:{title:'Participation synthetic',courseCode:randomUUID(),status:'PUBLISHED',creatorId:owner}})
  const c=await prisma.compositeAssessment.create({data:{code:randomUUID(),name:'Participation form',status:'DRAFT',courseId:course.id,createdBy:owner,publicEnabled:true,expiresAt:new Date(Date.now()+86400000)}});cid=c.id
  itemId=(await prisma.compositeAssessmentItem.create({data:{compositeAssessmentId:cid,type:'FORM',position:0,required:true,formType:'text_input',formLabel:'Response'}})).id
  await ensureCompositeFormSections(cid);await composite.publishComposite(owner,'TEACHER',cid)
 })
 // Deliberately retain synthetic records; never delete existing baseline data.
 async function fixture(mode:study.ParticipationMode='MEMORABLE_CODE'){
  const s=await study.createStudy(owner,'Participation test')
  await study.configureParticipation(owner,s.id,{revision:0,mode,label:'分配编号',instructions:'仅本人使用',shortCodes:mode==='MEMORABLE_CODE'?['001','002']:[]})
  const waves=[] as Array<{id:string;token:string}>
  for(const title of ['First','Second']){
   const t=await composite.createAccessTokenForComposite(owner,'TEACHER',cid,new Date(Date.now()+43200000).toISOString(),0)
   const w=await study.addWave(owner,'TEACHER',s.id,{compositeId:cid,tokenId:t.id,title});waves.push({id:w.id,token:t.token})
  }
  const join=(suffix='SKY7')=>study.joinStudy(waves[0].id,waves[0].token,true,mode==='SELF_CODE'?{generatedCode:true}:mode==='MEMORABLE_CODE'?{prefix:'001',suffix}:undefined)
  return {s,waves,join}
 }
 it('claims a short number once concurrently; public settings disclose no registry or secrets',async()=>{
  const f=await fixture(),results=await Promise.allSettled([f.join(),f.join('MOON8')])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(await prisma.$queryRaw`SELECT id FROM anonymous_study_participants WHERE study_id=${f.s.id}`).toHaveLength(1)
  await expect(study.joinStudy(f.waves[0].id,f.waves[0].token,true)).rejects.toThrow()
  await expect(study.recoverParticipationCode(f.s.id,'001')).rejects.toThrow()
  const info=await study.publicParticipationInfo(f.s.id)
  expect(Object.keys(info).sort()).toEqual(['instructions','label','mode','studyId','studyTitle'])
  await expect(study.readParticipationSettings(other,f.s.id)).rejects.toThrow()
 })
 it('restores the same participant across waves without creating student membership and rejects another study',async()=>{
  const f=await fixture(),joined=await f.join(),proof=await study.recoverParticipationCode(f.s.id,'００１-sky7')
  expect(proof.credential).toBe(joined.credential)
  const first=await study.startStudyWave(f.s.id,f.waves[0].id,proof.credential),second=await study.startStudyWave(f.s.id,f.waves[1].id,proof.credential)
  expect((await study.participantHome(f.s.id,proof.credential)).waves.map(w=>w.attemptId)).toEqual([first.attemptId,second.attemptId])
  expect((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:first.attemptId}})).userId).toBeNull()
  const otherStudy=await fixture();await expect(study.recoverParticipationCode(otherStudy.s.id,'001-SKY7')).rejects.toThrow()
  await expect(study.startStudyWave(otherStudy.s.id,f.waves[0].id,proof.credential)).rejects.toThrow()
 })
 it('reset immediately invalidates old identity and per-wave reports while preserving accepted answers',async()=>{
  const f=await fixture(),joined=await f.join(),a=await study.startStudyWave(f.s.id,f.waves[0].id,joined.credential)
  const state=await composite.getAttemptState(a.attemptId,{recoveryTokenHash:hashRecoveryToken(a.recoveryToken)}),section=state.formSections[0]
  await submitCompositeFormSectionFinal({attemptId:a.attemptId,sectionId:section.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:section.definitionHash,contextSnapshotHash:null,answers:[{formItemId:itemId,value:'retained answer'}],recoveryTokenHash:hashRecoveryToken(a.recoveryToken)})
  // Unified FORM persists its unit first; the existing authorized state reader
  // reconciles aggregate completion. Establish the terminal fact before reset.
  await composite.getAttemptState(a.attemptId,{recoveryTokenHash:hashRecoveryToken(a.recoveryToken)})
  const before=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:a.attemptId}})
  expect(before.status).toBe('COMPLETED');expect(before.completedAt).not.toBeNull()
  const answersBefore=await prisma.compositeFormAnswer.findMany({where:{attemptId:a.attemptId}})
  await expect(study.resetParticipationCode(other,f.s.id,'001')).rejects.toThrow()
  const reset=await study.resetParticipationCode(owner,f.s.id,'001')
  await expect(study.participantHome(f.s.id,joined.credential)).rejects.toThrow()
  await expect(composite.getAttemptState(a.attemptId,{recoveryTokenHash:hashRecoveryToken(a.recoveryToken)})).rejects.toThrow()
  await expect(study.completeParticipationReset(f.s.id,reset.resetCode,'SKY7')).rejects.toThrow('不同')
  const proof=await study.completeParticipationReset(f.s.id,reset.resetCode,'MOON8'),restored=await study.recoverStudyWave(f.s.id,f.waves[0].id,proof.credential)
  expect(restored.state).toBe('COMPLETED');expect(restored.recoveryToken).not.toBe(a.recoveryToken)
  expect((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:a.attemptId}})).completedAt).toEqual(before.completedAt)
  expect(await prisma.compositeFormAnswer.findMany({where:{attemptId:a.attemptId}})).toEqual(answersBefore)
  await expect(study.recoverParticipationCode(f.s.id,'001-SKY7')).rejects.toThrow()
  await expect(study.completeParticipationReset(f.s.id,reset.resetCode,'NEXT9')).rejects.toThrow()
  expect((await study.recoverParticipationCode(f.s.id,'001-MOON8')).displayCode).toBe(joined.displayCode)
 })
 it('continues a previously frozen FORM with the new proof and rejects old FINAL/replay without changing admission',async()=>{
  const f=await fixture(),joined=await f.join(),a=await study.startStudyWave(f.s.id,f.waves[0].id,joined.credential)
  const oldHash=hashRecoveryToken(a.recoveryToken),state=await composite.getAttemptState(a.attemptId,{recoveryTokenHash:oldHash}),section=state.formSections[0]
  await ensureCompositeFormAdmissionAtDelivery(a.attemptId,section as any)
  const where={attemptId_sectionId:{attemptId:a.attemptId,sectionId:section.id}}
  const frozen=await prisma.compositeFormSectionAttempt.findUniqueOrThrow({where})
  const input={attemptId:a.attemptId,sectionId:section.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:section.definitionHash,contextSnapshotHash:null,answers:[{formItemId:itemId,value:'continued answer'}],recoveryTokenHash:oldHash}
  const reset=await study.resetParticipationCode(owner,f.s.id,'001')
  await expect(submitCompositeFormSectionFinal(input)).rejects.toThrow()
  const proof=await study.completeParticipationReset(f.s.id,reset.resetCode,'MOON8'),restored=await study.recoverStudyWave(f.s.id,f.waves[0].id,proof.credential)
  const current={...input,recoveryTokenHash:hashRecoveryToken(restored.recoveryToken)}
  await submitCompositeFormSectionFinal(current)
  await expect(submitCompositeFormSectionFinal(input)).rejects.toThrow()
  await submitCompositeFormSectionFinal(current)
  const after=await prisma.compositeFormSectionAttempt.findUniqueOrThrow({where})
  expect(after.frozenAdmissionSnapshotHash).toBe(frozen.frozenAdmissionSnapshotHash)
  expect(after.frozenAdmissionSnapshotEncrypted).toBe(frozen.frozenAdmissionSnapshotEncrypted)
  expect(await prisma.compositeFormAnswer.count({where:{attemptId:a.attemptId}})).toBe(1)
  await expect(prisma.$executeRaw`UPDATE anonymous_study_attempts SET admission_credential_hash=${'f'.repeat(64)} WHERE attempt_id=${a.attemptId}`).rejects.toThrow()
 })
 it('linearizes FORM FINAL against reset without deadlock or duplicate answers',async()=>{
  const f=await fixture(),joined=await f.join(),a=await study.startStudyWave(f.s.id,f.waves[0].id,joined.credential)
  const oldHash=hashRecoveryToken(a.recoveryToken),state=await composite.getAttemptState(a.attemptId,{recoveryTokenHash:oldHash}),section=state.formSections[0]
  const input={attemptId:a.attemptId,sectionId:section.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:section.definitionHash,contextSnapshotHash:null,answers:[{formItemId:itemId,value:'race answer'}],recoveryTokenHash:oldHash}
  await ensureCompositeFormAdmissionAtDelivery(a.attemptId,section as any)
  const [submitted,rotated]=await Promise.allSettled([submitCompositeFormSectionFinal(input),study.resetParticipationCode(owner,f.s.id,'001')])
  expect(rotated.status).toBe('fulfilled')
  if(rotated.status!=='fulfilled')throw rotated.reason
  if(submitted.status==='rejected')expect(String(submitted.reason)).not.toMatch(/deadlock|timed out/i)
  const proof=await study.completeParticipationReset(f.s.id,rotated.value.resetCode,'MOON8'),restored=await study.recoverStudyWave(f.s.id,f.waves[0].id,proof.credential)
  await submitCompositeFormSectionFinal({...input,recoveryTokenHash:hashRecoveryToken(restored.recoveryToken)})
  await expect(submitCompositeFormSectionFinal(input)).rejects.toThrow()
  expect(await prisma.compositeFormAnswer.count({where:{attemptId:a.attemptId}})).toBe(1)
 })
 it('refuses an entire reset with a historical unbound attempt before any credential rotation',async()=>{
  const f=await fixture(),joined=await f.join()
  const participant=await prisma.$queryRaw<Array<{id:string}>>`SELECT id FROM anonymous_study_participants WHERE study_id=${f.s.id}`
  const legacy=await prisma.compositeAssessmentAttempt.create({data:{compositeAssessmentId:cid,participantKey:'legacy-'+randomUUID(),recoveryTokenHash:hashRecoveryToken(joined.credential)}})
  await prisma.$executeRaw`INSERT INTO anonymous_study_attempts(study_id,wave_id,participant_id,attempt_id) VALUES(${f.s.id},${f.waves[0].id},${participant[0].id},${legacy.id})`
  const before=await prisma.$queryRaw`SELECT credential_hash,recovery_generation FROM anonymous_study_participants WHERE id=${participant[0].id}`
  await expect(study.resetParticipationCode(owner,f.s.id,'001')).rejects.toThrow('旧参与协议')
  expect(await prisma.$queryRaw`SELECT credential_hash,recovery_generation FROM anonymous_study_participants WHERE id=${participant[0].id}`).toEqual(before)
  expect((await study.recoverParticipationCode(f.s.id,'001-SKY7')).credential).toBe(joined.credential)
 })
 it('server generated code uses shared mechanism but never Survey namespace or owner reset',async()=>{
  const f=await fixture('SELF_CODE'),joined=await f.join()
  expect(joined.fullCode).toMatch(/^HT2(?:-[0-9A-HJKMNP-TV-Z]{5}){4}$/)
  expect((await study.recoverParticipationCode(f.s.id,joined.fullCode!)).credential).toBe(joined.credential)
  expect((await study.readParticipationSettings(owner,f.s.id)).participants).toEqual([])
  await expect(study.resetParticipationCode(owner,f.s.id,'001')).rejects.toThrow()
  await expect(study.recoverParticipationCode(f.s.id,joined.fullCode!.replace('HT2','HS2'))).rejects.toThrow()
 })
 it('keeps unpublished study settings private while its owner can configure participation',async()=>{
  const draft=await study.createStudy(owner,'Private draft title')
  await expect(study.publicParticipationInfo(draft.id)).rejects.toThrow()
  expect((await study.readParticipationSettings(owner,draft.id)).mode).toBe('PERSONAL_LINK')
 })
 it('does not reconfigure a closed study even before its first wave',async()=>{
  const draft=await study.createStudy(owner,'Closed unpublished study')
  await study.closeStudy(owner,draft.id)
  expect((await study.readParticipationSettings(owner,draft.id)).locked).toBe(true)
  await expect(study.configureParticipation(owner,draft.id,{revision:0,mode:'SELF_CODE',label:'码',instructions:'',shortCodes:[]})).rejects.toThrow('关闭')
 })
 it('freezes assigned registry at publication but permits configured claims and draft reconfiguration',async()=>{
  const draft=await study.createStudy(owner,'Draft registry')
  const a=await study.configureParticipation(owner,draft.id,{revision:0,mode:'MEMORABLE_CODE',label:'码',instructions:'',shortCodes:['101']})
  expect(a.shortCodes).toEqual(['101'])
  const b=await study.configureParticipation(owner,draft.id,{revision:1,mode:'MEMORABLE_CODE',label:'码',instructions:'',shortCodes:['102']})
  expect(b.shortCodes).toEqual(['102'])
  const f=await fixture()
  await expect(prisma.$executeRaw`INSERT INTO anonymous_study_codes(id,study_id,prefix) VALUES(${randomUUID()},${f.s.id},'999')`).rejects.toThrow()
  await expect(prisma.$executeRaw`UPDATE anonymous_study_codes SET enabled=false WHERE study_id=${f.s.id} AND prefix='002'`).rejects.toThrow()
  const joined=await f.join()
  expect((await study.recoverParticipationCode(f.s.id,'001-SKY7')).credential).toBe(joined.credential)
  const reset=await study.resetParticipationCode(owner,f.s.id,'001')
  expect((await study.completeParticipationReset(f.s.id,reset.resetCode,'MOON8')).displayCode).toBe(joined.displayCode)
  await expect(prisma.$executeRaw`UPDATE anonymous_study_codes SET participant_id=NULL WHERE study_id=${f.s.id} AND prefix='001'`).rejects.toThrow()
 })
 it('freezes publication mode and keeps original personal-link path operational',async()=>{
  const f=await fixture('PERSONAL_LINK'),joined=await f.join()
  expect(joined.fullCode).toBeUndefined();expect((await study.participantHome(f.s.id,joined.credential)).displayCode).toBe(joined.displayCode)
  await expect(study.configureParticipation(owner,f.s.id,{revision:1,mode:'SELF_CODE',label:'码',instructions:'',shortCodes:[]})).rejects.toThrow()
  await expect(prisma.$executeRaw`UPDATE anonymous_studies SET participation_mode='SELF_CODE' WHERE id=${f.s.id}`).rejects.toThrow()
 })
})
