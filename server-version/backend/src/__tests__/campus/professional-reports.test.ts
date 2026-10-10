import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
const state=vi.hoisted(()=>({
  context:vi.fn(),query:vi.fn(),read:vi.fn(),
}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:state.query}}))
vi.mock('../../modules/organization/access',()=>({
  resolveOrganizationAccessContext:state.context,
  contextHasCapability:(ctx:any,cap:string)=>
    ctx.productDomain!=='SCHOOL'||(ctx.capabilities.includes(cap)&&!ctx.explicitDenies.includes(cap)&&!ctx.explicitDenies.includes('*')),
}))
vi.mock('../../modules/reporting/pr4Service',()=>({readOrganizationReportingArtifact:state.read}))
import { listCampusProfessionalReports, readCampusProfessionalReport } from '../../modules/campus/professional-reports'
import { campusStudentReference } from '../../modules/campus/studentReference'

const orgId='00000000-0000-4000-8000-000000000001'
const artifactId='00000000-0000-4000-8000-000000000002'
const school={userId:'counselor-one',platformRole:'STANDARD',accountDomain:'SCHOOL'}
const ctx={membershipId:'counselor-membership',organizationStatus:'ACTIVE',
  productDomain:'SCHOOL',personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF'],explicitDenies:[]}

describe('Huischool professional report subject scoping',()=>{
  beforeEach(()=>{
    vi.stubEnv('CAMPUS_ELIGIBILITY_HMAC_KEY','ab'.repeat(32))
    vi.clearAllMocks();state.context.mockResolvedValue(ctx)
    state.query.mockResolvedValue([])
    state.read.mockResolvedValue({artifactId,projection:{kind:'PROTECTED_FEEDBACK',state:'suppressed'}})
  })
  afterEach(()=>vi.unstubAllEnvs())
  it('refuses TRAINING accounts before loading any artifact',async()=>{
    await expect(listCampusProfessionalReports({...school,accountDomain:'TRAINING'} as any,orgId))
      .rejects.toMatchObject({statusCode:404})
    expect(state.context).not.toHaveBeenCalled()
    expect(state.query).not.toHaveBeenCalled()
  })
  it('refuses school governance, a counselor title alone, and a revoked psychology grant',async()=>{
    for(const revoked of [
      {...ctx,personas:[]},{...ctx,capabilities:[]},
      {...ctx,explicitDenies:['PSYCHOLOGY_STAFF']},
      {...ctx,productDomain:'LEGACY'},
    ]){
      state.context.mockResolvedValueOnce(revoked)
      await expect(listCampusProfessionalReports(school as any,orgId)).rejects.toMatchObject({statusCode:404})
    }
    expect(state.query).not.toHaveBeenCalled()
  })
  it('returns a bounded pseudonym-only index with counselor/client and deny SQL filters',async()=>{
    state.query.mockResolvedValueOnce([{id:artifactId,generatedAt:new Date('2026-10-10T00:00:00Z'),
      subjectUserId:'school-student',analysisKind:'PROTECTED_FEEDBACK'}])
    const result=await listCampusProfessionalReports(school as any,orgId)
    expect(result).toEqual({list:[{artifactId,subjectAlias:campusStudentReference(orgId,'school-student'),
      analysisKind:'PROTECTED_FEEDBACK',generatedAt:'2026-10-10T00:00:00.000Z'}],hasMore:false})
    const sql=state.query.mock.calls[0][0].join('')
    expect(sql).toContain('counselor.client_membership_id=student_m.id')
    expect(sql).not.toContain('student_alias.login_name')
    expect(sql).toContain("student_p.persona='CLIENT'")
    expect(sql).toContain("a.analysis_kind IN ('PROTECTED_FEEDBACK','INDIVIDUAL_LONGITUDINAL')")
    expect(sql).toContain('LIMIT 21')
    expect(sql).toContain('organization_access_denies')
  })
  it('checks artifact kind before calling the authoritative reporting reader',async()=>{
    state.query.mockResolvedValueOnce([])
    await expect(readCampusProfessionalReport(school as any,orgId,artifactId))
      .rejects.toMatchObject({statusCode:404})
    expect(state.read).not.toHaveBeenCalled()
  })
})
