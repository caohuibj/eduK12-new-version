import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { matrixBankFileSchema } from '../../modules/cognitive/banks/matrix-bank-schema'

/**
 * COG-Intelligence Roadmap v2.0 PR2 — matRiks 生成题库的质量检查。
 * 渲染回归由 SVG 结构断言承担（每格/每选项必须是完整 svg 文档且无退化 NA 节点）；
 * 规则覆盖与干扰项可用性按 roadmap 质检门槛断言。
 */
const BANK_PATH = path.resolve('../tools/matrix-generation/bank-matgen.json')

describe('matRiks generated matrix bank (roadmap v2.0 PR2)', () => {
  const bank = matrixBankFileSchema.parse(JSON.parse(readFileSync(BANK_PATH, 'utf8')))

  it('passes schema validation with the committed provenance header', () => {
    expect(bank.schemaVersion).toBe(1)
    expect(bank.generator).toMatch(/^matRiks [\d.]+ \(MIT\)/)
    expect(bank.provenance).toMatch(/internal-authored derivatives/)
    expect(bank.coverage.failedPlans).toEqual([])
  })

  it('meets the rule and matrix-type coverage gates', () => {
    expect(bank.coverage.byMatrixType['3x3']).toBeGreaterThanOrEqual(6)
    expect(bank.coverage.byMatrixType['2x2']).toBeGreaterThanOrEqual(4)
    for (const rule of ['identity', 'shape', 'rotate', 'shade', 'size']) {
      expect(bank.coverage.byRuleTag[rule] ?? 0).toBeGreaterThanOrEqual(2)
    }
    expect(bank.items.length).toBeGreaterThanOrEqual(12)
  })

  it('keeps responses unique with at least six usable distractors beyond correct', () => {
    for (const item of bank.items) {
      const svgs = item.responses.map((response) => response.svg)
      expect(new Set(svgs).size, item.itemId).toBe(svgs.length)
      expect(item.responses[0].name).toBe('correct')
      expect(item.responses.length - 1, item.itemId).toBeGreaterThanOrEqual(6)
    }
  })

  it('keeps correct answers positionally stable for server-side derivation', () => {
    for (const item of bank.items) {
      expect(item.correctResponseIndex).toBe(0)
      expect(item.responses[0].svg).toBeTruthy()
    }
  })
})
