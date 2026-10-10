import { beforeEach,describe,expect,it,vi } from 'vitest'
const m=vi.hoisted(()=>({
  query:vi.fn(),guard:vi.fn(),diff:vi.fn(),
  sources:vi.fn(),specs:vi.fn(),published:vi.fn(),generate:vi.fn(),read:vi.fn(),
}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:m.query}}))
vi.mock('../../modules/campus/group-reports',()=>({
  requireCampusGroupManager:m.guard,assertCampusNoGroupDifferencing:m.diff,
  CAMPUS_GROUP_MIN_N:10,
}))
vi.mock('../../modules/reporting/discovery',()=>({
  listOrganizationReportingSources:m.sources,listPublishedReportingSpecs:m.specs,
}))
vi.mock('../../modules/reporting/spec',()=>({getPublishedReportingSpec:m.published}))
vi.mock('../../modules/reporting/longitudinal-planner',()=>({generateAutomaticLongitudinal:m.generate}))
vi.mock('../../modules/reporting/pr4Service',()=>({readOrganizationReportingArtifact:m.read}))
import {
  assertCampusFixedLongitudinalPopulation,assertCampusGroupComparability,
  projectCampusFixedGroupLongitudinal,generateCampusFixedGroupLongitudinal,
} from '../../modules/campus/group-longitudinal-studio'

const org='00000000-0000-4000-8000-000000000001'
const specId='00000000-0000-4000-8000-000000000002'
const r1='00000000-0000-4000-8000-000000000003'
const r2='00000000-0000-4000-8000-000000000004'
const t1='00000000-0000-4000-8000-000000000005'
const t2='00000000-0000-4000-8000-000000000006'
const actor={userId:'school-admin',accountDomain:'SCHOOL',role:'ADMIN',platformRole:'STANDARD'}
const source1={runId:r1,trackId:t1,runName:'2026年春季',
  publishedAt:'2026-02-01T00:00:00Z',resource:{family:'SCALE',key:'wellbeing',version:'1.0.0'}}
const source2={runId:r2,trackId:t2,runName:'2026年秋季',
  publishedAt:'2026-06-01T00:00:00Z',resource:{family:'SCALE',key:'wellbeing',version:'1.0.0'}}
const spec={analysisKind:'REPEATED_COHORT',minimumCohortN:10,
  minimumContributorN:10,metricRules:[{metricId:'wellbeing',sourceFamily:'SCALE',
    sourceResourceKey:'wellbeing',minimumMetricN:10}],
  comparabilityRules:[{metricId:'wellbeing',resourceFamily:'SCALE',resourceKey:'wellbeing',
    fromVersion:'1.0.0',toVersion:'1.0.0',level:'EXACT',
    evidenceRef:'reviewed-method',evidenceHash:'a'.repeat(64)}]}
const actors=(n=10,diff=false)=>[
  ...Array.from({length:n},(_,i)=>({runId:r1,trackId:t1,userId:'student-'+i,approved:true,
    runReady:true,activityReady:true,selfStudent:true})),
  ...Array.from({length:n},(_,i)=>({runId:r2,trackId:t2,
    userId:diff&&i===0?'someone-else':'student-'+i,approved:true,
    runReady:true,activityReady:true,selfStudent:true})),
]
const projection={kind:'REPEATED_COHORT',state:'present',
  waves:[1,2].map((i)=>({
    ordinal:i,state:'present',eligibleN:10,resultContributorN:10,
    metrics:{wellbeing:{state:'present',validN:10,missingN:0,
      aggregations:{mean:i===1?3.44:3.85,sdPopulation:0.9}}},
  })),
  comparisons:[],limitations:['INDEPENDENT_WAVE_POPULATIONS'],
}
describe('school fixed-population longitudinal differential defenses',()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    m.guard.mockResolvedValue({userId:actor.userId,platformRole:'STANDARD'})
    m.diff.mockResolvedValue(undefined)
    m.query.mockResolvedValue(actors())
    m.sources.mockResolvedValue({list:[source1,source2],truncated:false})
    m.specs.mockResolvedValue({list:[],total:0})
    m.published.mockResolvedValue({definition:spec})
    m.generate.mockResolvedValue({artifactId:'group-long-1'})
    m.read.mockResolvedValue({artifactId:'group-long-1',projection})
  })
  it('only admits the same 10+ unique STUDENT persons in every immutable Run',async()=>{
    const actual=await assertCampusFixedLongitudinalPopulation({organizationId:org,
      sources:[{runId:r1,trackId:t1},{runId:r2,trackId:t2}]})
    expect(actual).toBe(10)
    const sql=m.query.mock.calls[0][0].join('')
    expect(sql).toContain('campus_activity_runs')
    expect(sql).toContain("run.status='CLOSED'")
    expect(sql).toContain("activity.status='CLOSED'")
    expect(sql).toContain("subject.actor_role='STUDENT'")
  })
  it('rejects a replaced person, duplicate person, insufficient class or post-close pending wave',async()=>{
    const inputs=[
      actors(10,true),
      actors(9),
      [...actors(10),actors(10)[0]],
      actors(10).map((r,i)=>i===0?{...r,runReady:false}:r),
    ]
    for(const rows of inputs){
      m.query.mockResolvedValueOnce(rows)
      await expect(assertCampusFixedLongitudinalPopulation({
        organizationId:org,sources:[{runId:r1,trackId:t1},{runId:r2,trackId:t2}],
      })).rejects.toMatchObject({code:'CAMPUS_LONGITUDINAL_GROUP_WITHHELD'})
    }
    expect(m.generate).not.toHaveBeenCalled()
  })
  it('requires each metric/version comparison to have hash-addressed science evidence',()=>{
    expect(()=>assertCampusGroupComparability({spec:spec as any,sources:[source1,source2]}))
      .not.toThrow()
    for(const bad of [
      {...spec,minimumContributorN:9},
      {...spec,metricRules:[{...spec.metricRules[0],minimumMetricN:3}]},
      {...spec,comparabilityRules:[]},
      {...spec,comparabilityRules:[{...spec.comparabilityRules[0],evidenceHash:'no-evidence'}]},
    ])expect(()=>assertCampusGroupComparability({spec:bad as any,sources:[source1,source2]}))
      .toThrow()
  })
  it('returns only one-decimal full-case means, not contributor N, identities, variance or deltas',()=>{
    const summary=projectCampusFixedGroupLongitudinal({artifactId:'a',projection},10)
    expect(summary).toMatchObject({state:'READY',metrics:{
      wellbeing:[{wave:1,mean:3.4},{wave:2,mean:3.9}],
    }})
    expect(JSON.stringify(summary)).not.toMatch(/student-|eligibleN|resultContributorN|sdPopulation|distribution|delta/)
    const partial={...projection,waves:[projection.waves[0],{
      ...projection.waves[1],resultContributorN:9,
    }]}
    expect(projectCampusFixedGroupLongitudinal({artifactId:'a',projection:partial},10).state)
      .toBe('WITHHELD')
  })
  it('delegates to canonical frozen series, never accepting cohortSelector from browser',async()=>{
    const result=await generateCampusFixedGroupLongitudinal({
      actor:actor as any,organizationId:org,specId,analysisKind:'REPEATED_COHORT',
      sources:[{runId:r2,trackId:t2},{runId:r1,trackId:t1}],
    })
    expect(m.generate).toHaveBeenCalledWith({
      principal:{userId:'school-admin',platformRole:'STANDARD'},organizationId:org,
      specId,sources:[{runId:r1,trackId:t1},{runId:r2,trackId:t2}],
      cohortStrategy:'BASELINE_FIXED',analysisKind:'REPEATED_COHORT',
    })
    expect(m.diff).toHaveBeenCalledTimes(2)
    expect(result.state).toBe('READY')
    expect(JSON.stringify(result)).not.toContain('student-')
    expect(m.read).toHaveBeenCalledWith(expect.objectContaining({artifactId:'group-long-1'}))
  })
})
