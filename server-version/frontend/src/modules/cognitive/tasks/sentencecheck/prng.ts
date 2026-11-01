import type { SentencecheckTrialPayload } from '../../types'

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

const buildSentence = (questionKind: SentenceQuestionKind, askedValue: string, negated: boolean): string =>
  `${askedValue}${negated ? '不是' : '是'}图片的${questionKind === 'shape' ? '形状' : '颜色'}`

/**
 * 生成真伪平衡、否定比例受控的句图试次；askedValue 由目标真伪反推。
 */
export const buildSentencecheckTrials = (
  seed: string,
  totalTrials: number,
  trueRatio: number,
  negationRatio: number
): SentencecheckStimulus[] => {
  const random = mulberry32(xmur3(`${seed}:sentencecheck`)())
  const trueCount = Math.round(totalTrials * trueRatio)
  const negatedCount = Math.round(totalTrials * negationRatio)
  const truthFlags: boolean[] = Array.from({ length: totalTrials }, (_, index) => index < trueCount)
  const negatedFlags: boolean[] = Array.from({ length: totalTrials }, (_, index) => index < negatedCount)
  for (let index = truthFlags.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[truthFlags[index], truthFlags[swap]] = [truthFlags[swap], truthFlags[index]]
    ;[negatedFlags[index], negatedFlags[swap]] = [negatedFlags[swap], negatedFlags[index]]
  }
  return truthFlags.map((statementTrue, index) => {
    const shape = SHAPES[Math.floor(random() * SHAPES.length)]
    const color = COLORS[Math.floor(random() * COLORS.length)]
    const questionKind: SentenceQuestionKind = random() < 0.5 ? 'shape' : 'color'
    const actualValue = questionKind === 'shape' ? SHAPE_NAMES[shape] : COLOR_NAMES[color]
    const pool = questionKind === 'shape' ? Object.values(SHAPE_NAMES) : Object.values(COLOR_NAMES)
    const negated = negatedFlags[index]
    let askedValue: string
    if (statementTrue) {
      askedValue = negated
        ? pool.filter((value) => value !== actualValue)[Math.floor(random() * (pool.length - 1))]
        : actualValue
    } else {
      askedValue = negated ? actualValue : pool.filter((value) => value !== actualValue)[Math.floor(random() * (pool.length - 1))]
    }
    return {
      shape,
      color,
      questionKind,
      negated,
      askedValue,
      sentence: buildSentence(questionKind, askedValue, negated),
    }
  })
}

export const SENTENCECHECK_PRACTICE_TRIALS: SentencecheckStimulus[] = [
  { shape: 'circle', color: 'red', questionKind: 'shape', negated: false, askedValue: '圆形', sentence: '圆形是图片的形状' },
  { shape: 'circle', color: 'red', questionKind: 'color', negated: true, askedValue: '蓝色', sentence: '蓝色不是图片的颜色' },
]
