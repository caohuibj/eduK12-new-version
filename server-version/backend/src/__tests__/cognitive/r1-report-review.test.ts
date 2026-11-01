import { describe, expect, it } from 'vitest'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { resolveParticipantPresentation } from '../../modules/cognitive/participant-presentation'
import { freezeAssignmentProfile, readFrozenReport } from '../../modules/cognitive/profile-freeze'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'

const names = ['patterncompare', 'flanker', 'cardsort', 'trailmaking', 'reversallearning', 'numberline', 'arithverify', 'sizecongruity', 'symbolmatch', 'cancellation', 'ufov']
const identity = (testType: string) => ({ testType, engineVersion: names.indexOf(testType) < 5 ? '1.0.0' : '1.0.1', scoringVersion: '1.0.0' })
const projection = (testType: string, profile: 'experience' | 'research', metrics: Record<string, number | null>) => {
  const id = identity(testType)
  const definition = buildCognitiveV2TaskDefinition(requireCognitiveRegistryEntry(id.testType, id.engineVersion, id.scoringVersion))
  return projectThreeLayerReport({ ...id, configVersion: id.engineVersion, profile, protocolSignature: 'r1-synthetic-report', participantPresentation: resolveParticipantPresentation(id), definition: definition.report, metricDefinitions: definition.metrics, qualityDefinitions: definition.quality, metrics, score: { metrics, quality: { state: 'interpretable', flags: {}, reasons: [] }, audit: { trialCount: 24, scorerVersion: '1.0.0' } } })
}

describe('R1 display revisions', () => {
  it.each(names)('%s has a separate current display without changing metric or calculation identities', async (name) => {
    const previous = (await import(`../../modules/cognitive/tasks/${name}/participant-presentation.previous.ts`)).participantPresentations[0]
    const current = resolveParticipantPresentation(identity(name))!
    expect(current.presentationVersion).not.toBe(previous.presentationVersion)
    expect(current.reportReading!.version).not.toBe(previous.reportReading.version)
    expect(current.engineVersion).toBe(previous.engineVersion)
    expect(current.scoringVersion).toBe(previous.scoringVersion)
    expect(Object.keys(current.metrics)).toEqual(Object.keys(previous.metrics))
    for (const key of Object.keys(current.metrics)) {
      expect(current.metrics[key].valueUnit).toBe(previous.metrics[key].valueUnit)
      expect(current.metrics[key].displayUnit).toBe(previous.metrics[key].displayUnit)
    }
    expect(current.reportReading!.metricGates).toEqual(previous.reportReading.metricGates)
    expect(current.reportReading!.withholdFlags).toEqual(previous.reportReading.withholdFlags)
    expect(current.protocols.experience!.reportCaveats.join(' ')).toContain('未实测')
    expect(current.reportReading!.professional!.confounders.join(' ')).toContain('未测定') // must not imply reliability
  })

  it('keeps zero distance real and missing direction missing in a synthetic numberline report', () => {
    const report = projection('numberline', 'experience', { paePercent: 0, biasPercent: null, withinTenRate: 1, validTrialCount: 8, timeoutCount: 0, medianRtMs: null })
    const metrics = [...report.headline, ...report.user, ...report.detail]
    expect(metrics.find(m => m.key === 'paePercent')!.value).toBe(0)
    expect(metrics.find(m => m.key === 'biasPercent')?.value ?? null).toBeNull()
    expect(report.reading!.feedback.summary).not.toContain('{')
  })

  it('retains the sign of a negative condition difference', () => {
    const report = projection('sizecongruity', 'research', { sizeCongruityEffectMs: -25, congruentAccuracy: 1, incongruentAccuracy: 1, accuracy: 1, validCongruentRtCount: 48, validIncongruentRtCount: 48 })
    expect([...report.headline, ...report.user, ...report.detail].find(m => m.key === 'sizeCongruityEffectMs')!.value).toBe(-25)
  })

  it('withholds the arithmetic trend only in the short experience display', () => {
    const metrics = { accuracy: 1, medianRtMs: 500, problemSizeSlopeMs: 18, errorCount: 0, timeoutCount: 0, validRtCount: 12 }
    const exp = projection('arithverify', 'experience', metrics)
    const research = projection('arithverify', 'research', metrics)
    expect([...exp.headline, ...exp.user, ...exp.detail].some(m => m.key === 'problemSizeSlopeMs')).toBe(false)
    expect([...research.headline, ...research.user, ...research.detail].some(m => m.key === 'problemSizeSlopeMs')).toBe(true)
  })

  it('describes partial trail completion without implying that every step finished', () => {
    const report = projection('trailmaking', 'research', { completionTimeMs: 1800, errorCount: 0, completedStepCount: 6, setShiftCostMs: null })
    expect(report.reading!.feedback.summary).toContain('6')
    expect(report.reading!.feedback.summary).not.toContain('完成连接')
    expect(report.reading!.popular!.metricHelp.completionTimeMs.explanation).toContain('不是从开始到结束')
  })

  it('projects an old frozen presentation unchanged after the new display becomes current', async () => {
    const entry = requireCognitiveRegistryEntry('flanker', '1.0.0', '1.0.0')
    const seed = (await import('../../modules/cognitive/tasks/flanker/seeds')).seeds[0]
    const oldPresentation = structuredClone((await import('../../modules/cognitive/tasks/flanker/participant-presentation.previous')).participantPresentations[0])
    const oldKey = process.env.DATA_ENCRYPTION_KEY
    process.env.DATA_ENCRYPTION_KEY = '1'.repeat(64)
    try {
      const frozen = readFrozenReport(freezeAssignmentProfile({ entry, baseConfig: seed.config, profile: 'experience' }).resolvedReportSnapshotEncrypted)!
      frozen.presentationVersion = oldPresentation.presentationVersion
      frozen.participantPresentation = oldPresentation
      const input = { ...identity('flanker'), configVersion: '1.0.0', profile: 'experience' as const, frozenReport: frozen, score: 70, metrics: { flankerEffectMs: 0, congruentAccuracy: 1, incongruentAccuracy: 1 }, qualityFlags: { interpretable: true }, reference: null }
      const before = buildCognitiveSingleTaskReport(input)
      const current = resolveParticipantPresentation(identity('flanker'))!
      const title = current.title
      try { current.title = 'synthetic later wording'; expect(buildCognitiveSingleTaskReport(input)).toEqual(before) }
      finally { current.title = title }
      expect(before.title).toBe(oldPresentation.title)
      expect(frozen.participantPresentation).toEqual(oldPresentation)
    } finally {
      if (oldKey === undefined) delete process.env.DATA_ENCRYPTION_KEY
      else process.env.DATA_ENCRYPTION_KEY = oldKey
    }
  })
})
