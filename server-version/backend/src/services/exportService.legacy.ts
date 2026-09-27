import { pinyin } from 'pinyin-pro'
import { prisma } from '../config/database'
import * as fs from 'fs'
import * as path from 'path'
import { saveToFile, SavVariable, VariableType, VariableMeasure } from 'sav-writer'
import { readScaleAnswers, readScaleResult } from '../modules/scale/scale-workflow.service'
import { readContextFormAnswers } from '../modules/assessment-context'

// ==================== 类型定义 ====================

interface ExportOptions {
  anonymize?: boolean           // 是否脱敏
  includeProgress?: boolean     // 是否包含进行中
  minProgress?: number          // 最低完成进度
  dateRange?: {
    start?: string
    end?: string
  }
  includeLabels?: boolean       // 是否包含变量标签
  // Internal bounded-preview knob. File exports intentionally omit this.
  recordLimit?: number
}

export interface ExportField {
  name: string       // 字段名（拼音）
  label: string      // 字段标签（中文）
  type: 'numeric' | 'string' | 'date'
  width?: number     // 字段宽度
  decimals?: number  // 小数位数
}

export interface ExportData {
  fields: ExportField[]
  rows: Record<string, any>[]
}

/** Spreadsheet-safe CSV cell. A leading formula character is prefixed with
 * an apostrophe before normal RFC4180 quoting so Excel/Sheets treats it as
 * text rather than executable formula input. */
export function spreadsheetSafeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') return String(value)
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}

export function serializeCsv(fields: ExportField[], rows: Record<string, any>[]): string {
  const lines = [fields.map((field) => field.name).join(',')]
  for (const row of rows) lines.push(fields.map((field) => spreadsheetSafeCell(row[field.name])).join(','))
  return lines.join('\n')
}

// 字段命名规则
const FIELD_RULES = {
  USER_PREFIX: 'U_',
  QUESTION_PREFIX: 'Q_',
  MAX_LENGTH: 8,
}

const deviceProvenanceFields = (prefix: string, labelPrefix = ''): ExportField[] => {
  const label = (name: string) => `${labelPrefix ? `[${labelPrefix}] ` : ''}${name}`
  return [
    { name: `${prefix}DEVICE_CLASS`, label: label('设备类别'), type: 'string', width: 12 },
    { name: `${prefix}DEVICE_OS_FAMILY`, label: label('操作系统族'), type: 'string', width: 16 },
    { name: `${prefix}DEVICE_BROWSER_FAMILY`, label: label('浏览器族'), type: 'string', width: 16 },
    { name: `${prefix}DEVICE_VIEWPORT_WIDTH`, label: label('视口宽度'), type: 'numeric', width: 10, decimals: 0 },
    { name: `${prefix}DEVICE_VIEWPORT_HEIGHT`, label: label('视口高度'), type: 'numeric', width: 10, decimals: 0 },
    { name: `${prefix}DEVICE_SCREEN_WIDTH`, label: label('屏幕宽度'), type: 'numeric', width: 10, decimals: 0 },
    { name: `${prefix}DEVICE_SCREEN_HEIGHT`, label: label('屏幕高度'), type: 'numeric', width: 10, decimals: 0 },
    { name: `${prefix}DEVICE_PIXEL_RATIO`, label: label('设备像素比'), type: 'numeric', width: 10, decimals: 3 },
    { name: `${prefix}DEVICE_MAX_TOUCH_POINTS`, label: label('最大触点数'), type: 'numeric', width: 10, decimals: 0 },
    { name: `${prefix}DEVICE_PRIMARY_POINTER`, label: label('主指针类型'), type: 'string', width: 10 },
    { name: `${prefix}DEVICE_CAPTURED_AT`, label: label('捕获时间'), type: 'string', width: 32 },
  ]
}

// Legacy callers can still clear/use the module cache, but every export run
// receives its own context so concurrent exports never influence one another.
const fieldNameCache = new Map<string, number>()
export type FieldNameContext = Map<string, number>
export const createFieldNameContext = (): FieldNameContext => new Map<string, number>()

/** Date-only ranges are interpreted as UTC half-open intervals. */
export const utcHalfOpenDateFilter = (dateRange?: ExportOptions['dateRange']): { gte?: Date; lt?: Date } | null => {
  if (!dateRange?.start && !dateRange?.end) return null
  const filter: { gte?: Date; lt?: Date } = {}
  if (dateRange.start) {
    const start = new Date(`${dateRange.start}T00:00:00.000Z`)
    if (Number.isNaN(start.getTime())) throw new Error('开始日期无效')
    filter.gte = start
  }
  if (dateRange.end) {
    const end = new Date(`${dateRange.end}T00:00:00.000Z`)
    if (Number.isNaN(end.getTime())) throw new Error('结束日期无效')
    end.setUTCDate(end.getUTCDate() + 1)
    filter.lt = end
  }
  if (filter.gte && filter.lt && filter.gte >= filter.lt) throw new Error('日期范围无效')
  return filter
}

// ==================== 字段命名服务 ====================

/**
 * 将中文转换为拼音字段名
 * @param chinese 中文字符串
 * @param prefix 字段前缀
 * @returns 拼音字段名
 */
export function toPinyinFieldName(chinese: string, prefix: string = '', context: FieldNameContext = fieldNameCache): string {
  // 转换为拼音
  const pinyinStr = pinyin(chinese, {
    pattern: 'pinyin',
    toneType: 'none',
    type: 'array'
  }).join('')
  
  // 取前N个字符
  let fieldName = pinyinStr.toLowerCase().substring(0, FIELD_RULES.MAX_LENGTH)
  
  // 移除特殊字符，只保留字母和数字
  fieldName = fieldName.replace(/[^a-z0-9]/g, '')
  
  // 添加前缀
  const fullName = prefix + fieldName
  
  // 去重处理
  const count = context.get(fullName) || 0
  if (count > 0) {
    const uniqueName = fullName + (count + 1)
    context.set(fullName, count + 1)
    return uniqueName.substring(0, FIELD_RULES.MAX_LENGTH + prefix.length + 2)
  }
  
  context.set(fullName, 1)
  return fullName
}

/**
 * 清空字段名缓存
 */
export function clearFieldNameCache(): void {
  fieldNameCache.clear()
}

// ==================== 数据导出服务 ====================

/**
 * 获取量表导出数据
 */
export async function getScaleExportData(
  scaleId: string,
  options: ExportOptions = {}
): Promise<ExportData> {
  const {
    anonymize = true,
    includeProgress = false,
    minProgress = 100,
    dateRange,
    recordLimit,
  } = options

  const fieldNameContext = createFieldNameContext()

  // The v2 definition is the only source for item order, response values and
  // score keys. Export never re-runs reverse scoring or another scorer.
  const scale = await prisma.scale.findUnique({
    where: { id: scaleId },
    select: { id: true, name: true, definition: true },
  })

  if (!scale) {
    throw new Error('量表不存在')
  }

  const definition = scale.definition && typeof scale.definition === 'object'
    ? scale.definition as {
        items?: Array<{ itemCode: string; content: string }>
        scoring?: { scores?: Array<{ key: string; label: string }> }
      }
    : null
  const definitionItems = Array.isArray(definition?.items) ? definition.items : []
  const definitionScores = Array.isArray(definition?.scoring?.scores) ? definition.scoring.scores : []
  if (definitionItems.length === 0 || definitionScores.length === 0) {
    throw new Error('量表尚未安装有效的 v2 definition')
  }

  // 构建查询条件
  const where: any = {
    scaleId,
    compositeAttemptId: null,
    progress: { gte: minProgress }
  }
  
  if (!includeProgress) {
    where.status = 'COMPLETED'
  }

  const dateFilter = utcHalfOpenDateFilter(dateRange)
  if (dateFilter) where.completedAt = { ...where.completedAt, ...dateFilter }

  // 获取测评记录
  const assessments = await prisma.assessment.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          nickname: true,
          username: true
        }
      }
    },
    orderBy: { completedAt: 'asc' },
    ...(recordLimit ? { take: recordLimit } : {}),
  })

  // 构建字段定义
  const fields: ExportField[] = []

  // 用户基础信息字段
  fields.push({ name: 'U_id', label: '用户ID', type: 'string', width: 32 })
  if (!anonymize) {
    fields.push({ name: 'U_name', label: '姓名', type: 'string', width: 20 })
  }
  fields.push({ name: 'U_time', label: '完成用时(秒)', type: 'numeric', width: 6 })
  fields.push({ name: 'U_date', label: '完成日期', type: 'string', width: 10 })
  fields.push(...deviceProvenanceFields(''))

  // Each item has response value, transformed item score and response time.
  const itemFieldMap = new Map<string, { response: string; score: string; responseTime: string }>()
  for (const item of definitionItems) {
    const responseField = toPinyinFieldName(item.itemCode, `${FIELD_RULES.QUESTION_PREFIX}V_`, fieldNameContext)
    const scoreField = toPinyinFieldName(item.itemCode, `${FIELD_RULES.QUESTION_PREFIX}S_`, fieldNameContext)
    const responseTimeField = toPinyinFieldName(item.itemCode, 'RT_', fieldNameContext)
    itemFieldMap.set(item.itemCode, { response: responseField, score: scoreField, responseTime: responseTimeField })
    fields.push({
      name: responseField,
      label: `${item.itemCode} 原始回答 ${item.content.substring(0, 20)}`,
      type: 'string',
      width: 16,
    })
    fields.push({
      name: scoreField,
      label: `${item.itemCode} 映射后题目分值`,
      type: 'numeric',
      width: 8,
      decimals: 0
    })
    fields.push({ name: responseTimeField, label: `${item.itemCode} 作答时间(毫秒)`, type: 'numeric', width: 8, decimals: 0 })
  }

  const scoreFieldMap = new Map<string, string>()
  for (const score of definitionScores) {
    const fieldName = toPinyinFieldName(score.key, 'SCORE_', fieldNameContext)
    scoreFieldMap.set(score.key, fieldName)
    fields.push({
      name: fieldName,
      label: `${score.key} ${score.label}冻结得分`,
      type: 'numeric',
      width: 10,
      decimals: 6,
    })
  }
  fields.push({ name: 'QUALITY_STATUS', label: '质量状态', type: 'string', width: 16 })
  fields.push({ name: 'QUALITY_FLAGS', label: '质量问题', type: 'string', width: 32 })
  fields.push({ name: 'INSTRUMENT_VERSION', label: '量表版本', type: 'string', width: 16 })
  fields.push({ name: 'SCORING_VERSION', label: '计分版本', type: 'string', width: 16 })
  fields.push({ name: 'REPORT_VERSION', label: '报告版本', type: 'string', width: 16 })
  fields.push({ name: 'DEFINITION_HASH', label: '定义哈希', type: 'string', width: 64 })
  fields.push({ name: 'REFERENCE_VERSIONS', label: '使用的参考版本', type: 'string', width: 32 })

  // 构建数据行
  const rows: Record<string, any>[] = []

  for (const assessment of assessments) {
    const row: Record<string, any> = {}

    // 用户基础信息
    row['U_id'] = assessment.userId 
      ? (anonymize ? `U${assessment.userId.substring(0, 8)}` : assessment.userId)
      : 'ANONYMOUS'
    if (!anonymize && assessment.user) {
      row['U_name'] = assessment.user.nickname || assessment.user.username
    }
    row['U_time'] = assessment.totalTime == null ? null : Math.round(assessment.totalTime / 1000)
    row['U_date'] = assessment.completedAt ? assessment.completedAt.toISOString().split('T')[0] : null

    // Raw answers are exported for both completed and in-progress records;
    // completed scores are always read from the frozen result payload.
    const parsedAnswers = readScaleAnswers(assessment.answers)
    const answers = parsedAnswers.answers
    const device = parsedAnswers.deviceInputProvenance
    const answerMap = new Map(answers.map((answer) => [answer.itemCode, answer.responseValue]))
    const responseTimeMap = new Map(answers.map((answer) => [answer.itemCode, answer.responseTimeMs]))
    row.DEVICE_CLASS = device?.deviceClass ?? null
    row.DEVICE_OS_FAMILY = device?.osFamily ?? null
    row.DEVICE_BROWSER_FAMILY = device?.browserFamily ?? null
    row.DEVICE_VIEWPORT_WIDTH = device?.viewportWidth ?? null
    row.DEVICE_VIEWPORT_HEIGHT = device?.viewportHeight ?? null
    row.DEVICE_SCREEN_WIDTH = device?.screenWidth ?? null
    row.DEVICE_SCREEN_HEIGHT = device?.screenHeight ?? null
    row.DEVICE_PIXEL_RATIO = device?.devicePixelRatio ?? null
    row.DEVICE_MAX_TOUCH_POINTS = device?.maxTouchPoints ?? null
    row.DEVICE_PRIMARY_POINTER = device?.primaryPointer ?? null
    row.DEVICE_CAPTURED_AT = device?.capturedAt ?? null

    const parsedResult = assessment.status === 'COMPLETED' ? readScaleResult(assessment.result) : { result: null, decryptError: false }
    const resultValue = parsedResult.result
    const itemScores = Array.isArray(resultValue?.itemScores) ? resultValue.itemScores : []
    const itemScoreMap = new Map(itemScores.map((item: any) => [item.itemCode, item]))
    for (const item of definitionItems) {
      const fieldNames = itemFieldMap.get(item.itemCode)!
      row[fieldNames.response] = answerMap.get(item.itemCode) ?? null
      row[fieldNames.score] = resultValue ? itemScoreMap.get(item.itemCode)?.score ?? null : null
      row[fieldNames.responseTime] = responseTimeMap.get(item.itemCode) ?? null
    }

    for (const score of definitionScores) {
      const fieldName = scoreFieldMap.get(score.key)!
      row[fieldName] = resultValue?.scores?.find((candidate: any) => candidate?.key === score.key)?.value ?? null
    }
    row.QUALITY_STATUS = parsedResult.decryptError || parsedAnswers.decryptError ? 'decrypt_error' : resultValue?.quality?.status ?? null
    row.QUALITY_FLAGS = parsedResult.decryptError || parsedAnswers.decryptError
      ? 'decrypt_error'
      : Array.isArray(resultValue?.quality?.flags) ? resultValue.quality.flags.join('|') : null
    row.INSTRUMENT_VERSION = resultValue?.method?.instrumentVersion ?? null
    row.SCORING_VERSION = resultValue?.method?.scoringVersion ?? null
    row.REPORT_VERSION = resultValue?.method?.reportVersion ?? null
    row.DEFINITION_HASH = resultValue?.method?.definitionHash ?? null
    row.REFERENCE_VERSIONS = Array.isArray(resultValue?.method?.referenceVersions) ? resultValue.method.referenceVersions.join('|') : null

    rows.push(row)
  }

  return { fields, rows }
}

/**
 * 导出为 CSV 格式
 */
export async function exportToCSV(scaleId: string, options: ExportOptions = {}): Promise<string> {
  const { fields, rows } = await getScaleExportData(scaleId, options)
  return serializeCsv(fields, rows)
}

/**
 * 导出为 SPSS .sav 格式
 * 由于 npm 上的 sav-writer 库可能不可用，这里提供 CSV + SPS 语法方案
 */
export function serializeSpsSyntax(fields: ExportField[]): string {
  // 生成 SPSS 语法文件 (.sps)
  const spsLines: string[] = [
    '* SPSS 导入语法文件',
    '* 自动生成于 ' + new Date().toISOString(),
    '',
    'GET DATA',
    '  /TYPE=TXT',
    '  /FILE="data.csv"',
    '  /ENCODING="UTF8"',
    '  /DELCASE=LINE',
    '  /DELIMITERS=","',
    '  /QUALIFIER=\'"\'',
    '  /ARRANGEMENT=DELIMITED',
    '  /FIRSTCASE=2',
    '  /IMPORTCASE=ALL',
    '  /VARIABLES='
  ]

  // 添加变量定义
  const varDefs = fields.map(f => {
    if (f.type === 'string') {
      return `    ${f.name} A${f.width || 20}`
    } else {
      return `    ${f.name} F${f.width || 8}.${f.decimals || 0}`
    }
  })
  spsLines.push(varDefs.join('\n'))
  spsLines.push('.')

  // 添加变量标签
  spsLines.push('')
  spsLines.push('VARIABLE LABELS')
  const labelDefs = fields.map(f => `  ${f.name} "${f.label}"`)
  spsLines.push(labelDefs.join('\n'))
  spsLines.push('.')

  // Empty CSV cells are imported as system-missing values. Do not invent
  // variables or sentinel codes: every statement must refer only to fields
  // that are present in this export's schema.

  spsLines.push('EXECUTE.')

  return spsLines.join('\n')
}

export function exportDataToSPSS(fields: ExportField[], rows: Record<string, any>[]): { csvContent: string; spsContent: string } {
  return {
    csvContent: serializeCsv(fields, rows),
    spsContent: serializeSpsSyntax(fields),
  }
}

export async function exportToSPSS(
  scaleId: string,
  options: ExportOptions = {}
): Promise<{ csvContent: string; spsContent: string }> {
  const { fields, rows } = await getScaleExportData(scaleId, options)
  return exportDataToSPSS(fields, rows)
}

/**
 * 导出为原生 SPSS .sav 文件
 */
export async function exportToSav(
  scaleId: string,
  options: ExportOptions = {}
): Promise<string> {
  const { fields, rows } = await getScaleExportData(scaleId, options)

  // 构建 SPSS 变量定义
  const variables: SavVariable[] = fields.map(field => ({
    name: field.name,
    label: field.label,
    type: field.type === 'string' ? VariableType.String : VariableType.Numeric,
    width: field.type === 'string' ? (field.width || 20) : 8,
    decimal: field.decimals || 0,
    columns: field.width || 8,
    measure: field.type === 'string' ? VariableMeasure.Nominal : VariableMeasure.Continuous
  }))

  // 创建临时文件路径
  const exportDir = path.join(__dirname, '../../exports')
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true })
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
  const savPath = path.join(exportDir, `scale_${scaleId.substring(0, 8)}_${timestamp}.sav`)

  // 生成 SAV 文件
  saveToFile(savPath, rows, variables)

  return savPath
}

/**
 * 保存导出文件
 */
export async function saveExportFiles(
  scaleId: string,
  options: ExportOptions = {},
  format: 'csv' | 'sav' | 'spss' = 'csv',
  precomputedData?: ExportData,
): Promise<{ csvPath?: string; savPath?: string; spsPath?: string }> {
  // 使用 __dirname 确保路径正确（相对于 dist/services 目录）
  const exportDir = path.join(__dirname, '../../exports')
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
  const baseFileName = `scale_${scaleId.substring(0, 8)}_${timestamp}`

  const result: { csvPath?: string; savPath?: string; spsPath?: string } = {}

  const exportData = precomputedData || await getScaleExportData(scaleId, options)

  if (format === 'csv') {
    // 纯 CSV 格式
    const csvContent = serializeCsv(exportData.fields, exportData.rows)
    const csvPath = path.join(exportDir, `${baseFileName}.csv`)
    fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf-8')
    result.csvPath = csvPath
  } else if (format === 'sav') {
    // 原生 SAV 格式
    const savPath = await writeSavFile(path.join(exportDir, `${baseFileName}.sav`), exportData)
    result.savPath = savPath
  } else if (format === 'spss') {
    // CSV + SPS 格式（兼容旧版）
    const { csvContent, spsContent } = exportDataToSPSS(exportData.fields, exportData.rows)
    
    const csvPath = path.join(exportDir, `${baseFileName}.csv`)
    const spsPath = path.join(exportDir, `${baseFileName}.sps`)
    
    fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf-8')
    fs.writeFileSync(spsPath, spsContent, 'utf-8')
    
    result.csvPath = csvPath
    result.spsPath = spsPath
  }

  return result
}

const writeSavFile = async (savPath: string, exportData: ExportData): Promise<string> => {
  const variables: SavVariable[] = exportData.fields.map(field => ({
    name: field.name,
    label: field.label,
    type: field.type === 'string' ? VariableType.String : VariableType.Numeric,
    width: field.type === 'string' ? (field.width || 20) : 8,
    decimal: field.decimals || 0,
    columns: field.width || 8,
    measure: field.type === 'string' ? VariableMeasure.Nominal : VariableMeasure.Continuous,
  }))
  saveToFile(savPath, exportData.rows, variables)
  return savPath
}

const writeChunk = async (
  stream: fs.WriteStream,
  chunk: string,
  state: { bytes: number },
  maxBytes: number,
): Promise<void> => {
  const bytes = Buffer.byteLength(chunk)
  if (state.bytes + bytes > maxBytes) {
    throw new Error('EXPORT_MAX_BYTES exceeded while writing export artifact')
  }
  state.bytes += bytes
  if (!stream.write(chunk, 'utf8')) {
    await new Promise<void>((resolve, reject) => {
      stream.once('drain', resolve)
      stream.once('error', reject)
    })
  }
}

const writeCsvIncrementally = async (
  filePath: string,
  exportData: ExportData,
  maxBytes: number,
): Promise<void> => {
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8', flags: 'wx' })
  const state = { bytes: 0 }
  try {
    await writeChunk(stream, '\uFEFF' + exportData.fields.map((field) => field.name).join(',') + '\n', state, maxBytes)
    for (let index = 0; index < exportData.rows.length; index += 1) {
      const row = exportData.rows[index]
      const line = exportData.fields.map((field) => spreadsheetSafeCell(row[field.name])).join(',')
      await writeChunk(stream, line + (index + 1 < exportData.rows.length ? '\n' : ''), state, maxBytes)
    }
    await new Promise<void>((resolve, reject) => {
      stream.end(resolve)
      stream.once('error', reject)
    })
  } catch (error) {
    stream.destroy()
    try { fs.unlinkSync(filePath) } catch {}
    throw error
  }
}

/** Write one already-built dataset to an explicit artifact path without
 * materializing a second full CSV string in memory. */
export const writeExportDataFile = async (
  filePath: string,
  exportData: ExportData,
  format: 'csv' | 'sav' | 'sps',
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<void> => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  if (format === 'csv') {
    await writeCsvIncrementally(filePath, exportData, maxBytes)
    return
  }
  if (format === 'sps') {
    const content = serializeSpsSyntax(exportData.fields)
    if (Buffer.byteLength(content) > maxBytes) throw new Error('EXPORT_MAX_BYTES exceeded while writing export artifact')
    fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx' })
    return
  }
  await writeSavFile(filePath, exportData)
}

// ==================== 问卷导出服务 ====================

/**
 * 获取问卷导出数据（宽表格式）
 * 合并所有量表的题目和维度到一张表
 */
export async function getQuestionnaireExportData(
  questionnaireId: string,
  options: ExportOptions = {}
): Promise<ExportData> {
  return getQuestionnaireExportDataV2(questionnaireId, options)
}

/**
 * Questionnaire wide export backed by the same frozen ScaleResultV2 contract
 * as standalone scale export. Raw response values and mapped item scores are
 * separate columns; score columns are populated only from a completed,
 * frozen result and never recalculated during export.
 */
async function getQuestionnaireExportDataV2(
  questionnaireId: string,
  options: ExportOptions = {},
): Promise<ExportData> {
  const {
    anonymize = true,
    includeProgress = false,
    minProgress = 100,
    dateRange,
    recordLimit,
  } = options

  const fieldNameContext = createFieldNameContext()
  const questionnaire = await prisma.questionnaire.findUnique({
    where: { id: questionnaireId },
    include: {
      formItems: { orderBy: { position: 'asc' } },
      questionnaireScales: {
        orderBy: { position: 'asc' },
        include: {
          scale: {
            select: { id: true, name: true, code: true, instrumentVersion: true, definition: true },
          },
        },
      },
    },
  })
  if (!questionnaire) throw new Error('问卷不存在')

  const where: any = { questionnaireId, progress: { gte: minProgress } }
  if (!includeProgress) where.status = 'COMPLETED'
  const dateFilter = utcHalfOpenDateFilter(dateRange)
  if (dateFilter) where.completedAt = { ...where.completedAt, ...dateFilter }

  const assessments = await prisma.questionnaireAssessment.findMany({
    where,
    include: {
      user: { select: { id: true, nickname: true, username: true } },
      formAnswers: true,
      scaleAssessments: {
        select: {
          id: true,
          scaleId: true,
          status: true,
          answers: true,
          result: true,
        },
      },
    },
    orderBy: { completedAt: 'asc' },
    ...(recordLimit ? { take: recordLimit } : {}),
  })

  const fields: ExportField[] = [
    { name: 'U_id', label: '用户ID', type: 'string', width: 32 },
  ]
  if (!anonymize) fields.push({ name: 'U_name', label: '姓名', type: 'string', width: 20 })
  fields.push(
    { name: 'U_time', label: '完成用时(秒)', type: 'numeric', width: 6 },
    { name: 'U_date', label: '完成日期', type: 'string', width: 10 },
    { name: 'CONTEXT_SNAPSHOT_HASH', label: '测评上下文快照哈希', type: 'string', width: 64 },
  )

  const formFieldMap = new Map<string, string>()
  questionnaire.formItems.forEach((formItem, index) => {
    const fieldName = toPinyinFieldName(formItem.label.substring(0, 8), `F${index + 1}_`, fieldNameContext)
    formFieldMap.set(formItem.id, fieldName)
    fields.push({ name: fieldName, label: `[表单] ${formItem.label}`, type: 'string', width: 20 })
  })

  type V2Item = { itemCode: string; content: string }
  type V2Score = { key: string; label: string }
  type ScaleMap = {
    scaleId: string
    items: V2Item[]
    scores: V2Score[]
    responseFields: Map<string, string>
    itemScoreFields: Map<string, string>
    responseTimeFields: Map<string, string>
    scoreFields: Map<string, string>
    qualityStatusField: string
    qualityFlagsField: string
    instrumentVersionField: string
    scoringVersionField: string
    reportVersionField: string
    definitionHashField: string
    referenceVersionsField: string
    contextSnapshotHashField: string
    deviceClassField: string
    deviceOsFamilyField: string
    deviceBrowserFamilyField: string
    deviceViewportWidthField: string
    deviceViewportHeightField: string
    deviceScreenWidthField: string
    deviceScreenHeightField: string
    devicePixelRatioField: string
    deviceMaxTouchPointsField: string
    devicePrimaryPointerField: string
    deviceCapturedAtField: string
  }

  const scaleMaps: ScaleMap[] = []
  for (let scaleIndex = 0; scaleIndex < questionnaire.questionnaireScales.length; scaleIndex += 1) {
    const scale = questionnaire.questionnaireScales[scaleIndex].scale
    const definition = scale.definition && typeof scale.definition === 'object' ? scale.definition as any : null
    const items: V2Item[] = Array.isArray(definition?.items) ? definition.items : []
    const scores: V2Score[] = Array.isArray(definition?.scoring?.scores) ? definition.scoring.scores : []
    if (items.length === 0 || scores.length === 0) throw new Error(`问卷包含尚未安装有效 v2 definition 的量表：${scale.code}`)
    const prefix = `S${scaleIndex + 1}_`
    const responseFields = new Map<string, string>()
    const itemScoreFields = new Map<string, string>()
    const responseTimeFields = new Map<string, string>()
    const scoreFields = new Map<string, string>()
    items.forEach((item) => {
      const responseField = toPinyinFieldName(item.itemCode, `${prefix}Q_V_`, fieldNameContext)
      const scoreField = toPinyinFieldName(item.itemCode, `${prefix}Q_S_`, fieldNameContext)
      const responseTimeField = toPinyinFieldName(item.itemCode, `${prefix}RT_`, fieldNameContext)
      responseFields.set(item.itemCode, responseField)
      itemScoreFields.set(item.itemCode, scoreField)
      responseTimeFields.set(item.itemCode, responseTimeField)
      fields.push({ name: responseField, label: `[${scale.name}] ${item.itemCode} 原始回答`, type: 'string', width: 32 })
      fields.push({ name: scoreField, label: `[${scale.name}] ${item.itemCode} 映射后题目分值`, type: 'numeric', width: 10, decimals: 6 })
      fields.push({ name: responseTimeField, label: `[${scale.name}] ${item.itemCode} 作答时间(毫秒)`, type: 'numeric', width: 10, decimals: 0 })
    })
    scores.forEach((score) => {
      const scoreField = toPinyinFieldName(score.key, `${prefix}SCORE_`, fieldNameContext)
      scoreFields.set(score.key, scoreField)
      fields.push({ name: scoreField, label: `[${scale.name}] ${score.key} ${score.label}冻结得分`, type: 'numeric', width: 12, decimals: 6 })
    })
    const metadataFields = {
      qualityStatusField: `${prefix}QUALITY_STATUS`,
      qualityFlagsField: `${prefix}QUALITY_FLAGS`,
      instrumentVersionField: `${prefix}INSTRUMENT_VERSION`,
      scoringVersionField: `${prefix}SCORING_VERSION`,
      reportVersionField: `${prefix}REPORT_VERSION`,
      definitionHashField: `${prefix}DEFINITION_HASH`,
      referenceVersionsField: `${prefix}REFERENCE_VERSIONS`,
      contextSnapshotHashField: `${prefix}CONTEXT_SNAPSHOT_HASH`,
      deviceClassField: `${prefix}DEVICE_CLASS`,
      deviceOsFamilyField: `${prefix}DEVICE_OS_FAMILY`,
      deviceBrowserFamilyField: `${prefix}DEVICE_BROWSER_FAMILY`,
      deviceViewportWidthField: `${prefix}DEVICE_VIEWPORT_WIDTH`,
      deviceViewportHeightField: `${prefix}DEVICE_VIEWPORT_HEIGHT`,
      deviceScreenWidthField: `${prefix}DEVICE_SCREEN_WIDTH`,
      deviceScreenHeightField: `${prefix}DEVICE_SCREEN_HEIGHT`,
      devicePixelRatioField: `${prefix}DEVICE_PIXEL_RATIO`,
      deviceMaxTouchPointsField: `${prefix}DEVICE_MAX_TOUCH_POINTS`,
      devicePrimaryPointerField: `${prefix}DEVICE_PRIMARY_POINTER`,
      deviceCapturedAtField: `${prefix}DEVICE_CAPTURED_AT`,
    }
    fields.push(
      { name: metadataFields.qualityStatusField, label: `[${scale.name}] 质量状态`, type: 'string', width: 16 },
      { name: metadataFields.qualityFlagsField, label: `[${scale.name}] 质量问题`, type: 'string', width: 48 },
      { name: metadataFields.instrumentVersionField, label: `[${scale.name}] 量表版本`, type: 'string', width: 16 },
      { name: metadataFields.scoringVersionField, label: `[${scale.name}] 计分版本`, type: 'string', width: 16 },
      { name: metadataFields.reportVersionField, label: `[${scale.name}] 报告版本`, type: 'string', width: 16 },
      { name: metadataFields.definitionHashField, label: `[${scale.name}] 定义哈希`, type: 'string', width: 64 },
      { name: metadataFields.referenceVersionsField, label: `[${scale.name}] 使用的参考版本`, type: 'string', width: 32 },
      { name: metadataFields.contextSnapshotHashField, label: `[${scale.name}] 测评上下文快照哈希`, type: 'string', width: 64 },
      ...deviceProvenanceFields(prefix, scale.name),
    )
    scaleMaps.push({ scaleId: scale.id, items, scores, responseFields, itemScoreFields, responseTimeFields, scoreFields, ...metadataFields })
  }

  const rows: Record<string, any>[] = []
  for (const assessment of assessments) {
    const row: Record<string, any> = {
      U_id: assessment.userId ? (anonymize ? `U${assessment.userId.substring(0, 8)}` : assessment.userId) : 'ANONYMOUS',
      U_time: assessment.totalTime == null ? null : Math.round(assessment.totalTime / 1000),
      U_date: assessment.completedAt ? assessment.completedAt.toISOString().split('T')[0] : null,
      CONTEXT_SNAPSHOT_HASH: assessment.contextSnapshotHash ?? null,
    }
    if (!anonymize) row.U_name = assessment.user?.nickname || assessment.user?.username || null
    const readableFormAnswers = readContextFormAnswers(questionnaire.formItems, assessment.formAnswers)
    const formAnswerMap = new Map(readableFormAnswers.map((answer) => [answer.formItemId, answer.value]))
    questionnaire.formItems.forEach((formItem) => {
      const fieldName = formFieldMap.get(formItem.id)
      if (fieldName) row[fieldName] = formAnswerMap.get(formItem.id) ?? null
    })

    scaleMaps.forEach((scaleMap) => {
      const child = assessment.scaleAssessments.find((candidate) => candidate.scaleId === scaleMap.scaleId)
      const answers = child ? readScaleAnswers(child.answers) : { answers: [], decryptError: false }
      const result = child && child.status === 'COMPLETED' ? readScaleResult(child.result) : { result: null, decryptError: false }
      const answerMap = new Map(answers.answers.map((answer) => [answer.itemCode, answer]))
      const itemScoreMap = new Map((result.result?.itemScores ?? []).map((item) => [item.itemCode, item]))
      const scoreMap = new Map((result.result?.scores ?? []).map((score) => [score.key, score]))
      scaleMap.items.forEach((item) => {
        const answer = answerMap.get(item.itemCode)
        row[scaleMap.responseFields.get(item.itemCode)!] = answer?.responseValue ?? null
        row[scaleMap.itemScoreFields.get(item.itemCode)!] = result.result ? itemScoreMap.get(item.itemCode)?.score ?? null : null
        row[scaleMap.responseTimeFields.get(item.itemCode)!] = answer?.responseTimeMs ?? null
      })
      scaleMap.scores.forEach((score) => {
        row[scaleMap.scoreFields.get(score.key)!] = result.result ? scoreMap.get(score.key)?.value ?? null : null
      })
      row[scaleMap.qualityStatusField] = result.decryptError || answers.decryptError ? 'decrypt_error' : result.result?.quality.status ?? null
      row[scaleMap.qualityFlagsField] = result.decryptError || answers.decryptError
        ? 'decrypt_error'
        : result.result?.quality.flags.join('|') ?? null
      row[scaleMap.instrumentVersionField] = result.result?.method.instrumentVersion ?? null
      row[scaleMap.scoringVersionField] = result.result?.method.scoringVersion ?? null
      row[scaleMap.reportVersionField] = result.result?.method.reportVersion ?? null
      row[scaleMap.definitionHashField] = result.result?.method.definitionHash ?? null
      row[scaleMap.referenceVersionsField] = result.result?.method.referenceVersions.join('|') ?? null
      row[scaleMap.contextSnapshotHashField] = result.result?.method.assessmentContext?.snapshotHash ?? assessment.contextSnapshotHash ?? null
      const device = answers.deviceInputProvenance
      row[scaleMap.deviceClassField] = device?.deviceClass ?? null
      row[scaleMap.deviceOsFamilyField] = device?.osFamily ?? null
      row[scaleMap.deviceBrowserFamilyField] = device?.browserFamily ?? null
      row[scaleMap.deviceViewportWidthField] = device?.viewportWidth ?? null
      row[scaleMap.deviceViewportHeightField] = device?.viewportHeight ?? null
      row[scaleMap.deviceScreenWidthField] = device?.screenWidth ?? null
      row[scaleMap.deviceScreenHeightField] = device?.screenHeight ?? null
      row[scaleMap.devicePixelRatioField] = device?.devicePixelRatio ?? null
      row[scaleMap.deviceMaxTouchPointsField] = device?.maxTouchPoints ?? null
      row[scaleMap.devicePrimaryPointerField] = device?.primaryPointer ?? null
      row[scaleMap.deviceCapturedAtField] = device?.capturedAt ?? null
    })
    rows.push(row)
  }
  return { fields, rows }
}

/**
 * 导出问卷为 CSV 格式
 */
export async function exportQuestionnaireToCSV(
  questionnaireId: string,
  options: ExportOptions = {}
): Promise<string> {
  const { fields, rows } = await getQuestionnaireExportData(questionnaireId, options)

  return serializeCsv(fields, rows)
}

/**
 * 导出问卷为原生 SAV 格式
 */
export async function exportQuestionnaireToSav(
  questionnaireId: string,
  options: ExportOptions = {}
): Promise<string> {
  const { fields, rows } = await getQuestionnaireExportData(questionnaireId, options)

  // 构建 SPSS 变量定义
  const variables: SavVariable[] = fields.map(field => ({
    name: field.name,
    label: field.label,
    type: field.type === 'string' ? VariableType.String : VariableType.Numeric,
    width: field.type === 'string' ? (field.width || 20) : 8,
    decimal: field.decimals || 0,
    columns: field.width || 8,
    measure: field.type === 'string' ? VariableMeasure.Nominal : VariableMeasure.Continuous
  }))

  // 创建临时文件路径
  const exportDir = path.join(__dirname, '../../exports')
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true })
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
  const savPath = path.join(exportDir, `questionnaire_${questionnaireId.substring(0, 8)}_${timestamp}.sav`)

  // 生成 SAV 文件
  saveToFile(savPath, rows, variables)

  return savPath
}

/**
 * 保存问卷导出文件
 */
export async function saveQuestionnaireExportFiles(
  questionnaireId: string,
  options: ExportOptions = {},
  format: 'csv' | 'sav' = 'csv',
  precomputedData?: ExportData,
): Promise<{ csvPath?: string; savPath?: string }> {
  const exportDir = path.join(__dirname, '../../exports')
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
  const baseFileName = `questionnaire_${questionnaireId.substring(0, 8)}_${timestamp}`

  const result: { csvPath?: string; savPath?: string } = {}

  const exportData = precomputedData || await getQuestionnaireExportData(questionnaireId, options)
  if (format === 'csv') {
    const csvContent = serializeCsv(exportData.fields, exportData.rows)
    const csvPath = path.join(exportDir, `${baseFileName}.csv`)
    fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf-8')
    result.csvPath = csvPath
  } else if (format === 'sav') {
    const savPath = await writeSavFile(path.join(exportDir, `${baseFileName}.sav`), exportData)
    result.savPath = savPath
  }

  return result
}

// ==================== 导出服务对象 ====================

export const exportService = {
  toPinyinFieldName,
  getScaleExportData,
  exportToCSV,
  exportToSPSS,
  exportToSav,
  saveExportFiles,
  clearFieldNameCache,
  // 问卷导出
  getQuestionnaireExportData,
  exportQuestionnaireToCSV,
  exportQuestionnaireToSav,
  saveQuestionnaireExportFiles
}
