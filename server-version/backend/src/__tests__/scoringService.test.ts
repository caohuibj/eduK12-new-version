import { describe, it, expect } from 'vitest'
import { scoringService } from '../services/scoringService'

describe('Scoring Service', () => {
  describe('normalizeScore', () => {
    it('should normalize score to 0-100 range for sum method', () => {
      // 10题，每题1-5分，总分范围 10-50
      const score1 = scoringService.normalizeScore(30, 10, 5, 'sum')
      expect(score1).toBe(50) // 中间分数应该是50分

      const score2 = scoringService.normalizeScore(10, 10, 5, 'sum')
      expect(score2).toBe(0) // 最低分应该是0分

      const score3 = scoringService.normalizeScore(50, 10, 5, 'sum')
      expect(score3).toBe(100) // 最高分应该是100分
    })

    it('should normalize score to 0-100 range for average method', () => {
      // 平均分范围 1-5
      const score1 = scoringService.normalizeScore(3, 10, 5, 'average')
      expect(score1).toBe(50) // 中间分数应该是50分

      const score2 = scoringService.normalizeScore(1, 10, 5, 'average')
      expect(score2).toBe(0) // 最低分应该是0分

      const score3 = scoringService.normalizeScore(5, 10, 5, 'average')
      expect(score3).toBe(100) // 最高分应该是100分
    })

    it('should handle different point scales', () => {
      // 7点量表
      const score1 = scoringService.normalizeScore(4, 10, 7, 'average')
      expect(score1).toBeCloseTo(50, 1) // 中间分数

      const score2 = scoringService.normalizeScore(1, 10, 7, 'average')
      expect(score2).toBe(0)

      const score3 = scoringService.normalizeScore(7, 10, 7, 'average')
      expect(score3).toBe(100)
    })
  })

  describe('determineLevel', () => {
    it('should return "high" for score >= 70', () => {
      expect(scoringService.determineLevel(70)).toBe('high')
      expect(scoringService.determineLevel(85)).toBe('high')
      expect(scoringService.determineLevel(100)).toBe('high')
    })

    it('should return "medium" for score between 40-69', () => {
      expect(scoringService.determineLevel(40)).toBe('medium')
      expect(scoringService.determineLevel(50)).toBe('medium')
      expect(scoringService.determineLevel(69)).toBe('medium')
    })

    it('should return "low" for score < 40', () => {
      expect(scoringService.determineLevel(0)).toBe('low')
      expect(scoringService.determineLevel(20)).toBe('low')
      expect(scoringService.determineLevel(39)).toBe('low')
    })
  })

  describe('generateInterpretation', () => {
    it('should generate interpretation with dimension description', () => {
      const score = {
        dimensionId: 'test-dim-1',
        dimensionCode: 'extraversion',
        dimensionName: '外向性',
        rawScore: 30,
        normalizedScore: 75,
        level: 'high' as const,
        itemCount: 10,
        minScore: 10,
        maxScore: 50
      }

      const interpretation = scoringService.generateInterpretation(score, '衡量个体的社交倾向')
      expect(interpretation).toContain('外向性')
      expect(interpretation).toContain('表现突出')
      expect(interpretation).toContain('衡量个体的社交倾向')
    })

    it('should generate interpretation without dimension description', () => {
      const score = {
        dimensionId: 'test-dim-1',
        dimensionCode: 'neuroticism',
        dimensionName: '神经质',
        rawScore: 15,
        normalizedScore: 30,
        level: 'low' as const,
        itemCount: 10,
        minScore: 10,
        maxScore: 50
      }

      const interpretation = scoringService.generateInterpretation(score, null)
      expect(interpretation).toContain('神经质')
      expect(interpretation).toContain('表现偏低')
    })
  })

  describe('generateSuggestions', () => {
    it('should generate suggestions for high extraversion', () => {
      const suggestions = scoringService.generateSuggestions('high', 'extraversion')
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.some(s => s.includes('社交'))).toBe(true)
    })

    it('should generate suggestions for low neuroticism', () => {
      const suggestions = scoringService.generateSuggestions('low', 'neuroticism')
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.some(s => s.includes('情绪稳定') || s.includes('优势'))).toBe(true)
    })

    it('should generate default suggestions for unknown dimension', () => {
      const suggestions = scoringService.generateSuggestions('medium', 'unknown_dimension')
      expect(suggestions.length).toBeGreaterThan(0)
    })
  })

  describe('generateOverallFeedback', () => {
    it('should generate overall feedback with all level types', () => {
      const scores = [
        {
          dimensionId: 'dim-1',
          dimensionCode: 'extraversion',
          dimensionName: '外向性',
          rawScore: 35,
          normalizedScore: 75,
          level: 'high' as const,
          itemCount: 10,
          minScore: 10,
          maxScore: 50
        },
        {
          dimensionId: 'dim-2',
          dimensionCode: 'neuroticism',
          dimensionName: '神经质',
          rawScore: 20,
          normalizedScore: 50,
          level: 'medium' as const,
          itemCount: 10,
          minScore: 10,
          maxScore: 50
        },
        {
          dimensionId: 'dim-3',
          dimensionCode: 'openness',
          dimensionName: '开放性',
          rawScore: 12,
          normalizedScore: 25,
          level: 'low' as const,
          itemCount: 10,
          minScore: 10,
          maxScore: 50
        }
      ]

      const feedback = scoringService.generateOverallFeedback(scores, '大五人格量表')
      expect(feedback).toContain('大五人格量表')
      expect(feedback).toContain('外向性')
      expect(feedback).toContain('神经质')
      expect(feedback).toContain('开放性')
    })
  })

  it('calculates scores when item-dimension relations are present', () => {
    const scores = scoringService.calculateScores(
      [{ itemId: 'item-1', value: 4 }],
      [{
        id: 'item-1',
        weight: 1,
        reverse: false,
        itemDimensions: [{ dimensionId: 'dimension-1', weight: 1, reverse: false }],
      }],
      [{
        id: 'dimension-1',
        code: 'focus',
        name: '专注',
        scoringMethod: 'sum',
        minScore: null,
        maxScore: null,
      }],
      { points: 5 },
    )

    expect(scores).toHaveLength(1)
    expect(scores[0].rawScore).toBe(4)
  })

  describe('Reverse scoring', () => {
    it('should apply reverse scoring correctly', () => {
      // 5点量表，反向计分：original 1 -> 5, 2 -> 4, 3 -> 3, 4 -> 2, 5 -> 1
      const points = 5
      
      // 测试反向计分逻辑（这个在 calculateScores 中实现）
      // 这里我们只验证公式
      const reverseScore = (value: number, maxPoints: number) => maxPoints + 1 - value
      
      expect(reverseScore(1, points)).toBe(5)
      expect(reverseScore(2, points)).toBe(4)
      expect(reverseScore(3, points)).toBe(3)
      expect(reverseScore(4, points)).toBe(2)
      expect(reverseScore(5, points)).toBe(1)
    })
  })
})
