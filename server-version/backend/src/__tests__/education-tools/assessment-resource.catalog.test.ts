import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn(),workflow:vi.fn(),manager:vi.fn(),editor:vi.fn(),source:vi.fn(),start:vi.fn(),policy:vi.fn(),studentConfig:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:m.transaction}}))
vi.mock('../../modules/assessment-run/educationLibraryContext',()=>({readEducationRunLibraryContext:m.workflow}))
vi.mock('../../modules/assessment-run/resourceBoundary',()=>({assertCurrentRunManagerBoundary:m.manager}))
vi.mock('../../modules/campus/activity.service',()=>({lockAndAssertCampusActivityEditor:m.editor}))
vi.mock('../../modules/education-tools/assessment-resource.authority',()=>({assertEducationAssessmentRunUse:m.source}))
vi.mock('../../modules/education-tools/assessment-resource.repository',()=>({EducationAssessmentSourceError:class extends Error{readonly statusCode=409;constructor(readonly code:string){super(code)}}}))
vi.mock('../../modules/assessment-run/resourceAuthority',()=>({relationalEntryToRunPolicy:m.policy,productionRunResourceAuthorityRegistry:{assertStartSupported:m.start}}))
import {listEducationAssessmentResources,type EducationAssessmentCatalogInput} from '../../modules/education-tools/assessment-resource.catalog'
import {EducationAssessmentSourceError} from '../../modules/education-tools/assessment-resource.repository'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const actor={userId:id(9),accountDomain:'SCHOOL'} as EducationAssessmentCatalogInput['actor']
const input:EducationAssessmentCatalogInput={product:'TEACHER',organizationId:id(1),workflowId:id(2),runId:id(3),expectedVersion:4,actor}
const tx={$queryRaw:m.query,huiteacherStudentEvaluationConfig:{findUnique:m.studentConfig}}
const policy={subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'APPROVED_PERSONAL_V1',minimumRespondents:null}
const units=[{itemId:id(20),family:'COGNITIVE',measurement:{releaseId:id(21),contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)},references:[],report:null}]
beforeEach(()=>{
 vi.clearAllMocks();m.transaction.mockImplementation(async callback=>callback(tx));m.workflow.mockResolvedValue({product:'TEACHER',teacherEventId:id(2),schoolCourseId:null})
 m.manager.mockResolvedValue(undefined);m.editor.mockResolvedValue({activity:{status:'DRAFT'}});m.start.mockReturnValue({});m.policy.mockReturnValue(policy);m.studentConfig.mockResolvedValue(null)
 m.query.mockImplementation(async sql=>sql.text.includes('FROM education_assessment_deliveries')?[{id:id(10),family:'COGNITIVE'}]:[{version:4,status:'DRAFT',workflowStatus:'DRAFT'}])
 m.source.mockImplementation(async(_tx,request)=>({entry:{title:'授权工具',educationOriginHash:'c'.repeat(64)},origin:{product:'TEACHER',organizationId:id(1),family:request.resource.family,units},runtime:{definition:'PRIVATE_ORIGINAL'},releases:new Map([['secret',{content:'PRIVATE_ORIGINAL'}]]),authority:[{actorId:'PRIVATE_ISSUER'}],identityOnly:true}))
})

describe('bounded authorized education assessment catalog',()=>{
 it('does not mix a protected student-evaluates-teacher Form workflow into the personal assessment directory',async()=>{
  m.studentConfig.mockResolvedValueOnce({id:'protected-config'})
  await expect(listEducationAssessmentResources(input)).rejects.toMatchObject({code:'HUITEACHER_STUDENT_EVAL_TRACK_READONLY',statusCode:403})
  expect(m.source).not.toHaveBeenCalled()
  expect(m.query.mock.calls.some(([sql])=>sql.text.includes('FROM education_assessment_deliveries'))).toBe(false)
 })
 it('projects only safe fixed-version metadata after full authority and never exposes original content or identity proofs',async()=>{
  const result=await listEducationAssessmentResources(input)
  expect(result.scope).toEqual({product:'TEACHER',organizationId:id(1),workflowId:id(2),runId:id(3),expectedVersion:4})
  expect(result.list).toEqual([{title:'授权工具',family:'COGNITIVE',key:`education-assessment:TEACHER:${id(1)}:${id(10)}`,version:'1.0.0',product:'TEACHER',organizationId:id(1),releaseStatus:'PUBLISHED',availability:'AVAILABLE',educationOriginHash:'c'.repeat(64),units,requestedPolicy:policy}])
  expect(m.source).toHaveBeenCalledWith(tx,{actorUserId:actor.userId,organizationId:id(1),runId:id(3),resource:{family:'COGNITIVE',key:`education-assessment:TEACHER:${id(1)}:${id(10)}`,version:'1.0.0'}})
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|identityOnly|authority|runtime/)
 })
 it('bounds each page at ten rows and uses product, organization, PUBLISHED and exact id cursor in SQL',async()=>{
  m.query.mockImplementation(async sql=>sql.text.includes('FROM education_assessment_deliveries')?Array.from({length:11},(_,index)=>({id:id(10+index),family:'COGNITIVE'})):[{version:4,status:'DRAFT',workflowStatus:'DRAFT'}])
  const result=await listEducationAssessmentResources({...input,cursor:id(8)})
  expect(result.list).toHaveLength(10);expect(result.nextCursor).toBe(id(19));expect(m.source).toHaveBeenCalledTimes(10)
  const sql=m.query.mock.calls.find(([sql])=>sql.text.includes('FROM education_assessment_deliveries'))![0]
  expect(sql.text).toContain("status='PUBLISHED'");expect(sql.text).toContain('ORDER BY id LIMIT 11')
  expect(sql.values).toEqual(['TEACHER',id(1),id(8)])
 })
 it('checks current management authority even for an empty directory',async()=>{
  m.query.mockImplementation(async sql=>sql.text.includes('FROM education_assessment_deliveries')?[]:[{version:4,status:'DRAFT',workflowStatus:'DRAFT'}])
  expect((await listEducationAssessmentResources(input)).list).toEqual([])
  expect(m.manager).toHaveBeenCalledWith(expect.objectContaining({actorUserId:actor.userId,runId:id(3)}),tx)
  m.manager.mockRejectedValueOnce(Object.assign(Error('revoked-manager'),{statusCode:403}))
  await expect(listEducationAssessmentResources(input)).rejects.toThrow('revoked-manager')
 })
 it.each(['product','workflow'])('refuses a persisted %s mismatch before candidate retrieval',async field=>{
  m.workflow.mockResolvedValue(field==='product'?{product:'SCHOOL',schoolCourseId:id(2)}:{product:'TEACHER',teacherEventId:id(99)})
  await expect(listEducationAssessmentResources(input)).rejects.toThrow('WORKFLOW_MISMATCH');expect(m.query).not.toHaveBeenCalled();expect(m.source).not.toHaveBeenCalled()
 })
 it.each([{version:5,status:'DRAFT',workflowStatus:'DRAFT'},{version:4,status:'PUBLISHED',workflowStatus:'DRAFT'},{version:4,status:'DRAFT',workflowStatus:'OPEN'}])('refuses stale version or non-draft state %j',async run=>{
  m.query.mockResolvedValue([run]);await expect(listEducationAssessmentResources(input)).rejects.toThrow(run.version===5?'RUN_VERSION_CONFLICT':'NOT_DRAFT')
  expect(m.source).not.toHaveBeenCalled();expect(m.query).toHaveBeenCalledTimes(2)
 })
 it('keeps School activity-editor authority separate from run-manager authority',async()=>{
  m.workflow.mockResolvedValue({product:'SCHOOL',schoolCourseId:id(2),teacherEventId:null})
  await listEducationAssessmentResources({...input,product:'SCHOOL'})
  expect(m.editor).toHaveBeenCalledWith(tx,{actor,organizationId:id(1),courseId:id(2)})
  expect(m.query.mock.calls[0][0].text).toContain('FROM organizations')
  expect(m.query.mock.calls[0][0].text).toContain('FOR SHARE')
  expect(m.query.mock.invocationCallOrder[0]).toBeLessThan(m.editor.mock.invocationCallOrder[0])
  m.editor.mockRejectedValueOnce(Object.assign(Error('activity-editor-revoked'),{statusCode:403}))
  await expect(listEducationAssessmentResources({...input,product:'SCHOOL'})).rejects.toThrow('activity-editor-revoked')
 })
 it('rejects a Training principal without opening a database transaction',async()=>{
  await expect(listEducationAssessmentResources({...input,actor:{...actor,accountDomain:'TRAINING'}})).rejects.toThrow('ACCOUNT_REQUIRED')
  expect(m.transaction).not.toHaveBeenCalled()
 })
 it.each(['EDUCATION_ASSESSMENT_RESOURCE_NOT_AVAILABLE','EDUCATION_ASSESSMENT_ORIGINAL_ISSUER_REVOKED'])('omits explicit business refusal %s with a controlled count',async code=>{
  m.source.mockRejectedValueOnce(new EducationAssessmentSourceError(code))
  expect(await listEducationAssessmentResources(input)).toMatchObject({list:[],unavailableCount:1})
 })
 it.each([Error('database-disconnected'),new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_CONTENT_IDENTITY')])('does not turn infrastructure or corrupt identity into an empty catalog',async error=>{
  m.source.mockRejectedValueOnce(error)
  await expect(listEducationAssessmentResources(input)).rejects.toBe(error)
 })
 it('does not offer an authorized source before its actual runtime adapter is enabled',async()=>{
  m.start.mockImplementationOnce(()=>{throw Object.assign(Error('unavailable'),{code:'RUN_START_ADAPTER_UNAVAILABLE'})})
  expect(await listEducationAssessmentResources(input)).toMatchObject({list:[],unavailableCount:1})
 })
})
