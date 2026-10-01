import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { listCognitiveRegistryEntries, requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { resolveParticipantPresentation } from '../../modules/cognitive/participant-presentation'
import { freezeAssignmentProfile, readFrozenReport } from '../../modules/cognitive/profile-freeze'
import { getCognitiveV2TaskDefinition, buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { projectThreeLayerReport, referencesForReportReading } from '../../modules/cognitive/v2/report'
import { compileCognitiveRuntime } from '../../modules/assessment-runtime/compiler'
import { COGNITIVE_SEEDS } from '../../../prisma/seeds/cognitive'
import type { CognitiveProfile, CognitiveScoreResult } from '../../modules/cognitive/v2/types'

const previousKey = process.env.DATA_ENCRYPTION_KEY
afterEach(() => { if (previousKey === undefined) delete process.env.DATA_ENCRYPTION_KEY; else process.env.DATA_ENCRYPTION_KEY = previousKey })

const reactionInput = (valid = 18, interrupted = false) => ({
  config: COGNITIVE_SEEDS.find(s => s.testType === 'reaction' && s.configVersion === '1.1.0')!.config,
  trials: Array.from({ length: 20 }, (_, i) => ({ trialIndex: i, payload: { foreperiodMs: 800, rtMs: i < valid ? [280, 305, 310, 295, 330, 315, 300, 290, 340, 325, 310, 300, 320, 355, 305, 295, 310, 335][i] : null, prematureCount: i === 4 ? 1 : 0, interrupted: interrupted && i === 4, inputMode: 'pointer' } })),
})

function project(testType: string, scoringVersion: string, metrics: Record<string, unknown>, score: CognitiveScoreResult, profile: CognitiveProfile = 'standard', extras: { trials?: unknown[]; config?: Record<string, unknown> } = {}) {
  const entry = requireCognitiveRegistryEntry(testType, '1.0.0', scoringVersion)
  const definition = getCognitiveV2TaskDefinition(testType, '1.0.0', scoringVersion)!
  return projectThreeLayerReport({ testType, engineVersion: '1.0.0', scoringVersion, configVersion: scoringVersion, protocolSignature: 'test', profile,
    definition: definition.report, metrics, score, metricDefinitions: definition.metrics, qualityDefinitions: definition.quality,
    participantPresentation: resolveParticipantPresentation(entry), reportCaveats: entry.profiles[profile]!.reportCaveats, ...extras })
}

describe('versioned participant report interpretation', () => {
  it.each([5, 0])('withholds speed for %i/20 valid responses while preserving actual completion counts', valid => {
    const input = reactionInput(valid)
    const scored = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')!.scorer(input as never)
    const report = project('reaction', '1.1.0', scored.metrics, scored, 'standard', input)
    expect(scored.quality.state).toBe('limited')
    expect(report.reading!.interpretation.state).toBe('withheld')
    expect([...report.headline, ...report.user, ...report.detail].some(m => ['medianRtMs', 'rtICV', 'meanRtMs'].includes(m.key))).toBe(false)
    expect([...report.headline, ...report.user].find(m => m.key === 'validTrialCount')!.value).toBe(valid)
    expect(report.reading!.feedback.evidenceMetricKeys).toEqual([])
    expect(report.reading!.visuals).toEqual([])
    expect(referencesForReportReading(report, [{ metricKey: 'medianRtMs' }, { metricKey: 'validTrialCount' }])).toEqual([{ metricKey: 'validTrialCount' }])
  })
  it('uses real metrics, exact valid RT boundaries and explicit missing graph points', () => {
    const input = reactionInput()
    input.trials[0].payload.rtMs = 99
    input.trials[1].payload.rtMs = 2001
    const scored = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')!.scorer(input as never)
    const report = project('reaction', '1.1.0', scored.metrics, scored, 'standard', input)
    expect(report.reading!.feedback.summary).toContain(String(scored.metrics.validTrialCount))
    expect(report.reading!.visuals[0].points.slice(0, 2).map(p => p.value)).toEqual([null, null])
    expect(report.reading!.visuals[0].points.some(p => p.value === 0)).toBe(false)
    expect(report.reading!.visuals[0].points.filter(p => p.value !== null).length).toBe(scored.metrics.validTrialCount)
    const reordered = project('reaction', '1.1.0', scored.metrics, scored, 'standard', { ...input, trials: [...input.trials].reverse() })
    expect(reordered.reading!.visuals).toEqual(report.reading!.visuals)
  })
  it('qualifies interrupted records without turning interruption into a diagnosis', () => {
    const input = reactionInput(18, true)
    const scored = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')!.scorer(input as never)
    const report = project('reaction', '1.1.0', scored.metrics, scored, 'standard', input)
    expect(report.reading!.interpretation.state).toBe('qualified')
    expect(report.headline[0].key).toBe('medianRtMs')
    expect(report.reading!.interpretation.reasons).toContain('作答期间出现中断')
  })
  it('gates SST estimates locally while retaining permitted go/stop process records', () => {
    const metrics = { ssrtMs: 220, pRespondStop: 0.5, goMedianRtMs: 460, goOmissionRate: 0.1, goChoiceErrorRate: 0.05 }
    const score: CognitiveScoreResult = { metrics, quality: { state: 'limited', flags: { strategicSlowingSuspected: true, legacyUninterpretable: true }, reasons: [] }, audit: { trialCount: 96, scorerVersion: '1.0.0' } }
    const report = project('sst', '1.0.0', metrics, score)
    expect([...report.headline, ...report.user, ...report.detail].some(m => m.key === 'ssrtMs')).toBe(false)
    expect([...report.headline, ...report.user, ...report.detail].some(m => m.key === 'goMedianRtMs')).toBe(true)
    expect(report.reading!.caveats.join(' ')).toContain('不是临床抑制分数')
    const experience = project('sst', '1.0.0', metrics, { ...score, quality: { state: 'interpretable', flags: {}, reasons: [] } }, 'experience')
    expect(experience.headline[0].key).toBe('pRespondStop')
    expect(experience.reading!.feedback.evidenceMetricKeys).not.toContain('ssrtMs')
  })
  it('describes low accuracy without treating all task measurements as technically invalid', () => {
    const metrics = { accuracy: 0.4, incongruentAccuracy: 0.35, congruentAccuracy: 0.45, flankerEffectMs: 30 }
    const score: CognitiveScoreResult = { metrics, quality: { state: 'limited', flags: { lowAccuracy: true, legacyUninterpretable: true }, reasons: [] }, audit: { trialCount: 80, scorerVersion: '1.0.0' } }
    const report = project('flanker', '1.0.0', metrics, score)
    expect(report.reading!.interpretation.state).toBe('qualified')
    expect(report.user.some(m => m.key === 'incongruentAccuracy')).toBe(true)
  })
  it('does not imply a personal upper limit at the memory protocol ceiling', () => {
    const fixture = JSON.parse(readFileSync(new URL('../../modules/cognitive/tasks/memory/fixtures/1.0.0-1.1.0.json', import.meta.url), 'utf8')).cases[0].input
    const task = getCognitiveV2TaskDefinition('memory', '1.0.0', '1.1.0')!
    const scored = task.scorer(fixture)
    const report = project('memory', '1.1.0', scored.metrics, scored, 'standard', { ...fixture, config: { ...fixture.config, maxLength: scored.metrics.maxSpan } })
    expect(report.reading!.caveats.join(' ')).toContain('不能据此认定个人记忆上限')
    expect(JSON.stringify(report.reading!.visuals)).not.toContain('sequence')
  })
  it('keeps N-back difficulty values separate and preserves signed d-prime values', () => {
    const metrics = { maxReliableN: 2, dPrimeByN: { '1': 1.2, '2': -0.4 } }
    const report = project('nback', '1.0.0', metrics, { metrics, quality: { state: 'interpretable', flags: {}, reasons: [] }, audit: { trialCount: 40, scorerVersion: '1.0.0' } })
    expect(report.reading!.visuals[0].unit).toBe('d-prime')
    expect(report.reading!.visuals[0].points).toEqual([{ label: '1-back', value: 1.2 }, { label: '2-back', value: -0.4 }])
  })
  it('reads task categories and learning rounds with their actual units and missing values', () => {
    for (const testType of ['matrix', 'pairedassociate', 'picturesequence']) {
      const fixture = JSON.parse(readFileSync(new URL(`../../modules/cognitive/tasks/${testType}/fixtures/1.0.0-1.0.0.json`, import.meta.url), 'utf8')).cases[0].input
      const task = getCognitiveV2TaskDefinition(testType, '1.0.0', '1.0.0')!
      const scored = task.scorer(fixture)
      const report = project(testType, '1.0.0', scored.metrics, scored)
      const key = testType === 'matrix' ? 'accuracyByRuleFamily' : testType === 'pairedassociate' ? 'correctByTrial' : 'positionScoreByRound'
      const record = [...report.headline, ...report.user, ...report.detail].find(m => m.key === key)!
      expect(record).toBeDefined()
      expect(record.formatted).not.toContain('-back')
      expect(record.formatted).toContain(testType === 'matrix' ? '递进规律：100%' : testType === 'pairedassociate' ? '第 1 轮：' : '第 1 轮：0%')
      if (testType === 'pairedassociate') {
        expect(record.formatted).toContain(' 次')
        const missing = project(testType, '1.0.0', { ...scored.metrics, correctByTrial: [null, 2] }, scored)
        expect(missing.detail.find(m => m.key === key)?.formatted ?? missing.user.find(m => m.key === key)?.formatted).toBe('第 1 轮：—；第 2 轮：2 次')
      }
    }
  })
  it('freezes display policies and caveats without changing compiled runtime or historical projections', () => {
    process.env.DATA_ENCRYPTION_KEY = '1'.repeat(64)
    const entry = requireCognitiveRegistryEntry('reaction', '1.0.0', '1.1.0')
    const input = reactionInput()
    const frozen = readFrozenReport(freezeAssignmentProfile({ entry, baseConfig: input.config, profile: 'standard' }).resolvedReportSnapshotEncrypted)!
    const scored = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')!.scorer(input as never)
    const base = { testType: 'reaction', engineVersion: '1.0.0', scoringVersion: '1.1.0', configVersion: '1.1.0', protocolSignature: 'test', profile: 'standard' as const, definition: frozen.v2ReportDefinition!, metrics: scored.metrics, score: scored, metricDefinitions: frozen.v2MetricDefinitions!, qualityDefinitions: frozen.v2QualityDefinitions! }
    const before = projectThreeLayerReport({ ...base, participantPresentation: frozen.participantPresentation, reportCaveats: frozen.reportCaveats })
    const presentation = resolveParticipantPresentation(entry)!
    const policy = structuredClone(presentation.reportReading!)
    const runtime = compileCognitiveRuntime({ definition: buildCognitiveV2TaskDefinition(entry) })
    try {
      presentation.reportReading!.title = 'new live title'
      presentation.reportReading!.withholdFlags.push('interrupted')
      expect(projectThreeLayerReport({ ...base, participantPresentation: frozen.participantPresentation, reportCaveats: frozen.reportCaveats })).toEqual(before)
      expect(compileCognitiveRuntime({ definition: buildCognitiveV2TaskDefinition(entry) })).toEqual(runtime)
      const historical = structuredClone(frozen.participantPresentation!)
      delete historical.reportReading
      expect(projectThreeLayerReport({ ...base, participantPresentation: historical }).schemaVersion).toBeUndefined()
    } finally { presentation.reportReading = policy }
  })
  it('covers exact identities with valid display references and never projects research-only metrics', () => {
    const families = new Set<string>()
    for (const entry of listCognitiveRegistryEntries().filter(e => e.testType !== 'fake')) {
      families.add(entry.testType)
      const policy = resolveParticipantPresentation(entry)!.reportReading!
      expect(policy).toBeDefined()
      const definition = getCognitiveV2TaskDefinition(entry.testType, entry.engineVersion, entry.scoringVersion)!
      for (const key of [...policy.summary.metricKeys, ...policy.studentMetricKeys, ...policy.processMetricKeys, ...(policy.chart?.metricKeys ?? [])]) expect(definition.metrics[key], `${entry.testType}/${key}`).toBeDefined()
      const metrics = Object.fromEntries(Object.keys(definition.metrics).map(key => [key, 1]))
      const report = project(entry.testType, entry.scoringVersion, metrics, { metrics, quality: { state: 'interpretable', flags: {}, reasons: [] }, audit: { trialCount: 1, scorerVersion: entry.scoringVersion } }, 'research')
      expect([...report.headline, ...report.user, ...report.detail].some(m => definition.metrics[m.key].role === 'research_only')).toBe(false)
    }
    expect(families.size).toBe(24)
  })
})
