import { beforeEach,describe,expect,it,vi } from 'vitest'

const mock=vi.hoisted(()=>({
  context:vi.fn(),query:vi.fn(),spec:vi.fn(),listSpecs:vi.fn(),listSources:vi.fn(),
  generate:vi.fn(),read:vi.fn(),cohort:vi.fn(),
}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:mock.query}}))
vi.mock('../../modules/organization/access',()=>({
  resolveOrganizationAccessContext:mock.context,
  contextHasCapability:(ctx:any,key:string)=>ctx.capabilities.includes(key)
    &&!ctx.explicitDenies.includes(key),
}))
vi.mock('../../modules/reporting/discovery',()=>({
  listPublishedReportingSpecs:mock.listSpecs,
  listOrganizationReportingSources:mock.listSources,
}))
vi.mock('../../modules/reporting/spec',()=>({getPublishedReportingSpec:mock.spec}))
vi.mock('../../modules/reporting/cohort',()=>({readReportingCohort:mock.cohort}))
vi.mock('../../modules/reporting/service',()=>({generateOrganizationGroupAnalysis:mock.generate}))
vi.mock('../../modules/reporting/pr4Service',()=>({readOrganizationReportingArtifact:mock.read}))

import {
  CAMPUS_GROUP_MIN_N,assertReviewedCampusGroupSpec,projectCampusGroupReport,
  assertCampusNoGroupDifferencing,
  listCampusGroupReportCatalog,generateCampusGroupReport,readCampusGroupReport,
} from '../../modules/campus/group-reports'

const org='00000000-0000-4000-8000-000000000001'
const run='00000000-0000-4000-8000-000000000002'
const track='00000000-0000-4000-8000-000000000003'
const spec='00000000-0000-4000-8000-000000000004'
const artifact='00000000-0000-4000-8000-000000000005'
const admin={userId:'school-admin',accountDomain:'SCHOOL',
  role:'ADMIN',platformRole:'STANDARD'}
const active={membershipId:'m-admin',productDomain:'SCHOOL',organizationStatus:'ACTIVE',
  orgRole:'ORG_ADMIN',personas:[],capabilities:[],explicitDenies:[]}
const definition={analysisKind:'GROUP',minimumCohortN:10,minimumContributorN:10,
  metricRules:[{minimumMetricN:10}]}
const content={artifactId:artifact,generatedAt:'2026-10-10T01:00:00.000Z',projection:{
  kind:'GROUP',state:'present',eligibleN:10,resultContributorN:10,
  metrics:{wellbeing:{state:'present',validN:10,missingN:0,aggregations:{
    mean:3.456,median:4,distribution:{0:1,1:9},
  }}},evidence:{level:'PILOT',limitations:['需补充科学效度研究']},
}}
const source={runId:run,trackId:track,runName:'班级学习支持测评',runStatus:'CLOSED',
  resource:{family:'SCALE',key:'reviewed-scale',version:'1.0'}}
describe('Huischool internal group reporting privacy boundary',()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    mock.context.mockResolvedValue(active)
    mock.query.mockResolvedValue([{total:10,respondents:10,
      allSelfStudents:true,runReady:true,activityReady:true}])
    mock.spec.mockResolvedValue({definition})
    mock.generate.mockResolvedValue({artifactId:artifact})
    mock.read.mockResolvedValue(content)
    mock.cohort.mockResolvedValue({organizationId:org,sourceRunId:run,sourceTrackId:track,
      selector:{kind:'RUN_TRACK_SUBJECTS'},eligibleN:10,
      members:Array.from({length:10},(_,i)=>({userId:'campus-user-'+i}))})
    mock.listSpecs.mockResolvedValue({list:[{specId:spec,specKey:'school-group',
      version:1,analysisKind:'GROUP',metricIds:['wellbeing'],privacy:{
        minimumCohortN:10,minimumContributorN:10,
      }}],total:1})
    mock.listSources.mockResolvedValue({list:[source],truncated:false})
  })
  it('requires a separately reviewed group floor and independent metric coverage floor',()=>{
    expect(CAMPUS_GROUP_MIN_N).toBe(10)
    expect(()=>assertReviewedCampusGroupSpec(definition)).not.toThrow()
    for(const invalid of [
      {...definition,minimumCohortN:9},
      {...definition,minimumContributorN:9},
      {...definition,analysisKind:'PROTECTED_FEEDBACK'},
      {...definition,metricRules:[{minimumMetricN:3}]},
      {...definition,metricRules:[]},
    ])expect(()=>assertReviewedCampusGroupSpec(invalid)).toThrow('school aggregate')
  })
  it('rejects students, generic teachers and training accounts before looking up any report',async()=>{
    for(const actor of [
      {...admin,accountDomain:'TRAINING'},
      {...admin,role:'STUDENT'},
      {...admin,role:'TEACHER'},
    ]){
      if(actor.role==='TEACHER'&&actor.accountDomain==='SCHOOL')
        mock.context.mockResolvedValueOnce({...active,orgRole:'MEMBER',personas:['TEACHER']})
      await expect(listCampusGroupReportCatalog(actor as any,org)).rejects.toMatchObject({
        code:'CAMPUS_GROUP_REPORT_NOT_FOUND',statusCode:404,
      })
    }
    expect(mock.listSpecs).not.toHaveBeenCalled()
    expect(mock.listSources).not.toHaveBeenCalled()
  })
  it('rejects a denied or cross-domain school organization',async()=>{
    mock.context.mockResolvedValueOnce({...active,productDomain:'LEGACY'})
    await expect(listCampusGroupReportCatalog(admin as any,org)).rejects.toMatchObject({statusCode:404})
    mock.context.mockResolvedValueOnce({...active,explicitDenies:['ORG_GROUP_REPORT_V1']})
    await expect(generateCampusGroupReport({
      actor:admin as any,organizationId:org,runId:run,trackId:track,specId:spec,
    })).rejects.toMatchObject({statusCode:404})
    expect(mock.generate).not.toHaveBeenCalled()
  })
  it('does not launch calculation when whole-source or delay checks fail',async()=>{
    for(const partial of [
      {total:9,respondents:9,allSelfStudents:true,runReady:true,activityReady:true},
      {total:10,respondents:9,allSelfStudents:true,runReady:true,activityReady:true},
      {total:10,respondents:10,allSelfStudents:false,runReady:true,activityReady:true},
      {total:10,respondents:10,allSelfStudents:true,runReady:false,activityReady:true},
      {total:10,respondents:10,allSelfStudents:true,runReady:true,activityReady:false},
    ]){
      mock.query.mockResolvedValueOnce([partial])
      await expect(generateCampusGroupReport({
        actor:admin as any,organizationId:org,runId:run,trackId:track,specId:spec,
      })).rejects.toMatchObject({code:'CAMPUS_GROUP_SOURCE_WITHHELD',statusCode:409})
    }
    expect(mock.generate).not.toHaveBeenCalled()
    const sql=mock.query.mock.calls[0][0].join('')
    expect(sql).toContain("r.status='CLOSED'")
    expect(sql).toContain("activity.status='CLOSED'")
    expect(sql).toContain("interval '24 hours'")
    expect(sql).toContain("assignment.relationship_kind='SELF'")
    expect(sql).toContain("subject.actor_role='STUDENT'")
  })
  it('uses canonical generation and a second governed read, with no arbitrary cohort selector',async()=>{
    const result=await generateCampusGroupReport({
      actor:admin as any,organizationId:org,runId:run,trackId:track,specId:spec,
    })
    expect(mock.generate).toHaveBeenCalledWith({principal:{
      userId:'school-admin',platformRole:'STANDARD',
    },organizationId:org,runId:run,trackId:track,specId:spec})
    expect(mock.read).toHaveBeenCalledWith({principal:{
      userId:'school-admin',platformRole:'STANDARD',
    },organizationId:org,artifactId:artifact})
    expect(result.state).toBe('READY')
    expect(result.metrics).toEqual({wellbeing:{mean:3.5}})
    expect(JSON.stringify(result)).not.toMatch(/eligibleN|validN|resultContributorN|median|distribution|studentUserId|username/)
  })
  it('blocks overlapping non-identical school cohorts, including old exposed artifacts',async()=>{
    mock.query.mockReset().mockResolvedValueOnce([{priorN:12,shared:9,currentN:10}])
    await expect(assertCampusNoGroupDifferencing({
      organizationId:org,runId:run,trackId:track,
    })).rejects.toMatchObject({
      code:'CAMPUS_GROUP_DIFFERENCING_WITHHELD',statusCode:409,
    })
    const sql=mock.query.mock.calls[0][0].join('')
    expect(sql).toContain('jsonb_array_elements(old.members)')
    expect(sql).toContain("artifact.analysis_kind='GROUP'")
    expect(sql).toContain('LIMIT 101')
  })
  it('allows disjoint or exactly identical populations only, never a narrow override',async()=>{
    for(const rows of [
      [{priorN:10,shared:0,currentN:10}],
      [{priorN:10,shared:10,currentN:10}],
      [],
    ]){
      mock.query.mockReset().mockResolvedValueOnce(rows)
      await expect(assertCampusNoGroupDifferencing({
        organizationId:org,runId:run,trackId:track,
      })).resolves.toBeUndefined()
    }
    mock.query.mockReset().mockResolvedValueOnce(
      Array.from({length:101},()=>({priorN:10,shared:0,currentN:10})))
    await expect(assertCampusNoGroupDifferencing({
      organizationId:org,runId:run,trackId:track,
    })).rejects.toMatchObject({code:'CAMPUS_GROUP_DIFFERENCING_WITHHELD'})
  })
  it('suppresses incomplete contributors, missing values and insufficient published mean',()=>{
    for(const projection of [
      {...content.projection,resultContributorN:9},
      {...content.projection,eligibleN:9,resultContributorN:9},
      {...content.projection,metrics:{wellbeing:{state:'present',validN:9,missingN:1,aggregations:{mean:3.5}}}},
      {...content.projection,metrics:{wellbeing:{state:'suppressed'}}},
    ]){
      const result=projectCampusGroupReport({...content,projection})
      expect(result.state).toBe('WITHHELD')
      expect(result.metrics).toEqual({})
      expect(JSON.stringify(result)).not.toMatch(/validN|resultContributorN|eligibleN/)
    }
  })
  it('rejects wrong audience for existing artifact and re-checks historical source',async()=>{
    mock.query.mockResolvedValueOnce([{specId:spec,runId:run,trackId:track,
      cohortSnapshotId:'frozen-whole-cohort'}])
      .mockResolvedValueOnce([{total:10,respondents:10,allSelfStudents:true,
        runReady:true,activityReady:true}])
    const result=await readCampusGroupReport({
      actor:admin as any,organizationId:org,artifactId:artifact,
    })
    expect(result.state).toBe('READY')
    expect(mock.read).toHaveBeenCalledTimes(1)
  })
  it('rejects a historic filtered 10-person cohort from a larger Run despite adequate metric N',async()=>{
    mock.query.mockResolvedValueOnce([{specId:spec,runId:run,trackId:track,
      cohortSnapshotId:'filtered-population'}])
      .mockResolvedValueOnce([{total:15,respondents:15,allSelfStudents:true,
        runReady:true,activityReady:true}])
    mock.cohort.mockResolvedValueOnce({organizationId:org,sourceRunId:run,
      sourceTrackId:track,selector:{kind:'FILTERED_RUN_TRACK_SUBJECTS'},
      eligibleN:10,members:Array.from({length:10},(_,i)=>({userId:'student-'+i}))})
    await expect(readCampusGroupReport({
      actor:admin as any,organizationId:org,artifactId:artifact,
    })).rejects.toMatchObject({code:'CAMPUS_GROUP_REPORT_NOT_FOUND',statusCode:404})
    expect(mock.read).not.toHaveBeenCalled()
  })
  it('refuses an old partial cohort even if its selector is spelled as whole-Run',async()=>{
    mock.query.mockResolvedValueOnce([{specId:spec,runId:run,trackId:track,
      cohortSnapshotId:'incomplete-whole-cohort'}])
      .mockResolvedValueOnce([{total:12,respondents:12,allSelfStudents:true,
        runReady:true,activityReady:true}])
    await expect(readCampusGroupReport({
      actor:admin as any,organizationId:org,artifactId:artifact,
    })).rejects.toMatchObject({statusCode:404})
    expect(mock.read).not.toHaveBeenCalled()
  })
  it('catalog is bounded, exposes no student identities, and omits unreviewed low-floor plans',async()=>{
    mock.listSpecs.mockResolvedValueOnce({list:[
      {specId:spec,version:1,specKey:'approved',analysisKind:'GROUP',metricIds:['wellbeing'],
        privacy:{minimumCohortN:10,minimumContributorN:10}},
      {specId:'unreviewed',analysisKind:'GROUP',metricIds:['x'],privacy:{
        minimumCohortN:3,minimumContributorN:3,
      }},
    ],total:2})
    const out=await listCampusGroupReportCatalog(admin as any,org)
    expect(out.specs.map(s=>s.specId)).toEqual([spec])
    expect(out.sources).toHaveLength(1)
    expect(JSON.stringify(out)).not.toMatch(/studentUserId|memberId|participantCount|username/)
  })
})
