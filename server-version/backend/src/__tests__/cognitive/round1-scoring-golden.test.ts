import { describe, expect, it } from 'vitest'
import golden from '../../../../cognitive-scoring-golden-v1.json'
import { cptSequence, corsiSequence, gonogoSequence, nbackSequence, sstSequence, taskswitchSequence } from '../../modules/cognitive/randomization'
import { scoreCorsiV1 } from '../../modules/cognitive/scoring/corsi.v1'
import { scoreCptV1 } from '../../modules/cognitive/scoring/cpt.v1'
import { scoreGonogoV1 } from '../../modules/cognitive/scoring/gonogo.v1'
import { scoreMemoryV1_1 } from '../../modules/cognitive/scoring/memory.v1_1'
import { scoreNbackV1 } from '../../modules/cognitive/scoring/nback.v1'
import { scoreReactionV1_1 } from '../../modules/cognitive/scoring/reaction.v1_1'
import { scoreSstV1 } from '../../modules/cognitive/scoring/sst.v1'
import { scoreStroopV1_1 } from '../../modules/cognitive/scoring/stroop.v1_1'
import { scoreTaskswitchV1 } from '../../modules/cognitive/scoring/taskswitch.v1'

const noneReport = { reportVersion: '1.0.0', referenceMode: 'none' as const }

const resultContract = (result: { score: number; metrics: Record<string, unknown>; qualityFlags: Record<string, unknown> }) => ({
  score: result.score,
  metrics: result.metrics,
  qualityFlags: result.qualityFlags,
})

const buildGoldenResults = () => {
  const reactionConfig = {
    totalTrials: 5,
    foreperiodMinMs: 700,
    foreperiodMaxMs: 1500,
    timeoutMs: 2000,
    readyDurationMs: 1000,
    report: noneReport,
  }
  const reaction = scoreReactionV1_1({
    config: reactionConfig,
    trials: [250, 300, 350, 400, 450].map((rtMs, trialIndex) => ({
      trialIndex,
      payload: {
        foreperiodMs: 700 + trialIndex * 100,
        rtMs,
        prematureCount: trialIndex === 0 ? 1 : 0,
        interrupted: false,
        inputMode: 'pointer' as const,
      },
    })),
  })

  const memoryConfig = {
    startLength: 2,
    maxLength: 5,
    trialsPerLevel: 2 as const,
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
    response: Array.from({ length }, (_, index) => correct || index < length - 1 ? index : 9),
    responseDurationMs: trialWithinLevel * 100,
    interrupted,
  })
  const memory = scoreMemoryV1_1({
    config: memoryConfig,
    trials: [
      memoryTrial(2, 1, true), memoryTrial(2, 2, false),
      memoryTrial(3, 1, true), memoryTrial(3, 2, false),
      memoryTrial(4, 1, false), memoryTrial(4, 2, false, true),
    ].map((payload, trialIndex) => ({ trialIndex, payload })),
  })

  const stroopConfig = {
    totalTrials: 4,
    congruentRatio: 0.5,
    fixationMs: 500,
    stimulusDurationMs: 2000,
    isiMs: 500,
    validRtFloorMs: 200,
    report: noneReport,
  }
  const stroop = scoreStroopV1_1({
    config: stroopConfig,
    trials: [
      { word: '红' as const, inkColor: 'red' as const, response: 'red' as const, rtMs: 300, interrupted: false },
      { word: '蓝' as const, inkColor: 'blue' as const, response: 'blue' as const, rtMs: 350, interrupted: false },
      { word: '红' as const, inkColor: 'green' as const, response: 'green' as const, rtMs: 500, interrupted: false },
      { word: '黄' as const, inkColor: 'blue' as const, response: 'blue' as const, rtMs: 550, interrupted: false },
    ].map((payload, trialIndex) => ({ trialIndex, payload })),
  })

  const gonogoConfig = {
    totalTrials: 8,
    nogoRatio: 0.25 as const,
    stimulusMs: 800,
    isiMs: 400,
    validRtFloorMs: 100,
    report: noneReport,
  }
  const gonogoSeed = 'round1-golden-gonogo'
  const gonogo = scoreGonogoV1({
    config: gonogoConfig,
    randomSeed: gonogoSeed,
    trials: gonogoSequence(gonogoSeed, 8, 0.25).map((trialType, trialIndex) => ({
      trialIndex,
      payload: { trialType, responded: trialType === 'go', rtMs: trialType === 'go' ? 300 : null, interrupted: false },
    })),
  })

  const cptConfig = {
    totalTrials: 12,
    targetRatio: 0.25,
    blockCount: 1,
    stimulusMs: 400,
    isiMs: 400,
    validRtFloorMs: 100,
    perseverationRtMs: 100 as const,
    report: noneReport,
  }
  const cptSeed = 'round1-golden-cpt'
  const cpt = scoreCptV1({
    config: cptConfig,
    randomSeed: cptSeed,
    trials: cptSequence(cptSeed, 12, 0.25, 1).map((item, trialIndex) => ({
      trialIndex,
      payload: { ...item, responded: item.isTarget, rtMs: item.isTarget ? 280 : null, interrupted: false },
    })),
  })

  const nbackConfig = {
    nLevels: [1] as Array<1 | 2 | 3>,
    trialCountByN: [16],
    blockCountByN: [1],
    targetRatio: 0.3,
    stimulusMs: 400,
    isiMs: 800,
    validRtFloorMs: 100,
    report: noneReport,
  }
  const nbackSeed = 'round1-golden-nback'
  const nback = scoreNbackV1({
    config: nbackConfig,
    randomSeed: nbackSeed,
    trials: nbackSequence(nbackSeed, [1], [16], [1], 0.3).map((item, trialIndex) => ({
      trialIndex,
      payload: { ...item, responded: item.target, rtMs: item.target ? 320 : null, interrupted: false },
    })),
  })

  const corsiConfig = {
    startSpan: 3,
    maxSpan: 4,
    trialsPerLevel: 2 as const,
    boardSize: 9 as const,
    highlightMs: 400,
    intervalMs: 200,
    readyDurationMs: 400,
    inactivityGuardMs: 8000,
    report: noneReport,
  }
  const corsiSeed = 'round1-golden-corsi'
  const corsi = scoreCorsiV1({
    config: corsiConfig,
    randomSeed: corsiSeed,
    trials: [
      { spanLength: 3, trialWithinLevel: 1 as const },
      { spanLength: 3, trialWithinLevel: 2 as const },
      { spanLength: 4, trialWithinLevel: 1 as const },
      { spanLength: 4, trialWithinLevel: 2 as const },
    ].map((item, trialIndex) => {
      const sequence = corsiSequence(corsiSeed, trialIndex, item.spanLength)
      return {
        trialIndex,
        payload: {
          ...item,
          sequence,
          response: item.spanLength === 3 ? sequence : [...sequence].reverse(),
          responseDurationMs: 800 + trialIndex * 100,
          interrupted: false,
        },
      }
    }),
  })

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
    report: noneReport,
  }
  const sstSeed = 'round1-golden-sst'
  let ssd = sstConfig.ssdStartMs
  let stopIndex = 0
  const sst = scoreSstV1({
    config: sstConfig,
    randomSeed: sstSeed,
    trials: sstSequence(sstSeed, 40, 0.25).map((item, trialIndex) => {
      if (item.trialType === 'go') {
        return { trialIndex, payload: { ...item, response: item.goStimulus, rtMs: 420, ssdMs: null, stopSignalPresented: false, interrupted: false } }
      }
      const responded = stopIndex % 2 === 0
      stopIndex += 1
      const usedSsd = ssd
      ssd = Math.min(sstConfig.ssdMaxMs, Math.max(sstConfig.ssdMinMs, responded ? ssd - sstConfig.ssdStepMs : ssd + sstConfig.ssdStepMs))
      return {
        trialIndex,
        payload: { ...item, response: responded ? item.goStimulus : null, rtMs: responded ? 300 : null, ssdMs: usedSsd, stopSignalPresented: true, interrupted: false },
      }
    }),
  })

  const taskswitchConfig = {
    totalTrials: 48,
    switchRatio: 0.5,
    blockCount: 2,
    includePureBlocks: false,
    cueMs: 200,
    stimulusMs: 800,
    isiMs: 200,
    validRtFloorMs: 150,
    report: noneReport,
  }
  const taskswitchSeed = 'round1-golden-taskswitch'
  const taskswitch = scoreTaskswitchV1({
    config: taskswitchConfig,
    randomSeed: taskswitchSeed,
    trials: taskswitchSequence(taskswitchSeed, 48, 2, 0.5, false).map((item, trialIndex) => ({
      trialIndex,
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
    })),
  })

  return {
    version: 'round1-scoring-v1',
    reaction: resultContract(reaction),
    memory: resultContract(memory),
    stroop: resultContract(stroop),
    gonogo: resultContract(gonogo),
    cpt: resultContract(cpt),
    nback: resultContract(nback),
    corsi: resultContract(corsi),
    sst: resultContract(sst),
    taskswitch: resultContract(taskswitch),
  }
}

describe('Round 1 scoring golden fixture', () => {
  it('freezes score, metrics, and quality flags for every P0/P1 scorer', () => {
    const actual = buildGoldenResults()
    expect(actual).toEqual(golden)
  })
})
