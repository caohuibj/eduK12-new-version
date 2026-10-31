import { describe, expect, it } from 'vitest'
import {
  buildCatPool,
  catOperationalMode,
  estimateCatTheta,
  selectNextCatItem,
  shouldStopCatSession,
  type CatItem,
  type CatSelectionConfig,
} from '../../modules/cognitive/cat/cat-engine'
import { calibrationSnapshotSchema } from '../../modules/cognitive/banks/calibration-snapshot-schema'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * COG-Intelligence Roadmap v2.0 PR7 — CAT 引擎与蒙特卡洛仿真。
 * 蒙特卡洛使用 60 题合成题库（已知参数）+ 路线图门槛：RMSE/偏倚/题量
 * 边界/曝光控制全部 fail-hard；确定性种子保证 CI 可复现。
 */
const SNAPSHOT_PATH = path.resolve('../tools/irt-calibration/calibration-snapshot.json')
const snapshot = calibrationSnapshotSchema.parse(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')))

const config: CatSelectionConfig = {
  minItems: 5,
  maxItems: 20,
  seStopThreshold: 0.45,
  randomesqueK: 5,
  seed: 'sim-seed',
}

const buildSyntheticPool = (count: number, seed: number): CatItem[] => {
  // 与 PR5 仿真一致的参数分布：a~N(1.3,0.35) 截断、b~N(0,1) 截断。
  let state = seed | 0
  const rand = (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = (): number => {
    let sum = 0
    for (let index = 0; index < 4; index += 1) sum += rand()
    return (sum - 2) * 1.732
  }
  const rules = ['shape', 'rotate', 'shade', 'size', 'identity']
  return Array.from({ length: count }, (_, index) => ({
    itemId: `pool-${String(index + 1).padStart(3, '0')}`,
    a: Math.min(2.5, Math.max(0.5, 1.3 + 0.35 * normal())),
    b: Math.min(2.5, Math.max(-2.5, normal())),
    ruleTag: rules[index % rules.length],
  }))
}

const icc = (item: CatItem, theta: number): number => 1 / (1 + Math.exp(-item.a * (theta - item.b)))

const runAdaptiveSession = (pool: CatItem[], thetaTrue: number, examineeSeed: number, maxItems = config.maxItems, seedSuffix = '') => {
  let state = examineeSeed | 0
  const rand = (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const itemsById = new Map(pool.map((item) => [item.itemId, item]))
  const history: Array<{ itemId: string; correct: boolean }> = []
  const exposure = new Map<string, number>()
  let theta: number | null = null
  let se: number | null = null
  for (;;) {
    const selection = selectNextCatItem(pool, history, { ...config, maxItems, seed: `${config.seed}${seedSuffix}` })
    if (!selection) break
    exposure.set(selection.itemId, (exposure.get(selection.itemId) ?? 0) + 1)
    const correct = rand() < icc(itemsById.get(selection.itemId)!, thetaTrue)
    history.push({ itemId: selection.itemId, correct })
    const estimate = estimateCatTheta(itemsById, history)!
    theta = estimate.theta
    se = estimate.se
    if (shouldStopCatSession(history, pool.length, se, config)) break
    if (history.length >= maxItems) break
  }
  return { theta: theta!, se: se!, length: history.length, exposure }
}

describe('CAT engine (roadmap v2.0 PR7)', () => {
  it('gates simulation-only pools away from product use', () => {
    expect(catOperationalMode(snapshot)).toBe('simulation-only')
    const ruleTags = new Map(snapshot.items.map((item, index) => [item.itemId, ['shape', 'rotate', 'shade', 'size', 'identity'][index % 5]]))
    expect(() => buildCatPool(snapshot, ruleTags)).toThrow(/SIMULATION_ONLY/)
    expect(() => buildCatPool(snapshot, ruleTags, { allowSimulationPool: true })).not.toThrow()
    const pilot = {
      ...snapshot, status: 'PILOT_CALIBRATED' as const, provenance: 'real sample',
      items: snapshot.items.map(({ trueA: _a, trueB: _b, ...rest }) => rest),
    }
    expect(() => buildCatPool(pilot, ruleTags)).not.toThrow()
    expect(() => buildCatPool({ ...pilot, status: 'VALIDATED' }, ruleTags)).toThrow(/evidenceReviewRef/)
  })

  it('estimates theta with shrinking SE as history accumulates', () => {
    const pool = buildSyntheticPool(20, 42)
    const itemsById = new Map(pool.map((item) => [item.itemId, item]))
    expect(estimateCatTheta(itemsById, [])).toBeNull()
    const history = pool.slice(0, 3).map((item) => ({ itemId: item.itemId, correct: true }))
    const first = estimateCatTheta(itemsById, history)!
    const longer = [...history, ...pool.slice(3, 10).map((item) => ({ itemId: item.itemId, correct: true }))]
    const second = estimateCatTheta(itemsById, longer)!
    expect(second.se).toBeLessThan(first.se)
  })

  it('rejects stale, repeated and under-sized CAT histories and invalid configuration', () => {
    const pool = buildSyntheticPool(12, 4)
    expect(() => selectNextCatItem(pool, [], { ...config, minItems: 13 })).toThrow(/Invalid CAT pool/)
    expect(() => selectNextCatItem(pool, [], { ...config, randomesqueK: 0 })).toThrow(/Invalid CAT pool/)
    expect(() => selectNextCatItem(pool, [
      { itemId: pool[0].itemId, correct: true },
      { itemId: pool[0].itemId, correct: false },
    ], config)).toThrow(/duplicate/)
    expect(() => estimateCatTheta(new Map(pool.map((i) => [i.itemId, i])), [
      { itemId: 'unknown', correct: true },
    ])).toThrow(/unknown/)
  })

  it('honors min/max item bounds and stop rules', () => {
    const pool = buildSyntheticPool(30, 7)
    const session = runAdaptiveSession(pool, 0, 1)
    expect(session.length).toBeGreaterThanOrEqual(config.minItems)
    expect(session.length).toBeLessThanOrEqual(config.maxItems)
    expect(shouldStopCatSession(Array.from({ length: 25 }, (_, index) => ({ itemId: `pool-${String(index + 1).padStart(3, '0')}`, correct: true })), pool.length, null, config)).toBe(true)
    expect(shouldStopCatSession([], pool.length, null, config)).toBe(false)
  })

  it('deterministically replays selection from history (resume reproducibility)', () => {
    const pool = buildSyntheticPool(20, 99)
    const history = [
      { itemId: pool[0].itemId, correct: true },
      { itemId: pool[3].itemId, correct: false },
    ]
    const first = selectNextCatItem(pool, history, config)
    const second = selectNextCatItem(pool, [...history], config)
    expect(first?.itemId).toBe(second?.itemId)
  })

  it('monte carlo: adaptive beats fixed-form RMSE with bounded exposure and bias', () => {
    const pool = buildSyntheticPool(60, 20261031)
    const thetas = [-2, -1, 0, 1, 2]
    const errors: number[] = []
    const byTheta = new Map<number, number[]>()
    const totalExposure = new Map<string, number>()
    let sessions = 0
    let lengths: number[] = []
    const simulationCases: Array<{ thetaTrue: number; examineeSeed: number; length: number }> = []
    for (const thetaTrue of thetas) {
      for (let examinee = 0; examinee < 100; examinee += 1) {
        const examineeSeed = 1000 * examinee + thetaTrue * 7 + 3
        const session = runAdaptiveSession(pool, thetaTrue, examineeSeed, config.maxItems, `-e${examinee}-t${thetaTrue}`)
        simulationCases.push({ thetaTrue, examineeSeed, length: session.length })
        errors.push(session.theta - thetaTrue)
        byTheta.set(thetaTrue, [...(byTheta.get(thetaTrue) ?? []), session.theta - thetaTrue])
        for (const [itemId, count] of session.exposure) totalExposure.set(itemId, (totalExposure.get(itemId) ?? 0) + count)
        lengths.push(session.length)
        sessions += 1
      }
    }
    const rmse = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / errors.length)
    const biases = thetas.map((theta) => {
      const list = byTheta.get(theta)!
      return list.reduce((sum, e) => sum + e, 0) / list.length
    })
    const maxBias = Math.max(...biases.map(Math.abs))
    const maxExposureRate = Math.max(...totalExposure.values()) / sessions
    const rmseFixed = (() => {
      // The same 500 examinees, with exactly the SAME NUMBER of scored items as
      // each adaptive session. Avoid a misleading 20-item CAT vs 10-item fixed comparison.
      const itemsById = new Map(pool.map((item) => [item.itemId, item]))
      const errs: number[] = []
      for (const { thetaTrue, examineeSeed, length } of simulationCases) {
        let state = examineeSeed | 0
        const rand = (): number => {
          state = (state + 0x6d2b79f5) | 0
          let t = Math.imul(state ^ (state >>> 15), 1 | state)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
        const fixed = pool.slice(0, length)
        const history = fixed.map((item) => ({ itemId: item.itemId, correct: rand() < icc(item, thetaTrue) }))
        errs.push(estimateCatTheta(itemsById, history)!.theta - thetaTrue)
      }
      return Math.sqrt(errs.reduce((sum, e) => sum + e * e, 0) / errs.length)
    })()

    // |θ|=±2 处 EAP 受 N(0,1) 先验收缩（全对/全错似然单调），偏倚上浮属预期特性；
    // 中央区间（|θ|<=1，K12 常模主要区间）保持严格门槛。
    const centralBias = Math.max(...[-1, 0, 1].map((theta) => {
      const list = byTheta.get(theta)!
      return Math.abs(list.reduce((sum, e) => sum + e, 0) / list.length)
    }))
    expect(rmse).toBeLessThanOrEqual(0.6)
    expect(maxBias).toBeLessThanOrEqual(0.5)
    expect(centralBias).toBeLessThanOrEqual(0.3)
    expect(Number.isFinite(rmseFixed)).toBe(true)
    expect(rmse).toBeLessThanOrEqual(rmseFixed)
    expect(maxExposureRate).toBeLessThanOrEqual(0.7)
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(config.minItems)
    expect(Math.max(...lengths)).toBeLessThanOrEqual(config.maxItems)
  })
})
