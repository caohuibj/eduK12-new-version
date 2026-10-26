import {beforeEach,describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({tx:{} as Record<string,any>,completed:null as null|{id:string},item:{id:'draft',organizationId:'school',eventId:'event',observerUserId:'actor',kind:'FORMAL_FEEDBACK',status:'DRAFT',revision:1}}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn(state.tx)}}))
vi.mock('../../modules/assessment-runtime/security',()=>({encryptUnifiedRuntimePayload:()=> 'encrypted',decryptUnifiedRuntimePayload:()=>({})}))
vi.mock('../../modules/organization/service',()=>({appendAudit:vi.fn()}))
vi.mock('../../modules/organization/educationProductAccess',()=>({resolveEducationProductMemberScope:vi.fn()}))
vi.mock('../../modules/survey/final.compute',()=>({dryRunSurveyForm:vi.fn(),SurveyFinalValidationError:class extends Error{}}))
vi.mock('../../modules/huiteacher/fieldForm.service',()=>({readBoundHuiteacherFieldForm:async()=>null}))
import {createHuiteacherObservation,updateHuiteacherObservation,submitHuiteacherObservation} from '../../modules/huiteacher/observer.service'
beforeEach(()=>{
 state.completed={id:'first-final'};state.item={id:'draft',organizationId:'school',eventId:'event',observerUserId:'actor',kind:'FORMAL_FEEDBACK',status:'DRAFT',revision:1}
 const record={findUnique:vi.fn(async()=>state.item),findFirst:vi.fn(async()=>state.completed),create:vi.fn(async({data}:any)=>({...data,revision:1})),updateMany:vi.fn(async()=>({count:1}))}
 state.tx={$queryRaw:vi.fn(async(strings:TemplateStringsArray)=>strings.join('').includes('huiteacher_evaluation_events')?[{id:'event',kind:'CLASSROOM',status:'OPEN'}]:[{id:'actor',role:'EXPERT'}]),$executeRaw:vi.fn(async()=>1),huiteacherObservationRecord:record}
})
describe('one formal Teacher feedback per actor and event',()=>{
 it.each(['create','update','submit'] as const)('rejects %s after a finalized formal record before any evidence write',async(operation)=>{
  const job=operation==='create'?createHuiteacherObservation({organizationId:'school',eventId:'event',actorUserId:'actor',kind:'FORMAL_FEEDBACK',content:'new'}):operation==='update'?updateHuiteacherObservation({id:'draft',actorUserId:'actor',expectedRevision:1,content:'changed'}):submitHuiteacherObservation({id:'draft',actorUserId:'actor',expectedRevision:1})
  await expect(job).rejects.toMatchObject({code:'HUITEACHER_FORMAL_FEEDBACK_ALREADY_SUBMITTED',statusCode:409})
  expect(state.tx.huiteacherObservationRecord.create).not.toHaveBeenCalled()
  expect(state.tx.huiteacherObservationRecord.updateMany).not.toHaveBeenCalled()
  expect(state.tx.huiteacherObservationRecord.findFirst).toHaveBeenCalledWith({where:{organizationId:'school',eventId:'event',observerUserId:'actor',kind:'FORMAL_FEEDBACK',status:'SUBMITTED'},select:{id:true}})
  expect(state.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(state.tx.huiteacherObservationRecord.findFirst.mock.invocationCallOrder[0])
 })
 it('admits a first formal submission and locks a key containing the exact actor and activity',async()=>{
  state.completed=null
  await expect(submitHuiteacherObservation({id:'draft',actorUserId:'actor',expectedRevision:1})).resolves.toMatchObject({status:'SUBMITTED'})
  const [sql,key]=state.tx.$executeRaw.mock.calls[0]
  expect(sql.join('')).toContain('pg_advisory_xact_lock(hashtextextended(')
  expect(JSON.parse(key)).toEqual(['huiteacher-formal-feedback-v1','school','event','actor'])
  expect(state.tx.huiteacherObservationRecord.updateMany).toHaveBeenCalledOnce()
 })
 it.each(['FACT','PRIVATE_REFLECTION'] as const)('keeps auxiliary %s independent of the formal slot',async(kind)=>{
  state.item.kind=kind
  await expect(submitHuiteacherObservation({id:'draft',actorUserId:'actor',expectedRevision:1})).resolves.toMatchObject({status:'SUBMITTED'})
  expect(state.tx.$executeRaw).not.toHaveBeenCalled()
  expect(state.tx.huiteacherObservationRecord.findFirst).not.toHaveBeenCalled()
 })
})
