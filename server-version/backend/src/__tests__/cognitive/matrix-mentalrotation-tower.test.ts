import { describe, expect, it } from 'vitest'
import { getCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { applyTowerMove, matrixSequence, mentalRotationSequence, towerSequence, TowerMove, TowerState } from '../../modules/cognitive/randomization'
import { matrixConfigSchema } from '../../modules/cognitive/schemas/matrix.config'
import { mentalrotationConfigSchema } from '../../modules/cognitive/schemas/mentalrotation.config'
import { towerConfigSchema } from '../../modules/cognitive/schemas/tower.config'
import { scoreMatrixV1 } from '../../modules/cognitive/scoring/matrix.v1'
import { scoreMentalrotationV1 } from '../../modules/cognitive/scoring/mentalrotation.v1'
import { scoreTowerV1 } from '../../modules/cognitive/scoring/tower.v1'
import golden from '../../../../cognitive-randomization-golden-v1.json'

const report = { reportVersion: '1.0.0' as const, referenceMode: 'none' as const }
const matrixConfig = { itemCount: 6 as const, optionCount: 4 as const, itemTimeoutMs: 30000, validRtFloorMs: 300, stimulusSetVersion: 'matrix-generator-v1.0.0' as const, report }
const rotationConfig = { totalTrials: 12 as const, stimulusMs: 5000, isiMs: 400, validRtFloorMs: 200, stimulusSetVersion: 'rotation-objects-v1.0.0' as const, report }
const towerConfig = { problemCount: 4 as const, maxMovesFactor: 3, inactivityGuardMs: 90000, stimulusSetVersion: 'three-peg-tower-v1.0.0' as const, report }
const wrap = (value: number) => ((value - 1) % 8 + 8) % 8 + 1
const applicableMatrixRules = (panels: number[]) => {
  const rows = [panels.slice(0, 3), panels.slice(3, 6)]
  const step = wrap(rows[0][1] - rows[0][0])
  return [
    rows.every((row) => wrap(row[1] - row[0]) === step && row[2] === wrap(row[1] + step)) && 'progression',
    rows.every((row) => row[0] === row[2]) && 'alternation',
    rows.every((row) => row[2] === wrap(row[0] + row[1])) && 'combination',
  ].filter(Boolean)
}

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
      if (applied.valid && !visited.has(key)) { visited.add(key); queue.push({ state: applied.state, path: [...current.path, move] }) }
    }
  }
  throw new Error('missing tower path')
}

describe('Round 2 PR5 task contracts', () => {
  it('has strict schemas and exact three-profile patches', () => {
    expect(matrixConfigSchema.safeParse(matrixConfig).success).toBe(true)
    expect(matrixConfigSchema.safeParse({ ...matrixConfig, unknown: true }).success).toBe(false)
    expect(mentalrotationConfigSchema.safeParse({ ...rotationConfig, totalTrials: 20 }).success).toBe(false)
    expect(towerConfigSchema.safeParse({ ...towerConfig, problemCount: 8 }).success).toBe(false)
    const matrix = getCognitiveRegistryEntry('matrix', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(matrix, matrixConfig, 'experience')).toMatchObject({ itemCount: 6 })
    expect(mergeProfileConfig(matrix, matrixConfig, 'standard')).toMatchObject({ itemCount: 16 })
    expect(mergeProfileConfig(matrix, matrixConfig, 'research')).toMatchObject({ itemCount: 24 })
    const rotation = getCognitiveRegistryEntry('mentalrotation', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(rotation, rotationConfig, 'experience')).toMatchObject({ totalTrials: 12 })
    expect(mergeProfileConfig(rotation, rotationConfig, 'research')).toMatchObject({ totalTrials: 80 })
    const tower = getCognitiveRegistryEntry('tower', '1.0.0', '1.0.0')!
    expect(mergeProfileConfig(tower, towerConfig, 'experience')).toMatchObject({ problemCount: 4 })
    expect(mergeProfileConfig(tower, towerConfig, 'research')).toMatchObject({ problemCount: 18 })
  })

  it('scores matrix answers from the server-held item bank', () => {
    const seed = 'matrix-seed'
    const expected = matrixSequence(seed, matrixConfig.itemCount)
    const trials = expected.map((item, trialIndex) => ({ trialIndex, payload: { itemId: item.itemId, selectedOption: item.correctOption, rtMs: 1000, interrupted: false, timedOut: false } }))
    const result = scoreMatrixV1({ config: matrixConfig, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ accuracy: 1, reachedDifficulty: 3, omissionRate: 0 })
    const forged = structuredClone(trials); forged[0].payload.itemId = 'matrix-24'
    expect(() => scoreMatrixV1({ config: matrixConfig, trials: forged, randomSeed: seed })).toThrow(/frozen item sequence/)
    const standard = matrixSequence(seed, 16)
    expect(new Set(standard.map((item) => item.ruleFamily))).toEqual(new Set(['progression', 'alternation', 'combination']))
    expect(new Set(standard.map((item) => item.difficulty))).toEqual(new Set([1, 2, 3]))
    const fullBank = matrixSequence('content-audit', 24)
    expect(fullBank.reduce((counts, item) => { counts[item.correctOption] += 1; return counts }, [0, 0, 0, 0])).toEqual([6, 6, 6, 6])
    const shortPositionCounts = matrixSequence('short-position-audit', 6).reduce((counts, item) => { counts[item.correctOption] += 1; return counts }, [0, 0, 0, 0])
    expect(Math.max(...shortPositionCounts) - Math.min(...shortPositionCounts)).toBeLessThanOrEqual(1)
    for (const item of fullBank) {
      expect(applicableMatrixRules(item.panels)).toEqual([item.ruleFamily])
      expect(new Set(item.options).size).toBe(4)
      const expectedValue = item.ruleFamily === 'progression'
        ? wrap(item.panels[7] + wrap(item.panels[1] - item.panels[0]))
        : item.ruleFamily === 'alternation'
          ? item.panels[6]
          : wrap(item.panels[6] + item.panels[7])
      expect(item.options[item.correctOption]).toBe(expectedValue)
    }
  })

  it('balances rotation labels and derives angle cost from the frozen bank', () => {
    const seed = 'rotation-seed'
    const expected = mentalRotationSequence(seed, rotationConfig.totalTrials)
    expect(expected.filter((item) => item.mirrored)).toHaveLength(6)
    const trials = expected.map((item, trialIndex) => ({ trialIndex, payload: { itemId: item.itemId, response: item.correctResponse, rtMs: item.angle >= 135 ? 900 : 500, interrupted: false, timedOut: false } }))
    const result = scoreMentalrotationV1({ config: rotationConfig, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ accuracy: 1, angleCost: 400, mirrorErrorRate: 0 })
    expect(result.qualityFlags.interpretable).toBe(true)
  })

  it('replays Tower moves and verifies the internal minimum path', () => {
    const seed = 'tower-seed'
    const expected = towerSequence(seed, towerConfig.problemCount)
    const trials = expected.map((problem, trialIndex) => {
      const path = shortestPath(problem.initialState, problem.targetState)
      expect(path).toHaveLength(problem.minimumMoves)
      return { trialIndex, payload: { problemId: problem.problemId, moves: path.map((move, index) => ({ ...move, atMs: 500 + index * 300 })), gaveUp: false, interrupted: false, timedOut: false } }
    })
    const result = scoreTowerV1({ config: towerConfig, trials, randomSeed: seed })
    expect(result.metrics).toMatchObject({ minimumMoveSolveRate: 1, solveRate: 1, excessMoves: 0, ruleViolations: 0 })
    const forged = structuredClone(trials); forged[0].payload.problemId = 'tower-18'
    expect(() => scoreTowerV1({ config: towerConfig, trials: forged, randomSeed: seed })).toThrow(/frozen problem sequence/)
    const tooMany = structuredClone(trials)
    tooMany[0].payload.moves = Array.from({ length: 7 }, (_, index) => ({ disk: 0, from: 0, to: 1, atMs: index }))
    expect(() => scoreTowerV1({ config: towerConfig, trials: tooMany, randomSeed: seed })).toThrow(/frozen problem limit/)
  })

  it('flags constant/no-attempt patterns without turning low performance into IQ labels', () => {
    const matrixSeed = 'matrix-quality'
    const matrixTrials = matrixSequence(matrixSeed, 6).map((item, trialIndex) => ({ trialIndex, payload: { itemId: item.itemId, selectedOption: 0, rtMs: 500, interrupted: false, timedOut: false } }))
    expect(scoreMatrixV1({ config: matrixConfig, trials: matrixTrials, randomSeed: matrixSeed }).qualityFlags).toMatchObject({ interpretable: false, constantResponse: true })
    const towerSeed = 'tower-quality'
    const towerTrials = towerSequence(towerSeed, 4).map((item, trialIndex) => ({ trialIndex, payload: { problemId: item.problemId, moves: [], gaveUp: true, interrupted: false, timedOut: false } }))
    expect(scoreTowerV1({ config: towerConfig, trials: towerTrials, randomSeed: towerSeed }).qualityFlags).toMatchObject({ interpretable: false, insufficientAttemptedProblems: true })
  })

  it('is deterministic and changes with the seed', () => {
    expect(matrixSequence(golden.seed, 6)).toEqual(golden.matrix)
    expect(mentalRotationSequence(golden.seed, 12)).toEqual(golden.mentalrotation)
    expect(towerSequence(golden.seed, 4)).toEqual(golden.tower)
    expect(matrixSequence('a', 16)).toEqual(matrixSequence('a', 16))
    expect(matrixSequence('a', 16)).not.toEqual(matrixSequence('b', 16))
    expect(mentalRotationSequence('a', 40)).toEqual(mentalRotationSequence('a', 40))
    expect(mentalRotationSequence('a', 40)).not.toEqual(mentalRotationSequence('b', 40))
    expect(towerSequence('a', 10)).toEqual(towerSequence('a', 10))
    expect(towerSequence('a', 10)).not.toEqual(towerSequence('b', 10))
  })
})
