import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { executionEntries } from '../../modules/cognitive/tasks/auditorynback/package'
import { seeds } from '../../modules/cognitive/tasks/auditorynback/seeds'
import { generateAuditoryNbackSequence, generateAuditoryNbackFixedSequence } from '../../modules/cognitive/tasks/auditorynback/generator'
import { generateAuditoryNbackFixedSequence as frontendSequence } from '../../../../frontend/src/modules/cognitive/tasks/auditorynback/generator'
import { scoreAuditorynbackV1, scoreAuditorynbackV11 } from '../../modules/cognitive/scoring/auditorynback.v1'

const base = seeds[1].config as any
const trialsFor = (sequence: number[], n: number) => sequence.map((toneIndex, trialIndex) => ({trialIndex, payload: {trialIndex, toneIndex, responded: trialIndex >= n && toneIndex === sequence[trialIndex - n], rtMs: trialIndex >= n && toneIndex === sequence[trialIndex - n] ? 300 : null, interrupted: false, audioLatencyMs: 10}}))

describe('versioned auditory n-back fixed opportunities', () => {
  it('retains the reachable old shortfall and the old golden output', () => {
    const sequence = generateAuditoryNbackSequence('r2-counterexample', 12, 2, .3, 5)
    const scored = scoreAuditorynbackV1({config: {...base, totalTrials: 12}, randomSeed:'r2-counterexample', trials:trialsFor(sequence,2)})
    expect(scored.metrics.matchCount).toBe(3)
    expect(scored.metrics.hitRate).toBe(1)
    expect(scored.qualityFlags.insufficientTargets).toBe(true)
    expect(scored.qualityFlags.interpretable).toBe(false)
    const fixture = JSON.parse(readFileSync(new URL('../../modules/cognitive/tasks/auditorynback/fixtures/1.0.1-1.0.0.json',import.meta.url),'utf8')).cases[0]
    expect(scoreAuditorynbackV1(fixture.input)).toEqual(fixture.expected)
  })
  it('supplies both actual denominators in every new profile, with identical frontend sequence and unchanged score formula', () => {
    const entry = executionEntries[1]
    for (const [profile, count, targets] of [['experience',22,6],['standard',40,11],['research',60,17]] as const) {
      const config = entry.configSchema.parse({...base, ...entry.profiles[profile]!.configPatch}) as typeof base
      expect(config.totalTrials).toBe(count)
      for (const seed of ['r2-counterexample','fixture-seed']) {
        const sequence = generateAuditoryNbackFixedSequence(seed,count,2,.3,5)
        expect(frontendSequence(seed,count,2,.3,5)).toEqual(sequence)
        const matches = sequence.map((v,i)=>i>=2 && v===sequence[i-2]).slice(2)
        expect(matches.filter(Boolean)).toHaveLength(targets)
        expect(matches.some((_,i)=>matches[i] && matches[i+1] && matches[i+2])).toBe(false)
        const score = scoreAuditorynbackV11({config, randomSeed:seed, trials:trialsFor(sequence,2)})
        expect(score.metrics).toMatchObject({matchCount:targets,nonmatchCount:count-2-targets,hitRate:1,falseAlarmRate:0,medianHitRtMs:300})
        expect(score.qualityFlags.insufficientTargets).toBe(false)
        expect(score.qualityFlags.stimulusEchoMismatch).toBe(false)
      }
    }
  })
  it('rejects structurally insufficient new configs and incomplete FINAL without weakening the old schema', () => {
    expect(executionEntries[0].configSchema.safeParse({...base,totalTrials:12}).success).toBe(true)
    expect(executionEntries[1].configSchema.safeParse({...base,totalTrials:12}).success).toBe(false)
    const config={...base,totalTrials:22}
    const sequence=generateAuditoryNbackFixedSequence('fixture-seed',22,2,.3,5)
    expect(()=>scoreAuditorynbackV11({config,randomSeed:'fixture-seed',trials:trialsFor(sequence,2).slice(1)})).toThrow('expects exactly 22 trials')
  })
})
