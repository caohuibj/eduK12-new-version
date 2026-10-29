/**
 * icarmatrix shared generator (backend copy; an identical mirror ships to the
 * frontend). Dual-track design: the first BANK_SIZE trials use a frozen,
 * hand-authored bank (stable across seeds, ICAR public-domain paradigm);
 * later trials are generated from the session seed (MatGen-inspired), so
 * repeated administrations never see the same generated items.
 */

function xmur3(value: string): () => number {
  let hash = 1779033703 ^ value.length
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353)
    hash = (hash << 13) | (hash >>> 19)
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
    hash ^= hash >>> 16
    return hash >>> 0
  }
}

function mulberry32(seed: number): () => number {
  let value = seed | 0
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const ICARMATRIX_STIMULUS_SET_VERSION = 'icarmatrix-gen-v1.0.0'
export const ICARMATRIX_OPTION_COUNT = 6
export const ICARMATRIX_BANK_SIZE = 8
const SHAPE_COUNT = 6
const FILL_COUNT = 3

export type CellSpec = { shape: number; fill: number; count: number }
export type IcarmatrixItem = {
  cells: CellSpec[] // 8 shown cells; cell 8 (bottom-right) is the query
  options: CellSpec[]
  answerIndex: number
}

type AttributeRule = 'constant' | 'progression' | 'distribution'

const valueAt = (rule: AttributeRule, start: number, row: number, col: number, modulus: number): number => {
  if (rule === 'constant') return start % modulus
  if (rule === 'progression') return (start + col) % modulus
  // distribution: each row is a rotation of the value set
  return (start + row + col) % modulus
}

const buildCell = (shapeRule: AttributeRule, fillRule: AttributeRule, countRule: AttributeRule, s0: number, f0: number, c0: number, row: number, col: number): CellSpec => ({
  shape: valueAt(shapeRule, s0, row, col, SHAPE_COUNT),
  fill: valueAt(fillRule, f0, row, col, FILL_COUNT),
  count: valueAt(countRule, c0, row, col, 3) + 1,
})

const sameCell = (a: CellSpec, b: CellSpec): boolean => a.shape === b.shape && a.fill === b.fill && a.count === b.count

const key = (cell: CellSpec): string => `${cell.shape}-${cell.fill}-${cell.count}`

const buildOptions = (correct: CellSpec, random: () => number): { options: CellSpec[]; answerIndex: number } => {
  const distractors: CellSpec[] = []
  const seen = new Set<string>([key(correct)])
  const variants: CellSpec[] = []
  for (let shape = 0; shape < SHAPE_COUNT; shape += 1) variants.push({ ...correct, shape })
  for (let fill = 0; fill < FILL_COUNT; fill += 1) variants.push({ ...correct, fill })
  for (let count = 1; count <= 3; count += 1) variants.push({ ...correct, count })
  const shuffled = [...variants]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
  }
  for (const variant of shuffled) {
    if (distractors.length >= ICARMATRIX_OPTION_COUNT - 1) break
    if (seen.has(key(variant))) continue
    seen.add(key(variant))
    distractors.push(variant)
  }
  const options = [correct, ...distractors]
  for (let index = options.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[options[index], options[swap]] = [options[swap], options[index]]
  }
  return { options, answerIndex: options.findIndex((option) => sameCell(option, correct)) }
}

type GeneratedSpec = { shapeRule: AttributeRule; fillRule: AttributeRule; countRule: AttributeRule; s0: number; f0: number; c0: number }

const specFor = (seed: string, index: number): GeneratedSpec => {
  const random = mulberry32(xmur3(`${seed}:icarmatrix:spec:${index}`)())
  const rulePool: AttributeRule[][] = [
    ['progression', 'distribution', 'constant'],
    ['distribution', 'progression', 'constant'],
    ['constant', 'progression', 'distribution'],
  ]
  const ruleSet = rulePool[index % rulePool.length]
  return {
    shapeRule: ruleSet[0],
    fillRule: ruleSet[1],
    countRule: ruleSet[2],
    s0: Math.floor(random() * SHAPE_COUNT),
    f0: Math.floor(random() * FILL_COUNT),
    c0: Math.floor(random() * 3),
  }
}

const generatedItem = (seed: string, index: number): IcarmatrixItem => {
  const spec = specFor(seed, index)
  const cells: CellSpec[] = []
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      cells.push(buildCell(spec.shapeRule, spec.fillRule, spec.countRule, spec.s0, spec.f0, spec.c0, row, col))
    }
  }
  const shown = cells.slice(0, 8)
  const random = mulberry32(xmur3(`${seed}:icarmatrix:opts:${index}`)())
  const { options, answerIndex } = buildOptions(cells[8], random)
  return { cells: shown, options, answerIndex }
}

export type FrozenIcarmatrixItem = { cells: [CellSpec, CellSpec, CellSpec, CellSpec, CellSpec, CellSpec, CellSpec, CellSpec]; options: [CellSpec, CellSpec, CellSpec, CellSpec, CellSpec, CellSpec]; answerIndex: number }

const cell = (shape: number, fill: number, count: number): CellSpec => ({ shape, fill, count })

/** Frozen hand-authored bank (first 8 trials; stable across seeds). */
export const ICARMATRIX_FROZEN_BANK: FrozenIcarmatrixItem[] = [
  {
    cells: [cell(0, 2, 1), cell(0, 2, 1), cell(0, 2, 1), cell(0, 2, 1), cell(0, 2, 1), cell(0, 2, 1), cell(0, 2, 1), cell(0, 2, 1)],
    options: [cell(0, 2, 1), cell(1, 2, 1), cell(2, 2, 1), cell(3, 2, 1), cell(4, 2, 1), cell(5, 2, 1)],
    answerIndex: 0,
  },
  {
    cells: [cell(1, 0, 1), cell(2, 0, 1), cell(3, 0, 1), cell(1, 0, 1), cell(2, 0, 1), cell(3, 0, 1), cell(1, 0, 1), cell(2, 0, 1)],
    options: [cell(1, 0, 1), cell(3, 0, 1), cell(2, 0, 1), cell(4, 0, 1), cell(0, 0, 1), cell(5, 0, 1)],
    answerIndex: 1,
  },
  {
    cells: [cell(0, 0, 1), cell(0, 1, 1), cell(0, 2, 1), cell(0, 0, 1), cell(0, 1, 1), cell(0, 2, 1), cell(0, 0, 1), cell(0, 1, 1)],
    options: [cell(0, 0, 1), cell(0, 2, 1), cell(0, 1, 1), cell(1, 2, 1), cell(2, 2, 1), cell(3, 2, 1)],
    answerIndex: 1,
  },
  {
    cells: [cell(0, 2, 1), cell(1, 2, 1), cell(2, 2, 1), cell(0, 2, 1), cell(1, 2, 1), cell(2, 2, 1), cell(0, 2, 1), cell(1, 2, 1)],
    options: [cell(0, 2, 1), cell(1, 2, 1), cell(2, 2, 1), cell(3, 2, 1), cell(4, 2, 1), cell(5, 2, 1)],
    answerIndex: 2,
  },
  {
    cells: [cell(0, 2, 1), cell(0, 2, 2), cell(0, 2, 3), cell(0, 2, 1), cell(0, 2, 2), cell(0, 2, 3), cell(0, 2, 1), cell(0, 2, 2)],
    options: [cell(0, 2, 1), cell(0, 2, 2), cell(0, 2, 3), cell(1, 2, 3), cell(2, 2, 3), cell(3, 2, 3)],
    answerIndex: 2,
  },
  {
    cells: [cell(0, 2, 1), cell(1, 2, 1), cell(2, 2, 1), cell(2, 2, 1), cell(0, 2, 1), cell(1, 2, 1), cell(1, 2, 1), cell(2, 2, 1)],
    options: [cell(0, 2, 1), cell(1, 2, 1), cell(2, 2, 1), cell(3, 2, 1), cell(4, 2, 1), cell(5, 2, 1)],
    answerIndex: 0,
  },
  {
    cells: [cell(4, 0, 2), cell(5, 0, 2), cell(4, 0, 2), cell(5, 0, 2), cell(4, 0, 2), cell(5, 0, 2), cell(4, 0, 2), cell(5, 0, 2)],
    options: [cell(4, 0, 2), cell(5, 0, 2), cell(3, 0, 2), cell(2, 0, 2), cell(1, 0, 2), cell(0, 0, 2)],
    answerIndex: 1,
  },
  {
    cells: [cell(2, 2, 2), cell(3, 2, 2), cell(2, 2, 2), cell(3, 2, 2), cell(2, 2, 2), cell(3, 2, 2), cell(2, 2, 2), cell(3, 2, 2)],
    options: [cell(2, 2, 2), cell(3, 2, 2), cell(4, 2, 2), cell(1, 2, 2), cell(0, 2, 2), cell(5, 2, 2)],
    answerIndex: 1,
  },
]

/** 双轨取题：前 BANK_SIZE 题用冻结题库，其后按 seed 生成（重复施测不复现）。 */
export const icarmatrixItem = (seed: string, index: number): IcarmatrixItem => {
  if (index < ICARMATRIX_BANK_SIZE) {
    const frozen = ICARMATRIX_FROZEN_BANK[index]
    return { cells: frozen.cells, options: frozen.options, answerIndex: frozen.answerIndex }
  }
  return generatedItem(seed, index)
}
