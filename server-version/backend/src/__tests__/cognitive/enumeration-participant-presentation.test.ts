import { describe, expect, it, vi } from 'vitest'
vi.mock('dotenv', () => ({ default: { config: () => ({ parsed: {} }) } }))
// Synthetic key only: the freeze path seals the snapshot with the real AES helper.
process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY ?? 'a'.repeat(64)
import { getCognitiveTaskResource } from '../../modules/cognitive/task-resource'
import { freezeNativeAssignmentProfile, readFrozenReport, hashResolvedConfig } from '../../modules/cognitive/profile-freeze'
import { resolveNativeParticipantPresentation } from '../../modules/cognitive/content-candidates/native-registry/participant-presentations'
import { ENUMERATION_RECIPE_IDENTITY, enumerationRecipeConfig } from '../../modules/cognitive/content-candidates/enumeration/protocol'
import { enumerationRecipeDefinition } from '../../modules/cognitive/content-candidates/enumeration/package'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'
const FALLBACK = '该指标用于描述本次任务中的一个具体表现维度，请结合任务说明与其他指标共同阅读。'
const resource = () => {
  const r = getCognitiveTaskResource('enumeration', ENUMERATION_RECIPE_IDENTITY.engineVersion, ENUMERATION_RECIPE_IDENTITY.scoringVersion)
  if (!r || r.kind !== 'native') throw new Error('enumeration native resource missing')
  return r
}
const freeze = (profile: 'experience' | 'research' = 'experience') => freezeNativeAssignmentProfile({
  resource: resource(), baseConfig: enumerationRecipeConfig(profile), profile })
describe('native participant presentation', () => {
  it('resolves only for the exact recipe tuple and stays absent for the historical one', () => {
    expect(resolveNativeParticipantPresentation({ testType: 'enumeration', engineVersion: '0.2.0', scoringVersion: '0.2.0', configVersion: '0.3.0' })
      ?.presentationVersion).toBe('0.1.0')
    expect(resolveNativeParticipantPresentation({ testType: 'enumeration', engineVersion: '0.2.0', scoringVersion: '0.2.0', configVersion: '0.2.0' })).toBeUndefined()
    expect(resolveNativeParticipantPresentation({ testType: 'enumeration', engineVersion: '0.1.0', scoringVersion: '0.2.0', configVersion: '0.2.0' })).toBeUndefined()
    expect(resolveNativeParticipantPresentation({ testType: 'mot', engineVersion: '1.1.1', scoringVersion: '1.1.0', configVersion: '1.1.0' })).toBeUndefined()
  })
  it('freezes the presentation with the assignment without touching the config hash', () => {
    const frozen = freeze(), report = readFrozenReport(frozen.resolvedReportSnapshotEncrypted)
    expect(report?.presentationVersion).toBe('0.1.0')
    expect(report?.participantPresentation?.presentationVersion).toBe('0.1.0')
    expect(report?.participantPresentation?.metrics.correctTrialCount.label).toBe('判断正确次数')
    // The display sidecar never enters the resolved config or its hash.
    expect(Object.keys(frozen.resolvedConfig as Record<string, unknown>)).not.toContain('presentation')
    expect(hashResolvedConfig(frozen.resolvedConfig)).toBe(frozen.resolvedConfigHash)
  })
  it('keeps every freeze independent so one assignment cannot rewrite another wording', () => {
    const first = readFrozenReport(freeze().resolvedReportSnapshotEncrypted)!
    first.participantPresentation!.metrics.correctTrialCount.explanation = 'mutated'
    const second = readFrozenReport(freeze().resolvedReportSnapshotEncrypted)!
    expect(second.participantPresentation!.metrics.correctTrialCount.explanation).not.toBe('mutated')
  })
  it('gives each shown metric its own explanation instead of the generic fallback', () => {
    const presentation = resolveNativeParticipantPresentation({ testType: 'enumeration', engineVersion: '0.2.0', scoringVersion: '0.2.0', configVersion: '0.3.0' })
    const metrics = { correctTrialCount: 5, includedTrialCount: 25, overReportedTrialCount: 15, underReportedTrialCount: 5,
      byQuantity: [{ targetValue: 5, expected: 5, observed: 5, included: 5, correct: 2, overReported: 2, underReported: 1,
        accuracy: 0.4, signedMeanError: 0.4, meanAbsoluteError: 0.8, medianReportOperationMs: 2400 }],
      signedMeanError: 1.2, meanAbsoluteError: 1.6 }
    const report = projectThreeLayerReport({
      participantPresentation: presentation, testType: 'enumeration', configVersion: '0.3.0',
      protocolSignature: 'a'.repeat(64), engineVersion: '0.2.0', scoringVersion: '0.2.0', profile: 'experience',
      definition: enumerationRecipeDefinition.report, metrics, metricDefinitions: enumerationRecipeDefinition.metrics,
      qualityDefinitions: enumerationRecipeDefinition.quality,
      score: { metrics, quality: { state: 'interpretable', flags: { descriptiveOnly: true, noIncludedRecords: false,
        incompleteRecords: false, technicalExclusions: false }, reasons: [] }, audit: { trialCount: 25, scorerVersion: '0.2.0' } },
    })
    const shown = [...report.headline, ...report.user]
    expect(shown.map(view => view.key)).toEqual(['correctTrialCount', 'includedTrialCount', 'overReportedTrialCount', 'underReportedTrialCount'])
    const explanations = shown.map(view => view.explanation)
    expect(explanations.every(text => typeof text === 'string' && text.length > 0)).toBe(true)
    expect(new Set(explanations).size).toBe(explanations.length)
    expect(explanations).not.toContain(FALLBACK)
    expect(shown[2].participantLabel).toBe('点数偏多次数')
  })
})
