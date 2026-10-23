vi.mock('../../modules/assessment-relational/runtime-consent',()=>({createRelationalRuntimeConsentAuthority:()=>({assertCompositeFinal:vi.fn(async()=>{})})}))
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {privateFormResourceEntry} from '../../modules/education-tools/private-tool.form-runtime-source'
import {privateFormOriginSchema,privateFormResourceKey} from '../../modules/education-tools/private-tool.form-runtime-contracts'
import {relationalEntryToRunPolicy} from '../../modules/assessment-run/resourceAuthority'
const mocked=vi.hoisted(()=>({read:vi.fn(),lock:vi.fn(),authority:vi.fn(),section:vi.fn()}))
vi.mock('../../modules/education-tools/private-tool.form-runtime-resources',()=>({readPrivateFormRuntimeResource:mocked.read}))
vi.mock('../../modules/assessment-run/startClaim',()=>({lockExecutionEnvelope:mocked.lock}))
vi.mock('../../modules/assessment-run/startAuthority',()=>({assertCurrentRunStartAuthority:mocked.authority}))
vi.mock('../../config/database',()=>({prisma:{compositeFormSection:{findFirst:mocked.section}}}))
import {readPrivateFormExecutionSource,assertPrivateFormFinalCurrent,assertPrivateFormSectionOwnership} from '../../modules/assessment-run/educationPrivateFormExecution'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const origin=privateFormOriginSchema.parse({schemaVersion:1,adapterVersion:'1.0.0',kind:'AUTHOR_PRIVATE_FORM',entry:'SCHOOL',
 organizationId:id(1),ownerUserId:id(2),toolId:id(3),versionId:id(4),contentHash:'a'.repeat(64),variantKey:'STUDENT:SELF'})
const resourceEntry=privateFormResourceEntry(origin,'Synthetic',id(5),'PUBLISHED'),policy=relationalEntryToRunPolicy(resourceEntry)
const parent={id:id(7),userId:id(6),subjectUserId:id(6),assignmentRef:id(8),compositeAssessmentId:id(5),compositeAssessment:{creationKey:privateFormResourceKey(origin),productKind:'ORGANIZATION_RESOURCE'}}
const row=()=>({executionId:id(9),organizationId:id(1),key:privateFormResourceKey(origin),version:'1.0.0',policy,policyHash:canonicalHash(policy),
 school:true,teacher:false,assignmentRef:id(8),assignmentStatus:'ASSIGNED',respondentUserId:id(6),subjectUserId:id(6),subjectRole:'STUDENT',respondentRole:'STUDENT',relationship:'SELF',
 bindingKind:'COMPOSITE',bindingRef:id(7),runStatus:'PUBLISHED',executionStatus:'STARTED'})
const db=()=>({$queryRaw:vi.fn().mockResolvedValue([row()]),compositeAssessmentAttempt:{findUnique:vi.fn().mockResolvedValue(parent)}})
beforeEach(()=>{vi.clearAllMocks();mocked.read.mockResolvedValue({origin,compositeId:id(5),resourceEntry,identityOnly:true,canPublish:false});mocked.lock.mockResolvedValue({});mocked.authority.mockResolvedValue(undefined)})
describe('Exact private FORM source and actual FINAL authority',()=>{
 it('reads immutable product/version identity without asking for current author capability',async()=>{
  const tx=db();const actual=await readPrivateFormExecutionSource(tx as any,{executionId:id(9),actorUserId:id(6),parentAttemptId:id(7)})
  expect(actual.origin).toEqual(origin);expect(mocked.read).toHaveBeenCalledWith(tx,{key:privateFormResourceKey(origin),version:'1.0.0',purpose:'EXISTING_EXECUTION'})
 })
 it.each([{school:false},{organizationId:id(40)},{version:'9.0.0'},{respondentUserId:id(40)},{policyHash:'0'.repeat(64)},{bindingRef:id(40)},{assignmentStatus:'REVOKED'}])('rejects incorrect workflow/tenant/version/actor/policy/binding %j',async(change)=>{
  const tx=db();tx.$queryRaw.mockResolvedValue([{...row(),...change}])
  await expect(readPrivateFormExecutionSource(tx as any,{executionId:id(9),actorUserId:id(6),parentAttemptId:id(7)})).rejects.toMatchObject({code:'PRIVATE_FORM_EXECUTION_BINDING_INVALID'})
 })
 it('rejects cancelled Run even if fixed source and parent still exist',async()=>{
  const tx=db();tx.$queryRaw.mockResolvedValue([{...row(),runStatus:'CANCELLED'}])
  await expect(readPrivateFormExecutionSource(tx as any,{executionId:id(9)})).rejects.toMatchObject({code:'PRIVATE_FORM_TASK_NOT_COLLECTABLE'})
 })
 it('locks the existing execution, rechecks exact source and current authority before FINAL writes',async()=>{
  const tx=db();tx.$queryRaw.mockResolvedValueOnce([{id:id(9)}]).mockResolvedValueOnce([row()])
  await assertPrivateFormFinalCurrent(tx as any,{attemptId:id(7),actorUserId:id(6)})
  expect(mocked.lock).toHaveBeenCalledWith(tx,id(9));expect(mocked.authority).toHaveBeenCalledWith(tx,id(9),{accountMode:'DETECT_EDUCATION_LIBRARY',operation:'BOUND_FINAL'})
  expect(mocked.lock.mock.invocationCallOrder[0]).toBeLessThan(mocked.read.mock.invocationCallOrder[0])
  expect(mocked.read.mock.invocationCallOrder[0]).toBeLessThan(mocked.authority.mock.invocationCallOrder[0])
 })
 it('does not turn legacy Form FINAL into an education authority path',async()=>{
  const tx=db();tx.compositeAssessmentAttempt.findUnique.mockResolvedValue({...parent,compositeAssessment:{creationKey:null,productKind:'QUESTIONNAIRE'}} as any)
  await assertPrivateFormFinalCurrent(tx as any,{attemptId:id(7),actorUserId:id(6)})
  expect(mocked.lock).not.toHaveBeenCalled();expect(mocked.read).not.toHaveBeenCalled()
 })
 it('rejects an unknown/cross-parent section before any child can be created',async()=>{
  mocked.section.mockResolvedValue(null)
  await expect(assertPrivateFormSectionOwnership(id(7),id(50))).rejects.toMatchObject({code:'PRIVATE_FORM_SECTION_NOT_FOUND',statusCode:404})
  expect(mocked.section).toHaveBeenCalledWith({where:{id:id(50),compositeAssessment:{attempts:{some:{id:id(7)}}}},select:{id:true}})
 })
})
