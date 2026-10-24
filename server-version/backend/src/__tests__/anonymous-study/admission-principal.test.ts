import {beforeEach,describe,expect,it,vi} from 'vitest'
const {db,state}=vi.hoisted(()=>({db:{$queryRaw:vi.fn(),$transaction:vi.fn()},state:{binding:null as any,lease:true,envelope:null as any}}))
vi.mock('../../config/database',()=>({prisma:db}))
vi.mock('../../modules/assessment-runtime/security',()=>({decryptUnifiedRuntimePayload:()=>state.envelope}))
vi.mock('../../modules/assessment-runtime/compact-raw',()=>({unpackWholeRawEnvelope:(x:unknown)=>x}))
import {acceptedStudyReceipt,assertCurrentStudyPrincipal,stableStudyAdmissionHash} from '../../modules/anonymous-study/admission-principal'
const original='1'.repeat(64),fresh='2'.repeat(64)
const input=()=>({attemptId:'parent',attemptEpoch:1,recoveryTokenHash:fresh,frozenHash:original})
const unit={assessmentId:'child',submissionId:'unit-submission',attemptEpoch:1,definitionHash:'definition',contextSnapshotHash:null,answers:[]}
const job=()=>({id:'job',attemptId:'parent',attemptEpoch:1,slotSetHash:'slot',contextHash:null,leaseToken:'lease',wholeSubmissionId:'whole',wholeAcceptedAt:new Date(1000),wholePayloadHash:'payload',wholeAnswersEncrypted:'server-cipher'} as any)
const text=(q:any)=>Array.from(q.strings??q).join('')
beforeEach(()=>{
 vi.resetAllMocks();state.lease=true
 state.binding={scopeValid:true,attemptId:'parent',hash:original,epoch:1,currentEpoch:1,currentHash:fresh,userId:null,participantStatus:'ACTIVE',slotSetHash:'slot',contextHash:null}
 state.envelope={schemaVersion:1,binding:{attemptId:'parent',attemptEpoch:1,slotSetHash:'slot',contextHash:null},payloadHash:'payload',units:[unit]}
 db.$transaction.mockImplementation(fn=>fn(db))
 db.$queryRaw.mockImplementation((q:any)=>Promise.resolve(text(q).includes('FROM anonymous_study_attempts')?(state.binding?[{...state.binding}]:[]):text(q).includes('FROM composite_report_jobs')?(state.lease?[{id:'job'}]:[]):[{id:'parent'}]))
})
describe('immutable study principal and fresh credential overlay',()=>{
 it('uses stable identity for later unit activation without changing the presented proof',async()=>{
  expect(await stableStudyAdmissionHash(db as any,'parent',fresh,null)).toBe(original)
  const request=input();expect(await assertCurrentStudyPrincipal(db as any,request)).toBe(true)
  expect(request.recoveryTokenHash).toBe(fresh)
 })
 it('rejects old proof even when it equals the frozen original principal',async()=>{
  await expect(assertCurrentStudyPrincipal(db as any,{...input(),recoveryTokenHash:original})).rejects.toMatchObject({statusCode:403})
 })
 it.each([{attemptEpoch:2},{frozenHash:fresh},{userId:'student'}])('rejects changed authority %j',async patch=>{
  await expect(assertCurrentStudyPrincipal(db as any,{...input(),...patch})).rejects.toThrow()
 })
 it('keeps ordinary and historical unbound protocols outside this adapter',async()=>{
  state.binding=null;expect(await assertCurrentStudyPrincipal(db as any,input())).toBe(false)
  expect(await stableStudyAdmissionHash(db as any,'parent',fresh,null)).toBe(fresh)
 })
 it('locks parent before re-reading current proof, rejecting reset which won the lock',async()=>{
  db.$queryRaw.mockImplementation((q:any)=>{
   if(text(q).includes('FOR UPDATE'))state.binding.currentHash=null
   return Promise.resolve(text(q).includes('FROM anonymous_study_attempts')?[{...state.binding}]:[{id:'parent'}])
  })
  await expect(assertCurrentStudyPrincipal(db as any,input(),true)).rejects.toThrow()
  const sql=db.$queryRaw.mock.calls.map(call=>text(call[0]))
  expect(sql[1]).toContain('composite_assessment_attempts');expect(sql[1]).toContain('FOR UPDATE');expect(sql[2]).toContain('FROM anonymous_study_attempts')
 })
 it('fails closed on a present new binding with damaged scope, never falling back to legacy',async()=>{
  state.binding.scopeValid=false;await expect(assertCurrentStudyPrincipal(db as any,input())).rejects.toThrow()
 })
 it('rejects revoked participant without rewriting the frozen hash',async()=>{
  state.binding.participantStatus='REVOKED';await expect(assertCurrentStudyPrincipal(db as any,input())).rejects.toThrow()
  expect(state.binding.hash).toBe(original)
 })
 it('allows only persisted accepted receipt computation after reset, not an old public proof',async()=>{
  const cap=await acceptedStudyReceipt(job(),state.envelope);state.binding.currentHash=null
  expect(await assertCurrentStudyPrincipal(db as any,{...input(),recoveryTokenHash:original,receipt:cap,unit},true)).toBe(true)
  await expect(assertCurrentStudyPrincipal(db as any,{...input(),recoveryTokenHash:original},true)).rejects.toThrow()
 })
 it('rejects a request-shaped or copied internal capability',async()=>{
  const cap=await acceptedStudyReceipt(job(),state.envelope)
  await expect(assertCurrentStudyPrincipal(db as any,{...input(),receipt:{...cap} as any,unit})).rejects.toThrow()
 })
 it('rechecks the actual lease at replay/write and rejects a changed receipt unit',async()=>{
  const cap=await acceptedStudyReceipt(job(),state.envelope)
  await expect(assertCurrentStudyPrincipal(db as any,{...input(),receipt:cap,unit:{...unit,answers:['changed']}})).rejects.toThrow()
  state.lease=false;await expect(assertCurrentStudyPrincipal(db as any,{...input(),receipt:cap,unit},true)).rejects.toThrow()
 })
 it('cannot mint capability for a missing/expired lease or mismatched envelope',async()=>{
  state.lease=false;await expect(acceptedStudyReceipt(job(),state.envelope)).rejects.toThrow()
  state.lease=true;state.envelope.binding.attemptId='other';await expect(acceptedStudyReceipt(job(),state.envelope)).rejects.toThrow()
 })
})
