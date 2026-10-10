import { beforeEach, describe, expect, it, vi } from 'vitest'

const state=vi.hoisted(()=>({
  context:vi.fn(),query:vi.fn(),sources:vi.fn(),specs:vi.fn(),spec:vi.fn(),
  generate:vi.fn(),read:vi.fn(),reference:vi.fn(),
}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:state.query}}))
vi.mock('../../modules/organization/access',()=>({
  resolveOrganizationAccessContext:state.context,
  contextHasCapability:(ctx:any,k:string)=>ctx.capabilities.includes(k)
    &&!ctx.explicitDenies.includes(k),
}))
vi.mock('../../modules/reporting/discovery',()=>({
  listProtectedReportingSources:state.sources,
  listPublishedReportingSpecs:state.specs,
}))
vi.mock('../../modules/reporting/spec',()=>({getPublishedReportingSpec:state.spec}))
vi.mock('../../modules/reporting/pr4Service',()=>({
  generateOrganizationProtectedFeedback:state.generate,
  readOrganizationReportingArtifact:state.read,
}))
vi.mock('../../modules/campus/studentReference',()=>({
  campusStudentReference:state.reference,
}))
import { CAMPUS_PROTECTED_MIN_N,assertReviewedCampusProtectedSpec,
  listCampusProtectedReportCatalog,generateCampusProtectedReport,
} from '../../modules/campus/protected-report-studio'

const org='00000000-0000-4000-8000-000000000001'
const run='00000000-0000-4000-8000-000000000002'
const track='00000000-0000-4000-8000-000000000003'
const spec='00000000-0000-4000-8000-000000000004'
const artifact='00000000-0000-4000-8000-000000000005'
const alias='林-123456789ABC'
const actor={userId:'school-counselor',accountDomain:'SCHOOL',
  role:'TEACHER',platformRole:'STANDARD'}
const context={organizationStatus:'ACTIVE',productDomain:'SCHOOL',
  membershipId:'current-counselor',orgRole:'MEMBER',personas:['COUNSELOR'],
  capabilities:['PSYCHOLOGY_STAFF'],explicitDenies:[]}
const definition={analysisKind:'PROTECTED_FEEDBACK',minimumRespondentN:5,
  minimumContributorN:5,metricRules:[{minimumMetricN:5}]}
const currentSource={
  runId:run,trackId:track,runName:'校园关系观察',runStatus:'CLOSED',
  subject:{userId:'student-private-id',membershipId:'private-membership'},
  relationshipKind:'CLASS_TEACHER_STUDENT',perspective:'OBSERVER_REPORT',
  resource:{family:'SCALE',key:'reviewed-observer',version:'1.0.0'},
}
const payload={actor:actor as any,organizationId:org,runId:run,trackId:track,
  subjectReference:alias,relationshipKind:'CLASS_TEACHER_STUDENT',
  perspective:'OBSERVER_REPORT' as const,specId:spec}
describe('Huischool protected feedback generation is only current CLIENT-scoped',()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    state.context.mockResolvedValue(context)
    state.reference.mockReturnValue(alias)
    state.sources.mockResolvedValue({list:[currentSource],truncated:false})
    state.specs.mockResolvedValue({list:[{
      specId:spec,specKey:'reviewed-professional',version:1,analysisKind:'PROTECTED_FEEDBACK',
      privacy:{minimumRespondentN:5,minimumContributorN:5},
    }],total:1})
    state.spec.mockResolvedValue({definition})
    state.query.mockResolvedValueOnce([{userId:'student-private-id'}])
      .mockResolvedValueOnce([{runId:run}])
    state.generate.mockResolvedValue({artifactId:artifact})
    state.read.mockResolvedValue({artifactId:artifact,
      projection:{state:'present',metrics:{private_measure:{state:'present',value:6}}}})
  })
  it('rejects training, parent, ordinary teacher and denied psychology staff early',async()=>{
    const outsiders=[
      {...actor,accountDomain:'TRAINING'},
      {...actor,role:'PARENT'},
    ]
    for(const outsider of outsiders)await expect(listCampusProtectedReportCatalog(outsider as any,org))
      .rejects.toMatchObject({code:'CAMPUS_PROTECTED_REPORT_NOT_FOUND'})
    state.context.mockResolvedValueOnce({...context,personas:['TEACHER']})
    await expect(listCampusProtectedReportCatalog(actor as any,org))
      .rejects.toMatchObject({statusCode:404})
    state.context.mockResolvedValueOnce({...context,explicitDenies:['REPORT_READ']})
    await expect(generateCampusProtectedReport(payload))
      .rejects.toMatchObject({statusCode:404})
    expect(state.sources).not.toHaveBeenCalled()
    expect(state.generate).not.toHaveBeenCalled()
  })
  it('enforces per-metric and respondent floors independently of the Reporting engine',()=>{
    expect(CAMPUS_PROTECTED_MIN_N).toBe(5)
    expect(()=>assertReviewedCampusProtectedSpec(definition)).not.toThrow()
    for(const invalid of [
      {...definition,analysisKind:'GROUP'},
      {...definition,minimumRespondentN:4},
      {...definition,minimumContributorN:4},
      {...definition,metricRules:[]},
      {...definition,metricRules:[{minimumMetricN:4}]},
    ])expect(()=>assertReviewedCampusProtectedSpec(invalid)).toThrow()
  })
  it('shows only pseudonyms and approved CLOSED school subjects in professional catalog',async()=>{
    const r=await listCampusProtectedReportCatalog(actor as any,org)
    expect(r.sources).toEqual([{
      runId:run,trackId:track,runName:'校园关系观察',
      subjectReference:alias,relationshipKind:'CLASS_TEACHER_STUDENT',
      perspective:'OBSERVER_REPORT',resource:currentSource.resource,
    }])
    expect(JSON.stringify(r)).not.toMatch(/student-private-id|private-membership|subjectUserId|campus_accounts/)
    expect(state.sources).toHaveBeenCalledWith({principal:{
      userId:actor.userId,platformRole:actor.platformRole,
    },organizationId:org})
  })
  it('refuses spoofed or absent current student reference before calculation',async()=>{
    await expect(generateCampusProtectedReport({...payload,
      subjectReference:'林-AAAAAAAAAAAA'})).rejects.toMatchObject({statusCode:404})
    expect(state.generate).not.toHaveBeenCalled()
  })
  it('never returns raw scores or subjectUserId after canonical generation',async()=>{
    const r=await generateCampusProtectedReport(payload)
    expect(state.generate).toHaveBeenCalledWith({
      principal:{userId:actor.userId,platformRole:'STANDARD'},
      organizationId:org,runId:run,trackId:track,
      subjectUserId:'student-private-id',relationshipKind:'CLASS_TEACHER_STUDENT',
      perspective:'OBSERVER_REPORT',specId:spec,
    })
    expect(state.read).toHaveBeenCalledWith({
      principal:{userId:actor.userId,platformRole:'STANDARD'},
      organizationId:org,artifactId:artifact,
    })
    expect(r).toEqual({artifactId:artifact,subjectReference:alias,status:'AVAILABLE'})
    expect(JSON.stringify(r)).not.toMatch(/private_measure|student-private-id|eligibleN|mean|rawAnswers/)
  })
  it('refuses a revoked student after source discovery, with no report generated',async()=>{
    state.query.mockReset().mockResolvedValueOnce([])
    const r=await listCampusProtectedReportCatalog(actor as any,org)
    expect(r.sources).toEqual([])
    expect(state.generate).not.toHaveBeenCalled()
  })
})
