import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cognitiveSeeds } from '../../modules/cognitive/generated/seeds'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { resolveParticipantPresentation } from '../../modules/cognitive/participant-presentation'
import { freezeAssignmentProfile, readFrozenReport } from '../../modules/cognitive/profile-freeze'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'

const tasks = ['lexicaldecision','emotionrecognition','bart','delaydiscount','gamblingdeck','timecopy','semanticfluency','trustgame','pursuitrotor','maze','sharegame']
const current = tasks.map(testType => cognitiveSeeds.find(seed => seed.testType === testType && seed.configVersion.endsWith('-report3'))!)
beforeAll(() => { vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64)); vi.stubEnv('DATA_PSEUDONYM_KEY', 'b'.repeat(64)) })
afterAll(() => { vi.unstubAllEnvs() })
describe('explicit cognitive report R3 selection', () => {
  it('keeps old configs and default presentation while each new draft selects R3 without changing task parameters', () => {
    expect(current).toHaveLength(11)
    for (const seed of current) {
      expect(seed, 'new draft').toBeDefined()
      expect(seed.status).toBe('DRAFT')
      const old = cognitiveSeeds.find(candidate => candidate.testType === seed.testType && candidate.configVersion === seed.configVersion.replace(/-report3$/, ''))!
      const { report: oldReport, ...oldParameters } = old.config
      const { report: newReport, ...newParameters } = seed.config
      expect(newParameters, seed.testType).toEqual(oldParameters)
      expect(newReport).toEqual({ ...(oldReport as object), reportVersion: '3.0.0', referenceMode: 'none' })
      const original = resolveParticipantPresentation(seed)!
      const revised = resolveParticipantPresentation({ ...seed, reportVersion: '3.0.0' })!
      expect(original.presentationVersion).not.toBe('3.0.0')
      expect(revised.presentationVersion).toBe('3.0.0')
      expect(revised.reportReading?.version).toBe('3.0.0')
      expect(resolveParticipantPresentation({ ...seed, engineVersion: 'unknown', reportVersion: '3.0.0' })).toBeUndefined()
    }
  })
  it('freezes both mode reports with the requested R, original profile patch and no product index', () => {
    for (const seed of current) {
      const entry = requireCognitiveRegistryEntry(seed.testType, seed.engineVersion, seed.scoringVersion)
      const old = cognitiveSeeds.find(candidate => candidate.testType === seed.testType && candidate.configVersion === seed.configVersion.replace(/-report3$/, ''))!
      for (const profile of ['experience','research'] as const) {
        const revised = freezeAssignmentProfile({ entry, baseConfig: seed.config, profile })
        const legacy = freezeAssignmentProfile({ entry, baseConfig: old.config, profile })
        const { report: revisedReportConfig, ...revisedConfig } = revised.resolvedConfig as Record<string, unknown>
        const { report: oldReportConfig, ...oldConfig } = legacy.resolvedConfig as Record<string, unknown>
        expect(revisedConfig).toEqual(oldConfig)
        const frozen = readFrozenReport(revised.resolvedReportSnapshotEncrypted)!
        const oldFrozen = readFrozenReport(legacy.resolvedReportSnapshotEncrypted)!
        expect(frozen.reportDefinitionVersion).toBe('3.0.0')
        expect(frozen.v2ReportDefinition?.version).toBe('3.0.0')
        expect(frozen.participantPresentation?.reportReading?.version).toBe('3.0.0')
        expect(frozen.protocolShowProductIndex).toBe(false)
        expect(oldFrozen.presentationVersion).not.toBe('3.0.0')
        const single = buildCognitiveSingleTaskReport({ ...seed, profile, frozenReport: frozen, score: 99, metrics: {}, qualityFlags: { interpretable: true }, reference: null })!
        expect(single.productIndex).toBeNull()
        expect(single.title).toBe(frozen.participantPresentation!.title)
        for (const key of frozen.participantPresentation!.reportReading!.studentMetricKeys) expect(entry.metricDefinitions[key], `${seed.testType}/${key}`).toBeDefined()
      }
    }
  })
  it('does not change an old frozen report when the new live presentation is edited', () => {
    const seed = current.find(seed => seed.testType === 'sharegame')!
    const old = cognitiveSeeds.find(candidate => candidate.testType === seed.testType && candidate.configVersion === '2.0.0')!
    const entry = requireCognitiveRegistryEntry(seed.testType, seed.engineVersion, seed.scoringVersion)
    const frozen = readFrozenReport(freezeAssignmentProfile({ entry, baseConfig: old.config, profile: 'experience' }).resolvedReportSnapshotEncrypted)!
    const presentation = resolveParticipantPresentation({ ...seed, reportVersion: '3.0.0' })!
    const previous = presentation.title
    try {
      presentation.title = 'Changed R3 live wording'
      expect(frozen.participantPresentation?.title).toBe('分享决策')
      expect(frozen.participantPresentation?.reportReading?.version).toBe('2.0.0')
    } finally { presentation.title = previous }
  })
  it('projects an explicit zero as zero and withholds an all-unanswered giving rate', () => {
    const seed = current.find(seed => seed.testType === 'sharegame')!
    const entry = requireCognitiveRegistryEntry(seed.testType, seed.engineVersion, seed.scoringVersion)
    const frozen = readFrozenReport(freezeAssignmentProfile({ entry, baseConfig: seed.config, profile: 'experience' }).resolvedReportSnapshotEncrypted)!
    const project = (givingRate: number | null, answeredRounds: number) => projectThreeLayerReport({ ...seed, profile: 'experience', protocolSignature: 'synthetic-report-only',
      participantPresentation: frozen.participantPresentation,
      definition: frozen.v2ReportDefinition!, metricDefinitions: frozen.v2MetricDefinitions!, qualityDefinitions: frozen.v2QualityDefinitions!,
      metrics: { givingRate, answeredRounds, zeroChoiceCount: answeredRounds, timeoutRounds: 3 - answeredRounds, omittedRounds: 0 },
      score: { metrics: {}, quality: { state: answeredRounds ? 'interpretable' : 'limited', flags: { legacyUninterpretable: !answeredRounds }, reasons: [] }, audit: { trialCount: 3, scorerVersion: seed.scoringVersion } },
    })
    const explicitZero = project(0, 3)
    const noAnswer = project(null, 0)
    expect(explicitZero.reading?.feedback.summary).toContain('0%')
    expect(explicitZero.headline.find(metric => metric.key === 'givingRate')?.value).toBe(0)
    expect(noAnswer.reading?.interpretation.state).toBe('withheld')
    expect([...noAnswer.headline,...noAnswer.user,...noAnswer.detail].some(metric => metric.key === 'givingRate')).toBe(false)
    expect(noAnswer.reading?.visuals).toEqual([])
  })
  it('formats fractional words per planned round as a count in both R3 reports, preserving old units', () => {
    const seed = current.find(seed => seed.testType === 'semanticfluency')!
    const entry = requireCognitiveRegistryEntry(seed.testType, seed.engineVersion, seed.scoringVersion)
    const frozen = readFrozenReport(freezeAssignmentProfile({ entry, baseConfig: seed.config, profile: 'experience' }).resolvedReportSnapshotEncrypted)!
    expect(entry.metricDefinitions.uniqueValidPerTrial.unit).toBe('ratio')
    expect(frozen.metricDefinitions.uniqueValidPerTrial.unit).toBe('count')
    const metrics = { uniqueValidCount: 5, uniqueValidPerTrial: 2.5, emptyTrialCount: 0 }
    const report = projectThreeLayerReport({ ...seed, profile: 'experience', protocolSignature: 'synthetic-report-only',
      participantPresentation: frozen.participantPresentation,
      definition: frozen.v2ReportDefinition!, metricDefinitions: frozen.v2MetricDefinitions!, qualityDefinitions: frozen.v2QualityDefinitions!, metrics,
      score: { metrics, quality: { state: 'interpretable', flags: {}, reasons: [] }, audit: { trialCount: 2, scorerVersion: seed.scoringVersion } },
    })
    expect(report.user.find(metric => metric.key === 'uniqueValidPerTrial')?.formatted).toBe('2.5')
    expect(report.reading?.feedback.summary).toContain('2.5 个')
    expect(report.reading?.feedback.summary).not.toContain('250%')
    const single = buildCognitiveSingleTaskReport({ ...seed, profile: 'experience', frozenReport: frozen, score: 99, metrics, qualityFlags: { interpretable: true }, reference: null })!
    expect(single.primaryMetrics.find(metric => metric.key === 'uniqueValidPerTrial')?.formatted).toBe('2.5')
  })

})
