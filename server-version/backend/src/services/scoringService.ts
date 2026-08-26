import { prisma } from '../config/database'
import { logger } from '../utils/logger'

// ==================== 类型定义 ====================

export interface Answer {
  itemId: string
  value: number | string
  answeredAt?: Date
  responseTime?: number
}

export interface DimensionScore {
  dimensionId: string
  dimensionCode: string
  dimensionName: string
  rawScore: number
  normalizedScore: number
  level: 'high' | 'medium' | 'low'
  itemCount: number
  minScore: number  // 维度最低可能分数
  maxScore: number  // 维度最高可能分数
}

// 等级配置类型
export interface LevelConfig {
  name: string
  min: number
  max: number
  interpretation: string
  suggestions: string[]
}

export interface LevelFeedback {
  levels: LevelConfig[]
}

export interface FeedbackResult {
  overall: string
  dimensions: Array<{
    dimensionId: string
    dimensionCode: string
    dimensionName: string
    score: number
    minScore: number  // 维度最低可能分数
    maxScore: number  // 维度最高可能分数
    level: string
    levelName?: string
    interpretation: string
    suggestions: string[]
  }>
  feedbackLevel: string
}

// ==================== 辅助函数 ====================

/**
 * 归一化分数到 0-100
 */
export function normalizeScore(
  rawScore: number,
  itemCount: number,
  points: number,
  method: string
): number {
  // 计算理论最小/最大分数
  const minPossible = itemCount // 每题最低 1 分
  const maxPossible = itemCount * points // 每题最高 points 分

  if (method === 'average') {
    // 平均分归一化
    return ((rawScore - 1) / (points - 1)) * 100
  } else {
    // 总分归一化
    return ((rawScore - minPossible) / (maxPossible - minPossible)) * 100
  }
}

/**
 * 确定分数等级
 */
export function determineLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

/**
 * 根据自定义等级配置查找对应等级
 */
export function findLevelByScore(
  rawScore: number,
  levelFeedback?: LevelFeedback | null
): { name: string; interpretation: string; suggestions: string[] } | null {
  if (!levelFeedback?.levels || levelFeedback.levels.length === 0) {
    return null
  }

  for (const level of levelFeedback.levels) {
    if (rawScore >= level.min && rawScore <= level.max) {
      return {
        name: level.name,
        interpretation: level.interpretation,
        suggestions: level.suggestions || []
      }
    }
  }

  return null
}

/**
 * 生成维度解读
 */
export function generateInterpretation(
  score: DimensionScore,
  dimensionDescription?: string | null
): string {
  const baseInterpretation = `您在"${score.dimensionName}"维度上的得分为${score.normalizedScore}分`
  const levelInterpretation = {
    high: '表现突出',
    medium: '表现中等',
    low: '表现偏低'
  }[score.level]
  const description = dimensionDescription ? `。${dimensionDescription}` : ''

  return `${baseInterpretation}，${levelInterpretation}${description}`
}

/**
 * 生成建议
 */
export function generateSuggestions(level: string, dimensionCode: string): string[] {
  const suggestions: Record<string, Record<string, string[]>> = {
    high: {
      extraversion: [
        '继续保持积极的社交态度',
        '可以尝试领导团队活动',
        '注意平衡社交与独处时间'
      ],
      neuroticism: [
        '学习情绪管理技巧',
        '建立规律的生活作息',
        '寻求专业心理咨询支持'
      ],
      default: ['继续保持当前的良好状态', '设定更高的成长目标']
    },
    medium: {
      extraversion: [
        '尝试主动发起社交活动',
        '加入兴趣小组或社团',
        '练习在公众场合表达观点'
      ],
      neuroticism: [
        '关注自己的情绪变化',
        '学习放松和减压技巧',
        '建立健康的应对机制'
      ],
      default: ['保持当前的平衡状态', '寻找提升的空间']
    },
    low: {
      extraversion: [
        '不必强迫自己成为社交达人',
        '寻找适合自己的社交方式',
        '专注于深度而非广度的社交关系'
      ],
      neuroticism: [
        '您情绪稳定，这是一个优势',
        '继续培养积极的心态',
        '帮助他人应对情绪问题'
      ],
      default: ['接纳自己的特点', '在自己的优势领域发展']
    }
  }

  return suggestions[level]?.[dimensionCode] || suggestions[level]?.default || []
}

/**
 * 生成总体反馈
 */
export function generateOverallFeedback(scores: DimensionScore[], scaleName: string): string {
  const dimensionNames = scores
    .map((score) => score.dimensionName)
    .filter(Boolean)
    .join('、')
  const dimensions = dimensionNames ? `本次测评维度包括${dimensionNames}。` : ''
  return `您已完成"${scaleName}"测评。${dimensions}请查看各维度的详细解读，了解您的测评结果。`
}

// ==================== 主要计算函数 ====================

/**
 * 计算量表各维度分数（同步版本，用于已有数据）
 */
export function calculateScores(
  answers: Answer[],
  items: any[],
  dimensions: any[],
  scaleConfig?: { points?: number } | null
): DimensionScore[] {
  // 从量表配置获取点数，默认5点量表
  const points = scaleConfig?.points || 5

  // 创建答案映射
  const answerMap = new Map<string, number>()
  answers.forEach(answer => {
    answerMap.set(answer.itemId, Number(answer.value))
  })

  // 计算每个维度的分数
  const dimensionScores: DimensionScore[] = []

  for (const dimension of dimensions) {
    // 获取该维度关联的所有题目
    const dimensionItems = items.filter(item =>
      item.itemDimensions?.some((id: any) => id.dimensionId === dimension.id)
    )

    if (dimensionItems.length === 0) {
      continue
    }

    let totalScore = 0
    let totalWeight = 0
    let itemCount = 0

    for (const item of dimensionItems) {
      const answerValue = answerMap.get(item.id)
      if (answerValue === undefined) continue

      // 获取题目在该维度的关联配置
      const itemDim = item.itemDimensions?.find((id: any) => id.dimensionId === dimension.id)
      if (!itemDim) continue

      // 计算分数
      let score = answerValue

      // 应用反向计分
      const isReverse = itemDim.reverse || item.reverse
      if (isReverse) {
        score = points + 1 - score
      }

      // 应用权重
      const weight = Number(itemDim.weight) * Number(item.weight)
      totalScore += score * weight
      totalWeight += weight
      itemCount++
    }

    // 根据计分方式计算最终分数
    let rawScore: number
    if (dimension.scoringMethod === 'average') {
      rawScore = totalWeight > 0 ? totalScore / totalWeight : 0
    } else {
      rawScore = totalScore
    }

    // 计算理论最小/最大分数
    const theoreticalMin = itemCount // 每题最低 1 分
    const theoreticalMax = itemCount * points // 每题最高 points 分

    // 使用自定义分数区间（如果有设置）或理论分数区间
    const minPossible = dimension.minScore !== null && dimension.minScore !== undefined
      ? Number(dimension.minScore)
      : theoreticalMin
    const maxPossible = dimension.maxScore !== null && dimension.maxScore !== undefined
      ? Number(dimension.maxScore)
      : theoreticalMax

    // 归一化分数到 0-100（使用自定义区间）
    let normalizedScoreValue: number
    if (maxPossible > minPossible) {
      normalizedScoreValue = ((rawScore - minPossible) / (maxPossible - minPossible)) * 100
      // 确保在 0-100 范围内
      normalizedScoreValue = Math.max(0, Math.min(100, normalizedScoreValue))
    } else {
      normalizedScoreValue = 0
    }

    // 确定等级
    const level = determineLevel(normalizedScoreValue)

    dimensionScores.push({
      dimensionId: dimension.id,
      dimensionCode: dimension.code,
      dimensionName: dimension.name,
      rawScore: Math.round(rawScore * 100) / 100,
      normalizedScore: Math.round(normalizedScoreValue * 100) / 100,
      level,
      itemCount,
      minScore: minPossible,
      maxScore: maxPossible
    })
  }

  return dimensionScores
}

/**
 * 生成反馈报告
 */
export function generateFeedback(
  scores: DimensionScore[],
  dimensions: any[]
): FeedbackResult {
  // 生成维度反馈
  const dimensionFeedbacks = scores.map(score => {
    const dimension = dimensions.find((d: any) => d.id === score.dimensionId)
    return {
      dimensionId: score.dimensionId,
      dimensionCode: score.dimensionCode,
      dimensionName: score.dimensionName,
      score: score.normalizedScore,
      minScore: score.minScore,
      maxScore: score.maxScore,
      level: score.level,
      interpretation: generateInterpretation(score, dimension?.description),
      suggestions: generateSuggestions(score.level, score.dimensionCode)
    }
  })

  // 生成总体反馈
  const overall = generateOverallFeedback(scores, '测评')

  return {
    overall,
    dimensions: dimensionFeedbacks,
    feedbackLevel: 'basic'
  }
}

/**
 * 使用自定义等级配置生成反馈报告
 */
export function generateFeedbackWithLevels(
  scores: DimensionScore[],
  dimensions: any[],
  scaleName: string
): FeedbackResult {
  // 生成维度反馈
  const dimensionFeedbacks = scores.map(score => {
    const dimension = dimensions.find((d: any) => d.id === score.dimensionId)
    const levelFeedback = dimension?.levelFeedback as LevelFeedback | null
    
    // 尝试使用自定义等级配置
    const customLevel = findLevelByScore(score.rawScore, levelFeedback)
    
    if (customLevel) {
      // 使用自定义配置
      const interpretation = customLevel.interpretation.replace(
        /\{\{dimensionName\}\}/g,
        score.dimensionName
      )
      
      return {
        dimensionId: score.dimensionId,
        dimensionCode: score.dimensionCode,
        dimensionName: score.dimensionName,
        score: score.rawScore,
        minScore: score.minScore,
        maxScore: score.maxScore,
        level: score.level,
        levelName: customLevel.name,
        interpretation,
        suggestions: customLevel.suggestions
      }
    }
    
    // 回退到默认逻辑
    return {
      dimensionId: score.dimensionId,
      dimensionCode: score.dimensionCode,
      dimensionName: score.dimensionName,
      score: score.rawScore,
      minScore: score.minScore,
      maxScore: score.maxScore,
      level: score.level,
      interpretation: generateInterpretation(score, dimension?.description),
      suggestions: generateSuggestions(score.level, score.dimensionCode)
    }
  })

  // 生成总体反馈
  const overall = generateOverallFeedback(scores, scaleName)

  return {
    overall,
    dimensions: dimensionFeedbacks,
    feedbackLevel: 'custom'
  }
}

// ==================== 服务对象（保留原有接口） ====================

export const scoringService = {
  calculateScores,
  generateFeedback,
  generateFeedbackWithLevels,
  normalizeScore,
  determineLevel,
  findLevelByScore,
  generateInterpretation,
  generateSuggestions,
  generateOverallFeedback
}
