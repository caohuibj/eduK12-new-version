import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({query:vi.fn(),find:vi.fn(),resolve:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:mocks.query}}))
vi.mock('../../modules/assessment-relational/product-registry',()=>({relationalProductRegistry:{findExact:mocks.find}}))
vi.mock('../../modules/reporting/resultSource',()=>({resolveAuthoritativeTrackObservations:mocks.resolve}))
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { readRespondentRunSummary } from '../../modules/reporting/respondentSummary'
import { testDisclosure } from './result-disclosure.fixture'
beforeEach(()=>{vi.resetAllMocks()})
describe('own Run feedback summary',()=>{
  it('projects only content-approved canonical metrics for the exact respondent',async()=>{
    const contract=testDisclosure();contract.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['score'],longitudinalMetricKeys:[]}
    const policy={analysisMode:'INDIVIDUAL_ONLY',resultDisclosure:contract}
    mocks.query.mockResolvedValue([{organizationId:'org',runId:'run',trackId:'track',subjectUserId:'subject',relationship:'SELF',perspective:'SELF_REPORT',family:'BUNDLE',key:'key',version:'1',policy,hash:canonicalHash(policy)}])
    mocks.find.mockReturnValue({releaseStatus:'PUBLISHED',resultDisclosure:contract})
    mocks.resolve.mockResolvedValue({resolved:[{executionId:'e',respondent:{userId:'own'},metrics:[{key:'score',value:4,resultQuality:'interpretable'},{key:'secret',value:5,resultQuality:'interpretable'}]}]})
    expect(await readRespondentRunSummary('own','e')).toEqual({schemaVersion:1,mode:'INDIVIDUAL_SUMMARY',state:'READY',metrics:{score:4}})
    expect(mocks.query.mock.calls[0][1]).toBe('e');expect(mocks.query.mock.calls[0][2]).toBe('own')
    mocks.query.mockResolvedValue([])
    await expect(readRespondentRunSummary('other','e')).rejects.toMatchObject({statusCode:404})
  })
})
