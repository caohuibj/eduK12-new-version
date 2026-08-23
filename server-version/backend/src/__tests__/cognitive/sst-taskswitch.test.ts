import { describe, expect, it } from 'vitest'
import { sstConfigSchema } from '../../modules/cognitive/schemas/sst.config'
import { taskswitchConfigSchema } from '../../modules/cognitive/schemas/taskswitch.config'
import { scoreSstV1 } from '../../modules/cognitive/scoring/sst.v1'
import { scoreTaskswitchV1 } from '../../modules/cognitive/scoring/taskswitch.v1'
import { mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { sstSequence, taskswitchSequence, RANDOMIZATION_ALGORITHM_VERSION } from '../../modules/cognitive/randomization'
import golden from '../../../../cognitive-randomization-golden-v1.json'

const sstConfig = {
  totalTrials: 40,
  stopRatio: 0.25 as const,
  ssdStartMs: 250,
  ssdMinMs: 50,
  ssdMaxMs: 800,
  ssdStepMs: 50,
  goTimeoutMs: 1000,
  isiMs: 400,
  validRtFloorMs: 100,
  report: { reportVersion: '1.0.0', referenceMode: 'none' as const },
}

const taskswitchConfig = {
  totalTrials: 48,
  switchRatio: 0.5,
  blockCount: 2,
  includePureBlocks: false,
  cueMs: 200,
  stimulusMs: 800,
  isiMs: 200,
  validRtFloorMs: 150,
  report: { reportVersion: '1.0.0', referenceMode: 'none' as const },
}

describe('sst schema and profiles', () => {
  it('locks 40/96/200 trial contracts at 25% stop', () => {
    expect(sstConfigSchema.safeParse(sstConfig).success).toBe(true)
    expect(sstConfigSchema.safeParse({ ...sstConfig, stopRatio: 0.3 }).success).toBe(false)
    const entry = getCognitiveRegistryEntry('sst', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(entry, sstConfig, 'experience').totalTrials).toBe(40)
    expect(mergeProfileConfig(entry, sstConfig, 'standard').totalTrials).toBe(96)
    expect(mergeProfileConfig(entry, sstConfig, 'research').totalTrials).toBe(200)
  })
})

describe('sst scorer', () => {
  const seed = 'seed-sst'
  const expected = sstSequence(seed, sstConfig.totalTrials, sstConfig.stopRatio)

  const trialsFor = (ssdMutate?: (index: number, ssd: number) => number) => {
    let ssd = sstConfig.ssdStartMs
    let stopNo = 0
    return expected.map((item, index) => {
      if (item.trialType === 'go') {
        return {
          trialIndex: index,
          payload: {
            ...item,
            response: item.goStimulus,
            rtMs: 420,
            ssdMs: null,
            stopSignalPresented: false,
            interrupted: false,
          },
        }
      }
      const respond = stopNo % 2 === 0
      stopNo += 1
      const usedSsd = ssdMutate ? ssdMutate(index, ssd) : ssd
      const payload = {
        ...item,
        response: respond ? item.goStimulus : null,
        rtMs: respond ? 300 : null,
        ssdMs: usedSsd,
        stopSignalPresented: true,
        interrupted: false,
      }
      ssd = Math.min(sstConfig.ssdMaxMs, Math.max(sstConfig.ssdMinMs, respond ? ssd - sstConfig.ssdStepMs : ssd + sstConfig.ssdStepMs))
      return { trialIndex: index, payload }
    })
  }

  it('computes SSRT from the reconstructed staircase', () => {
    const result = scoreSstV1({ config: sstConfig, trials: trialsFor(), randomSeed: seed })
    expect(result.metrics.pRespondStop).toBe(0.5)
    expect(typeof result.metrics.ssrtMs).toBe('number')
    expect(result.qualityFlags.pRespondStopOutOfRange).toBe(false)
  })

  it('rejects an SSD that does not follow the staircase', () => {
    expect(() => scoreSstV1({ config: sstConfig, trials: trialsFor((_index, ssd) => ssd + 50), randomSeed: seed })).toThrow(/staircase|frozen seed sequence/)
  })

  it('includes choice errors and replaces Go omissions in the integration distribution', () => {
    let goIndex = 0
    const sparseGo = trialsFor().map((trial) => {
      if (trial.payload.trialType !== 'go') return trial
      const currentGo = goIndex
      goIndex += 1
      if (currentGo >= 15) {
        return { ...trial, payload: { ...trial.payload, response: null, rtMs: null } }
      }
      if (currentGo === 14) {
        return {
          ...trial,
          payload: {
            ...trial.payload,
            response: trial.payload.goStimulus === 'left' ? 'right' as const : 'left' as const,
            rtMs: 200,
          },
        }
      }
      return trial
    })
    const result = scoreSstV1({ config: sstConfig, trials: sparseGo, randomSeed: seed })
    expect(result.metrics.goChoiceErrorRate).toBeGreaterThan(0)
    expect(result.metrics.goOmissionRate).toBe(0.5)
    expect(result.metrics.ssrtMs).toBe(420 - (result.metrics.meanSsdMs as number))
  })
})

describe('taskswitch schema, profiles and scorer', () => {
  it('locks 48/128/256 trial contracts', () => {
    expect(taskswitchConfigSchema.safeParse(taskswitchConfig).success).toBe(true)
    expect(taskswitchConfigSchema.safeParse({ ...taskswitchConfig, includePureBlocks: true }).success).toBe(false)
    const entry = getCognitiveRegistryEntry('taskswitch', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(entry, taskswitchConfig, 'experience').totalTrials).toBe(48)
    expect(mergeProfileConfig(entry, taskswitchConfig, 'standard').totalTrials).toBe(128)
    expect(mergeProfileConfig(entry, taskswitchConfig, 'research').includePureBlocks).toBe(true)
    expect(mergeProfileConfig(entry, taskswitchConfig, 'research').blockCount).toBe(8)
  })

  it('computes switch cost and rejects a mutated rule', () => {
    const seed = 'seed-switch'
    const expected = taskswitchSequence(seed, 48, 2, 0.5, false)
    const trials = expected.map((item, index) => ({
      trialIndex: index,
      payload: {
        blockIndex: item.blockIndex,
        taskRule: item.taskRule,
        previousTaskRule: item.previousTaskRule,
        switchType: item.switchType,
        stimulus: item.stimulus,
        response: item.correctResponse,
        rtMs: item.switchType === 'switch' ? 520 : 400,
        interrupted: false,
      },
    }))
    const result = scoreTaskswitchV1({ config: taskswitchConfig, trials, randomSeed: seed })
    expect(result.metrics.switchCostRtMs).toBe(120)
    expect(result.qualityFlags.interpretable).toBe(true)
    expect(() => scoreTaskswitchV1({
      config: taskswitchConfig,
      randomSeed: seed,
      trials: trials.map((trial, index) => index === 1
        ? { ...trial, payload: { ...trial.payload, taskRule: trial.payload.taskRule === 'parity' ? 'magnitude' : 'parity' } }
        : trial),
    })).toThrow(/frozen seed sequence/)
  })
})

describe('sst/taskswitch randomization contract', () => {
  it('is deterministic per seed and versioned', () => {
    expect(RANDOMIZATION_ALGORITHM_VERSION).toBe('seq-v1.0.0')
    expect(sstSequence('seed-1', 40, 0.25)).toEqual(sstSequence('seed-1', 40, 0.25))
    expect(sstSequence('seed-1', 40, 0.25).filter((trial) => trial.trialType === 'stop')).toHaveLength(10)
    expect(taskswitchSequence('seed-1', 48, 2, 0.5, false)).toEqual(taskswitchSequence('seed-1', 48, 2, 0.5, false))
    expect(taskswitchSequence('seed-1', 48, 2, 0.5, false)[0].switchType).toBe('start')
  })

  it('matches the repository-wide golden vectors', () => {
    expect(RANDOMIZATION_ALGORITHM_VERSION).toBe(golden.version)
    expect(sstSequence(golden.seed, 8, 0.25)).toEqual(golden.sst)
    expect(taskswitchSequence(golden.seed, 8, 2, 0.5, false)).toEqual(golden.taskswitch)
  })
})
