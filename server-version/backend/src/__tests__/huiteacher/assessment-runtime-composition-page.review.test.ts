import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
import {createTeacherAssessmentAccess,type TeacherAssessmentSourceAccess} from '../../modules/huiteacher/assessmentRuntime.access'
import {EducationPrivateToolError} from '../../modules/education-tools/private-tool.contracts'
import {readFrozenCompositionIdentity,assertCompositionCollection} from '../../modules/assessment-run/educationCompositionExecution'

vi.mock('../../modules/assessment-run/educationCompositionExecution',()=>({
 readFrozenCompositionIdentity:vi.fn(),assertCompositionCollection:vi.fn(),
}))

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
function row(n:number,status:'ASSIGNED'|'STARTED'){
 return {executionId:id(n),organizationId:id(10),runId:id(11),eventId:id(12),eventTitle:'Synthetic Teacher event',family:'BUNDLE',status,runStatus:'PUBLISHED',
  runtimeBindingRef:status==='STARTED'?id(13):null,consentRequired:false,consentPurpose:null,consentVisibility:null,
  resourceKey:`education-composition:TEACHER:${id(n+20)}:TEACHER:SELF:1.0.0`,resourceVersion:'1.0.0',policy:{},policyHash:'a'.repeat(64),
  assignmentId:id(n+30),episodeId:id(n+40),bindingKind:status==='STARTED'?'COMPOSITE':null,cursorCreatedAt:'2026-10-28T22:00:00.000000Z',
  attemptEpoch:status==='STARTED'?1:null,frozenSlotSet:null,frozenSlotSetHash:null}
}

describe('Review: ordinary Teacher page isolates current source-use withdrawal',()=>{
 beforeEach(()=>vi.resetAllMocks())
 it('retains an entered questionnaire when another not-yet-entered source on the page loses U',async()=>{
  const entered=row(1,'STARTED'),withdrawn=row(2,'ASSIGNED')
  const frozen=(key:string)=>({kind:'COMPOSITION',origin:{entry:'TEACHER'},compositeId:id(50),title:key===entered.resourceKey?'已入场问卷':'已撤回来源',units:[],identityOnly:true})
  vi.mocked(readFrozenCompositionIdentity).mockImplementation(async(_tx,input)=>frozen(input.key) as Awaited<ReturnType<typeof readFrozenCompositionIdentity>>)
  vi.mocked(assertCompositionCollection).mockImplementation(async(_tx,_identity,purpose)=>{
   if(purpose==='NEW_START')throw new EducationPrivateToolError('PUBLIC_SOURCE_USE_REQUIRED',403)
  })
  const db={$queryRaw:vi.fn().mockResolvedValue([entered,withdrawn])} as unknown as Prisma.TransactionClient
  const source={readIdentity:vi.fn(),assertUse:vi.fn()} satisfies TeacherAssessmentSourceAccess
  // Raw SQL rows and source proofs are synthetic. This only verifies the page's
  // typed error handling, not database population authority or a login journey.
  const result=await createTeacherAssessmentAccess(db,source).page(id(60),{pageSize:50})
  expect(result.list.map(task=>task.executionId)).toEqual([entered.executionId])
  expect(result.nextCursor).toBeNull()
  expect(assertCompositionCollection).toHaveBeenCalledWith(db,expect.objectContaining({title:'已入场问卷'}),'BOUND_COLLECTION')
  expect(source.readIdentity).not.toHaveBeenCalled()
 })
 it('advances by the last scanned row when a known withdrawn source leaves an empty page',async()=>{
  const withdrawn=row(2,'ASSIGNED'),entered=row(1,'STARTED'),actor=id(60)
  vi.mocked(readFrozenCompositionIdentity).mockResolvedValue({origin:{entry:'TEACHER'},compositeId:id(50),title:'Fixed',units:[]} as never)
  vi.mocked(assertCompositionCollection).mockImplementation(async(_tx,_identity,purpose)=>{if(purpose==='NEW_START')throw new EducationPrivateToolError('LIBRARY_SOURCE_USE_REQUIRED',403)})
  const db={$queryRaw:vi.fn().mockResolvedValueOnce([withdrawn,entered]).mockResolvedValueOnce([entered])} as unknown as Prisma.TransactionClient
  const access=createTeacherAssessmentAccess(db,{readIdentity:vi.fn(),assertUse:vi.fn()})
  const first=await access.page(actor,{pageSize:1})
  expect(first.list).toEqual([]);expect(first.nextCursor).toBeTypeOf('string')
  expect(JSON.parse(Buffer.from(first.nextCursor!,'base64url').toString('utf8'))).toMatchObject({actorUserId:actor,executionId:withdrawn.executionId})
  expect((await access.page(actor,{pageSize:1,cursor:first.nextCursor})).list.map(task=>task.executionId)).toEqual([entered.executionId])
 })
 it('propagates an unknown 403 instead of treating it as ordinary source withdrawal',async()=>{
  vi.mocked(readFrozenCompositionIdentity).mockResolvedValue({origin:{entry:'TEACHER'},compositeId:id(50),title:'Fixed',units:[]} as never)
  const error=new EducationPrivateToolError('SYNTHETIC_UNKNOWN_DENIAL',403)
  vi.mocked(assertCompositionCollection).mockRejectedValue(error)
  const db={$queryRaw:vi.fn().mockResolvedValue([row(1,'ASSIGNED')])} as unknown as Prisma.TransactionClient
  await expect(createTeacherAssessmentAccess(db,{readIdentity:vi.fn(),assertUse:vi.fn()}).page(id(60),{})).rejects.toBe(error)
 })
})
