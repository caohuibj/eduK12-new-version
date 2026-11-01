import { describe, expect, it } from 'vitest'
import { participantPresentations as reversalAll } from '../../modules/cognitive/tasks/reversallearning/participant-presentation'
import { participantPresentations as numberlineAll } from '../../modules/cognitive/tasks/numberline/participant-presentation'
import { executionEntries as reversalEntries } from '../../modules/cognitive/tasks/reversallearning/package'
import { executionEntries as numberlineEntries } from '../../modules/cognitive/tasks/numberline/package'
import { buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'
import type { CognitiveParticipantPresentationV1 } from '../../modules/cognitive/participant-presentation.types'
import type { RegistryEntry } from '../../modules/cognitive/cognitive.types'
const reversal = reversalAll.filter(p => p.reportReading?.version === '3.0.0')
const numberline = numberlineAll.filter(p => p.reportReading?.version === '3.0.0')
const project = (p: CognitiveParticipantPresentationV1, entries: RegistryEntry<unknown, unknown>[], metrics: Record<string, number | null>) => {
  const entry = entries.find(e => e.engineVersion === p.engineVersion && e.scoringVersion === p.scoringVersion)!
  const d = buildCognitiveV2TaskDefinition(entry)
  return projectThreeLayerReport({ testType: p.testType, engineVersion: p.engineVersion, scoringVersion: p.scoringVersion, configVersion: p.engineVersion, protocolSignature: 'synthetic-r1-version-binding', profile: 'research', participantPresentation: p, definition: d.report, metricDefinitions: d.metrics, qualityDefinitions: d.quality, metrics, score: { metrics, quality: { state: 'interpretable', flags: {}, reasons: [] }, audit: { trialCount: 6, scorerVersion: p.scoringVersion } } })
}
describe('R1 text stays bound to exact new and legacy C/S protocols', () => {
  it('projects both reversal identities while keeping new timing and configurable criterion wording', () => {
    expect(reversal.map(p => [p.engineVersion, p.scoringVersion, p.presentationVersion, p.reportReading!.version])).toEqual([['1.0.0', '1.0.0', '3.0.0', '3.0.0'], ['1.1.0', '1.0.0', '3.0.0', '3.0.0']])
    const newer = reversal[1]
    expect(newer.reportReading!.professional!.procedure).toContain('正式2秒')
    expect(newer.reportReading!.professional!.procedure).toContain('自定步速')
    expect(newer.reportReading!.professional!.procedure).toContain('调度下限')
    for (const p of reversal) {
      expect(p.metrics.trialsToAcquisitionCriterion.label).toContain('设定连续正确次数')
      const report = project(p, reversalEntries, { acquisitionAccuracy: 1, reversalAccuracy: 1, perseverativeErrorCount: 0, trialsToAcquisitionCriterion: null, trialsToReversalCriterion: null })
      expect([...report.headline, ...report.user, ...report.detail].find(m => m.key === 'perseverativeErrorCount')!.value).toBe(0)
      expect(report.reading!.popular!.concept).toContain('不确定反馈')
    }
  })
  it('projects legacy numberline plus NP without importing old midpoint teaching or forty-point claims into NP', () => {
    expect(numberline.map(p => [p.engineVersion, p.scoringVersion, p.presentationVersion])).toEqual([['1.0.1', '1.0.0', '3.0.0'], ['1.1.0', '1.1.0', '3.0.0']])
    const np = numberline[1]
    expect(np.reportReading!.introduction).toContain('六个')
    expect(np.reportReading!.professional!.procedure).toContain('A/B六个原选点')
    expect(np.reportReading!.professional!.procedure).not.toContain('40个分层点位')
    expect(np.reportReading!.nextStep).not.toContain('中点')
    expect(np.practicalTips.join(' ')).not.toContain('中点')
    for (const p of numberline) {
      const report = project(p, numberlineEntries, { paePercent: 0, biasPercent: 0, withinTenRate: 1, validTrialCount: 6, timeoutCount: 0, medianRtMs: null })
      expect([...report.headline, ...report.user, ...report.detail].find(m => m.key === 'paePercent')!.value).toBe(0)
      expect(report.reading!.feedback.summary).not.toContain('{')
    }
  })
})
