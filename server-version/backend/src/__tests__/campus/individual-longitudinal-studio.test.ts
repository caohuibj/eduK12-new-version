import { beforeEach,describe,expect,it,vi } from 'vitest'

const m=vi.hoisted(()=>({
  query:vi.fn(),ctx:vi.fn(),scope:vi.fn(),sources:vi.fn(),specs:vi.fn(),published:vi.fn(),
  generate:vi.fn(),read:vi.fn(),reference:vi.fn(),
}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:m.query}}))
vi.mock('../../modules/organization/access',()=>({
  resolveOrganizationAccessContext:m.ctx,
  contextHasCapability:(x:any,key:string)=>x.capabilities.includes(key)
    &&!x.explicitDenies.includes(key),
}))
vi.mock('../../modules/reporting/individualAuthorization',()=>({
  assertIndividualLongitudinalAccess:m.scope,
}))
vi.mock('../../modules/reporting/individualService',()=>({
  listIndividualSources:m.sources,generateIndividualLongitudinal:m.generate,
}))
vi.mock('../../modules/reporting/discovery',()=>({
  listPublishedReportingSpecs:m.specs,
}))
vi.mock('../../modules/reporting/spec',()=>({getPublishedReportingSpec:m.published}))
vi.mock('../../modules/reporting/pr4Service',()=>({
  readOrganizationReportingArtifact:m.read,
}))
vi.mock('../../modules/campus/studentReference',()=>({campusStudentReference:m.reference}))

import {
  assertCampusLongitudinalComparability,listCampusIndividualLongitudinalCatalog,
  listCampusIndividualLongitudinalSources,generateCampusIndividualLongitudinal,
} from '../../modules/campus/individual-longitudinal-studio'

const org='00000000-0000-4000-8000-000000000001'
const specId='00000000-0000-4000-8000-000000000002'
const r1='00000000-0000-4000-8000-000000000003'
const r2='00000000-0000-4000-8000-000000000004'
const t1='00000000-0000-4000-8000-000000000005'
const t2='00000000-0000-4000-8000-000000000006'
const alias='林-ABCDEF123456'
const actor={userId:'counselor-1',role:'TEACHER',accountDomain:'SCHOOL',platformRole:'STANDARD'}
const ctx={membershipId:'counselor-member',productDomain:'SCHOOL',organizationStatus:'ACTIVE',
  orgRole:'MEMBER',capabilities:['PSYCHOLOGY_STAFF'],personas:['COUNSELOR'],explicitDenies:[]}
const family='SCALE',key='approved-wellbeing'
const source1={runId:r1,trackId:t1,runName:'第一次',
  publishedAt:'2026-02-01T12:00:00.000Z',
  resource:{family,key,version:'1.0.0'}}
const source2={runId:r2,trackId:t2,runName:'第二次',
  publishedAt:'2026-04-01T12:00:00.000Z',
  resource:{family,key,version:'1.0.0'}}
const definition={
  analysisKind:'INDIVIDUAL_LONGITUDINAL',
  metricRules:[{metricId:'support',sourceFamily:family,sourceResourceKey:key}],
  comparabilityRules:[{metricId:'support',resourceFamily:family,resourceKey:key,
    fromVersion:'1.0.0',toVersion:'1.0.0',
    level:'EXACT',evidenceRef:'approved-method-1',evidenceHash:'a'.repeat(64)}],
}
const generation={actor:actor as any,organizationId:org,subjectReference:alias,
  specId,sources:[{runId:r2,trackId:t2},{runId:r1,trackId:t1}]}
describe('Huischool current-CLIENT individual longitudinal studio',()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    m.ctx.mockResolvedValue(ctx)
    m.reference.mockReturnValue(alias)
    m.query.mockResolvedValueOnce([{userId:'student-1'}])
      .mockResolvedValueOnce([{runId:r1,trackId:t1},{runId:r2,trackId:t2}])
    m.scope.mockResolvedValue(undefined)
    m.sources.mockResolvedValue({list:[source2,source1],nextPage:null})
    m.specs.mockResolvedValue({list:[{analysisKind:'INDIVIDUAL_LONGITUDINAL',
      specId,version:1,specKey:'longitudinal-reviewed'}],total:1})
    m.published.mockResolvedValue({definition})
    m.generate.mockResolvedValue({artifactId:'artifact-1',projection:{secretScores:[10,20]}})
    m.read.mockResolvedValue({artifactId:'artifact-1',
      projection:{kind:'INDIVIDUAL_LONGITUDINAL',waves:[{metrics:{secretValue:{value:3}}}]}})
  })
  it('rejects training, parent, ordinary teacher and explicit denial before looking up subjects',async()=>{
    for(const outsider of [
      {...actor,accountDomain:'TRAINING'},
      {...actor,role:'PARENT'},
    ])await expect(listCampusIndividualLongitudinalCatalog(outsider as any,org))
      .rejects.toMatchObject({statusCode:404})
    m.ctx.mockResolvedValueOnce({...ctx,personas:['TEACHER']})
    await expect(listCampusIndividualLongitudinalCatalog(actor as any,org))
      .rejects.toMatchObject({statusCode:404})
    m.ctx.mockResolvedValueOnce({...ctx,explicitDenies:['REPORT_READ']})
    await expect(listCampusIndividualLongitudinalCatalog(actor as any,org))
      .rejects.toMatchObject({statusCode:404})
    expect(m.query).not.toHaveBeenCalled()
  })
  it('catalog exposes only school pseudonyms without login name or member mapping',async()=>{
    const x=await listCampusIndividualLongitudinalCatalog(actor as any,org)
    expect(x.subjects).toEqual([{reference:alias}])
    expect(JSON.stringify(x)).not.toMatch(/student-1|counselor-member|username|studentNumber/)
    const sql=m.query.mock.calls[0][0].join('')
    expect(sql).toContain('organization_counselor_client_relationships')
    expect(sql).toContain("student.persona='STUDENT'")
    expect(sql).toContain("client.persona='CLIENT'")
    expect(sql).toContain("admission.status='APPROVED'")
    expect(sql).toContain("u.account_domain='SCHOOL'")
  })
  it('withholds other-user pseudonyms before requesting any prior source',async()=>{
    await expect(listCampusIndividualLongitudinalSources({
      actor:actor as any,organizationId:org,subjectReference:'林-000000000000',
    })).rejects.toMatchObject({statusCode:404})
    expect(m.sources).not.toHaveBeenCalled()
  })
  it('requires reviewed per-metric and per-version comparability for each adjacent wave',()=>{
    expect(()=>assertCampusLongitudinalComparability({
      spec:definition as any,sources:[source1,source2],
    })).not.toThrow()
    for(const item of [
      {spec:definition,sources:[source1]},
      {spec:definition,sources:[source1,{...source2,resource:{family,key:'other',version:'1.0.0'}}]},
      {spec:{...definition,comparabilityRules:[]},sources:[source1,source2]},
      {spec:{...definition,comparabilityRules:[{
        ...definition.comparabilityRules[0],evidenceHash:'unverified'}]},sources:[source1,source2]},
      {spec:definition,sources:[source1,{...source2,resource:{family,key,version:'2.0.0'}}]},
    ])expect(()=>assertCampusLongitudinalComparability(item as any)).toThrow()
  })
  it('requires closed campus sources and current scope, never passing student IDs to the client',async()=>{
    const x=await listCampusIndividualLongitudinalSources({
      actor:actor as any,organizationId:org,subjectReference:alias,
    })
    expect(x.sources).toEqual([source2,source1])
    expect(JSON.stringify(x)).not.toContain('student-1')
    const scopeSql=m.query.mock.calls[1][0].join('')
    expect(scopeSql).toContain("run.status='CLOSED'")
    expect(scopeSql).toContain("activity.status='CLOSED'")
    expect(scopeSql).toContain("execution.status='COMPLETED'")
    expect(m.scope).toHaveBeenCalledWith(expect.objectContaining({
      organizationId:org,subjectUserId:'student-1',
    }))
  })
  it('sorts source waves chronologically and delegates to canonical individual artifact',async()=>{
    const x=await generateCampusIndividualLongitudinal(generation)
    expect(m.generate).toHaveBeenCalledWith(expect.objectContaining({
      subjectUserId:'student-1',
      sources:[{runId:r1,trackId:t1},{runId:r2,trackId:t2}],
      referenceResolutionMode:'ORIGINAL',
    }))
    expect(m.read).toHaveBeenCalledWith(expect.objectContaining({artifactId:'artifact-1'}))
    expect(x).toMatchObject({artifactId:'artifact-1',subjectReference:alias,status:'AVAILABLE'})
    expect(JSON.stringify(x)).not.toMatch(/student-1|secret|value|waves|username/)
  })
  it('refuses a source ID from another patient without executing any generation',async()=>{
    await expect(generateCampusIndividualLongitudinal({
      ...generation,sources:[{runId:r1,trackId:t1},{
        runId:'00000000-0000-4000-8000-000000000099',trackId:t2,
      }],
    })).rejects.toMatchObject({statusCode:404})
    expect(m.generate).not.toHaveBeenCalled()
  })
})
