import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({transaction:vi.fn(),query:vi.fn(),execute:vi.fn(),source:vi.fn(),workflow:vi.fn(),lockWorkflow:vi.fn(),library:vi.fn(),narrow:vi.fn(),studentConfig:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:m.transaction}}))
vi.mock('../../modules/assessment-run/educationLibraryContext',()=>({readEducationRunLibraryContext:m.workflow,lockAndAssertEducationRunWorkflow:m.lockWorkflow,assertEducationRunLibraryResources:m.library}))
vi.mock('../../modules/education-tools/assessment-resource.authority',()=>({assertEducationAssessmentRunUse:m.source}))
vi.mock('../../modules/assessment-run/resourceAuthority',()=>({assertRunTrackNarrowing:m.narrow,relationalEntryToRunPolicy:()=>({verified:'policy'})}))
import {addAssessmentRunTrackDraft} from '../../modules/assessment-run/repository'
const tx={$queryRaw:m.query,$executeRaw:m.execute,huiteacherStudentEvaluationConfig:{findUnique:m.studentConfig}}
const input={organizationId:'org',runId:'run',expectedRunId:'run',educationWorkflow:{product:'TEACHER' as const,id:'event'},actorUserId:'actor',expectedVersion:4,resource:{family:'COGNITIVE' as const,key:'education-assessment:TEACHER:org:resource',version:'1.0.0'},requestedPolicy:{subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'approved',minimumRespondents:null}}
beforeEach(()=>{
 vi.clearAllMocks();m.transaction.mockImplementation(async callback=>callback(tx));m.workflow.mockResolvedValue({product:'TEACHER',teacherEventId:'event'});m.lockWorkflow.mockResolvedValue({});m.source.mockResolvedValue({entry:{verified:true}});m.library.mockResolvedValue(null);m.studentConfig.mockResolvedValue(null)
 m.query.mockImplementation(async parts=>parts.join('').includes('FOR UPDATE')?[{status:'DRAFT',version:4}]:[{id:'new-track'}]);m.execute.mockResolvedValue(1)
})
describe('education track expected version under repository transaction lock',()=>{
 it('rejects a protected student Form workflow inside the write transaction before authorizing or inserting a personal assessment',async()=>{
  m.studentConfig.mockResolvedValueOnce({id:'protected-config'})
  await expect(addAssessmentRunTrackDraft(input)).rejects.toMatchObject({code:'HUITEACHER_STUDENT_EVAL_TRACK_READONLY',statusCode:403})
  expect(m.source).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled()
 })
 it.each([undefined,0,1.5,Number.MAX_SAFE_INTEGER+1])('requires exact expectedVersion %s before authorizing or writing',async expectedVersion=>{
  await expect(addAssessmentRunTrackDraft({...input,expectedVersion})).rejects.toThrow('Current editor and exact draft version required')
  expect(m.source).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();expect(m.execute).not.toHaveBeenCalled()
 })
 it('checks the current workflow and complete source authority in the same transaction before the locked CAS and insert',async()=>{
  expect(await addAssessmentRunTrackDraft(input)).toEqual({id:'new-track'})
  expect(m.lockWorkflow).toHaveBeenCalledWith(tx,expect.objectContaining({actorUserId:'actor',purpose:'EDIT'}),expect.objectContaining({teacherEventId:'event'}))
  expect(m.source).toHaveBeenCalledWith(tx,expect.objectContaining({actorUserId:'actor',organizationId:'org',runId:'run',resource:input.resource}))
  expect(m.narrow).toHaveBeenCalledWith({verified:'policy'},input.requestedPolicy)
  expect(m.query.mock.calls[0][0].join('')).toContain('FOR UPDATE')
  expect(m.query.mock.calls[1][0].join('')).toContain('INSERT INTO "assessment_run_tracks"')
  expect(m.execute.mock.calls[0][0].join('')).toContain('"version" = "version" + 1')
 })
 it('rejects a stale expectedVersion after obtaining the row lock without inserting or incrementing',async()=>{
  m.query.mockResolvedValue([{status:'DRAFT',version:5}])
  await expect(addAssessmentRunTrackDraft(input)).rejects.toMatchObject({code:'RUN_VERSION_CONFLICT',statusCode:409})
  expect(m.query).toHaveBeenCalledTimes(1);expect(m.execute).not.toHaveBeenCalled()
 })
 it('does not write after actual workflow freeze or source authority revocation',async()=>{
  m.lockWorkflow.mockRejectedValueOnce(Error('event-not-draft'))
  await expect(addAssessmentRunTrackDraft(input)).rejects.toThrow('event-not-draft');expect(m.source).not.toHaveBeenCalled()
  m.source.mockRejectedValueOnce(Error('original-issuer-revoked'))
  await expect(addAssessmentRunTrackDraft(input)).rejects.toThrow('original-issuer-revoked');expect(m.query).not.toHaveBeenCalled()
 })
 it('preserves legacy Form callers that do not supply expectedVersion',async()=>{
  await expect(addAssessmentRunTrackDraft({...input,expectedVersion:undefined,resource:{family:'FORM',key:'huiteacher-form:legacy',version:'digest'}})).resolves.toEqual({id:'new-track'})
  expect(m.source).not.toHaveBeenCalled();expect(m.lockWorkflow).not.toHaveBeenCalled()
 })
 it('refuses a missing or changed expected run and a run rebound to another event before authority or write',async()=>{
  for(const expectedRunId of [undefined,'different-run'])await expect(addAssessmentRunTrackDraft({...input,expectedRunId})).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_EXPECTED_RUN_REQUIRED'})
  await expect(addAssessmentRunTrackDraft({...input,educationWorkflow:undefined})).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_EXPECTED_RUN_REQUIRED'})
  m.workflow.mockResolvedValueOnce({product:'TEACHER',teacherEventId:'different-event'})
  await expect(addAssessmentRunTrackDraft(input)).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_WORKFLOW_REQUIRED'})
  expect(m.source).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled()
 })
})
