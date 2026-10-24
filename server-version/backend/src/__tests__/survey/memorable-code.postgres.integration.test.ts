import express from 'express'
import {createServer} from 'node:http'
import {publicSurveyRouter} from '../../modules/survey/public.routes'
import * as codeCrypto from '../../modules/survey/memorable-code.crypto'
import {randomBytes,randomUUID,createHmac} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest'
import {PrismaClient} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {configureParticipation,readParticipationSettings,joinMemorableStudy,recoverMemorableIdentity,resetMemorableIdentity,completeMemorableReset,joinGeneratedCodeStudy} from '../../modules/survey/memorable-code.service'
import {createWave} from '../../modules/survey/waves.service'
import {prepareWave,openWave} from '../../modules/survey/waves.publish'
import {getPublicResearchInfo,startLinkedWave} from '../../modules/survey/admission.service'
import {createLinkedResearchIdentity} from '../../modules/survey/identity.service'
import {submitResearchFinal} from '../../modules/survey/final.service'
import {getOwnResearchTask} from '../../modules/survey/task.public'
const url=integrationDatabaseUrl('SURVEY_MEMORABLE_TEST_DATABASE_URL')
const suite=url?describe:describe.skip
suite('memorable participant identity in isolated PostgreSQL',()=>{
 let db:PrismaClient,owner:string,other:string
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.SURVEY_WORKSPACE_ENABLED='true';process.env.SURVEY_PUBLICATION_ENABLED='true';process.env.DATA_ENCRYPTION_KEY='34'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}})
  const admin=await db.user.create({data:{username:'code-admin-'+randomUUID(),passwordHash:'synthetic',role:'ADMIN',accountDomain:'LEGACY',platformRole:'SYSTEM_ADMIN'}})
  async function researcher(){const u=await db.user.create({data:{username:'code-'+randomUUID(),passwordHash:'synthetic',role:'STUDENT',accountDomain:'SURVEY'}});const login='code_'+randomBytes(8).toString('hex');await db.surveyAccount.create({data:{userId:u.id,loginName:login,normalizedLogin:login}});await db.surveyResearcherGrant.create({data:{userId:u.id,status:'ACTIVE',grantedBy:admin.id}});await db.surveyMfaCredential.create({data:{userId:u.id,enabled:true,secretCipher:'synthetic-test'}});return u.id}
  owner=await researcher();other=await researcher()
 })
 afterAll(async()=>{await db?.$disconnect()})
 async function fixture(mode:'MEMORABLE_CODE'|'SELF_CODE'='MEMORABLE_CODE'){
  const projectId=randomUUID()
  await db.surveyProject.create({data:{id:projectId,ownerUserId:owner,title:'Code fixture',collectionMode:'LINKED_WAVES'}})
  await configureParticipation(owner,projectId,{revision:0,mode,label:'报名序号',instructions:'请输入分配给你的报名序号。',shortCodes:mode==='SELF_CODE'?[]:['001','002','二班07']})
  const tool=await db.surveyInstrumentDraft.create({data:{id:randomUUID(),projectId,instrumentKey:'checkin',kind:'FORM',title:'此刻感受',definition:{schemaVersion:2,pages:[{pageKey:'p',title:'状态',questions:[{itemKey:'mood',type:'SINGLE',prompt:'这次的学习状态如何？',required:true,options:[{optionKey:'good',label:'好'},{optionKey:'normal',label:'一般'}]}]}]}}})
  const waves=[] as {id:string;entryToken:string}[]
  for(const n of [1,2]){
   let w=await createWave(owner,projectId,{requestId:randomUUID(),title:'第'+n+'次',instrumentIds:[tool.id],consentText:'这是两次填写的编码关联测试。使用短编号加私人后缀，同一编码关联历次作答，参加自愿并可申请撤回。',generalText:'谢谢参与',linkageNoticeConfirmed:true,allowNewParticipants:n===1})
   await prepareWave(owner,projectId,w.id,w.revision)
   w=await db.surveyWave.findUniqueOrThrow({where:{id:w.id}})
   const opened=await openWave(owner,projectId,w.id,w.revision)
   const u=new URL(opened.researchUrl!,'http://survey.localhost:5174')
   waves.push({id:w.id,entryToken:new URLSearchParams(u.hash.slice(1)).get('entry')!})
  }
  const p=await db.surveyProject.findUniqueOrThrow({where:{id:projectId}})
  const enroll=(prefix='001',suffix='SKY7')=>joinMemorableStudy({publicId:p.publicId!,waveId:waves[0].id,entryToken:waves[0].entryToken,consent:true,consentVersion:1,prefix,suffix})
  return {projectId,publicId:p.publicId!,waves,enroll}
 }
 it('one assigned short number can be claimed only once, even concurrently; failed claims do not consume quota',async()=>{
  const f=await fixture()
  const results=await Promise.allSettled([f.enroll('001','SKY7'),f.enroll('001','MOON8')])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(await db.surveyParticipant.count({where:{projectId:f.projectId}})).toBe(1)
  expect((await db.surveyWave.findUniqueOrThrow({where:{id:f.waves[0].id}})).startsCount).toBe(1)
  await expect(f.enroll('999','SKY7')).rejects.toThrow()
  await expect(createLinkedResearchIdentity({projectId:f.projectId,waveId:f.waves[0].id,entryToken:f.waves[0].entryToken,consent:true,consentVersion:1})).rejects.toThrow()
 })
 it('requires exact consent and invitation before assigning a number',async()=>{
  const f=await fixture()
  for(const patch of [{consent:false},{consentVersion:2},{entryToken:'x'.repeat(43)}])await expect(joinMemorableStudy({publicId:f.publicId,waveId:f.waves[0].id,entryToken:f.waves[0].entryToken,consent:true,consentVersion:1,prefix:'001',suffix:'SKY7',...patch})).rejects.toThrow()
  expect(await db.surveyParticipant.count({where:{projectId:f.projectId}})).toBe(0)
 })
 it('one full code matches the same participant through two completed waves; neither suffix nor registry is public',async()=>{
  const f=await fixture(),first=await f.enroll(),proof=await recoverMemorableIdentity(f.publicId,'００１-sky7')
  expect(proof.accessCredential).toBe(first.accessCredential)
  for(const [i,w] of f.waves.entries()){
   const a=await startLinkedWave({publicId:f.publicId,waveId:w.id,...proof,consent:true,consentVersion:1})
   await submitResearchFinal({publicId:f.publicId,attemptId:a.attemptId,...proof,submissionId:randomUUID(),answers:{checkin:{mood:i?'normal':'good'}}})
  }
  const records=await db.surveyWaveAttempt.findMany({where:{projectId:f.projectId},include:{final:true}})
  expect(records).toHaveLength(2);expect(new Set(records.map(r=>r.participantId)).size).toBe(1)
  expect(records.every(r=>r.status==='COMPLETED'&&r.final?.resultsHash)).toBe(true)
  await expect(recoverMemorableIdentity(f.publicId,'001-WRONG')).rejects.toThrow()
  const otherStudy=await fixture();await expect(recoverMemorableIdentity(otherStudy.publicId,'001-SKY7')).rejects.toThrow()
  const info=JSON.stringify(await getPublicResearchInfo(f.publicId))
  expect(info).not.toContain('shortCodes');expect(info).not.toContain('二班07');expect(info).not.toContain('SKY7')
 })
 it('resets only the private suffix: original prefix, participant and saved final remain; old sessions and codes stop working',async()=>{
  const f=await fixture(),first=await f.enroll()
  await submitResearchFinal({publicId:f.publicId,attemptId:first.attemptId,...first,submissionId:randomUUID(),answers:{checkin:{mood:'good'}}})
  const finalBefore=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:first.attemptId}})
  await expect(resetMemorableIdentity(other,f.projectId,'001')).rejects.toThrow()
  const ticket=await resetMemorableIdentity(owner,f.projectId,'001')
  expect(ticket.resetCode).toMatch(/^001-[A-F0-9]{10}$/)
  await expect(recoverMemorableIdentity(f.publicId,'001-SKY7')).rejects.toThrow()
  await expect(getOwnResearchTask({publicId:f.publicId,attemptId:first.attemptId,...first})).rejects.toThrow()
  await expect(completeMemorableReset(f.publicId,ticket.resetCode,'SKY7')).rejects.toThrow('不同')
  const reset=await completeMemorableReset(f.publicId,ticket.resetCode,'MOON8')
  expect(reset.researchCode).toBe(first.researchCode);expect(reset.accessCredential).not.toBe(first.accessCredential)
  expect((await recoverMemorableIdentity(f.publicId,'001-MOON8')).researchCode).toBe(first.researchCode)
  await expect(recoverMemorableIdentity(f.publicId,'001-SKY7')).rejects.toThrow()
  await expect(completeMemorableReset(f.publicId,ticket.resetCode,'OTHER9')).rejects.toThrow()
  const second=await startLinkedWave({publicId:f.publicId,waveId:f.waves[1].id,...reset,consent:true,consentVersion:1})
  await submitResearchFinal({publicId:f.publicId,attemptId:second.attemptId,...reset,submissionId:randomUUID(),answers:{checkin:{mood:'normal'}}})
  expect(await db.surveyParticipant.count({where:{projectId:f.projectId}})).toBe(1)
  expect((await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:first.attemptId}})).resultsHash).toBe(finalBefore.resultsHash)
 })
 it('expires reset tickets and permits a fresh ticket without changing the original short prefix',async()=>{
  const f=await fixture();await f.enroll()
  const old=await resetMemorableIdentity(owner,f.projectId,'001')
  await db.surveyParticipantCode.update({where:{projectId_prefix:{projectId:f.projectId,prefix:'001'}},data:{resetExpiresAt:new Date(Date.now()-1000)}})
  await expect(completeMemorableReset(f.publicId,old.resetCode,'MOON8')).rejects.toThrow()
  const current=await resetMemorableIdentity(owner,f.projectId,'001')
  await expect(completeMemorableReset(f.publicId,old.resetCode,'MOON8')).rejects.toThrow()
  await expect(completeMemorableReset(f.publicId,current.resetCode,'SKY7')).rejects.toThrow('不同')
  await completeMemorableReset(f.publicId,current.resetCode,'MOON8')
  expect(await recoverMemorableIdentity(f.publicId,'001-MOON8')).toBeTruthy()
 })
 it('server-generated single code links both waves, cannot be reset, and never exposes its credential to researchers',async()=>{
  const f=await fixture('SELF_CODE')
  const enroll=()=>joinGeneratedCodeStudy({publicId:f.publicId,waveId:f.waves[0].id,entryToken:f.waves[0].entryToken,consent:true,consentVersion:1})
  const first=await enroll(),fullCode=first.fullCode!
  expect(fullCode).toMatch(/^HS2(?:-[0-9A-HJKMNP-TV-Z]{5}){4}$/)
  const proof=await recoverMemorableIdentity(f.publicId,fullCode.toLowerCase().replaceAll('-',''))
  expect(proof.researchCode).toBe(first.researchCode)
  expect(proof.accessCredential).toBe(first.accessCredential)
  for(const [i,w] of f.waves.entries()){
   const a=await startLinkedWave({publicId:f.publicId,waveId:w.id,...proof,consent:true,consentVersion:1})
   await submitResearchFinal({publicId:f.publicId,attemptId:a.attemptId,...proof,submissionId:randomUUID(),answers:{checkin:{mood:i?'normal':'good'}}})
  }
  const finals=await db.surveyWaveAttempt.findMany({where:{projectId:f.projectId},include:{final:true}})
  expect(finals).toHaveLength(2);expect(new Set(finals.map(a=>a.participantId)).size).toBe(1)
  expect(finals.every(a=>a.status==='COMPLETED'&&a.final)).toBe(true)
  const rows=await db.surveyParticipantCode.findMany({where:{projectId:f.projectId}})
  expect(rows).toHaveLength(1);expect(rows[0].prefix).toMatch(/^S[0-9A-HJKMNP-TV-Z]{19}$/)
  expect(JSON.stringify(rows)).not.toContain(fullCode)
  const settings=await readParticipationSettings(owner,f.projectId)
  expect(settings.participants).toEqual([]);expect(JSON.stringify(settings)).not.toContain(fullCode)
  await expect(resetMemorableIdentity(owner,f.projectId,rows[0].prefix)).rejects.toThrow()
  await expect(completeMemorableReset(f.publicId,rows[0].prefix+'-ABCDEF1234','NEWCODE7')).rejects.toThrow()
  await expect(f.enroll()).rejects.toThrow()
  const other=await fixture('SELF_CODE');await expect(recoverMemorableIdentity(other.publicId,fullCode)).rejects.toThrow()
  const mutated=fullCode.slice(0,-1)+(fullCode.endsWith('A')?'B':'A')
  await expect(recoverMemorableIdentity(f.publicId,mutated)).rejects.toThrow()
  const second=await enroll();expect(second.fullCode).not.toBe(fullCode);expect(second.researchCode).not.toBe(first.researchCode)
  // A forced RNG/lookup collision must fail atomically, never return or claim the first identity.
  const spy=vi.spyOn(codeCrypto,'generateStudyCode').mockReturnValue(fullCode)
  try{await expect(enroll()).rejects.toThrow('暂未完成')}finally{spy.mockRestore()}
  expect(await db.surveyParticipant.count({where:{projectId:f.projectId}})).toBe(2)
  expect((await db.surveyWave.findUniqueOrThrow({where:{id:f.waves[0].id}})).startsCount).toBe(2)
 })
 it('rejects legacy self-chosen secrets, including one resembling the new format, without changing their stored records',async()=>{
  const f=await fixture('SELF_CODE')
  for(const value of ['蓝天白云78','HS2ABCDEABCDEABCDEABCDE']){
   const prefix=createHmac('sha256',codeCrypto.codeKey('self-lookup:'+f.projectId)).update(value).digest('hex').slice(0,20).toUpperCase()
   const secret=await codeCrypto.memorableCredential(f.projectId,prefix,value,0)
   const participant=await db.surveyParticipant.create({data:{id:randomUUID(),projectId:f.projectId,researchCode:'R-'+randomBytes(8).toString('hex').toUpperCase(),credentialHash:codeCrypto.codeCredentialHash(secret),consentVersion:1,status:'ACTIVE'}})
   await db.surveyParticipantCode.create({data:{id:randomUUID(),projectId:f.projectId,prefix,participantId:participant.id}})
   await expect(recoverMemorableIdentity(f.publicId,value)).rejects.toThrow()
   await expect(recoverMemorableIdentity(f.publicId,value.toLowerCase())).rejects.toThrow()
   expect(await db.surveyParticipant.findUnique({where:{id:participant.id}})).toEqual(participant)
  }
 })
 it('closes old HTTP enrollment and rejects caller-chosen credentials at the new endpoint before claiming quota',async()=>{
  const f=await fixture('SELF_CODE'),app=express();app.use(express.json());app.use(publicSurveyRouter)
  const server=createServer(app);await new Promise<void>(resolve=>{server.listen(0,'127.0.0.1',resolve)})
  const address=server.address();if(!address||typeof address==='string')throw Error('fixture server unavailable')
  const url='http://127.0.0.1:'+address.port+'/r/'+f.publicId+'/waves/'+f.waves[0].id
  const body={entryToken:f.waves[0].entryToken,consent:true,consentVersion:1}
  const post=(path:string,data:unknown)=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})
  try{
   expect((await post('/join-self-code',{...body,fullCode:'蓝天白云78'})).status).toBe(410)
   expect((await post('/join-random-code',{...body,fullCode:'HS2-ABCDE-ABCDE-ABCDE-ABCDE'})).status).toBe(400)
   expect((await post('/join-random-code',{...body,consent:false})).status).toBe(400)
   expect((await post('/join-random-code',{...body,consentVersion:2})).status).toBe(403)
   expect((await post('/join-random-code',{...body,entryToken:'x'.repeat(43)})).status).toBe(403)
   expect(await db.surveyParticipant.count({where:{projectId:f.projectId}})).toBe(0)
   const result=await post('/join-random-code',body)
   expect(result.status).toBe(200);expect((await result.json()).data.fullCode).toMatch(/^HS2(?:-[0-9A-HJKMNP-TV-Z]{5}){4}$/)
   expect(await db.surveyParticipant.count({where:{projectId:f.projectId}})).toBe(1)
  }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
 })
 it('keeps claimed short identifiers immutable in the database',async()=>{
  const f=await fixture();await f.enroll()
  const row=await db.surveyParticipantCode.findUniqueOrThrow({where:{projectId_prefix:{projectId:f.projectId,prefix:'001'}}})
  await expect(db.surveyParticipantCode.update({where:{id:row.id},data:{prefix:'999'}})).rejects.toThrow()
  await expect(db.surveyParticipantCode.delete({where:{id:row.id}})).rejects.toThrow()
 })
 it('fixes mode and registry after publication, including direct database updates',async()=>{
  const f=await fixture(),settings=await readParticipationSettings(owner,f.projectId)
  expect(settings.locked).toBe(true)
  await expect(configureParticipation(owner,f.projectId,{revision:settings.revision,mode:'PERSONAL_LINK',label:'报名序号',instructions:'',shortCodes:[]})).rejects.toThrow()
  await expect(db.surveyProject.update({where:{id:f.projectId},data:{participantIdentityMode:'PERSONAL_LINK'}})).rejects.toThrow()
  await expect(readParticipationSettings(other,f.projectId)).rejects.toThrow()
 })
})
