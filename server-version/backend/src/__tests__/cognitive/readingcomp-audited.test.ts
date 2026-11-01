import { describe, expect, it } from 'vitest'
import { scoreReadingcompV11 as score } from '../../modules/cognitive/scoring/readingcomp.v1.1'
import { scoreReadingcompV1 as legacyScore } from '../../modules/cognitive/scoring/readingcomp.v1'
import { READINGCOMP_BANK as bank } from '../../modules/cognitive/tasks/readingcomp/bank'
import { readingcompAuditedConfigSchema as schema } from '../../modules/cognitive/schemas/readingcomp.v1.1.config'
import { executionEntries } from '../../modules/cognitive/tasks/readingcomp/package'
import { participantPresentations } from '../../modules/cognitive/tasks/readingcomp/participant-presentation'
import fixture from '../../modules/cognitive/tasks/readingcomp/fixtures/1.0.0-1.0.0.json'

const config = { totalTrials: 4, stimulusSetVersion: 'readingcomp-zh-v1.1.0', fixationMs: 400, timeoutMs: 15000, validRtFloorMs: 300, report: { reportVersion: '1.1.0', referenceMode: 'none' as const } }
const trials = () => bank.slice(0, 4).map((item, trialIndex) => ({ trialIndex, payload: { itemId: item.id, responseIndex: item.answer as number | null, rtMs: 500 as number | null, interrupted: false } }))

describe('readingcomp audited scoring contract', () => {
  it('recommends only the audited identity for new creation while retaining legacy scoring', () => {
    expect(executionEntries[0].recommendedForCreate).toBe(false)
    expect(executionEntries[1].recommendedForCreate).toBe(true)
    expect(executionEntries[0].engineVersion).toBe('1.0.0')
    expect(executionEntries[0].score).toBe(legacyScore)
  })

  it('preserves frozen legacy fixtures and separates execution/report identities', () => {
    for (const entry of fixture.cases) {
      if ('expectedError' in entry) expect(() => legacyScore(entry.input as never)).toThrow(entry.expectedError)
      else expect(legacyScore(entry.input as never)).toEqual(entry.expected)
    }
    expect(executionEntries.map(entry => [entry.engineVersion, entry.scoringVersion])).toEqual([['1.0.0','1.0.0'], ['1.1.0','1.1.0']])
    expect(participantPresentations.map(entry => [entry.engineVersion, entry.scoringVersion, entry.presentationVersion])).toEqual([['1.0.0','1.0.0','1.0.0'], ['1.1.0','1.1.0','1.1.0']])
  })
  it('uses formal denominator and distinguishes correct, error, timeout and missing RT', () => {
    const data = trials()
    data[1].payload.rtMs = 700
    data[2].payload.responseIndex = (data[2].payload.responseIndex! + 1) % 4
    data[3].payload.responseIndex = null; data[3].payload.rtMs = null
    expect(score({ config, trials: data })).toMatchObject({ score: 50, showProductIndex: false, metrics: { accuracy: 0.5, correctCount: 2, answeredCount: 3, errorCount: 1, timeoutCount: 1, medianRtMs: 600, validRtCount: 2 } })
  })
  it('retains genuine zero-correct responses and does not pretend all-timeouts are ability zero', () => {
    const wrong = trials().map(trial => ({ ...trial, payload: { ...trial.payload, responseIndex: (trial.payload.responseIndex! + 1) % 4 } }))
    expect(score({ config, trials: wrong })).toMatchObject({ metrics: { accuracy: 0, answeredCount: 4, errorCount: 4, timeoutCount: 0, medianRtMs: null }, qualityFlags: { interpretable: true, noResponses: false } })
    const empty = trials().map(trial => ({ ...trial, payload: { ...trial.payload, responseIndex: null, rtMs: null } }))
    expect(score({ config, trials: empty })).toMatchObject({ metrics: { accuracy: 0, answeredCount: 0, errorCount: 0, timeoutCount: 4, medianRtMs: null }, qualityFlags: { interpretable: false, noResponses: true } })
  })
  it('excludes interrupted and too-fast responses from RT only and rejects impossible times', () => {
    const data = trials(); data[0].payload.rtMs = 0; data[1].payload.interrupted = true
    expect(score({ config, trials: data })).toMatchObject({ metrics: { correctCount: 4, validRtCount: 2, medianRtMs: 500 }, qualityFlags: { interrupted: true } })
    data[0].payload.rtMs = 15001; expect(() => score({ config, trials: data })).toThrow()
    data[0].payload.rtMs = null; expect(() => score({ config, trials: data })).toThrow()
  })
  it('refuses duplicate, unknown, practice, extra or incomplete formal records', () => {
    const data = trials(); data[1].payload.itemId = data[0].payload.itemId
    expect(() => score({ config, trials: data })).toThrow()
    data[1].payload.itemId = 'rc-practice-1'; expect(() => score({ config, trials: data })).toThrow()
    expect(() => score({ config, trials: trials().slice(0, 3) })).toThrow()
    expect(() => score({ config, trials: [...trials(), { ...trials()[0], trialIndex: 9 }] })).toThrow()
  })
  it('binds finite capacity, descriptive report and each original profile count', () => {
    for (const count of [18, 30, 36]) expect(schema.safeParse({ ...config, totalTrials: count }).success).toBe(true)
    expect(schema.safeParse({ ...config, totalTrials: 37 }).success).toBe(false)
    expect(schema.safeParse({ ...config, stimulusSetVersion: 'readingcomp-zh-v1.0.0' }).success).toBe(false)
    expect(schema.safeParse({ ...config, report: { reportVersion: '1.0.0', referenceMode: 'simulated' } }).success).toBe(false)
    expect(schema.safeParse({ ...config, validRtFloorMs: 15000 }).success).toBe(false)
  })
  it('keeps rc2-35 correct answer within the stated restoration evidence', () => {
    const item = bank.find(candidate => candidate.id === 'rc2-35')!
    expect(item.options[item.answer]).toBe('展示修复结果与原始资料的可核查性')
    expect(item.passage).toContain('另存修复副本')
    expect(item.passage).toContain('保留原件')
    expect(item.passage).toContain('记录改动位置')
    expect(item.options[item.answer]).not.toContain('清晰度')
  })
  it('has editorial explanations and no copied analogy report text', () => {
    for (const item of bank) { expect(item.explanation.length).toBeGreaterThan(8); expect(new Set(item.options).size).toBe(4) }
    const report = participantPresentations[1]
    expect(JSON.stringify(report.reportReading)).not.toMatch(/类比|词对|套关系|关系类型/)
    expect(report.reportReading!.withholdFlags).not.toContain('insufficientValidRt')
  })
})
