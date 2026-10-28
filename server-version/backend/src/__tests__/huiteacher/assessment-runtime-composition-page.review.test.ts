import {describe,expect,it,vi} from 'vitest'
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
})
