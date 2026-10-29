import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
const m=vi.hoisted(()=>({current:vi.fn(),formStored:vi.fn(),scaleStored:vi.fn(),parent:vi.fn()}))
vi.mock('../../modules/huiteacher/fieldComposition.authority',async original=>({...await original<object>(),currentFieldComposition:m.current}))
vi.mock('../../modules/composite/training-variant-child-scope',async original=>({...await original<object>(),
 assertTrainingSectionSelected:async(_id:string,_section:string,{parent}:{parent:unknown})=>parent,
 assertTrainingChildSelected:async(_row:unknown,{parent}:{parent:unknown})=>parent,
}))
vi.mock('../../modules/assessment-runtime/unit-admission',async original=>({...await original<object>(),loadStoredUnitAdmission:m.formStored,loadStoredVersionedUnitAdmission:m.scaleStored}))
import {activateCompositeFormAdmission,activateStoredOrCatalogCompositeFormAdmission,type CompositeFormAdmissionParent} from '../../modules/assessment-runtime/form-admission.service'
import {activateScaleAdmission} from '../../modules/scale/scale-admission.service'
import {assertPrivateFormFinalCurrent,assertPrivateFormParentSource} from '../../modules/assessment-run/educationPrivateFormExecution'
const sourceKey='education-composition:TEACHER:00000000-0000-4000-8000-000000000001:TEACHER:EXPERT_REPORT:2.0.0'
const parent:CompositeFormAdmissionParent={id:'parent',userId:'expert',recoveryTokenHash:null,assignmentRef:null,deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,
 contextSnapshotEncrypted:null,contextSnapshotHash:null,frozenActiveSlotSetEncrypted:null,frozenActiveSlotSetHash:null,compositeAssessment:{creationKey:sourceKey,productKind:'ORGANIZATION_RESOURCE',formSections:[]}}
const child={id:'section-attempt',attemptEpoch:1,frozenAdmissionSnapshotEncrypted:'existing-valid-stored-admission',frozenAdmissionSnapshotHash:'a'.repeat(64)}
beforeEach(()=>{vi.clearAllMocks();m.parent.mockResolvedValue({...parent,compositeAssessmentId:'composite'});m.formStored.mockResolvedValue({stored:true})})
describe('Native field authority is independent from reusable admission evidence',()=>{
 it('rechecks current invitation before either Form stored-admission fast path',async()=>{
  const revoked=Error('invitation revoked');m.current.mockRejectedValue(revoked)
  await expect(activateStoredOrCatalogCompositeFormAdmission({parentId:parent.id,parent,sectionId:'section',child})).rejects.toBe(revoked)
  await expect(activateCompositeFormAdmission({parent,sectionId:'section',child,definition:{id:'section',items:[]} as any})).rejects.toBe(revoked)
  expect(m.formStored).not.toHaveBeenCalled()
  m.current.mockResolvedValue({scope:{}})
  await expect(activateStoredOrCatalogCompositeFormAdmission({parentId:parent.id,parent,sectionId:'section',child})).resolves.toEqual({stored:true})
  expect(m.current.mock.invocationCallOrder.at(-1)).toBeLessThan(m.formStored.mock.invocationCallOrder[0])
 })
 it('rechecks current invitation before a stored Scale admission or completed-final replay can be consumed',async()=>{
  const revoked=Error('invitation revoked');m.current.mockRejectedValue(revoked)
  const row={...child,userId:'expert',compositeAttemptId:'parent',deliveryMode:'FINAL_ONLY',compositeAttempt:parent}
  await expect(activateScaleAdmission(row as any,parent as any)).rejects.toBe(revoked)
  expect(m.scaleStored).not.toHaveBeenCalled()
 })
 it('uses the actual FINAL transaction to hold current field authority and never fabricates an assignment or consults a Run',async()=>{
  const query=vi.fn(),tx={compositeAssessmentAttempt:{findUnique:m.parent},$queryRaw:query} as unknown as Prisma.TransactionClient
  m.current.mockResolvedValue({scope:{}})
  await assertPrivateFormFinalCurrent(tx,{attemptId:'parent',actorUserId:'expert'})
  expect(m.current).toHaveBeenCalledWith(tx,{attemptId:'parent',actorUserId:'expert',lock:true});expect(query).not.toHaveBeenCalled()
  const revoked=Error('current actor/target/grant invalid');m.current.mockRejectedValue(revoked)
  await expect(assertPrivateFormFinalCurrent(tx,{attemptId:'parent',actorUserId:'expert'})).rejects.toBe(revoked)
  await expect(assertPrivateFormParentSource('parent',tx)).rejects.toBe(revoked)
  expect(query).not.toHaveBeenCalled()
 })
})
