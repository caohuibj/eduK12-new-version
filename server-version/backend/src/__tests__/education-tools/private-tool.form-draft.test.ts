import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({tx:{},transaction:vi.fn(),editor:vi.fn(),lock:vi.fn(),prepare:vi.fn(),scale:vi.fn(),add:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:m.transaction}}))
vi.mock('../../modules/assessment-run/educationPrivateScaleContext',()=>({assertPrivateScaleRunEditor:m.editor}))
vi.mock('../../modules/assessment-run/repository',()=>({lockRun:m.lock,addAssessmentRunTrackDraft:m.add}))
vi.mock('../../modules/education-tools/private-tool.runtime-resources',()=>({preparePrivateScaleRuntimeResource:m.scale}))
vi.mock('../../modules/education-tools/private-tool.form-runtime-resources',()=>({preparePrivateFormRuntimeResource:m.prepare}))
import {addPrivateFormRunTrack} from '../../modules/education-tools/private-tool.run-adapter'
import {privateToolRunTrackInput,assertPrivateRunSelection} from '../../modules/education-tools/private-tool.run-contract'
import {privateFormResourceEntry} from '../../modules/education-tools/private-tool.form-runtime-source'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const scope={organizationId:id(1),runId:id(2),actorUserId:id(3),parent:{kind:'SCHOOL_ACTIVITY' as const,id:id(9)}}
const context={entry:'SCHOOL',organizationId:id(1),principal:{userId:id(3),accountDomain:'SCHOOL'}}
const input={expectedVersion:7,privateForm:{versionId:id(4),contentHash:'a'.repeat(64),administration:{population:'STUDENT',responseMode:'SELF'}},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'}}
const entry=privateFormResourceEntry({schemaVersion:1,adapterVersion:'1.0.0',kind:'AUTHOR_PRIVATE_FORM',entry:'SCHOOL',organizationId:id(1),ownerUserId:id(3),toolId:id(5),versionId:id(4),contentHash:'a'.repeat(64),variantKey:'STUDENT:SELF'},'Synthetic',id(7))
beforeEach(()=>{vi.clearAllMocks();m.transaction.mockImplementation(async(fn:any)=>fn(m.tx));m.editor.mockResolvedValue({context,schoolAdmin:false,workflow:{schoolCourseId:id(9),teacherEventId:null}});m.lock.mockResolvedValue({status:'DRAFT',version:7});m.prepare.mockResolvedValue({origin:entry.privateFormOrigin,compositeId:id(7),resourceEntry:entry,identityOnly:true,canPublish:false});m.add.mockResolvedValue({id:id(8)})})
describe('Private FORM fixed-version draft attachment',()=>{
 it('uses the actual FORM source in the same RC transaction after parent/editor/CAS, never prepares a Scale',async()=>{
  await expect(addPrivateFormRunTrack(scope,input)).resolves.toEqual({id:id(8)})
  expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.prepare.mock.invocationCallOrder[0])
  expect(m.prepare.mock.invocationCallOrder[0]).toBeLessThan(m.add.mock.invocationCallOrder[0])
  expect(m.transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'ReadCommitted'})
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({tx:m.tx,expectedVersion:7,resource:{family:'FORM',key:entry.applicability.resourceKey,version:'1.0.0'},requestedPolicy:expect.objectContaining({analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'EDUCATION_PRIVATE_FORM_V1'})}))
  expect(m.scale).not.toHaveBeenCalled();expect(m.add.mock.calls[0][0].requestedPolicy).not.toHaveProperty('resultDisclosure')
  expect(entry.releaseStatus).toBe('DRAFT');expect(entry.resultDisclosure?.audiences.RESPONDENT.mode).toBe('NONE')
 })
 it('does not prepare on stale draft or wrong path parent',async()=>{
  await expect(addPrivateFormRunTrack({...scope,parent:{kind:'TEACHER_EVENT',id:id(9)}},input)).rejects.toThrow('PARENT_MISMATCH')
  m.lock.mockResolvedValue({status:'DRAFT',version:8})
  await expect(addPrivateFormRunTrack(scope,input)).rejects.toThrow('RUN_VERSION_CONFLICT')
  expect(m.prepare).not.toHaveBeenCalled();expect(m.add).not.toHaveBeenCalled()
 })
 it('requires current workflow permission and does not derive publisher rights from form ownership',async()=>{
  m.editor.mockRejectedValue(new Error('workflow denied'))
  await expect(addPrivateFormRunTrack(scope,input)).rejects.toThrow('workflow denied')
  expect(m.prepare).not.toHaveBeenCalled()
 })
 it('rejects mixed/forged DTOs, missing CAS and invalid parent selectors before any writes',async()=>{
  for(const bad of [{...input,privateScale:input.privateForm},{...input,resource:{family:'FORM'}},{...input,resultDisclosure:{}},{...input,expectedVersion:undefined}])
   expect(privateToolRunTrackInput.safeParse(bad).success).toBe(false)
  const bad=privateToolRunTrackInput.parse({...input,privateForm:{...input.privateForm,administration:{population:'STUDENT',responseMode:'PARENT_REPORT'}}})
  expect(()=>assertPrivateRunSelection(bad)).toThrow('SELECTOR_COMBINATION_INVALID')
  expect(m.transaction).not.toHaveBeenCalled()
 })
 it('keeps psychological teacher observer restricted to explicit homeroom and preserves product population limits',async()=>{
  await expect(addPrivateFormRunTrack(scope,{...input,privateForm:{...input.privateForm,administration:{population:'STUDENT',responseMode:'TEACHER_REPORT'}},targetPolicy:{mode:'ALL_CLASS_TEACHERS'}})).rejects.toThrow('HOMEROOM_TARGET_REQUIRED')
  m.editor.mockResolvedValue({context:{...context,entry:'TEACHER'},schoolAdmin:false,workflow:{schoolCourseId:null,teacherEventId:id(9)}})
  await expect(addPrivateFormRunTrack({...scope,parent:{kind:'TEACHER_EVENT',id:id(9)}},input)).rejects.toThrow('VARIANT_UNSUPPORTED')
  expect(m.prepare).not.toHaveBeenCalled()
 })
})
