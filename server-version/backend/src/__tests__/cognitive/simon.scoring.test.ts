import { describe, expect, it } from 'vitest'
import { scoreSimon } from '../../modules/cognitive/tasks/simon/scorer'
import { SIMON_CONFIG, simonTrialSchema, type SimonTrial } from '../../modules/cognitive/tasks/simon/schema'
import { mappingForSeed, simonSequence } from '../../modules/cognitive/tasks/simon/sequence'
import type { AuthoritativeScorerInput, TrialEnvelope } from '../../modules/cognitive/v2/types'
const rows = (seed = 'golden'): TrialEnvelope<SimonTrial>[] => simonSequence(seed, 100).map((s, i) => ({ schemaVersion: 1, trialIndex: i, phase: 'test', condition: s.requiredSide === s.stimulusSide ? 'congruent' : 'incongruent', startedAtPerfMs: i * 3000, endedAtPerfMs: i * 3000 + 2000, durationMs: 2000, flags: { timeout: false, premature: false }, qualityEvents: [], payload: { timing: { strategy: 'double-raf-performance-v1', onsetPerfMs: i * 3000, windowEndPerfMs: i * 3000 + 2000, isiMs: s.isiMs }, color: s.color, stimulusSide: s.stimulusSide, requiredSide: s.requiredSide, mapping: s.mapping, responseSide: s.requiredSide, rtMs: s.requiredSide === s.stimulusSide ? 400 : 500, timeout: false, interrupted: false } }))
const score = (trials = rows(), seed = 'golden') => scoreSimon({ config: SIMON_CONFIG, trials, randomSeed: seed } as AuthoritativeScorerInput<typeof SIMON_CONFIG, SimonTrial>)
describe('Simon native independent golden', () => {
 it('balances all four cells, both mappings, and repeats seed exactly', () => {
  const mappings = new Set<string>()
  for (let i = 0; i < 20; i++) {
   const seed = String(i), seq = simonSequence(seed, 100); mappings.add(mappingForSeed(seed))
   expect(seq).toEqual(simonSequence(seed, 100))
   for (const color of ['red', 'blue']) for (const side of ['left', 'right']) expect(seq.filter(t => t.color === color && t.stimulusSide === side)).toHaveLength(25)
   expect(seq.every(t => t.isiMs >= 500 && t.isiMs <= 999)).toBe(true)
   expect(score(rows(seed), seed).metrics.simonEffectMeanMs).toBe(100)
  }
  expect([...mappings].sort()).toEqual(['blue-left', 'red-left'])
 })
 it('golden 400/500 => signed +100 with no numeric legacy score', () => {
  const result = score(); expect(result.metrics).toMatchObject({ accuracy: 1, congruentMeanRtMs: 400, incongruentMeanRtMs: 500, simonEffectMeanMs: 100, congruentValidCount: 50, incongruentValidCount: 50 }); expect(result.quality.state).toBe('interpretable'); expect(result).not.toHaveProperty('score')
 })
 it('wrong presses cannot change condition and all-wrong RT is null', () => {
  const trials = rows(); trials.forEach(r => r.payload.responseSide = r.payload.requiredSide === 'left' ? 'right' : 'left')
  expect(score(trials).metrics).toMatchObject({ accuracy: 0, meanRtMs: null, simonEffectMeanMs: null, validTrialCount: 0 })
 })
 it('0ms correct counts accuracy but not RT; 0.1 and 1999.99 are valid; 2000 is rejected', () => {
  const trials = rows(); trials[0].payload.rtMs = 0; trials[1].payload.rtMs = 0.1; trials[2].payload.rtMs = 1999.99
  expect(score(trials).metrics).toMatchObject({ accuracy: 1, validTrialCount: 99 })
  expect(simonTrialSchema.safeParse({ ...trials[0].payload, rtMs: 2000 }).success).toBe(false)
  expect(simonTrialSchema.safeParse({ ...trials[0].payload, rtMs: NaN }).success).toBe(false)
 })
 it('missing one condition gives null effect, not zero', () => {
  const trials = rows(); trials.filter(r => r.condition === 'incongruent').forEach(r => r.payload.responseSide = r.payload.requiredSide === 'left' ? 'right' : 'left')
  expect(score(trials).metrics.simonEffectMeanMs).toBeNull(); expect(score(trials).quality.flags.missingCondition).toBe(true)
 })
 it('interruptions excluded, timeouts retained in accuracy denominator', () => {
  const trials = rows(); trials[0].payload.interrupted = true; trials[1].payload = { ...trials[1].payload, responseSide: null, rtMs: null, timeout: true }; trials[1].flags.timeout = true
  expect(score(trials).metrics).toMatchObject({ accuracy: 98 / 99, timeoutCount: 1, interruptedCount: 1 })
  trials.forEach(r => r.payload.interrupted = true); expect(score(trials).metrics.accuracy).toBeNull()
 })
 it('rejects altered seed, mapping, condition, practice, indices and configuration', () => {
  for (const mutate of [(r: TrialEnvelope<SimonTrial>) => { r.payload.mapping = r.payload.mapping === 'red-left' ? 'blue-left' : 'red-left' }, (r: TrialEnvelope<SimonTrial>) => { r.condition = r.condition === 'congruent' ? 'incongruent' : 'congruent' }, (r: TrialEnvelope<SimonTrial>) => { r.phase = 'learning' }, (r: TrialEnvelope<SimonTrial>) => { r.trialIndex = 99 }]) { const trials = rows(); mutate(trials[0]); expect(() => score(trials)).toThrow() }
  expect(() => score(rows(), 'tampered')).toThrow(); expect(score([]).quality.state).toBe('invalid')
 })
})

import fixture from '../../modules/cognitive/tasks/simon/fixtures/1.0.0-1.0.0.json'
it('matches independently authored complete/empty/all-wrong fixture outputs', () => {
 for (const c of fixture.cases) expect(scoreSimon({ ...c.input, trials: c.input.trials.map(t => t.envelope) } as unknown as AuthoritativeScorerInput<typeof SIMON_CONFIG, SimonTrial>)).toEqual(c.expected)
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
it('keeps frontend and backend versioned seed generation byte-identical', () => {
 expect(readFileSync(resolve(process.cwd(), 'src/modules/cognitive/tasks/simon/sequence.ts'), 'utf8')).toBe(readFileSync(resolve(process.cwd(), '../frontend/src/modules/cognitive/tasks/simon/sequence.ts'), 'utf8'))
})

it('rejects missing condition and flags shortened windows technically invalid', () => {
 const trials = rows(); delete trials[0].condition; expect(() => score(trials)).toThrow('condition')
 const short = rows(); short[0].endedAtPerfMs = short[0].startedAtPerfMs + 1999; short[0].durationMs = 1999; short[0].payload.timing.windowEndPerfMs = short[0].endedAtPerfMs
 expect(score(short).metrics.interruptedCount).toBe(1)
 const malformed = rows(); malformed[0].durationMs = 50; expect(() => score(malformed)).toThrow()
})
it('independently verifies all eight source mapping vectors including inverted mapping B', () => {
 const vectors = JSON.parse(readFileSync(resolve(process.cwd(), '../../docs/cognitive-library/simon/golden-vectors.json'), 'utf8')).mapping_vectors as Array<{ mapping: string; color: string; stimulus_side: string; expected_correct_key: number; expected_condition: string }>
 for (const vector of vectors) {
  const targetMapping = vector.mapping === 'A' ? 'red-left' : 'blue-left'
  const seed = Array.from({ length: 100 }, (_, i) => String(i)).find(s => mappingForSeed(s) === targetMapping)!
  const trial = simonSequence(seed,100).find(t => t.color === vector.color && t.stimulusSide === vector.stimulus_side)!
  expect(trial.requiredSide).toBe(vector.expected_correct_key === 37 ? 'left' : 'right')
  expect(trial.requiredSide === trial.stimulusSide ? 'congruent' : 'incongruent').toBe(vector.expected_condition)
 }
})

it('rejects disagreement between exported and scored timeout', () => { const trials = rows(); trials[0].flags.timeout = true; expect(() => score(trials)).toThrow('timeout flag') })
it('requires observed timing and exact envelope binding; null onset is invalid, never interpretable', () => {
 const missing = rows(); delete (missing[0].payload as Partial<SimonTrial>).timing; expect(() => score(missing)).toThrow()
 const start = rows(); start[0].payload.timing.onsetPerfMs = 1; expect(() => score(start)).toThrow('timing envelope')
 const end = rows(); end[0].payload.timing.windowEndPerfMs += 1; expect(() => score(end)).toThrow('timing envelope')
 const isi = rows(); isi[0].payload.timing.isiMs = isi[0].payload.timing.isiMs === 500 ? 501 : 500; expect(() => score(isi)).toThrow('ISI seed')
 const absent = rows(); absent.forEach(r => { r.payload.timing.onsetPerfMs = null; r.startedAtPerfMs = r.endedAtPerfMs; r.durationMs = 0 })
 expect(score(absent).quality.state).toBe('invalid'); expect(score(absent).metrics.accuracy).toBeNull()
})
