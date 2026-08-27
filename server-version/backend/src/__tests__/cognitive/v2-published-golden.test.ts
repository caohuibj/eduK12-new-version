import { describe, expect, it } from 'vitest'
import round1Golden from '../../../../cognitive-scoring-golden-v1.json'
import { cptSequence, corsiSequence, gonogoSequence, nbackSequence, sstSequence, taskswitchSequence } from '../../modules/cognitive/randomization'
import { createSessionConfigSnapshot } from '../../modules/cognitive/v2/session-snapshot'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
import { getCognitiveV2TaskDefinition, listCognitiveV2TaskDefinitions } from '../../modules/cognitive/v2/registry'
import { runAuthoritativeScorer } from '../../modules/cognitive/v2/authoritative-scorer'

const noneReport = { reportVersion: '1.0.0', referenceMode: 'none' as const }

type GoldenCase = {
  key: string
  testType: string
  scoringVersion: string
  configVersion: string
  config: Record<string, unknown>
  randomSeed: string
  payloads: unknown[]
  expected: {
    metrics: Record<string, unknown>
    qualityFlags: Record<string, unknown>
  }
  qualityState: 'interpretable' | 'limited' | 'invalid'
}

const makeCase = (input: Omit<GoldenCase, 'key'>): GoldenCase => ({
  ...input,
  key: `${input.testType}/${input.configVersion}/${input.scoringVersion}`,
})

const cases = (): GoldenCase[] => {
  const reactionConfig = {
    totalTrials: 5,
    foreperiodMinMs: 700,
    foreperiodMaxMs: 1500,
    timeoutMs: 2000,
    readyDurationMs: 1000,
    report: noneReport,
  }
  const reaction = makeCase({
    testType: 'reaction',
    scoringVersion: '1.1.0',
    configVersion: '1.1.0',
    config: reactionConfig,
    randomSeed: 'v2-golden-reaction',
    payloads: [250, 300, 350, 400, 450].map((rtMs, trialIndex) => ({
      foreperiodMs: 700 + trialIndex * 100,
      rtMs,
      prematureCount: trialIndex === 0 ? 1 : 0,
      interrupted: false,
      inputMode: 'pointer',
    })),
    expected: round1Golden.reaction,
    qualityState: 'limited',
  })

  const memoryConfig = {
    startLength: 2,
    maxLength: 5,
    trialsPerLevel: 2,
    digitDisplayMs: 800,
    digitIntervalMs: 200,
    readyDurationMs: 1000,
    inactivityGuardMs: 30000,
    report: noneReport,
  }
  const memoryTrial = (length: number, trialWithinLevel: 1 | 2, correct: boolean, interrupted = false) => ({
    length,
    trialWithinLevel,
    sequence: Array.from({ length }, (_, index) => index),
    response: Array.from({ length }, (_, index) => (correct || index < length - 1 ? index : 9)),
    responseDurationMs: trialWithinLevel * 100,
    interrupted,
  })
  const memory = makeCase({
    testType: 'memory',
    scoringVersion: '1.1.0',
    configVersion: '1.1.0',
    config: memoryConfig,
    randomSeed: 'v2-golden-memory',
    payloads: [
      memoryTrial(2, 1, true), memoryTrial(2, 2, false),
      memoryTrial(3, 1, true), memoryTrial(3, 2, false),
      memoryTrial(4, 1, false), memoryTrial(4, 2, false, true),
    ],
    expected: round1Golden.memory,
    qualityState: 'limited',
  })

  const stroop = makeCase({
    testType: 'stroop',
    scoringVersion: '1.1.0',
    configVersion: '1.1.0',
    config: {
      totalTrials: 4,
      congruentRatio: 0.5,
      fixationMs: 500,
      stimulusDurationMs: 2000,
      isiMs: 500,
      validRtFloorMs: 200,
      report: noneReport,
    },
    randomSeed: 'v2-golden-stroop',
    payloads: [
      { word: '红', inkColor: 'red', response: 'red', rtMs: 300, interrupted: false },
      { word: '蓝', inkColor: 'blue', response: 'blue', rtMs: 350, interrupted: false },
      { word: '红', inkColor: 'green', response: 'green', rtMs: 500, interrupted: false },
      { word: '黄', inkColor: 'blue', response: 'blue', rtMs: 550, interrupted: false },
    ],
    expected: round1Golden.stroop,
    qualityState: 'interpretable',
  })

  const gonogoSeed = 'round1-golden-gonogo'
  const gonogo = makeCase({
    testType: 'gonogo',
    scoringVersion: '1.0.0',
    configVersion: '1.0.0',
    config: { totalTrials: 8, nogoRatio: 0.25, stimulusMs: 800, isiMs: 400, validRtFloorMs: 100, report: noneReport },
    randomSeed: gonogoSeed,
    payloads: gonogoSequence(gonogoSeed, 8, 0.25).map((trialType) => ({
      trialType,
      responded: trialType === 'go',
      rtMs: trialType === 'go' ? 300 : null,
      interrupted: false,
    })),
    expected: round1Golden.gonogo,
    qualityState: 'interpretable',
  })

  const cptSeed = 'round1-golden-cpt'
  const cpt = makeCase({
    testType: 'cpt',
    scoringVersion: '1.0.0',
    configVersion: '1.0.0',
    config: { totalTrials: 12, targetRatio: 0.25, blockCount: 1, stimulusMs: 400, isiMs: 400, validRtFloorMs: 100, perseverationRtMs: 100, report: noneReport },
    randomSeed: cptSeed,
    payloads: cptSequence(cptSeed, 12, 0.25, 1).map((item) => ({
      ...item,
      responded: item.isTarget,
      rtMs: item.isTarget ? 280 : null,
      interrupted: false,
    })),
    expected: round1Golden.cpt,
    qualityState: 'interpretable',
  })

  const nbackSeed = 'round1-golden-nback'
  const nback = makeCase({
    testType: 'nback',
    scoringVersion: '1.0.0',
    configVersion: '1.0.0',
    config: { nLevels: [1], trialCountByN: [16], blockCountByN: [1], targetRatio: 0.3, stimulusMs: 400, isiMs: 800, validRtFloorMs: 100, report: noneReport },
    randomSeed: nbackSeed,
    payloads: nbackSequence(nbackSeed, [1], [16], [1], 0.3).map((item) => ({
      ...item,
      responded: item.target,
      rtMs: item.target ? 320 : null,
      interrupted: false,
    })),
    expected: round1Golden.nback,
    qualityState: 'limited',
  })

  const corsiSeed = 'round1-golden-corsi'
  const corsi = makeCase({
    testType: 'corsi',
    scoringVersion: '1.0.0',
    configVersion: '1.0.0',
    config: { startSpan: 3, maxSpan: 4, trialsPerLevel: 2, boardSize: 9, highlightMs: 400, intervalMs: 200, readyDurationMs: 400, inactivityGuardMs: 8000, report: noneReport },
    randomSeed: corsiSeed,
    payloads: [3, 3, 4, 4].map((spanLength, trialIndex) => {
      const sequence = corsiSequence(corsiSeed, trialIndex, spanLength)
      return {
        spanLength,
        trialWithinLevel: (trialIndex % 2) + 1,
        sequence,
        response: spanLength === 3 ? sequence : [...sequence].reverse(),
        responseDurationMs: 800 + trialIndex * 100,
        interrupted: false,
      }
    }),
    expected: round1Golden.corsi,
    qualityState: 'interpretable',
  })

  const sstSeed = 'round1-golden-sst'
  const sstConfig = { totalTrials: 40, stopRatio: 0.25, ssdStartMs: 250, ssdMinMs: 50, ssdMaxMs: 800, ssdStepMs: 50, goTimeoutMs: 1000, isiMs: 400, validRtFloorMs: 100, report: noneReport }
  let ssd = sstConfig.ssdStartMs
  let stopIndex = 0
  const sst = makeCase({
    testType: 'sst',
    scoringVersion: '1.0.0',
    configVersion: '1.0.0',
    config: sstConfig,
    randomSeed: sstSeed,
    payloads: sstSequence(sstSeed, 40, 0.25).map((item) => {
      if (item.trialType === 'go') {
        return { ...item, response: item.goStimulus, rtMs: 420, ssdMs: null, stopSignalPresented: false, interrupted: false }
      }
      const responded = stopIndex % 2 === 0
      stopIndex += 1
      const usedSsd = ssd
      ssd = Math.min(sstConfig.ssdMaxMs, Math.max(sstConfig.ssdMinMs, responded ? ssd - sstConfig.ssdStepMs : ssd + sstConfig.ssdStepMs))
      return { ...item, response: responded ? item.goStimulus : null, rtMs: responded ? 300 : null, ssdMs: usedSsd, stopSignalPresented: true, interrupted: false }
    }),
    expected: round1Golden.sst,
    qualityState: 'interpretable',
  })

  const taskswitchSeed = 'round1-golden-taskswitch'
  const taskswitch = makeCase({
    testType: 'taskswitch',
    scoringVersion: '1.0.0',
    configVersion: '1.0.0',
    config: { totalTrials: 48, switchRatio: 0.5, blockCount: 2, includePureBlocks: false, cueMs: 200, stimulusMs: 800, isiMs: 200, validRtFloorMs: 150, report: noneReport },
    randomSeed: taskswitchSeed,
    payloads: taskswitchSequence(taskswitchSeed, 48, 2, 0.5, false).map((item) => ({
      blockIndex: item.blockIndex,
      taskRule: item.taskRule,
      previousTaskRule: item.previousTaskRule,
      switchType: item.switchType,
      stimulus: item.stimulus,
      response: item.correctResponse,
      rtMs: item.switchType === 'switch' ? 520 : 400,
      interrupted: false,
    })),
    expected: round1Golden.taskswitch,
    qualityState: 'interpretable',
  })

  // Existing PR12/PR13 fixtures are deliberately retained as separate tests;
  // this v2 set covers every definition currently marked Published.
  return [reaction, memory, stroop, gonogo, cpt, nback, corsi, sst, taskswitch]
}

const expectedV2Flags = (qualityFlags: Record<string, unknown>): Record<string, boolean> => {
  const { interpretable: _interpretable, ...flags } = qualityFlags
  return flags as Record<string, boolean>
}

describe('Cognitive v2 Published golden fixtures', () => {
  it('covers exactly the current Published inventory', () => {
    const published = listCognitiveV2TaskDefinitions().filter((definition) => definition.publication.status === 'PUBLISHED')
    expect(cases().map((fixture) => fixture.testType)).toHaveLength(published.length)
    expect(new Set(cases().map((fixture) => `${fixture.testType}/${fixture.scoringVersion}`))).toEqual(new Set(published.map((definition) => `${definition.testType}/${definition.scoringVersion}`)))
  })

  for (const fixture of cases()) {
    it(`replays ${fixture.key} through the v2 authoritative scorer`, () => {
      const definition = getCognitiveV2TaskDefinition(fixture.testType, '1.0.0', fixture.scoringVersion)
      if (!definition) throw new Error(`Missing v2 definition for ${fixture.key}`)
      const session = createSessionConfigSnapshot({ definition, configVersion: fixture.configVersion, config: fixture.config })
      const result = runAuthoritativeScorer({
        definition,
        session,
        randomSeed: fixture.randomSeed,
        trials: fixture.payloads.map((payload, trialIndex) => createTrialEnvelope({
          trialIndex,
          phase: 'test',
          payload,
          startedAtPerfMs: trialIndex * 100,
          endedAtPerfMs: trialIndex * 100 + 50,
        })),
      })

      expect(result.metrics).toEqual(fixture.expected.metrics)
      expect(result.quality.flags).toEqual(expectedV2Flags(fixture.expected.qualityFlags))
      expect(result.quality.state).toBe(fixture.qualityState)
      expect(result.audit.trialCount).toBe(fixture.payloads.length)
    })
  }
})
