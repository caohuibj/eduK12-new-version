import { describe, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({rows:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:state.rows}}))
import { governedArtifactMetrics } from '../../modules/reporting/governedDisclosure'

const input={
  artifact:{
    id:'report',organizationId:'campus',analysisKind:'PROTECTED_FEEDBACK',
    sourceRunId:'run',sourceTrackId:'track',
  } as any,
  principal:{userId:'viewer',platformRole:'STANDARD' as const},
}
describe('governed SCHOOL reporting cannot fall back to a legacy full projection',()=>{
  it('blocks a source without a frozen resultDisclosure contract even if a reporting artifact exists',async()=>{
    state.rows.mockResolvedValueOnce([{
      family:'SCALE',key:'sample',version:'1.0.0',policy:{},
      productDomain:'SCHOOL',hash:'legacy',closedAt:null,
    }])
    await expect(governedArtifactMetrics(input)).rejects.toMatchObject({
      code:'REPORT_NOT_FOUND',statusCode:404,
    })
  })
  it('leaves the unrelated LEGACY report compatibility rule unchanged',async()=>{
    state.rows.mockResolvedValueOnce([{
      family:'SCALE',key:'sample',version:'1.0.0',policy:{},
      productDomain:'LEGACY',hash:'legacy',closedAt:null,
    }])
    await expect(governedArtifactMetrics(input)).resolves.toBeNull()
  })
})
