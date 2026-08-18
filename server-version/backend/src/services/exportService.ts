import { pinyin } from 'pinyin-pro'
import { prisma } from '../config/database'
import { logger } from '../utils/logger'
import { safeDecrypt } from '../utils/encryption'
import * as fs from 'fs'
import * as path from 'path'
import { saveToFile, SavVariable, VariableType, VariableMeasure } from 'sav-writer'

// ==================== 类型定义 ====================

interface AnswerItem {
  itemId: string
  value: any
  responseTime?: number
}

interface ScoreItem {
  dimensionId: string
  rawScore?: number
  normalizedScore?: number
}

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
}

interface ExportField {
  name: string       // 字段名（拼音）
  label: string      // 字段标签（中文）
  type: 'numeric' | 'string' | 'date'
  width?: number     // 字段宽度
  decimals?: number  // 小数位数
}

interface ExportData {
  fields: ExportField[]
  rows: Record<string, any>[]
}

// 字段命名规则
const FIELD_RULES = {
  USER_PREFIX: 'U_',
  QUESTION_PREFIX: 'Q_',
  DIMENSION_PREFIX: 'D_',
  MAX_LENGTH: 8,
}

// 字段名缓存，用于去重
const fieldNameCache = new Map<string, number>()

// ==================== 字段命名服务 ====================

/**
 * 将中文转换为拼音字段名
 * @param chinese 中文字符串
 * @param prefix 字段前缀
 * @returns 拼音字段名
 */
export function toPinyinFieldName(chinese: string, prefix: string = ''): string {
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
  const count = fieldNameCache.get(fullName) || 0
  if (count > 0) {
    const uniqueName = fullName + (count + 1)
    fieldNameCache.set(fullName, count + 1)
    return uniqueName.substring(0, FIELD_RULES.MAX_LENGTH + prefix.length + 2)
  }
  
  fieldNameCache.set(fullName, 1)
  return fullName
}

/**
 * 清空字段名缓存
 */
export function clearFieldNameCache(): void {
  fieldNameCache.clear()
}

// ==================== 反向计分处理 ====================

/**
 * 应用反向计分
 * @param value 原始分值
 * @param reverse 是否反向计分
 * @param points 量表点数
 */
export function applyReverseScore(value: number, reverse: boolean, points: number): number {
  if (!reverse || value === null || value === undefined) return value
  return points + 1 - value
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
    dateRange
  } = options

  clearFieldNameCache()

  // 获取量表信息
  const scale = await prisma.scale.findUnique({
    where: { id: scaleId },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' }
      },
      dimensions: true
    }
  })

  if (!scale) {
    throw new Error('量表不存在')
  }

  // 获取量表点数
  const points = (scale.config as any)?.points || 5

  // 构建查询条件
  const where: any = {
    scaleId,
    progress: { gte: minProgress }
  }
  
  if (!includeProgress) {
    where.status = 'COMPLETED'
  }

  if (dateRange?.start) {
    where.completedAt = { ...where.completedAt, gte: new Date(dateRange.start) }
  }
  if (dateRange?.end) {
    where.completedAt = { ...where.completedAt, lte: new Date(dateRange.end + 'T23:59:59') }
  }

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
    orderBy: { completedAt: 'asc' }
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

  // 题目字段
  const itemFieldMap = new Map<string, string>()
  const rtFieldMap = new Map<string, string>() // 作答时间字段映射
  for (const item of scale.items) {
    const fieldName = toPinyinFieldName(item.content.substring(0, 10), FIELD_RULES.QUESTION_PREFIX)
    itemFieldMap.set(item.id, fieldName)
    fields.push({
      name: fieldName,
      label: `${item.itemCode || ''} ${item.content.substring(0, 20)}`,
      type: 'numeric',
      width: 2,
      decimals: 0
    })
    // 作答时间字段
    const rtFieldName = 'RT_' + fieldName.substring(2) // 将 Q_xxx 改为 RT_xxx
    rtFieldMap.set(item.id, rtFieldName)
    fields.push({
      name: rtFieldName,
      label: `${item.itemCode || ''} 作答时间(毫秒)`,
      type: 'numeric',
      width: 6,
      decimals: 0
    })
  }

  // 维度字段
  const dimensionFieldMap = new Map<string, string>()
  for (const dimension of scale.dimensions) {
    const fieldName = toPinyinFieldName(dimension.name, FIELD_RULES.DIMENSION_PREFIX)
    dimensionFieldMap.set(dimension.id, fieldName)
    fields.push({
      name: fieldName,
      label: `${dimension.name}得分`,
      type: 'numeric',
      width: 5,
      decimals: 2
    })
  }

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
    row['U_time'] = assessment.totalTime ? Math.round(assessment.totalTime / 1000) : null
    row['U_date'] = assessment.completedAt ? assessment.completedAt.toISOString().split('T')[0] : null

    // 题目得分（处理反向计分）- 支持加密存储
    const rawAnswers = assessment.answers
    let answers: AnswerItem[] = []
    if (Array.isArray(rawAnswers)) {
      answers = rawAnswers as unknown as AnswerItem[]
    } else if (typeof rawAnswers === 'string' && rawAnswers) {
      const decrypted = safeDecrypt<AnswerItem[]>(rawAnswers)
      if (decrypted) {
        answers = decrypted
      }
    }
    const answerMap = new Map(answers.map(a => [a.itemId, a.value]))
    const responseTimeMap = new Map(answers.map(a => [a.itemId, a.responseTime]))

    for (const item of scale.items) {
      const fieldName = itemFieldMap.get(item.id)!
      const rtFieldName = rtFieldMap.get(item.id)!
      const rawValue = answerMap.get(item.id)
      
      if (rawValue !== undefined && rawValue !== null) {
        // 应用反向计分
        row[fieldName] = applyReverseScore(Number(rawValue), item.reverse, points)
      } else {
        row[fieldName] = null // 缺失值
      }
      
      // 作答时间
      row[rtFieldName] = responseTimeMap.get(item.id) ?? null
    }

    // 维度得分 - 支持加密存储
    const rawScores = assessment.scores
    let scores: ScoreItem[] = []
    if (Array.isArray(rawScores)) {
      scores = rawScores as unknown as ScoreItem[]
    } else if (typeof rawScores === 'string' && rawScores) {
      const decrypted = safeDecrypt<ScoreItem[]>(rawScores)
      if (decrypted) {
        scores = decrypted
      }
    }
    for (const score of scores) {
      const fieldName = dimensionFieldMap.get(score.dimensionId)
      if (fieldName) {
        row[fieldName] = score.rawScore ?? score.normalizedScore ?? null
      }
    }

    rows.push(row)
  }

  return { fields, rows }
}

/**
 * 导出为 CSV 格式
 */
export async function exportToCSV(scaleId: string, options: ExportOptions = {}): Promise<string> {
  const { fields, rows } = await getScaleExportData(scaleId, options)

  // 构建 CSV 内容
  const header = fields.map(f => f.name).join(',')
  const lines = [header]

  for (const row of rows) {
    const values = fields.map(f => {
      const value = row[f.name]
      if (value === null || value === undefined) return ''
      if (typeof value === 'string') {
        // 正确转义双引号：将 " 替换为 ""
        return `"${value.replace(/"/g, '""')}"`
      }
      return String(value)
    })
    lines.push(values.join(','))
  }

  return lines.join('\n')
}

/**
 * 导出为 SPSS .sav 格式
 * 由于 npm 上的 sav-writer 库可能不可用，这里提供 CSV + SPS 语法方案
 */
export async function exportToSPSS(
  scaleId: string,
  options: ExportOptions = {}
): Promise<{ csvContent: string; spsContent: string }> {
  const { fields, rows } = await getScaleExportData(scaleId, options)

  // 生成 CSV 内容
  const header = fields.map(f => f.name).join(',')
  const lines = [header]

  for (const row of rows) {
    const values = fields.map(f => {
      const value = row[f.name]
      if (value === null || value === undefined) return ''
      if (typeof value === 'string') {
        // 正确转义双引号：将 " 替换为 ""
        return `"${value.replace(/"/g, '""')}"`
      }
      return String(value)
    })
    lines.push(values.join(','))
  }

  const csvContent = lines.join('\n')

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

  // 添加值标签（性别）
  spsLines.push('')
  spsLines.push('VALUE LABELS')
  spsLines.push('  U_gender')
  spsLines.push('  0 "未知"')
  spsLines.push('  1 "男"')
  spsLines.push('  2 "女".')
  spsLines.push('')

  // 添加缺失值定义
  spsLines.push('MISSING VALUES')
  const numericFields = fields.filter(f => f.type === 'numeric')
  spsLines.push('  ' + numericFields.map(f => f.name).join(' ') + ' (999).')
  spsLines.push('')

  spsLines.push('EXECUTE.')

  return {
    csvContent,
    spsContent: spsLines.join('\n')
  }
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
  format: 'csv' | 'sav' | 'spss' = 'csv'
): Promise<{ csvPath?: string; savPath?: string; spsPath?: string }> {
  // 使用 __dirname 确保路径正确（相对于 dist/services 目录）
  const exportDir = path.join(__dirname, '../../exports')
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
  const baseFileName = `scale_${scaleId.substring(0, 8)}_${timestamp}`

  const result: { csvPath?: string; savPath?: string; spsPath?: string } = {}

  if (format === 'csv') {
    // 纯 CSV 格式
    const csvContent = await exportToCSV(scaleId, options)
    const csvPath = path.join(exportDir, `${baseFileName}.csv`)
    fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf-8')
    result.csvPath = csvPath
  } else if (format === 'sav') {
    // 原生 SAV 格式
    const savPath = await exportToSav(scaleId, options)
    result.savPath = savPath
  } else if (format === 'spss') {
    // CSV + SPS 格式（兼容旧版）
    const { csvContent, spsContent } = await exportToSPSS(scaleId, options)
    
    const csvPath = path.join(exportDir, `${baseFileName}.csv`)
    const spsPath = path.join(exportDir, `${baseFileName}.sps`)
    
    fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf-8')
    fs.writeFileSync(spsPath, spsContent, 'utf-8')
    
    result.csvPath = csvPath
    result.spsPath = spsPath
  }

  return result
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
  const {
    anonymize = true,
    includeProgress = false,
    minProgress = 100,
    dateRange
  } = options

  clearFieldNameCache()

  // 获取问卷信息（包含表单题目）
  const questionnaire = await prisma.questionnaire.findUnique({
    where: { id: questionnaireId },
    include: {
      formItems: {
        orderBy: { position: 'asc' }
      },
      questionnaireScales: {
        include: {
          scale: {
            include: {
              items: { orderBy: { sortOrder: 'asc' } },
              dimensions: true
            }
          }
        },
        orderBy: { position: 'asc' }
      }
    }
  })

  if (!questionnaire) {
    throw new Error('问卷不存在')
  }

  // 获取问卷测评记录（包含表单答案）
  const where: any = {
    questionnaireId,
    progress: { gte: minProgress }
  }
  
  if (!includeProgress) {
    where.status = 'COMPLETED'
  }

  if (dateRange?.start) {
    where.completedAt = { ...where.completedAt, gte: new Date(dateRange.start) }
  }
  if (dateRange?.end) {
    where.completedAt = { ...where.completedAt, lte: new Date(dateRange.end + 'T23:59:59') }
  }

  const questionnaireAssessments = await prisma.questionnaireAssessment.findMany({
    where,
    include: {
      user: {
        select: { id: true, nickname: true, username: true }
      },
      formAnswers: true,
      scaleAssessments: {
        include: {
          scale: {
            include: {
              items: { orderBy: { sortOrder: 'asc' } },
              dimensions: true
            }
          }
        },
        orderBy: { startedAt: 'asc' }
      }
    },
    orderBy: { completedAt: 'asc' }
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

  // 为每个表单题目添加字段
  const formFieldMap = new Map<string, string>()
  for (let formIndex = 0; formIndex < questionnaire.formItems.length; formIndex++) {
    const formItem = questionnaire.formItems[formIndex]
    const fieldName = toPinyinFieldName(formItem.label.substring(0, 8), `F${formIndex + 1}_`)
    formFieldMap.set(formItem.id, fieldName)
    fields.push({
      name: fieldName,
      label: `[表单] ${formItem.label}`,
      type: 'string',
      width: 20
    })
  }

  // 为每个量表添加题目和维度字段
  const scaleFieldMaps: Array<{
    scaleIndex: number
    scaleId: string
    itemFieldMap: Map<string, string>
    rtFieldMap: Map<string, string>
    dimensionFieldMap: Map<string, string>
    points: number
  }> = []

  for (let scaleIndex = 0; scaleIndex < questionnaire.questionnaireScales.length; scaleIndex++) {
    const qs = questionnaire.questionnaireScales[scaleIndex]
    const scale = qs.scale
    const points = (scale.config as any)?.points || 5
    const prefix = `S${scaleIndex + 1}_`

    const itemFieldMap = new Map<string, string>()
    const rtFieldMap = new Map<string, string>()
    const dimensionFieldMap = new Map<string, string>()

    // 题目字段
    for (const item of scale.items) {
      const fieldName = toPinyinFieldName(item.content.substring(0, 8), `${FIELD_RULES.QUESTION_PREFIX}${prefix}`)
      itemFieldMap.set(item.id, fieldName)
      fields.push({
        name: fieldName,
        label: `[${scale.name}] ${item.itemCode || ''} ${item.content.substring(0, 15)}`,
        type: 'numeric',
        width: 2,
        decimals: 0
      })
      // 作答时间字段
      const rtFieldName = 'RT_' + fieldName.substring(2) // 将 Q_Sn_xxx 改为 RT_Sn_xxx
      rtFieldMap.set(item.id, rtFieldName)
      fields.push({
        name: rtFieldName,
        label: `[${scale.name}] ${item.itemCode || ''} 作答时间(毫秒)`,
        type: 'numeric',
        width: 6,
        decimals: 0
      })
    }

    // 维度字段
    for (const dimension of scale.dimensions) {
      const fieldName = toPinyinFieldName(dimension.name, `${FIELD_RULES.DIMENSION_PREFIX}${prefix}`)
      dimensionFieldMap.set(dimension.id, fieldName)
      fields.push({
        name: fieldName,
        label: `[${scale.name}] ${dimension.name}得分`,
        type: 'numeric',
        width: 5,
        decimals: 2
      })
    }

    scaleFieldMaps.push({
      scaleIndex,
      scaleId: scale.id,
      itemFieldMap,
      rtFieldMap,
      dimensionFieldMap,
      points
    })
  }

  // 构建数据行
  const rows: Record<string, any>[] = []

  for (const qa of questionnaireAssessments) {
    const row: Record<string, any> = {}

    // 用户基础信息
    row['U_id'] = qa.userId ? (anonymize ? `U${qa.userId.substring(0, 8)}` : qa.userId) : 'ANONYMOUS'
    if (!anonymize && qa.user) {
      row['U_name'] = qa.user.nickname || qa.user.username
    }
    row['U_time'] = qa.totalTime ? Math.round(qa.totalTime / 1000) : null
    row['U_date'] = qa.completedAt ? qa.completedAt.toISOString().split('T')[0] : null

    // 填充表单答案
    const formAnswerMap = new Map(qa.formAnswers.map(fa => [fa.formItemId, fa.value]))
    for (const formItem of questionnaire.formItems) {
      const fieldName = formFieldMap.get(formItem.id)
      if (fieldName) {
        row[fieldName] = formAnswerMap.get(formItem.id) ?? null
      }
    }

    // 为每个量表填充数据
    for (const scaleMap of scaleFieldMaps) {
      const scaleAssessment = qa.scaleAssessments.find(sa => sa.scaleId === scaleMap.scaleId)
      
      if (scaleAssessment) {
        // 解密 answers 字段（支持加密存储）
        const rawAnswers = scaleAssessment.answers
        let answers: AnswerItem[] = []
        if (Array.isArray(rawAnswers)) {
          answers = rawAnswers as unknown as AnswerItem[]
        } else if (typeof rawAnswers === 'string' && rawAnswers) {
          const decrypted = safeDecrypt<AnswerItem[]>(rawAnswers)
          if (decrypted) {
            answers = decrypted
          }
        }
        
        const answerMap = new Map(answers.map(a => [a.itemId, a.value]))
        const responseTimeMap = new Map(answers.map(a => [a.itemId, a.responseTime]))
        
        const scale = questionnaire.questionnaireScales.find(qs => qs.scaleId === scaleMap.scaleId)?.scale
        const items = scale?.items || []
        
        for (const item of items) {
          const fieldName = scaleMap.itemFieldMap.get(item.id)
          const rtFieldName = scaleMap.rtFieldMap.get(item.id)
          if (fieldName) {
            const rawValue = answerMap.get(item.id)
            if (rawValue !== undefined && rawValue !== null) {
              row[fieldName] = applyReverseScore(Number(rawValue), item.reverse, scaleMap.points)
            } else {
              row[fieldName] = null
            }
          }
          if (rtFieldName) {
            row[rtFieldName] = responseTimeMap.get(item.id) ?? null
          }
        }

        // 解密 scores 字段（支持加密存储）
        const rawScores = scaleAssessment.scores
        let scores: ScoreItem[] = []
        if (Array.isArray(rawScores)) {
          scores = rawScores as unknown as ScoreItem[]
        } else if (typeof rawScores === 'string' && rawScores) {
          const decrypted = safeDecrypt<ScoreItem[]>(rawScores)
          if (decrypted) {
            scores = decrypted
          }
        }
        
        for (const score of scores) {
          const fieldName = scaleMap.dimensionFieldMap.get(score.dimensionId)
          if (fieldName) {
            row[fieldName] = score.rawScore ?? score.normalizedScore ?? null
          }
        }
      } else {
        // 该量表未测评，填充 null
        for (const fieldName of scaleMap.itemFieldMap.values()) {
          row[fieldName] = null
        }
        for (const fieldName of scaleMap.rtFieldMap.values()) {
          row[fieldName] = null
        }
        for (const fieldName of scaleMap.dimensionFieldMap.values()) {
          row[fieldName] = null
        }
      }
    }

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

  const header = fields.map(f => f.name).join(',')
  const lines = [header]

  for (const row of rows) {
    const values = fields.map(f => {
      const value = row[f.name]
      if (value === null || value === undefined) return ''
      if (typeof value === 'string') {
        // 正确转义双引号：将 " 替换为 ""
        return `"${value.replace(/"/g, '""')}"`
      }
      return String(value)
    })
    lines.push(values.join(','))
  }

  return lines.join('\n')
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
  format: 'csv' | 'sav' = 'csv'
): Promise<{ csvPath?: string; savPath?: string }> {
  const exportDir = path.join(__dirname, '../../exports')
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
  const baseFileName = `questionnaire_${questionnaireId.substring(0, 8)}_${timestamp}`

  const result: { csvPath?: string; savPath?: string } = {}

  if (format === 'csv') {
    const csvContent = await exportQuestionnaireToCSV(questionnaireId, options)
    const csvPath = path.join(exportDir, `${baseFileName}.csv`)
    fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf-8')
    result.csvPath = csvPath
  } else if (format === 'sav') {
    const savPath = await exportQuestionnaireToSav(questionnaireId, options)
    result.savPath = savPath
  }

  return result
}

// ==================== 导出服务对象 ====================

export const exportService = {
  toPinyinFieldName,
  applyReverseScore,
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
