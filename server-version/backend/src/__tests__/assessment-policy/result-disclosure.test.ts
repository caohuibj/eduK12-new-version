import { describe, expect, it } from 'vitest'
import { projectAudienceResult, resultAudiences, validateResultDisclosureContract, type ResultDisclosureContractV1 } from '../../modules/assessment-policy/result-disclosure'
import { testDisclosure } from './result-disclosure.fixture'
describe('content result audience matrix', () => {
  it.each(resultAudiences)('has no implicit result privilege for %s', audience => {
    const c = testDisclosure(); expect(projectAudienceResult({ contract: c, audience, metrics: { score: 9, rawAnswers: 'secret' } })).toEqual({ schemaVersion: 1, mode: 'NONE', state: 'WITHHELD' })
  })
  it('projects one result across all audiences without copying raw fields', () => {
    const c = testDisclosure(3)
    c.audiences.RESPONDENT={mode:'COMPLETION_ONLY',metricKeys:[],longitudinalMetricKeys:[]}
    c.audiences.SUBJECT={mode:'AGGREGATE_ONLY',metricKeys:['mean'],longitudinalMetricKeys:[]}
    c.audiences.TEACHER={mode:'CLASS_AGGREGATE',metricKeys:['mean'],longitudinalMetricKeys:[]}
    c.audiences.PARENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['score'],longitudinalMetricKeys:[]}
    c.audiences.PROFESSIONAL={mode:'INDIVIDUAL_SUMMARY',metricKeys:['score'],longitudinalMetricKeys:['score']}
    c.audiences.ORGANIZATION={mode:'ORGANIZATION_AGGREGATE',metricKeys:['mean'],longitudinalMetricKeys:[]}
    c.audiences.RESEARCH={mode:'RESEARCH_PROJECTION',metricKeys:['mean'],longitudinalMetricKeys:[]}
    const canonical = Object.freeze({score:4,mean:3,rawAnswers:'private',itemScores:9,respondentId:'private'})
    for (const audience of resultAudiences) {
      const projection=projectAudienceResult({contract:c,audience,metrics:canonical,respondentCount:3})
      expect(JSON.stringify(projection)).not.toMatch(/private|rawAnswers|itemScores|respondentId/)
      if ('metrics' in projection) expect(Object.keys(projection.metrics!)).toEqual(c.audiences[audience].metricKeys)
    }
    expect(canonical.rawAnswers).toBe('private')
  })
  it('picks only declared metrics, rejects organization individual access and longitudinal widening', () => {
    const c = testDisclosure(); c.audiences.RESPONDENT = { mode: 'INDIVIDUAL_SUMMARY', metricKeys: ['score'], longitudinalMetricKeys: ['score'] }
    expect(projectAudienceResult({contract:c,audience:'RESPONDENT',metrics:{score:2,secret:3,rawAnswers:{item:4}}})).toEqual({schemaVersion:1,mode:'INDIVIDUAL_SUMMARY',state:'READY',metrics:{score:2}})
    c.audiences.ORGANIZATION = c.audiences.RESPONDENT; expect(()=>validateResultDisclosureContract(c)).toThrow(); c.audiences.ORGANIZATION = testDisclosure().audiences.ORGANIZATION
    c.audiences.RESPONDENT.longitudinalMetricKeys=['hidden']; expect(()=>validateResultDisclosureContract(c)).toThrow()
  })
  it('preserves minimum-N and server-clock delayed release without a count oracle', () => {
    const c=testDisclosure(5); c.audiences.SUBJECT={mode:'DELAYED_AGGREGATE',metricKeys:['mean'],longitudinalMetricKeys:[],delaySeconds:60}
    const base={contract:c,audience:'SUBJECT' as const,metrics:{mean:4},aggregateReleasedAt:new Date('2026-10-01T00:00:00Z')}
    expect(projectAudienceResult({...base,respondentCount:4,now:new Date('2026-10-01T00:02:00Z')})).not.toHaveProperty('metrics')
    expect(projectAudienceResult({...base,respondentCount:5,now:new Date('2026-10-01T00:00:59Z')})).not.toHaveProperty('metrics')
    expect(projectAudienceResult({...base,respondentCount:5,now:new Date('2026-10-01T00:01:00Z')})).toHaveProperty('metrics.mean',4)
  })
})
