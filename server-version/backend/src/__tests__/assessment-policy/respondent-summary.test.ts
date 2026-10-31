import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {Prisma} from '@prisma/client'
const mocks=vi.hoisted(()=>({query:vi.fn(),find:vi.fn(),resolve:vi.fn(),identity:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:mocks.query}}))
vi.mock('../../modules/assessment-relational/product-registry',()=>({relationalProductRegistry:{findExact:mocks.find}}))
vi.mock('../../modules/reporting/resultSource',()=>({resolveAuthoritativeTrackObservations:mocks.resolve}))
vi.mock('../../modules/education-tools/assessment-resource.repository',()=>({readEducationAssessmentDeliveryIdentity:mocks.identity}))
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { readRespondentRunSummary } from '../../modules/reporting/respondentSummary'
import { testDisclosure } from './result-disclosure.fixture'
import {buildSelfGroupCohortAnalysisPolicy,SELF_GROUP_POLICY_KEY} from '../../modules/assessment-policy/self-group-contract'
beforeEach(()=>{vi.resetAllMocks()})
it('refuses public SELF GROUP summaries while allowing only the internal whitelist without materializing scores',async()=>{
 const contract=testDisclosure(20);contract.policyKey=SELF_GROUP_POLICY_KEY
 contract.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['score'],longitudinalMetricKeys:[]}
 contract.audiences.ORGANIZATION={mode:'AGGREGATE_ONLY',metricKeys:['score'],longitudinalMetricKeys:[]}
 const policy={analysisMode:'COHORT_AGGREGATE',resultDisclosure:contract}
 const row={organizationId:'org',runId:'run',trackId:'track',subjectUserId:'self',relationship:'SELF',perspective:'SELF_REPORT',family:'BUNDLE',key:'key',version:'2.0.0',policy,hash:canonicalHash(policy)}
 mocks.query.mockResolvedValue([row])
 mocks.find.mockReturnValue({releaseStatus:'PUBLISHED',resultDisclosure:contract,
  applicability:{analysisMode:'COHORT_AGGREGATE',relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],minimumRespondents:20},
  cohortAnalysisPolicy:buildSelfGroupCohortAnalysisPolicy(contract)})
 // The public inbox must never flatten scores, even if a parent permits the
 // metric. Only the education reader can apply timing and per-leaf ceilings.
 mocks.resolve.mockRejectedValue(Error('public GROUP must not read canonical metrics'))
 await expect(readRespondentRunSummary('self','e')).rejects.toMatchObject({statusCode:404})
 expect(await readRespondentRunSummary('self','e',{disclosureOnly:true})).toEqual({schemaVersion:1,mode:'INDIVIDUAL_SUMMARY',state:'READY',metricKeys:['score']})
 expect(mocks.resolve).not.toHaveBeenCalled()
})
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
 expect(mocks.query.mock.calls[0][0].join(' ')).toContain('REPORT_READ')
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
it('keeps internal disclosure and exact historical source rechecks on the supplied report transaction',async()=>{
 const own=ownDisclosure();own.key='education-assessment:SCHOOL:org:resource'
 const query=vi.fn().mockResolvedValue([own]),db={$queryRaw:query} as unknown as Prisma.TransactionClient
 mocks.identity.mockResolvedValue({origin:{family:own.family},entry:{releaseStatus:'PUBLISHED',resultDisclosure:own.policy.resultDisclosure}})
 mocks.query.mockRejectedValue(Error('global autocommit is outside the report transaction'))
 expect(await readRespondentRunSummary('self','e',{disclosureOnly:true,db})).toMatchObject({state:'READY',metricKeys:['score']})
 expect(query).toHaveBeenCalledTimes(2);expect(mocks.query).not.toHaveBeenCalled()
 expect(mocks.identity).toHaveBeenCalledTimes(2)
 expect(mocks.identity).toHaveBeenCalledWith(db,{resourceKey:own.key,version:own.version,purpose:'HISTORY'})
 expect(mocks.resolve).not.toHaveBeenCalled()
})
