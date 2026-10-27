import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({query:vi.fn(),member:vi.fn(),manager:vi.fn(),add:vi.fn(),config:vi.fn(),resolve:vi.fn(),narrow:vi.fn(),use:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:m.query,huiteacherStudentEvaluationConfig:{findUnique:m.config}}}))
vi.mock('../../modules/organization/educationProductAccess',()=>({resolveEducationProductMemberScope:m.member}))
vi.mock('../../modules/assessment-run/resourceBoundary',()=>({assertCurrentRunManagerBoundary:m.manager,assertCurrentRunPublisherBoundary:vi.fn()}))
vi.mock('../../modules/assessment-run/repository',async original=>({...await original<typeof import('../../modules/assessment-run/repository')>(),addAssessmentRunTrackDraft:m.add}))
vi.mock('../../modules/assessment-run/registeredResources',()=>({assertRegisteredResourceUse:m.use}))
vi.mock('../../modules/assessment-run/resourceAuthority',()=>({productionRunResourceAuthorityRegistry:{resolveExact:m.resolve,assertStartSupported:vi.fn()},assertRunTrackNarrowing:m.narrow}))
import {addTeacherRunTrack} from '../../modules/huiteacher/run.service'
const input={organizationId:'org',eventId:'event',actorUserId:'actor',expectedRunId:'run-original',expectedVersion:3,
 resource:{family:'COGNITIVE' as const,key:'education-assessment:TEACHER:org:resource',version:'1.0.0'},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},
 requestedPolicy:{subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'INDIVIDUAL_ONLY',visibilityPolicyKey:'approved',minimumRespondents:null}}
beforeEach(()=>{
 vi.clearAllMocks();m.member.mockResolvedValue({productAdmin:true});m.manager.mockResolvedValue(undefined);m.config.mockResolvedValue(null);m.add.mockResolvedValue({id:'track'})
 m.query.mockResolvedValue([{runId:'run-original',eventStatus:'DRAFT',runStatus:'DRAFT',runVersion:3}])
 m.resolve.mockResolvedValue({family:'COGNITIVE',subjectRoles:['TEACHER'],runtimeLaunchTarget:{kind:'COMPOSITE',ref:'runtime'}})
})
describe('Teacher event implicit run binding',()=>{
 it('refuses an event rebound to a different run even if its version is identical',async()=>{
  m.query.mockResolvedValue([{runId:'run-replacement',eventStatus:'DRAFT',runStatus:'DRAFT',runVersion:3}])
  await expect(addTeacherRunTrack(input)).rejects.toMatchObject({code:'HUITEACHER_RUN_BINDING_CHANGED',statusCode:409})
  expect(m.resolve).not.toHaveBeenCalled();expect(m.add).not.toHaveBeenCalled()
 })
 it('passes exact run, version and trusted event binding into the transaction repository',async()=>{
  await expect(addTeacherRunTrack(input)).resolves.toEqual({id:'track'})
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({runId:'run-original',expectedRunId:'run-original',expectedVersion:3,educationWorkflow:{product:'TEACHER',id:'event'},actorUserId:'actor'}))
 })
})
