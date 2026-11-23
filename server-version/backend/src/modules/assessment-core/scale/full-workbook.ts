import ExcelJS from 'exceljs'
import {
  createCustomScaleDefinition,
  validateScaleDefinition,
  type ScaleDefinitionV2,
} from '../../scale/scale-definition'
import type { RawScoreFeedback } from '../../scale/raw-score-feedback'
import { ScaleImportValidationError, SCALE_IMPORT_MAX_ITEMS } from './import-parser'

const KEY_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const MAX_XLSX_BYTES = 2 * 1024 * 1024
const MAX_XLSX_EXPANDED_BYTES = 16 * 1024 * 1024
const MAX_XLSX_ENTRIES = 200
const MAX_XLSX_ROWS = 5000

const AGGREGATIONS: Record<string, 'sum' | 'mean'> = {
  sum: 'sum',
  mean: 'mean',
  求和: 'sum',
  平均: 'mean',
  均分: 'mean',
}

const textCell = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    throw new ScaleImportValidationError([{ line: 1, message: '不接受公式、超链接或富文本单元格，请填写纯文本/数字' }])
  }
  return String(value).trim()
}

const boolCell = (raw: string, fallback: boolean): boolean | null => {
  if (!raw) return fallback
  const lower = raw.toLowerCase()
  if (['true', '1', 'yes', '是'].includes(lower)) return true
  if (['false', '0', 'no', '否'].includes(lower)) return false
  return null
}

function assertBoundedXlsx(buffer: Buffer): void {
  if (!buffer.length || buffer.length > MAX_XLSX_BYTES) {
    throw new ScaleImportValidationError([{ line: 1, message: 'Excel 文件必须非空且不超过 2 MiB' }])
  }
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0 || end + 22 > buffer.length) {
    throw new ScaleImportValidationError([{ line: 1, message: '请选择有效的 .xlsx 工作簿文件' }])
  }
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  let expanded = 0
  if (count > MAX_XLSX_ENTRIES) {
    throw new ScaleImportValidationError([{ line: 1, message: 'Excel 归档条目过多' }])
  }
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new ScaleImportValidationError([{ line: 1, message: 'Excel 归档目录不完整' }])
    }
    expanded += buffer.readUInt32LE(offset + 24)
    if (expanded > MAX_XLSX_EXPANDED_BYTES) {
      throw new ScaleImportValidationError([{ line: 1, message: 'Excel 展开体积超过 16 MiB 限制' }])
    }
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
  }
}

/** Generate a 3-sheet Chinese Excel template for one-step scale authoring
 * (response options + items & dimensions + optional threshold feedback). */
export async function scaleFullTemplateWorkbook(): Promise<Buffer> {
  const book = new ExcelJS.Workbook()

  const optSheet = book.addWorksheet('选项组')
  optSheet.addRow(['选项组', '选项值', '选项文字', '分值'])
  optSheet.getRow(1).font = { bold: true }
  optSheet.views = [{ state: 'frozen', ySplit: 1 }]
  ;[
    ['default', '1', '完全不符合', 1],
    ['default', '2', '不太符合', 2],
    ['default', '3', '一般', 3],
    ['default', '4', '比较符合', 4],
    ['default', '5', '完全符合', 5],
  ].forEach((row) => optSheet.addRow(row))

  const itemSheet = book.addWorksheet('题目与计分')
  itemSheet.addRow(['题号', '题干', '反向', '选项组', '维度标识', '维度名称', '聚合方式'])
  itemSheet.getRow(1).font = { bold: true }
  itemSheet.views = [{ state: 'frozen', ySplit: 1 }]
  itemSheet.addRow(['Q1', '我能按计划完成每天的学习任务。', '否', 'default', 'self_reg', '自我调节', '平均'])
  itemSheet.addRow(['Q2', '面对困难时我容易直接放弃。', '是', 'default', 'self_reg', '自我调节', '平均'])

  const reportSheet = book.addWorksheet('阈值报告')
  reportSheet.addRow(['指标标识', '分档标识', '下限含', '上限', '含上限', '报告文字'])
  reportSheet.getRow(1).font = { bold: true }
  reportSheet.views = [{ state: 'frozen', ySplit: 1 }]
  reportSheet.addRow(['self_reg', 'low', 1, 3, '否', '当前自我调节得分偏低，建议先从拆解小目标与固定复习时段开始建立节奏。'])
  reportSheet.addRow(['self_reg', 'high', 3, 5, '是', '当前自我调节表现较好，能够稳定推进学习计划并应对干扰。'])

  const help = book.addWorksheet('填写说明')
  help.addRows([
    ['使用方式', '一次填写 3 张表即可完成整份量表的选项组、题目、维度计分与阈值报告导入，无需提前在页面手工建维度和选项组。'],
    ['选项组表', '每行一个选项；目前自定义量表使用单一共享选项组（例如 default）。分值必须为数字。'],
    ['题目与计分表', '每行一题（1–200 题）。维度标识多个用 | 分隔，对应维度名称也用 | 分隔；聚合方式支持 求和 / 平均（默认平均）。'],
    ['阈值报告表（可选）', '如填写，将为对应维度生成原始分阈值报告，发布后可向作答者展示；如留空，该量表仅用于数据采集，默认只提供回执。'],
    ['区间规则', '同一指标的区间按分数升序排列且不可重叠；仅最后一个区间可填 含上限=是。'],
  ])
  help.columns = [{ width: 24 }, { width: 100 }]
  for (const sheet of [optSheet, itemSheet, reportSheet]) {
    sheet.columns.forEach((col) => { col.width = 22 })
  }
  return Buffer.from(await book.xlsx.writeBuffer())
}

export interface FullScaleWorkbookResult {
  definition: ScaleDefinitionV2
  count: number
  reportConfigured: boolean
  items: Array<{ itemCode: string; content: string; reverse: boolean; scoreKeys: string[] }>
}

/** Parse a 3-sheet one-step scale workbook into a validated ScaleDefinitionV2. */
export async function parseFullScaleWorkbook(
  buffer: Buffer,
  existingDefinition?: unknown,
): Promise<FullScaleWorkbookResult> {
  assertBoundedXlsx(buffer)
  const book = new ExcelJS.Workbook()
  try {
    await book.xlsx.load(buffer as never)
  } catch {
    throw new ScaleImportValidationError([{ line: 1, message: '无法解析 Excel 工作簿，请使用标准 .xlsx 模板' }])
  }

  const optSheet = book.getWorksheet('选项组')
  const itemSheet = book.getWorksheet('题目与计分')
  const reportSheet = book.getWorksheet('阈值报告')
  if (!optSheet || !itemSheet) {
    throw new ScaleImportValidationError([{ line: 1, message: '模板必须包含「选项组」和「题目与计分」工作表' }])
  }

  let rowBudget = 0
  const readRows = (sheet: ExcelJS.Worksheet, expectedHeaders: readonly string[]): Array<{ line: number; data: Record<string, string> }> => {
    const headerValues = (sheet.getRow(1).values as unknown[]).slice(1).map((v) => textCell(v))
    if (expectedHeaders.some((name, idx) => headerValues[idx] !== name)) {
      throw new ScaleImportValidationError([{ line: 1, message: `工作表「${sheet.name}」表头必须为：${expectedHeaders.join('、')}` }])
    }
    const rows: Array<{ line: number; data: Record<string, string> }> = []
    sheet.eachRow((row, lineNumber) => {
      if (lineNumber === 1) return
      if (++rowBudget > MAX_XLSX_ROWS) {
        throw new ScaleImportValidationError([{ line: lineNumber, message: '工作簿行数超过 5000 行上限' }])
      }
      const data: Record<string, string> = {}
      let hasAny = false
      expectedHeaders.forEach((name, idx) => {
        const val = textCell(row.getCell(idx + 1).value)
        if (val) hasAny = true
        data[name] = val
      })
      if (hasAny) rows.push({ line: lineNumber, data })
    })
    return rows
  }

  const optRows = readRows(optSheet, ['选项组', '选项值', '选项文字', '分值'])
  const itemRows = readRows(itemSheet, ['题号', '题干', '反向', '选项组', '维度标识', '维度名称', '聚合方式'])
  const reportRows = reportSheet
    ? readRows(reportSheet, ['指标标识', '分档标识', '下限含', '上限', '含上限', '报告文字'])
    : []

  if (optRows.length < 2 || optRows.length > 50) {
    throw new ScaleImportValidationError([{ line: 1, message: '「选项组」必须包含 2–50 个选项' }])
  }
  const responseSetKey = optRows[0].data['选项组']
  if (!KEY_RE.test(responseSetKey)) {
    throw new ScaleImportValidationError([{ line: optRows[0].line, message: '选项组标识须以字母开头，仅含字母/数字/_/-' }])
  }
  const seenOptValues = new Set<string>()
  const options = optRows.map(({ line, data }) => {
    if (data['选项组'] !== responseSetKey) {
      throw new ScaleImportValidationError([{ line, message: '当前仅支持一套共享选项组，所有选项须使用同一选项组标识' }])
    }
    const value = data['选项值']
    const label = data['选项文字']
    const score = Number(data['分值'])
    if (!value || seenOptValues.has(value)) {
      throw new ScaleImportValidationError([{ line, message: '选项值不能为空或重复' }])
    }
    if (!label || label.length > 2000) {
      throw new ScaleImportValidationError([{ line, message: '选项文字必须为 1–2000 字符' }])
    }
    if (!Number.isFinite(score)) {
      throw new ScaleImportValidationError([{ line, message: '选项分值必须为有效数字' }])
    }
    seenOptValues.add(value)
    return { value, label, score }
  })

  if (!itemRows.length || itemRows.length > SCALE_IMPORT_MAX_ITEMS) {
    throw new ScaleImportValidationError([{ line: 1, message: `「题目与计分」必须包含 1–${SCALE_IMPORT_MAX_ITEMS} 道题` }])
  }

  const seenItems = new Set<string>()
  const scoreMap = new Map<string, { key: string; label: string; aggregation: 'sum' | 'mean'; items: Array<{ itemCode: string; weight: number }> }>()
  const items: ScaleDefinitionV2['items'] = []
  const itemRules: ScaleDefinitionV2['scoring']['itemRules'] = []
  const previewItems: FullScaleWorkbookResult['items'] = []

  itemRows.forEach(({ line, data }, idx) => {
    const itemCode = data['题号']
    const content = data['题干']
    const reverse = boolCell(data['反向'], false)
    const rowSetKey = data['选项组'] || responseSetKey
    if (!KEY_RE.test(itemCode) || seenItems.has(itemCode)) {
      throw new ScaleImportValidationError([{ line, message: '题号非法或重复' }])
    }
    if (!content || content.length > 16000) {
      throw new ScaleImportValidationError([{ line, message: '题干必须为 1–16000 字符' }])
    }
    if (reverse === null) {
      throw new ScaleImportValidationError([{ line, message: '反向列仅支持 是/否 或 true/false' }])
    }
    if (rowSetKey !== responseSetKey) {
      throw new ScaleImportValidationError([{ line, message: `选项组与「选项组」表不一致（应为 ${responseSetKey}）` }])
    }
    const dimKeys = data['维度标识'].split('|').map((s) => s.trim()).filter(Boolean)
    const dimLabels = data['维度名称'].split('|').map((s) => s.trim()).filter(Boolean)
    if (!dimKeys.length || new Set(dimKeys).size !== dimKeys.length || dimKeys.some((k) => !KEY_RE.test(k))) {
      throw new ScaleImportValidationError([{ line, message: '维度标识不能为空、重复或含非法字符（多个用 | 分隔）' }])
    }
    const aggKey = data['聚合方式'] || '平均'
    const aggregation = AGGREGATIONS[aggKey.toLowerCase()] ?? AGGREGATIONS[aggKey]
    if (!aggregation) {
      throw new ScaleImportValidationError([{ line, message: '聚合方式仅支持 求和/平均 或 sum/mean' }])
    }
    dimKeys.forEach((dimKey, dimIdx) => {
      const label = dimLabels[dimIdx] || dimKey
      const existing = scoreMap.get(dimKey)
      if (!existing) {
        scoreMap.set(dimKey, { key: dimKey, label, aggregation, items: [{ itemCode, weight: 1 }] })
      } else {
        if (existing.aggregation !== aggregation) {
          throw new ScaleImportValidationError([{ line, message: `维度 ${dimKey} 的聚合方式前后不一致` }])
        }
        existing.items.push({ itemCode, weight: 1 })
      }
    })
    seenItems.add(itemCode)
    items.push({
      itemCode,
      content,
      type: 'single',
      required: true,
      sortOrder: idx,
      responseSetKey,
      randomizeOptions: false,
    })
    itemRules.push({ itemCode, transform: { type: reverse ? 'reverse' : 'identity' } })
    previewItems.push({ itemCode, content, reverse, scoreKeys: dimKeys })
  })

  let rawScoreFeedback: RawScoreFeedback | undefined
  if (reportRows.length > 0) {
    const byScore = new Map<string, Array<{ key: string; min: number; max: number; includeMax: boolean; text: string }>>()
    for (const { line, data } of reportRows) {
      const scoreKey = data['指标标识']
      const rangeKey = data['分档标识']
      const min = Number(data['下限含'])
      const max = Number(data['上限'])
      const includeMax = boolCell(data['含上限'], false)
      const text = data['报告文字']
      if (!scoreMap.has(scoreKey)) {
        throw new ScaleImportValidationError([{ line, message: `阈值报告引用了不存在的指标标识：${scoreKey}` }])
      }
      if (!KEY_RE.test(rangeKey)) {
        throw new ScaleImportValidationError([{ line, message: '分档标识须以字母开头，仅含字母/数字/_/-' }])
      }
      if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
        throw new ScaleImportValidationError([{ line, message: '阈值下限必须小于上限且为有限数字' }])
      }
      if (includeMax === null) {
        throw new ScaleImportValidationError([{ line, message: '含上限仅支持 是/否 或 true/false' }])
      }
      if (!text || text.length > 16000) {
        throw new ScaleImportValidationError([{ line, message: '报告文字必须为 1–16000 字符' }])
      }
      const list = byScore.get(scoreKey) ?? []
      list.push({ key: rangeKey, min, max, includeMax, text })
      byScore.set(scoreKey, list)
    }
    rawScoreFeedback = {
      schemaVersion: 1,
      rules: [...byScore.entries()].map(([scoreKey, ranges]) => ({
        scoreKey,
        ranges: ranges.sort((a, b) => a.min - b.min),
      })),
    }
  }

  const base = createCustomScaleDefinition()
  const existingObj = existingDefinition && typeof existingDefinition === 'object' && !Array.isArray(existingDefinition)
    ? (existingDefinition as Partial<ScaleDefinitionV2>)
    : {}
  const scores: ScaleDefinitionV2['scoring']['scores'] = [...scoreMap.values()].map((entry, idx) => ({
    key: entry.key,
    type: entry.key === 'total' ? 'total' : 'dimension',
    label: entry.label,
    direction: 'descriptive',
    canonical: idx === 0,
    displayPrecision: entry.aggregation === 'mean' ? 2 : 0,
    source: { type: 'items', items: entry.items, aggregation: entry.aggregation },
  }))
  const scoreKeys = scores.map((s) => s.key)

  const candidate: ScaleDefinitionV2 = {
    ...base,
    respondentType: existingObj.respondentType ?? base.respondentType,
    source: existingObj.source ?? base.source,
    license: existingObj.license ?? base.license,
    display: { randomizeItems: false },
    responseSets: [{ key: responseSetKey, options }],
    items,
    scoring: {
      scoringVersion: existingObj.scoring?.scoringVersion ?? base.scoring.scoringVersion,
      itemRules,
      defaultMissingPolicy: { type: 'complete_required' },
      scores,
    },
    report: {
      reportVersion: rawScoreFeedback ? 'scale-report-v2' : 'none-v1',
      ...(rawScoreFeedback ? { rawScoreFeedback } : {}),
      primaryScoreKeys: scoreKeys.slice(0, 1),
      scoreOrder: scoreKeys,
      interpretations: scores.map((score) => ({
        scoreKey: score.key,
        headline: score.label,
        source: { type: 'score_only' as const },
        summary: rawScoreFeedback ? `${score.label}（已配置阈值反馈）。` : '本版本不配置报告或反馈。',
        bands: [],
        guidance: [],
      })),
      limitations: existingObj.report?.limitations?.length ? existingObj.report.limitations : base.report.limitations,
      disclaimer: existingObj.report?.disclaimer || base.report.disclaimer,
    },
    referencePolicy: { type: 'none' },
  }

  const checked = validateScaleDefinition(candidate, { instrumentClass: 'CUSTOM_DESCRIPTIVE' })
  const errors = checked.issues.filter((i) => i.severity === 'error')
  if (!checked.definition || errors.length) {
    throw new ScaleImportValidationError(errors.map((i) => ({ line: 1, message: `${i.path}: ${i.message}` })))
  }
  return {
    definition: checked.definition,
    count: previewItems.length,
    reportConfigured: Boolean(rawScoreFeedback && rawScoreFeedback.rules.length > 0),
    items: previewItems,
  }
}
