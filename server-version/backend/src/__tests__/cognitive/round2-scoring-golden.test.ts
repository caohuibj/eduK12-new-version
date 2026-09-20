import { describe, expect, it } from 'vitest'
import golden from '../../../../cognitive-scoring-golden-round2-v1.json'
import {
  applyTowerMove,
  cardsortSequence,
  digitBackwardSequence,
  flankerSequence,
  matrixSequence,
  mentalRotationSequence,
  pairedAssociateSet,
  patterncompareTrial,
  pictureSequenceItems,
  towerSequence,
  TowerMove,
  TowerState,
} from '../../modules/cognitive/randomization'
import { scoreCardsortV1 } from '../../modules/cognitive/scoring/cardsort.v1'
import { scoreDigitbackwardV1 } from '../../modules/cognitive/scoring/digitbackward.v1'
import { scoreFlankerV1 } from '../../modules/cognitive/scoring/flanker.v1'
import { scoreMatrixV1 } from '../../modules/cognitive/scoring/matrix.v1'
import { scoreMentalrotationV1 } from '../../modules/cognitive/scoring/mentalrotation.v1'
import { scorePairedassociateV1 } from '../../modules/cognitive/scoring/pairedassociate.v1'
import { scorePatterncompareV1 } from '../../modules/cognitive/scoring/patterncompare.v1'
import { scorePicturesequenceV1 } from '../../modules/cognitive/scoring/picturesequence.v1'
import { scoreTowerV1 } from '../../modules/cognitive/scoring/tower.v1'

const report = { reportVersion: '1.0.0' as const, referenceMode: 'none' as const }
const resultContract = (result: { score: number; metrics: Record<string, unknown>; qualityFlags: Record<string, unknown> }) => ({
  score: result.score,
  metrics: result.metrics,
  qualityFlags: result.qualityFlags,
})

const shortestPath = (initial: TowerState, target: TowerState): Array<Omit<TowerMove, 'atMs'>> => {
  const queue: Array<{ state: TowerState; path: Array<Omit<TowerMove, 'atMs'>> }> = [{ state: initial, path: [] }]
  const visited = new Set([initial.join('')])
  while (queue.length) {
    const current = queue.shift()!
    if (current.state.every((value, index) => value === target[index])) return current.path
    for (let disk = 0; disk < 3; disk += 1) for (let from = 0; from < 3; from += 1) for (let to = 0; to < 3; to += 1) {
      const move = { disk, from, to }
      const applied = applyTowerMove(current.state, move)
      const key = applied.state.join('')
      if (applied.valid && !visited.has(key)) {
        visited.add(key)
        queue.push({ state: applied.state, path: [...current.path, move] })
      }
    }
  }
  throw new Error('missing tower path')
}

const buildGoldenResults = () => {
  const patternSeed = 'round2-golden-pattern'
  const patternConfig = {
    durationSec: 30,
    trialTimeoutMs: 2500,
    isiMs: 250,
    validRtFloorMs: 150,
    stimulusSetVersion: 'geometric-v1.0.0' as const,
    report,
  }
  const patterncompare = scorePatterncompareV1({
    config: patternConfig,
    randomSeed: patternSeed,
    trials: Array.from({ length: 12 }, (_, trialIndex) => {
      const spec = patterncompareTrial(patternSeed, trialIndex)
      return {
        trialIndex,
        payload: {
          leftPattern: spec.leftPattern,
          rightPattern: spec.rightPattern,
          response: spec.correctResponse,
          rtMs: 500 + trialIndex,
          interrupted: false,
          timedOut: false,
        },
      }
    }),
  })

  const flankerSeed = 'round2-golden-flanker'
  const flankerConfig = {
    totalTrials: 24,
    congruentRatio: 0.5 as const,
    stimulusMs: 1800,
    isiMs: 400,
    validRtFloorMs: 150,
    stimulusSetVersion: 'arrows-v1.0.0' as const,
    report,
  }
  const flanker = scoreFlankerV1({
    config: flankerConfig,
    randomSeed: flankerSeed,
    trials: flankerSequence(flankerSeed, 24).map((item, trialIndex) => ({
      trialIndex,
      payload: {
        targetDirection: item.targetDirection,
        flankerDirection: item.flankerDirection,
        response: item.correctResponse,
        rtMs: item.targetDirection === item.flankerDirection ? 500 : 600,
        interrupted: false,
        timedOut: false,
      },
    })),
  })

  const cardsortSeed = 'golden-seed'
  const cardsortConfig = {
    totalTrials: 12,
    switchRatio: 0.33,
    blockCount: 2,
    cueMs: 500,
    stimulusMs: 2000,
    isiMs: 350,
    validRtFloorMs: 150,
    stimulusSetVersion: 'geometric-cards-v1.0.0' as const,
    report,
  }
  const cardsort = scoreCardsortV1({
    config: cardsortConfig,
    randomSeed: cardsortSeed,
    trials: cardsortSequence(cardsortSeed, 12, 2, 0.33).map((item, trialIndex) => ({
      trialIndex,
      payload: {
        ruleCue: item.ruleCue,
        stimulusColor: item.stimulusColor,
        stimulusShape: item.stimulusShape,
        response: item.correctResponse,
        rtMs: item.switchType === 'switch' ? 700 : 500,
        interrupted: false,
        timedOut: false,
      },
    })),
  })

  const digitSeed = 'round2-golden-digit'
  const digitConfig = {
    startSpan: 2,
    maxSpan: 4,
    trialsPerLevel: 2 as const,
    digitDisplayMs: 800,
    digitIntervalMs: 200,
    readyDurationMs: 800,
    inactivityGuardMs: 30000,
    stimulusSetVersion: 'digits-v1.0.0' as const,
    report,
  }
  const digitbackward = scoreDigitbackwardV1({
    config: digitConfig,
    randomSeed: digitSeed,
    trials: Array.from({ length: 6 }, (_, trialIndex) => {
      const spanLength = 2 + Math.floor(trialIndex / 2)
      const sequence = digitBackwardSequence(digitSeed, trialIndex, spanLength)
      return {
        trialIndex,
        payload: {
          spanLength,
          trialWithinLevel: ((trialIndex % 2) + 1) as 1 | 2,
          sequence,
          response: [...sequence].reverse(),
          responseDurationMs: 800,
          interrupted: false,
          timedOut: false,
        },
      }
    }),
  })

  const pictureSeed = 'round2-golden-picture'
  const pictureConfig = {
    itemCount: 12 as const,
    learningRounds: 3 as const,
    delayedEnabled: false,
    delayedDelayMs: 0,
    studyMsPerItem: 900,
    inactivityGuardMs: 60000,
    stimulusSetVersion: 'daily-scenes-v1.0.0' as const,
    report,
  }
  const pictureItems = pictureSequenceItems(pictureSeed, 12)
  const picturesequence = scorePicturesequenceV1({
    config: pictureConfig,
    randomSeed: pictureSeed,
    trials: Array.from({ length: 3 }, (_, trialIndex) => ({
      trialIndex,
      payload: {
        phase: 'learning' as const,
        roundIndex: trialIndex + 1,
        itemIds: pictureItems,
        responseOrder: trialIndex === 0 ? [...pictureItems].reverse() : pictureItems,
        responseDurationMs: 2000,
        interrupted: false,
        timedOut: false,
      },
    })),
  })

  const pairedSeed = 'round2-golden-paired'
  const pairedConfig = {
    pairCount: 12 as const,
    learningRounds: 3 as const,
    delayedEnabled: false,
    delayedDelayMs: 0,
    studyDurationMs: 12000,
    inactivityGuardMs: 90000,
    stimulusSetVersion: 'nonverbal-pairs-v1.0.0' as const,
    report,
  }
  const pairSet = pairedAssociateSet(pairedSeed, 12)
  const pairedassociate = scorePairedassociateV1({
    config: pairedConfig,
    randomSeed: pairedSeed,
    trials: Array.from({ length: 3 }, (_, trialIndex) => ({
      trialIndex,
      payload: {
        phase: 'learning' as const,
        roundIndex: trialIndex + 1,
        responses: pairSet.map((item, index) => ({
          itemId: item.itemId,
          selectedPosition: trialIndex === 0 && index % 2 === 0
            ? (item.targetPosition + 1) % pairedConfig.pairCount
            : item.targetPosition,
        })),
        responseDurationMs: 3000,
        interrupted: false,
        timedOut: false,
      },
    })),
  })

  const matrixSeed = 'round2-golden-matrix'
  const matrixConfig = {
    itemCount: 6 as const,
    optionCount: 4 as const,
    itemTimeoutMs: 30000,
    validRtFloorMs: 300,
    stimulusSetVersion: 'matrix-generator-v1.0.0' as const,
    report,
  }
  const matrix = scoreMatrixV1({
    config: matrixConfig,
    randomSeed: matrixSeed,
    trials: matrixSequence(matrixSeed, 6).map((item, trialIndex) => ({
      trialIndex,
      payload: { itemId: item.itemId, selectedOption: item.correctOption, rtMs: 1000, interrupted: false, timedOut: false },
    })),
  })

  const rotationSeed = 'round2-golden-rotation'
  const rotationConfig = {
    totalTrials: 12 as const,
    stimulusMs: 5000,
    isiMs: 400,
    validRtFloorMs: 200,
    stimulusSetVersion: 'rotation-objects-v1.0.0' as const,
    report,
  }
  const mentalrotation = scoreMentalrotationV1({
    config: rotationConfig,
    randomSeed: rotationSeed,
    trials: mentalRotationSequence(rotationSeed, 12).map((item, trialIndex) => ({
      trialIndex,
      payload: {
        itemId: item.itemId,
        response: item.correctResponse,
        rtMs: item.angle >= 135 ? 900 : 500,
        interrupted: false,
        timedOut: false,
      },
    })),
  })

  const towerSeed = 'round2-golden-tower'
  const towerConfig = {
    problemCount: 4 as const,
    maxMovesFactor: 3,
    inactivityGuardMs: 90000,
    stimulusSetVersion: 'three-peg-tower-v1.0.0' as const,
    report,
  }
  const tower = scoreTowerV1({
    config: towerConfig,
    randomSeed: towerSeed,
    trials: towerSequence(towerSeed, 4).map((problem, trialIndex) => {
      const path = shortestPath(problem.initialState, problem.targetState)
      return {
        trialIndex,
        payload: {
          problemId: problem.problemId,
          moves: path.map((move, index) => ({ ...move, atMs: 500 + index * 300 })),
          gaveUp: false,
          interrupted: false,
          timedOut: false,
        },
      }
    }),
  })

  return {
    version: 'round2-scoring-v1',
    patterncompare: resultContract(patterncompare),
    flanker: resultContract(flanker),
    cardsort: resultContract(cardsort),
    digitbackward: resultContract(digitbackward),
    picturesequence: resultContract(picturesequence),
    pairedassociate: resultContract(pairedassociate),
    matrix: resultContract(matrix),
    mentalrotation: resultContract(mentalrotation),
    tower: resultContract(tower),
  }
}

describe('Round 2 scoring golden fixture', () => {
  it('freezes score, metrics, and quality flags for every Round 2 scorer', () => {
    expect(buildGoldenResults()).toEqual(golden)
  })
})
