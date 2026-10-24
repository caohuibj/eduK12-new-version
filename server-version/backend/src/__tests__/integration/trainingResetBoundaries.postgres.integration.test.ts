import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import * as study from '../../modules/anonymous-study/service'
import * as composite from '../../modules/composite/composite.service'
import {ensureCompositeFormSections,submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {hashRecoveryToken} from '../../services/anonymousAccess'
const url=integrationDatabaseUrl('TRAINING_PARTICIPATION_TEST_DATABASE_URL'),suite=url?describe:describe.skip
suite('Training reset report and deterministic parent-lock boundaries',()=>{
 let observer:PrismaClient
 beforeAll(()=>{requireIsolatedReleaseDatabase(url!);process.env.DATA_ENCRYPTION_KEY='45'.repeat(32);process.env.DATA_PSEUDONYM_KEY='56'.repeat(32)
  const parsed=new URL(url!);parsed.searchParams.set('connection_limit','2');observer=new PrismaClient({datasources:{db:{url:parsed.toString()}}})})
 afterAll(async()=>{await observer?.$disconnect()})
 async function fixture(){
  const owner=(await prisma.user.create({data:{username:'reset-boundary-'+randomUUID(),passwordHash:'synthetic',role:'TEACHER'}})).id
  const course=await prisma.course.create({data:{title:'Reset boundary synthetic',courseCode:randomUUID(),status:'PUBLISHED',creatorId:owner}})
  const c=await prisma.compositeAssessment.create({data:{code:randomUUID(),name:'Reset boundary form',status:'DRAFT',courseId:course.id,createdBy:owner,publicEnabled:true,expiresAt:new Date(Date.now()+86400000)}})
  const item=await prisma.compositeAssessmentItem.create({data:{compositeAssessmentId:c.id,type:'FORM',position:0,required:true,formType:'text_input',formLabel:'Response'}})
  await ensureCompositeFormSections(c.id);await composite.publishComposite(owner,'TEACHER',c.id)
  const s=await study.createStudy(owner,'Boundary synthetic');await study.configureParticipation(owner,s.id,{revision:0,mode:'MEMORABLE_CODE',label:'编号',instructions:'',shortCodes:['001']})
  const token=await composite.createAccessTokenForComposite(owner,'TEACHER',c.id,new Date(Date.now()+43200000).toISOString(),0)
  const wave=await study.addWave(owner,'TEACHER',s.id,{compositeId:c.id,tokenId:token.id,title:'Wave'})
  const joined=await study.joinStudy(wave.id,token.token,true,{prefix:'001',suffix:'SKY7'}),a=await study.startStudyWave(s.id,wave.id,joined.credential),oldHash=hashRecoveryToken(a.recoveryToken)
  const state=await composite.getAttemptState(a.attemptId,{recoveryTokenHash:oldHash}),section=state.formSections[0]
  const input={attemptId:a.attemptId,sectionId:section.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:section.definitionHash,contextSnapshotHash:null,answers:[{formItemId:item.id,value:'preserved report fact'}],recoveryTokenHash:oldHash}
  const finishReset=async(resetCode:string)=>{const proof=await study.completeParticipationReset(s.id,resetCode,'MOON8');const restored=await study.recoverStudyWave(s.id,wave.id,proof.credential);return hashRecoveryToken(restored.recoveryToken)}
  return {owner,s,wave,a,oldHash,input,finishReset}
 }
 it('preserves the actual completed report endpoint while replacing its credential',async()=>{
  const f=await fixture();await submitCompositeFormSectionFinal(f.input)
  await composite.getAttemptState(f.a.attemptId,{recoveryTokenHash:f.oldHash})
  const before=await composite.getReport(f.a.attemptId,{recoveryTokenHash:f.oldHash})
  const row=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.a.attemptId}})
  expect(row.status).toBe('COMPLETED')
  const reset=await study.resetParticipationCode(f.owner,f.s.id,'001')
  await expect(composite.getReport(f.a.attemptId,{recoveryTokenHash:f.oldHash})).rejects.toThrow()
  const fresh=await f.finishReset(reset.resetCode)
  expect(await composite.getReport(f.a.attemptId,{recoveryTokenHash:fresh})).toEqual(before)
  expect((await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:f.a.attemptId}})).completedAt).toEqual(row.completedAt)
 })
 const settled=<T>(promise:Promise<T>)=>promise.then(value=>({ok:true as const,value}),error=>({ok:false as const,error}))
 async function waitForParentWaiters(count:number){
  const deadline=Date.now()+5000
  while(Date.now()<deadline){
   const rows=await observer.$queryRaw<Array<{count:number}>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%composite_assessment_attempts%' AND query LIKE '%FOR UPDATE%'`
   if(rows[0].count>=count)return
   await new Promise(resolve=>setTimeout(resolve,10))
  }
  throw new Error('Expected actual parent-lock waiters were not observed')
 }
 it.each(['reset','FINAL'])('serializes %s first using actual parent-lock waiters',async first=>{
  const f=await fixture();let locked!:()=>void,release!:()=>void
  const ready=new Promise<void>(resolve=>locked=resolve),gate=new Promise<void>(resolve=>release=resolve)
  const hold=observer.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM composite_assessment_attempts WHERE id=${f.a.attemptId} FOR UPDATE`;locked();await gate},{timeout:15000})
  await ready
  let final!:ReturnType<typeof settled<Awaited<ReturnType<typeof submitCompositeFormSectionFinal>>>>,reset!:ReturnType<typeof settled<Awaited<ReturnType<typeof study.resetParticipationCode>>>>
  try{
   if(first==='reset')reset=settled(study.resetParticipationCode(f.owner,f.s.id,'001'));else final=settled(submitCompositeFormSectionFinal(f.input))
   await waitForParentWaiters(1)
   if(first==='reset')final=settled(submitCompositeFormSectionFinal(f.input));else reset=settled(study.resetParticipationCode(f.owner,f.s.id,'001'))
   await waitForParentWaiters(2)
  }finally{release();await hold}
  const [written,rotated]=await Promise.all([final,reset]);expect(rotated.ok).toBe(true)
  if(!rotated.ok)throw rotated.error
  expect(written.ok).toBe(first==='FINAL')
  const fresh=await f.finishReset(rotated.value.resetCode)
  await submitCompositeFormSectionFinal({...f.input,recoveryTokenHash:fresh})
  await expect(submitCompositeFormSectionFinal(f.input)).rejects.toThrow()
  expect(await prisma.compositeFormAnswer.count({where:{attemptId:f.a.attemptId}})).toBe(1)
 },20000)
})
