/**
 * Embeddedfigures shared generator (backend copy; identical mirror on the
 * frontend). Dual-track: the first BANK_SIZE items use a frozen hand-authored
 * geometry bank (stable across seeds); later items generate a field of
 * polygons from the session seed (MatGen-inspired), one of which belongs to
 * the target family (triangle) among lookalike distractors (quads/pentagons).
 * Client relays which polygon was clicked; server derives correctness.
 */
export const EMBEDDEDFIGURES_STIMULUS_SET_VERSION = 'embeddedfigures-zh-v1.0.0'
export const EMBEDDEDFIGURES_BANK_SIZE = 4
export const EMBEDDEDFIGURES_FIELD_SHAPES = 7
export const EMBEDDEDFIGURES_CANVAS = 300

export type Poly = { id: string; points: Array<{ x: number; y: number }>; family: 'triangle' | 'quad' | 'pentagon' }
export type EmbeddedfiguresItem = { field: Poly[]; targetId: string; targetOutline: Poly }

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

type Family = 'triangle' | 'quad' | 'pentagon'
const FAMILY_SIDES: Record<Family, number> = { triangle: 3, quad: 4, pentagon: 5 }

const polygonAt = (random: () => number, family: Family, centerX: number, centerY: number, radius: number, id: string): Poly => {
  const sides = FAMILY_SIDES[family]
  const rotation = random() * Math.PI * 2
  const points: Array<{ x: number; y: number }> = []
  for (let vertex = 0; vertex < sides; vertex += 1) {
    const angle = rotation + (vertex / sides) * Math.PI * 2
    const r = radius * (0.75 + random() * 0.5)
    points.push({ x: Math.round(centerX + Math.cos(angle) * r), y: Math.round(centerY + Math.sin(angle) * r) })
  }
  return { id, points, family }
}

const generatedItem = (seed: string, index: number): EmbeddedfiguresItem => {
  const random = mulberry32(xmur3(`${seed}:embeddedfigures:item:${index}`)())
  // slot layout: 7 positions on a jittered grid so shapes never overlap much
  const slots: Array<{ x: number; y: number }> = []
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (row === 2 && col >= 1) continue // bottom row keep 1 slot for balance → 7 slots
      slots.push({ x: 60 + col * 90 + (random() * 30 - 15), y: 60 + row * 90 + (random() * 30 - 15) })
    }
  }
  const targetSlot = Math.floor(random() * slots.length)
  const field: Poly[] = []
  let targetId = ''
  let targetOutline: Poly | null = null
  for (let shapeIndex = 0; shapeIndex < EMBEDDEDFIGURES_FIELD_SHAPES; shapeIndex += 1) {
    const isTarget = shapeIndex === targetSlot
    const family: Family = isTarget ? 'triangle' : (shapeIndex % 2 === 0 ? 'quad' : 'pentagon')
    const id = `s${shapeIndex}`
    const poly = polygonAt(random, family, slots[shapeIndex].x, slots[shapeIndex].y, 34 + random() * 10, id)
    field.push(poly)
    if (isTarget) {
      targetId = id
      targetOutline = poly
    }
  }
  return { field, targetId, targetOutline: targetOutline as Poly }
}

export type FrozenEmbeddedfiguresItem = { field: Poly[]; targetId: string; targetOutline: Poly }

const tri = (id: string, points: Array<[number, number]>): Poly => ({ id, points: points.map(([x, y]) => ({ x, y })), family: 'triangle' })
const quad = (id: string, points: Array<[number, number]>): Poly => ({ id, points: points.map(([x, y]) => ({ x, y })), family: 'quad' })
const pent = (id: string, points: Array<[number, number]>): Poly => ({ id, points: points.map(([x, y]) => ({ x, y })), family: 'pentagon' })

/** Frozen hand-authored bank (first 4 items; stable across seeds). */
export const EMBEDDEDFIGURES_FROZEN_BANK: FrozenEmbeddedfiguresItem[] = [
  {
    field: [
      tri('s0', [[30, 40], [70, 40], [50, 80]]),
      quad('s1', [[110, 30], [160, 30], [160, 90], [110, 90]]),
      pent('s2', [[220, 30], [260, 60], [240, 100], [200, 100], [190, 55]]),
      quad('s3', [[30, 120], [90, 120], [90, 170], [30, 170]]),
      pent('s4', [[130, 130], [180, 125], [195, 170], [155, 195], [120, 170]]),
      tri('s5', [[230, 130], [275, 190], [205, 185]]),
      quad('s6', [[40, 210], [100, 205], [95, 265], [35, 270]]),
    ],
    targetId: 's0',
    targetOutline: tri('target', [[30, 40], [70, 40], [50, 80]]),
  },
  {
    field: [
      quad('s0', [[35, 35], [85, 35], [85, 85], [35, 85]]),
      tri('s1', [[120, 40], [170, 55], [125, 90]]),
      pent('s2', [[225, 35], [265, 65], [245, 105], [205, 100], [210, 55]]),
      tri('s3', [[40, 125], [85, 130], [55, 175]]),
      quad('s4', [[130, 125], [185, 130], [180, 185], [125, 180]]),
      pent('s5', [[230, 125], [270, 155], [250, 195], [210, 190], [215, 145]]),
      tri('s6', [[125, 220], [180, 225], [150, 270]]),
    ],
    targetId: 's1',
    targetOutline: tri('target', [[120, 40], [170, 55], [125, 90]]),
  },
  {
    field: [
      pent('s0', [[35, 40], [75, 35], [90, 75], [55, 95], [30, 70]]),
      quad('s1', [[120, 35], [175, 40], [170, 90], [115, 85]]),
      tri('s2', [[225, 40], [270, 45], [235, 90]]),
      quad('s3', [[35, 130], [90, 125], [95, 180], [40, 185]]),
      tri('s4', [[125, 130], [175, 125], [145, 180]]),
      pent('s5', [[230, 130], [268, 160], [250, 200], [208, 195], [212, 148]]),
      quad('s6', [[40, 215], [95, 215], [95, 270], [40, 270]]),
    ],
    targetId: 's2',
    targetOutline: tri('target', [[225, 40], [270, 45], [235, 90]]),
  },
  {
    field: [
      tri('s0', [[35, 45], [80, 40], [50, 90]]),
      quad('s1', [[120, 40], [170, 35], [175, 85], [115, 90]]),
      tri('s2', [[225, 40], [272, 50], [230, 95]]),
      pent('s3', [[35, 130], [78, 128], [92, 172], [52, 195], [28, 165]]),
      quad('s4', [[125, 130], [182, 128], [186, 185], [120, 188]]),
      tri('s5', [[230, 130], [275, 135], [245, 188]]),
      pent('s6', [[125, 218], [168, 215], [185, 258], [148, 278], [115, 252]]),
    ],
    targetId: 's5',
    targetOutline: tri('target', [[230, 130], [275, 135], [245, 188]]),
  },
]

/** 双轨取题：前 BANK_SIZE 题用冻结几何，其后按 seed 生成（重复施测不复现）。 */
export const embeddedfiguresItem = (seed: string, index: number): EmbeddedfiguresItem => {
  if (index < EMBEDDEDFIGURES_BANK_SIZE) {
    const frozen = EMBEDDEDFIGURES_FROZEN_BANK[index]
    return { field: frozen.field, targetId: frozen.targetId, targetOutline: frozen.targetOutline }
  }
  return generatedItem(seed, index)
}
