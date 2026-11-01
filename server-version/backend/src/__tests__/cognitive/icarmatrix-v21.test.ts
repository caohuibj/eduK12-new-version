import { describe, expect, it } from 'vitest'
import { generateIcarmatrixV2Plan, ICARMATRIX_V2_BANK, icarmatrixV2OptionOrder } from '../../modules/cognitive/tasks/icarmatrix/generator-v21'
import { generateIcarmatrixV2Plan as frontendPlan } from '../../../../frontend/src/modules/cognitive/tasks/icarmatrix/generator-v21'
import { scoreIcarmatrixV21 } from '../../modules/cognitive/scoring/icarmatrix.v21'
import { icarmatrixV21ConfigSchema } from '../../modules/cognitive/schemas/icarmatrix-v21.config'
import { executionEntries } from '../../modules/cognitive/tasks/icarmatrix/package'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { buildCognitiveSingleTaskReport } from '../../modules/cognitive/single-task-report'
import { resolveParticipantPresentation } from '../../modules/cognitive/participant-presentation'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'

const config = { totalTrials: 4, matrixType: '3x3' as const, stimulusSetVersion: 'matgen-reviewed-v1.0.0' as const,
  fixationMs: 400, timeoutMs: 30000, validRtFloorMs: 500, report: { reportVersion: '1.1.0', referenceMode: 'none' as const } }
const makeTrials = () => generateIcarmatrixV2Plan('seed-1', 4, '3x3').map((bankIndex, trialIndex) => {
  const item = ICARMATRIX_V2_BANK[bankIndex]
  return { trialIndex, payload: { trialIndex, bankItemId: item.itemId,
    responseIndex: icarmatrixV2OptionOrder('seed-1', trialIndex, item.responses.length).indexOf(0) as number | null,
    rtMs: 1500 as number | null, interrupted: false } }
})
const score = (trials = makeTrials()) => scoreIcarmatrixV21({ config, randomSeed: 'seed-1', trials })

describe('reviewed seven-item matrix pilot', () => {
  it('has exactly one geometrically matching answer for every retained missing figure', () => {
    // Independent manual solutions from the eight visible cells:
    // 001: Latin-square shape cycle; 002: repeated rows; 003: repeated columns.
    // All three require the original-size outline triangle pointing up.
    // 006: -45° per row/column; 007: -45° per column; 008: -45° per row.
    // 009: -45° per row, light-to-dark per column, so the missing figure is black.
    const targets: Record<string, { vertices: number; angle: number; fill: string }> = {
      '001': { vertices: 3, angle: -90, fill: 'none' },
      '002': { vertices: 3, angle: -90, fill: 'none' },
      '003': { vertices: 3, angle: -90, fill: 'none' },
      '006': { vertices: 200, angle: 0, fill: 'none' },
      '007': { vertices: 200, angle: 90, fill: 'none' },
      '008': { vertices: 200, angle: 90, fill: 'none' },
      '009': { vertices: 200, angle: 90, fill: '#000000' },
    }
    for (const item of ICARMATRIX_V2_BANK.filter(item => targets[item.itemId.slice(-3)])) {
      const target = targets[item.itemId.slice(-3)]
      const matches = item.responses.map((response, responseIndex) => {
        const polygons = [...response.svg.matchAll(/<polygon\b([^>]+)>/g)]
        if (polygons.length !== 1) return -1
        const attrs = polygons[0][1]
        const points = attrs.match(/points='([^']+)'/)![1].trim().split(/\s+/).map(pair => pair.split(',').map(Number))
        if (points.length !== target.vertices) return -1
        const radius = Math.max(...points.map(([x, y]) => Math.hypot(x - 41.4, y - 41.4)))
        if (Math.abs(radius - (target.vertices === 3 ? 19.79 : 21)) > 0.1) return -1
        const fill = attrs.match(/fill:\s*(#[A-Fa-f0-9]+)/)?.[1] ?? 'none'
        if (fill !== target.fill) return -1
        const vector = target.vertices === 3 ? points[0] : [
          points.reduce((sum, point) => sum + point[0], 0) / points.length,
          points.reduce((sum, point) => sum + point[1], 0) / points.length,
        ]
        const angle = Math.atan2(vector[1] - 41.4, vector[0] - 41.4) * 180 / Math.PI
        return Math.abs(angle - target.angle) < 1 ? responseIndex : -1
      }).filter(index => index >= 0)
      expect(matches, item.itemId).toEqual([item.correctResponseIndex])
    }
  })

  it('covers every retained rule family without repetition in both profiles and matches the frontend', () => {
    for (let seed = 0; seed < 100; seed += 1) for (const total of [4, 6, 7]) {
      const plan = generateIcarmatrixV2Plan(String(seed), total, '3x3')
      expect(frontendPlan(String(seed), total, '3x3')).toEqual(plan)
      expect(new Set(plan).size).toBe(total)
      expect(plan.flatMap(index => ICARMATRIX_V2_BANK[index].ruleTags)).toEqual(expect.arrayContaining(['shape', 'rotate', 'shade']))
      expect(plan).not.toContain(9) // Extra shape/rotation composition is outside this bounded pilot.
    }
    expect(icarmatrixV21ConfigSchema.safeParse({ ...config, totalTrials: 8 }).success).toBe(false)
    expect(icarmatrixV21ConfigSchema.safeParse({ ...config, matrixType: '2x2' }).success).toBe(false)
    expect(icarmatrixV21ConfigSchema.safeParse({ ...config, report: { ...config.report, referenceMode: 'simulated' } }).success).toBe(false)
    expect(executionEntries.map(entry => entry.recommendedForCreate)).toEqual([false, false, true])
  })

  it('preserves real response zero, timeout null and valid RT denominators', () => {
    const trials = makeTrials()
    trials[0].payload.responseIndex = 0
    trials[1].payload.responseIndex = null; trials[1].payload.rtMs = null
    trials[2].payload.rtMs = 200
    trials[3].payload.interrupted = true
    const result = score(trials)
    expect(result.metrics).toMatchObject({ answeredCount: 3, timeoutCount: 1, validRtCount: 1, medianRtMs: 1500 })
    expect(result.qualityFlags.interrupted).toBe(true)
    expect(score().metrics).toMatchObject({ accuracy: 1, correctCount: 4 })
    const none = makeTrials().map(trial => ({ ...trial, payload: { ...trial.payload, responseIndex: null, rtMs: null } }))
    expect(score(none)).toMatchObject({ metrics: { accuracy: 0, medianRtMs: null }, qualityFlags: { interpretable: false, excessiveTimeouts: true } })
  })

  it('rejects missing, duplicate, extra, mismatched and post-deadline observations', () => {
    expect(() => score(makeTrials().slice(1))).toThrow()
    expect(() => score([...makeTrials(), makeTrials()[0]])).toThrow()
    for (const mutate of [
      (t: ReturnType<typeof makeTrials>) => { t[1] = t[0] },
      (t: ReturnType<typeof makeTrials>) => { t[0].payload.bankItemId = 'other' },
      (t: ReturnType<typeof makeTrials>) => { t[0].payload.trialIndex = 1 },
      (t: ReturnType<typeof makeTrials>) => { t[0].payload.rtMs = 30001 },
      (t: ReturnType<typeof makeTrials>) => { t[0].payload.responseIndex = null },
    ]) { const trials = makeTrials(); mutate(trials); expect(() => score(trials)).toThrow() }
  })

  it('projects natural counts and hides rule maps and invalid performance charts', () => {
    const task = getCognitiveV2TaskDefinition('icarmatrix', '2.1.0', '1.1.0')!
    expect(task).toBeTruthy()
    const result = score()
    expect(result.showProductIndex).toBe(false)
    const single = buildCognitiveSingleTaskReport({ testType: 'icarmatrix', engineVersion: '2.1.0', scoringVersion: '1.1.0', configVersion: '2.1.0', profile: 'experience', frozenReport: null, score: result.score, metrics: result.metrics, qualityFlags: result.qualityFlags, reference: null })
    expect(single?.showProductIndex).toBe(false)
    expect(single?.productIndex).toBeNull()
    expect(single?.primaryMetrics.some(metric => metric.key === 'answeredCount')).toBe(true)
    const project = (state: 'interpretable' | 'invalid') => projectThreeLayerReport({
      testType: 'icarmatrix', engineVersion: '2.1.0', scoringVersion: '1.1.0', configVersion: '2.1.0',
      participantPresentation: resolveParticipantPresentation({ testType: 'icarmatrix', engineVersion: '2.1.0', scoringVersion: '1.1.0' }),
      protocolSignature: 'test', profile: 'experience', definition: task.report, metrics: result.metrics,
      score: { metrics: result.metrics, quality: { state, flags: result.qualityFlags, reasons: [] }, audit: { trialCount: 4, scorerVersion: '1.1.0' } },
      metricDefinitions: task.metrics, qualityDefinitions: task.quality,
    })
    const report = project('interpretable')
    expect([...report.headline, ...report.user, ...report.detail].some(metric => metric.key === 'accuracyByRuleTag')).toBe(false)
    expect(JSON.stringify(report)).not.toContain('"accuracyByRuleTag":')
    expect(report.user.some(metric => metric.key === 'answeredCount')).toBe(true)
    expect(report.disclaimer).toContain('不是原版 ICAR')
    expect(project('invalid').headline).toEqual([])
  })
})
