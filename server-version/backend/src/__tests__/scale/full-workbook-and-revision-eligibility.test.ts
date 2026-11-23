import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import {
  parseFullScaleWorkbook,
  scaleFullTemplateWorkbook,
} from '../../modules/scale/scale-full-workbook'
import { scaleCopyEligibility } from '../../modules/scale/scale-copy.service'

describe('one-step full scale Excel workbook import', () => {
  it('round-trips the generated 3-sheet template into a valid ScaleDefinitionV2 with threshold feedback', async () => {
    const buffer = await scaleFullTemplateWorkbook()
    const parsed = await parseFullScaleWorkbook(buffer)

    expect(parsed.count).toBe(2)
    expect(parsed.reportConfigured).toBe(true)
    expect(parsed.definition.responseSets).toHaveLength(1)
    expect(parsed.definition.responseSets[0].options).toHaveLength(5)
    expect(parsed.definition.items.map((i) => i.itemCode)).toEqual(['Q1', 'Q2'])
    expect(parsed.definition.scoring.itemRules).toEqual([
      { itemCode: 'Q1', transform: { type: 'identity' } },
      { itemCode: 'Q2', transform: { type: 'reverse' } },
    ])
    expect(parsed.definition.scoring.scores).toHaveLength(1)
    expect(parsed.definition.scoring.scores[0]).toMatchObject({
      key: 'self_reg',
      label: '自我调节',
      source: { type: 'items', aggregation: 'mean' },
    })
    expect(parsed.definition.report.rawScoreFeedback?.rules).toHaveLength(1)
    expect(parsed.definition.report.rawScoreFeedback?.rules[0].ranges).toHaveLength(2)
  })

  it('produces a DATA_COLLECTION_ONLY scale (reportConfigured=false) when 阈值报告 is left blank', async () => {
    const book = new ExcelJS.Workbook()
    const opts = book.addWorksheet('选项组')
    opts.addRow(['选项组', '选项值', '选项文字', '分值'])
    opts.addRow(['likert', '1', '否', 1])
    opts.addRow(['likert', '2', '是', 2])

    const items = book.addWorksheet('题目与计分')
    items.addRow(['题号', '题干', '反向', '选项组', '维度标识', '维度名称', '聚合方式'])
    items.addRow(['Q1', '科研采集题 1', '否', 'likert', 'total', '总分', '求和'])

    const report = book.addWorksheet('阈值报告')
    report.addRow(['指标标识', '分档标识', '下限含', '上限', '含上限', '报告文字'])

    const buffer = Buffer.from(await book.xlsx.writeBuffer())
    const parsed = await parseFullScaleWorkbook(buffer)
    expect(parsed.reportConfigured).toBe(false)
    expect(parsed.definition.report.reportVersion).toBe('none-v1')
    expect(parsed.definition.report.rawScoreFeedback).toBeUndefined()
  })

  it('rejects unknown metric keys in 阈值报告 and malformed buffers', async () => {
    const book = new ExcelJS.Workbook()
    const opts = book.addWorksheet('选项组')
    opts.addRow(['选项组', '选项值', '选项文字', '分值'])
    opts.addRow(['likert', '1', '否', 1])
    opts.addRow(['likert', '2', '是', 2])

    const items = book.addWorksheet('题目与计分')
    items.addRow(['题号', '题干', '反向', '选项组', '维度标识', '维度名称', '聚合方式'])
    items.addRow(['Q1', '题干', '否', 'likert', 'dim_a', '维度A', '平均'])

    const report = book.addWorksheet('阈值报告')
    report.addRow(['指标标识', '分档标识', '下限含', '上限', '含上限', '报告文字'])
    report.addRow(['unknown_dim', 'low', 1, 2, '是', '说明'])

    const buffer = Buffer.from(await book.xlsx.writeBuffer())
    await expect(parseFullScaleWorkbook(buffer)).rejects.toThrow(/量表导入未通过校验/)
    await expect(parseFullScaleWorkbook(Buffer.from('not-an-xlsx'))).rejects.toThrow(/量表导入未通过校验/)
  })
})

describe('scaleCopyEligibility for COPY vs REVISION', () => {
  const baseScale = (license: { status: string; redistribution: string }) => ({
    id: 'scale-1',
    code: 'custom_1',
    creatorId: 'author-1',
    status: 'PUBLISHED',
    instrumentClass: 'CUSTOM_DESCRIPTIVE',
    instrumentVersion: '1.0.0',
    definition: { license },
    definitionHash: 'a'.repeat(64),
    libraryEntryId: null,
  })

  it('keeps independent COPY restricted to self_authored + allowed redistribution', () => {
    expect(scaleCopyEligibility(baseScale({ status: 'self_authored', redistribution: 'allowed' }), 'author-1', 'COPY').allowed).toBe(true)
    expect(scaleCopyEligibility(baseScale({ status: 'self_authored', redistribution: 'restricted' }), 'author-1', 'COPY').allowed).toBe(false)
    expect(scaleCopyEligibility(baseScale({ status: 'authorized', redistribution: 'allowed' }), 'author-1', 'COPY').allowed).toBe(false)
  })

  it('allows the original author to create same-family REVISION drafts for self_authored scales even when restricted, without granting third-party adaptation rights', () => {
    expect(scaleCopyEligibility(baseScale({ status: 'self_authored', redistribution: 'restricted' }), 'author-1', 'REVISION').allowed).toBe(true)
    expect(scaleCopyEligibility(baseScale({ status: 'self_authored', redistribution: 'allowed' }), 'author-1', 'REVISION').allowed).toBe(true)
    expect(scaleCopyEligibility(baseScale({ status: 'authorized', redistribution: 'restricted' }), 'author-1', 'REVISION').allowed).toBe(false)
    expect(scaleCopyEligibility(baseScale({ status: 'authorized', redistribution: 'allowed' }), 'author-1', 'REVISION').allowed).toBe(false)
    expect(scaleCopyEligibility(baseScale({ status: 'unknown', redistribution: 'restricted' }), 'author-1', 'REVISION').allowed).toBe(false)
    expect(scaleCopyEligibility(baseScale({ status: 'self_authored', redistribution: 'restricted' }), 'other-user', 'REVISION').allowed).toBe(false)
  })
})
