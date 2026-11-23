import {beforeEach,describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({tx:{} as Record<string,any>,eventStatus:'CLOSED',authored:1,previous:true}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn(state.tx)}}))
vi.mock('../../modules/assessment-runtime/security',()=>({encryptUnifiedRuntimePayload:()=> 'encrypted',decryptUnifiedRuntimePayload:()=>({})}))
vi.mock('../../modules/organization/service',()=>({appendAudit:vi.fn()}))
vi.mock('../../modules/organization/educationProductAccess',()=>({resolveEducationProductMemberScope:async()=>({productAdmin:true,membershipId:'manager'})}))
vi.mock('../../modules/huiteacher/fieldForm.service',()=>({readBoundHuiteacherFieldForm:vi.fn()}))
vi.mock('../../modules/huiteacher/fieldComposition.evidence',()=>({createCanonicalFieldEvidence:vi.fn()}))
import {acceptHuiteacherObserver,inviteHuiteacherObserver,createHuiteacherObservation,updateHuiteacherObservation,submitHuiteacherObservation} from '../../modules/huiteacher/observer.service'
const original={id:'grant',organizationId:'school',eventId:'event',status:'INVITED',expiresAt:new Date(0)}
beforeEach(()=>{
 state.eventStatus='CLOSED';state.authored=1;state.previous=true
 const item={id:'draft',organizationId:'school',eventId:'event',observerUserId:'actor',kind:'FACT',status:'DRAFT',revision:1}
 state.tx={
  $queryRaw:vi.fn(async(strings:TemplateStringsArray)=>{const sql=strings.join('');return sql.includes('FROM "huiteacher_evaluation_events"')?[{id:'event',kind:'CLASSROOM',status:state.eventStatus}]:sql.includes('FROM "huiteacher_observer_grants"')?[original]:[{id:'actor'}]}),
  huiteacherObserverGrant:{findUnique:vi.fn(async()=>state.previous?original:null),update:vi.fn(async()=>({...original,revision:2,status:'ACCEPTED'})),create:vi.fn()},
  huiteacherObservationRecord:{count:vi.fn(async()=>state.authored),findUnique:vi.fn(async()=>item),create:vi.fn(),updateMany:vi.fn()},
 }
})
describe('closed Teacher field renewal remains source-bound and read-only',()=>{
 it('accepts a renewal only after rechecking an existing submitted formal author in this exact scope',async()=>{
  await expect(acceptHuiteacherObserver({userId:'actor',invitationId:'grant'})).resolves.toMatchObject({id:'grant',eventId:'event',status:'ACCEPTED'})
  expect(state.tx.huiteacherObservationRecord.count).toHaveBeenCalledWith({where:{organizationId:'school',eventId:'event',observerUserId:'actor',kind:'FORMAL_FEEDBACK',status:'SUBMITTED'}})
  expect(state.tx.huiteacherObserverGrant.update).toHaveBeenCalledOnce()
  expect(state.tx.huiteacherObservationRecord.create).not.toHaveBeenCalled()
  expect(state.tx.huiteacherObservationRecord.updateMany).not.toHaveBeenCalled()
 })
 it.each(['CLOSED','CANCELLED'])('rejects an unsourced invite after the activity becomes %s',async status=>{
  state.eventStatus=status;state.authored=0
  await expect(acceptHuiteacherObserver({userId:'actor',invitationId:'grant'})).rejects.toMatchObject({code:status==='CLOSED'?'HUITEACHER_CLOSED_EVENT_REVIEWER_NOT_SOURCED':'HUITEACHER_FIELD_EVENT_NOT_OPEN'})
  expect(state.tx.huiteacherObserverGrant.update).not.toHaveBeenCalled()
 })
 it.each(['DRAFT','OPEN'])('preserves the existing %s invitation acceptance path',async status=>{
  state.eventStatus=status;state.authored=0
  await expect(acceptHuiteacherObserver({userId:'actor',invitationId:'grant'})).resolves.toMatchObject({status:'ACCEPTED'})
  expect(state.tx.huiteacherObservationRecord.count).not.toHaveBeenCalled()
 })
 it('keeps every observation writer closed after a valid renewal',async()=>{
  for(const kind of ['FACT','FORMAL_FEEDBACK','PRIVATE_REFLECTION'] as const){
   state.tx.huiteacherObservationRecord.findUnique.mockResolvedValue({id:'draft',organizationId:'school',eventId:'event',observerUserId:'actor',kind,status:'DRAFT',revision:1})
   const attempts=[()=>createHuiteacherObservation({organizationId:'school',eventId:'event',actorUserId:'actor',kind,content:'new content'}),()=>updateHuiteacherObservation({id:'draft',actorUserId:'actor',expectedRevision:1,content:'changed'}),()=>submitHuiteacherObservation({id:'draft',actorUserId:'actor',expectedRevision:1})]
   for(const attempt of attempts)await expect(attempt()).rejects.toMatchObject({code:'HUITEACHER_FIELD_EVENT_NOT_OPEN'})
  }
  expect(state.tx.huiteacherObservationRecord.create).not.toHaveBeenCalled()
  expect(state.tx.huiteacherObservationRecord.updateMany).not.toHaveBeenCalled()
 })
 it.each([false,true])('does not issue new closed access without the original formal evidence (prior grant %s)',async previous=>{
  state.previous=previous;state.authored=0
  await expect(inviteHuiteacherObserver({organizationId:'school',eventId:'event',actorUserId:'manager',observerUserId:'actor',role:'EXPERT',expiresAt:new Date(Date.now()+3600000)})).rejects.toMatchObject({code:previous?'HUITEACHER_CLOSED_EVENT_REVIEWER_NOT_SOURCED':'HUITEACHER_CLOSED_EVENT_NEW_INVITEE_FORBIDDEN',statusCode:403})
  expect(state.tx.huiteacherObserverGrant.create).not.toHaveBeenCalled()
  expect(state.tx.huiteacherObserverGrant.update).not.toHaveBeenCalled()
 })
})
