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
    mocks.query.mockResolvedValueOnce([{organizationId:'org',runId:'run',trackId:'track',subjectUserId:'subject',relationship:'SELF',perspective:'SELF_REPORT',family:'BUNDLE',key:'key',version:'1',policy,hash:canonicalHash(policy)}]).mockResolvedValueOnce([])
    await expect(readRespondentRunSummary('own','e')).rejects.toMatchObject({statusCode:404})
    mocks.query.mockResolvedValue([])
    await expect(readRespondentRunSummary('other','e')).rejects.toMatchObject({statusCode:404})
  })
})


function ownDisclosure(){
 const contract=testDisclosure();contract.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY' as const,metricKeys:['score'],longitudinalMetricKeys:[]}
 const policy={analysisMode:'INDIVIDUAL_ONLY',resultDisclosure:contract}
 const own={organizationId:'org',runId:'run',trackId:'track',subjectUserId:'self',relationship:'SELF',perspective:'SELF_REPORT',family:'BUNDLE',key:'key',version:'1',policy,hash:canonicalHash(policy)}
 mocks.query.mockResolvedValue([own]);mocks.find.mockReturnValue({releaseStatus:'PUBLISHED',resultDisclosure:contract})
 return own
}
it('checks current respondent disclosure without flattening same-named canonical unit metrics',async()=>{
 ownDisclosure();mocks.resolve.mockRejectedValue(Error('AMBIGUOUS_OBSERVATION'))
 expect(await readRespondentRunSummary('self','e',{disclosureOnly:true})).toEqual({schemaVersion:1,mode:'INDIVIDUAL_SUMMARY',state:'READY',metricKeys:['score']})
 expect(mocks.resolve).not.toHaveBeenCalled();expect(mocks.query).toHaveBeenCalledTimes(2)
})
it('retains the default metric summary refusal for an ambiguous observation',async()=>{
 ownDisclosure();mocks.resolve.mockRejectedValue(Error('AMBIGUOUS_OBSERVATION'))
 await expect(readRespondentRunSummary('self','e')).rejects.toThrow('AMBIGUOUS_OBSERVATION')
})
it('does not treat disclosure-only as permission after current access is withdrawn',async()=>{
 const own=ownDisclosure();mocks.query.mockResolvedValueOnce([own]).mockResolvedValueOnce([])
 await expect(readRespondentRunSummary('self','e',{disclosureOnly:true})).rejects.toMatchObject({statusCode:404})
 expect(mocks.resolve).not.toHaveBeenCalled()
})
