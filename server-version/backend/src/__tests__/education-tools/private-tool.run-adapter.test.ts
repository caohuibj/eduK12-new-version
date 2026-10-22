import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({tx:{},transaction:vi.fn(),editor:vi.fn(),lock:vi.fn(),prepare:vi.fn(),add:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:m.transaction}}))
vi.mock('../../modules/assessment-run/educationPrivateScaleContext',()=>({assertPrivateScaleRunEditor:m.editor}))
vi.mock('../../modules/assessment-run/repository',()=>({lockRun:m.lock,addAssessmentRunTrackDraft:m.add}))
vi.mock('../../modules/education-tools/private-tool.runtime-resources',()=>({preparePrivateScaleRuntimeResource:m.prepare}))
import {addPrivateScaleRunTrack} from '../../modules/education-tools/private-tool.run-adapter'
import {privateScaleResourceEntry} from '../../modules/education-tools/private-tool.runtime-policy'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const scope={organizationId:id(1),runId:id(2),actorUserId:id(3),parent:{kind:'SCHOOL_ACTIVITY' as const,id:id(9)}}
const context={entry:'SCHOOL',organizationId:id(1),principal:{userId:id(3),accountDomain:'SCHOOL'}}
const input={expectedVersion:7,privateScale:{versionId:id(4),contentHash:'a'.repeat(64),administration:{population:'STUDENT',responseMode:'SELF'}},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'}}
const definition=compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic',required:true,reverse:false,dimensionKeys:['total']}]})
const entry=privateScaleResourceEntry({schemaVersion:1,adapterVersion:'1.0.0',kind:'AUTHOR_PRIVATE',entry:'SCHOOL',organizationId:id(1),ownerUserId:id(3),toolId:id(5),versionId:id(4),contentHash:'a'.repeat(64),definitionHash:'b'.repeat(64),releaseId:id(6),releaseHash:'c'.repeat(64),variantKey:'STUDENT:SELF'},'Synthetic',definition,id(7))
beforeEach(()=>{vi.clearAllMocks();m.transaction.mockImplementation(async(fn:any)=>fn(m.tx));m.editor.mockResolvedValue({context,schoolAdmin:false,workflow:{schoolCourseId:id(9),teacherEventId:null}});m.lock.mockResolvedValue({status:'DRAFT',version:7});m.prepare.mockResolvedValue({resourceEntry:entry});m.add.mockResolvedValue({id:id(8)})})
describe('Private draft attachment orchestration',()=>{
 it('uses one RC transaction and prepares only after real editor and draft CAS, deriving policy from the returned entry',async()=>{
  await expect(addPrivateScaleRunTrack(scope,input)).resolves.toEqual({id:id(8)})
  expect(m.editor.mock.invocationCallOrder[0]).toBeLessThan(m.lock.mock.invocationCallOrder[0])
  expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.prepare.mock.invocationCallOrder[0])
  expect(m.prepare.mock.invocationCallOrder[0]).toBeLessThan(m.add.mock.invocationCallOrder[0])
  expect(m.transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'ReadCommitted'})
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({tx:m.tx,expectedVersion:7,resource:{family:'SCALE',key:entry.applicability.resourceKey,version:'1.0.0'},requestedPolicy:expect.objectContaining({subjectRoles:['STUDENT'],respondentRoles:['STUDENT'],relationshipKinds:['SELF'],visibilityPolicyKey:'EDUCATION_PRIVATE_TOOL_V1'})}))
  expect(m.add.mock.calls[0][0].requestedPolicy).not.toHaveProperty('resultDisclosure')
 })
 it('does not prepare on stale version or non-draft run',async()=>{
  for(const run of [{status:'DRAFT',version:8},{status:'PUBLISHED',version:7}]){m.lock.mockResolvedValue(run);await expect(addPrivateScaleRunTrack(scope,input)).rejects.toThrow('RUN_VERSION_CONFLICT')}
  expect(m.prepare).not.toHaveBeenCalled();expect(m.add).not.toHaveBeenCalled()
 })
 it('cannot derive an editor or event privilege from private ownership',async()=>{
  m.editor.mockRejectedValue(new Error('Current workflow editor denied'))
  await expect(addPrivateScaleRunTrack(scope,input)).rejects.toThrow('workflow editor denied');expect(m.prepare).not.toHaveBeenCalled()
 })
 it('requires psychology teacher observer to explicitly select homeroom before any preparation',async()=>{
  await expect(addPrivateScaleRunTrack(scope,{...input,privateScale:{...input.privateScale,administration:{population:'STUDENT',responseMode:'TEACHER_REPORT'}},targetPolicy:{mode:'ALL_CLASS_TEACHERS'}})).rejects.toThrow('HOMEROOM_TARGET_REQUIRED')
  expect(m.prepare).not.toHaveBeenCalled()
 })
 it('rejects a different server path parent or product before preparation',async()=>{
  await expect(addPrivateScaleRunTrack({...scope,parent:{kind:'SCHOOL_ACTIVITY',id:id(99)}},input)).rejects.toThrow('PARENT_MISMATCH')
  await expect(addPrivateScaleRunTrack({...scope,parent:{kind:'TEACHER_EVENT',id:id(9)}},input)).rejects.toThrow('PARENT_MISMATCH')
  expect(m.prepare).not.toHaveBeenCalled();expect(m.add).not.toHaveBeenCalled()
 })
 it('rejects cross-entry administration and client policy before preparation',async()=>{
  m.editor.mockResolvedValue({context:{...context,entry:'TEACHER'},schoolAdmin:false,workflow:{schoolCourseId:null,teacherEventId:id(9)}})
  await expect(addPrivateScaleRunTrack({...scope,parent:{kind:'TEACHER_EVENT',id:id(9)}},input)).rejects.toThrow('VARIANT_UNSUPPORTED')
  await expect(addPrivateScaleRunTrack(scope,{...input,requestedPolicy:{}})).rejects.toThrow()
  expect(m.prepare).not.toHaveBeenCalled()
 })
})
