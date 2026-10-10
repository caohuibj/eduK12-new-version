import { beforeEach,describe,expect,it,vi } from 'vitest'

const mocks=vi.hoisted(()=>({
  query:vi.fn(),context:vi.fn(),workspace:vi.fn(),
}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:mocks.query}}))
vi.mock('../../modules/reporting/pr4Authorization',()=>({
  assertOrganizationReportingWorkspaceAccess:mocks.workspace,
  resolveOrganizationReportingWorkspaceContext:mocks.context,
}))
vi.mock('../../modules/reporting/protectedFeedback',()=>({
  resolveProtectedFeedbackManagerContext:mocks.context,
}))
vi.mock('../../modules/reporting/individualAuthorization',()=>({individualSubjectScope:vi.fn()}))
vi.mock('../../modules/reporting/series',()=>({
  readReportingSeriesBatch:vi.fn(),readReportingSeriesWavesBatch:vi.fn(),
}))
vi.mock('../../modules/reporting/spec',()=>({getPublishedReportingSpec:vi.fn()}))

import { listProtectedReportingSources } from '../../modules/reporting/discovery'

const org='00000000-0000-4000-8000-000000000001'
const principal={userId:'campus-counselor',platformRole:'STANDARD' as const}
const campus={productDomain:'SCHOOL',organizationStatus:'ACTIVE',orgRole:'ORG_ADMIN',
  membershipId:'current-counselor-membership',capabilities:['PSYCHOLOGY_STAFF'],
  personas:['TEACHER','COUNSELOR'],explicitDenies:[]}

describe('SCHOOL protected source discovery is not an all-student directory',()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    mocks.workspace.mockResolvedValue(undefined)
    mocks.query.mockResolvedValue([])
    mocks.context.mockResolvedValue(campus)
  })
  it('requires CLIENT relation even for dual-role school administrator+psychology staff',async()=>{
    await listProtectedReportingSources({principal,organizationId:org})
    const [strings,...args]=mocks.query.mock.calls[0]
    const sql=strings.join('')
    expect(sql).toContain('organization_counselor_client_relationships')
    expect(sql).toContain('relation.counselor_membership_id')
    // The ORG_ADMIN and TEACHER shortcut booleans are both false for SCHOOL.
    // Only the separately checked CLIENT relation may enumerate a subject.
    expect(args.filter(x=>x===false)).toHaveLength(2)
    expect(args.filter(x=>x===true)).toHaveLength(1)
    expect(args).toContain('current-counselor-membership')
    expect(sql).not.toContain('campus_accounts')
  })
  it('keeps existing LEGACY manager discovery semantics unchanged',async()=>{
    mocks.context.mockResolvedValue({...campus,productDomain:'LEGACY'})
    await listProtectedReportingSources({principal,organizationId:org})
    const args=mocks.query.mock.calls[0].slice(1)
    expect(args.filter(x=>x===false)).toHaveLength(0)
    expect(args.filter(x=>x===true)).toHaveLength(3)
  })
})
