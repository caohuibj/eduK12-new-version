export type SentenceShape = 'circle' | 'square' | 'triangle'
export type SentenceColor = 'red' | 'blue' | 'green' | 'yellow'
export type SentenceQuestionKind = 'shape' | 'color'

export interface SentencecheckStimulus {
  shape: SentenceShape
  color: SentenceColor
  questionKind: SentenceQuestionKind
  negated: boolean
  askedValue: string
  sentence: string
}

const SHAPES: SentenceShape[] = ['circle', 'square', 'triangle']
const SHAPE_NAMES: Record<SentenceShape, string> = { circle: '圆形', square: '方形', triangle: '三角形' }
const COLORS: SentenceColor[] = ['red', 'blue', 'green', 'yellow']
const COLOR_NAMES: Record<SentenceColor, string> = { red: '红色', blue: '蓝色', green: '绿色', yellow: '黄色' }

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

/**
 * Engine 1.1.0: preserve rounded margins and guarantee all four truth × polarity cells.
 * The joint count is nearest to independence, constrained to keep every cell nonempty.
 * Mirrored in the task-owned backend/frontend generator-v1.1.ts; checked by a parity test.
 */
export const buildSentencecheckTrialsV11 = (
  seed: string,
  totalTrials: number,
  trueRatio: number,
  negationRatio: number,
): SentencecheckStimulus[] => {
  const trueCount = Math.round(totalTrials * trueRatio)
  const negatedCount = Math.round(totalTrials * negationRatio)
  if (!Number.isSafeInteger(totalTrials) || totalTrials < 4 ||
      !Number.isFinite(trueRatio) || !Number.isFinite(negationRatio) ||
      trueCount < 2 || trueCount > totalTrials - 2 ||
      negatedCount < 2 || negatedCount > totalTrials - 2) {
    throw new Error('sentencecheck 1.1.0 requires at least two trials in each truth and polarity margin')
  }
  const minimumJoint = Math.max(1, trueCount + negatedCount - totalTrials + 1)
  const maximumJoint = Math.min(trueCount - 1, negatedCount - 1)
  const joint = Math.max(minimumJoint, Math.min(maximumJoint, Math.round(trueCount * negatedCount / totalTrials)))
  const cells = [
    { negated: false, statementTrue: true, count: trueCount - joint },
    { negated: false, statementTrue: false, count: totalTrials - trueCount - negatedCount + joint },
    { negated: true, statementTrue: true, count: joint },
    { negated: true, statementTrue: false, count: negatedCount - joint },
  ]
  const conditions = cells.flatMap(({ negated, statementTrue, count }) =>
    Array.from({ length: count }, () => ({ negated, statementTrue })))
  const random = mulberry32(xmur3(`${seed}:sentencecheck-crossed-v1.1.0`)())
  for (let index = conditions.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[conditions[index], conditions[swap]] = [conditions[swap], conditions[index]]
  }
  return conditions.map(({ negated, statementTrue }) => {
    const shape = SHAPES[Math.floor(random() * SHAPES.length)]
    const color = COLORS[Math.floor(random() * COLORS.length)]
    const questionKind: SentenceQuestionKind = random() < 0.5 ? 'shape' : 'color'
    const actualValue = questionKind === 'shape' ? SHAPE_NAMES[shape] : COLOR_NAMES[color]
    const pool = questionKind === 'shape' ? Object.values(SHAPE_NAMES) : Object.values(COLOR_NAMES)
    const alternatives = pool.filter((value) => value !== actualValue)
    const askedValue = statementTrue !== negated
      ? actualValue
      : alternatives[Math.floor(random() * alternatives.length)]
    return {
      shape, color, questionKind, negated, askedValue,
      sentence: `${askedValue}${negated ? '不是' : '是'}图片的${questionKind === 'shape' ? '形状' : '颜色'}`,
    }
  })
}
