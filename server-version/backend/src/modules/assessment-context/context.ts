import { createHmac } from 'node:crypto'
import { z } from 'zod'

export const assessmentContextKeySchema = z.enum([
  'birthYearMonth',
  'sexAtBirth',
  'gradeLevel',
  'primaryLanguage',
  'countryOrRegion',
])

export type AssessmentContextKey = z.infer<typeof assessmentContextKeySchema>

export const assessmentContextKeys = assessmentContextKeySchema.options

export const sexAtBirthSchema = z.enum(['female', 'male', 'intersex', 'not_disclosed'])
export type SexAtBirth = z.infer<typeof sexAtBirthSchema>

export const gradeLevelSchema = z.enum([
  'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
  'other', 'not_disclosed',
])
export type GradeLevel = z.infer<typeof gradeLevelSchema>

export interface AssessmentContextValues {
  birthYearMonth?: string
  ageMonthsAtFreeze?: number
  ageYearsAtFreeze?: number
  sexAtBirth?: SexAtBirth
  gradeLevel?: GradeLevel
  primaryLanguage?: string
  countryOrRegion?: string
}

export interface AssessmentContextV1 {
  schemaVersion: 1
  frozenAt: string
  values: AssessmentContextValues
}

export interface ContextFormItem {
  id: string
  type: string
  label?: string | null
  required?: boolean
  position?: number
  contextKey?: string | null
  options?: unknown
}

export interface ContextFormAnswer {
  formItemId: string
  value: string
}

export interface ContextDefinitionIssue {
  path: string
  message: string
}

const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const BCP_47 = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/
const ISO_REGION = /^[A-Z]{2}$/

const isValidContextKey = (value: string | null | undefined): value is AssessmentContextKey => (
  value !== null && value !== undefined && assessmentContextKeySchema.safeParse(value).success
)

const asOptions = (value: unknown): Array<{ value: string; label?: string }> => {
  if (!Array.isArray(value)) return []
  return value.filter((option): option is { value: string; label?: string } => (
    Boolean(option)
    && typeof option === 'object'
    && !Array.isArray(option)
    && typeof (option as { value?: unknown }).value === 'string'
  ))
}

const canonicalOptionValues = (item: ContextFormItem): Set<string> => (
  new Set(asOptions(item.options).map((option) => option.value))
)

export const validateContextFormItem = (item: ContextFormItem, path = 'formItem'): ContextDefinitionIssue[] => {
  if (!item.contextKey) return []
  const issues: ContextDefinitionIssue[] = []
  if (!isValidContextKey(item.contextKey)) {
    return [{ path: `${path}.contextKey`, message: 'contextKey 不合法' }]
  }

  if (item.contextKey === 'birthYearMonth') {
    if (item.type !== 'year_month') issues.push({ path: `${path}.type`, message: 'birthYearMonth 必须使用 year_month 表单类型' })
    return issues
  }

  if (item.type !== 'single_choice') {
    issues.push({ path: `${path}.type`, message: `${item.contextKey} 必须使用 single_choice 表单类型` })
  }
  const values = canonicalOptionValues(item)
  if (values.size === 0) {
    issues.push({ path: `${path}.options`, message: 'context 表单必须提供选项' })
  }

  if (item.contextKey === 'sexAtBirth') {
    for (const value of values) {
      if (!sexAtBirthSchema.safeParse(value).success) issues.push({ path: `${path}.options`, message: `sexAtBirth 选项值不合法：${value}` })
    }
  }
  if (item.contextKey === 'gradeLevel') {
    for (const value of values) {
      if (!gradeLevelSchema.safeParse(value).success) issues.push({ path: `${path}.options`, message: `gradeLevel 选项值不合法：${value}` })
    }
  }
  if (item.contextKey === 'primaryLanguage') {
    for (const value of values) {
      if (!BCP_47.test(value)) issues.push({ path: `${path}.options`, message: `primaryLanguage 必须是 BCP 47 值：${value}` })
    }
  }
  if (item.contextKey === 'countryOrRegion') {
    for (const value of values) {
      if (!ISO_REGION.test(value)) issues.push({ path: `${path}.options`, message: `countryOrRegion 必须是 ISO 两位地区代码：${value}` })
    }
  }
  return issues
}

export const validateContextFormItems = (items: ContextFormItem[], measurementPositions: number[] = []): ContextDefinitionIssue[] => {
  const issues: ContextDefinitionIssue[] = []
  const seen = new Set<string>()
  const firstMeasurement = measurementPositions.length > 0 ? Math.min(...measurementPositions) : null
  items.forEach((item, index) => {
    const path = `formItems.${index}`
    if (item.contextKey) {
      if (seen.has(item.contextKey)) issues.push({ path: `${path}.contextKey`, message: '同一父级测评中 contextKey 不能重复' })
      seen.add(item.contextKey)
      issues.push(...validateContextFormItem(item, path))
      if (firstMeasurement !== null && (item.position ?? 0) >= firstMeasurement) {
        issues.push({ path: `${path}.position`, message: 'context 表单必须排在第一个测评模块之前' })
      }
    }
  })
  return issues
}

const monthIndex = (yearMonth: string): number => {
  const [year, month] = yearMonth.split('-').map(Number)
  return year * 12 + month - 1
}

export const isValidYearMonth = (value: string): boolean => ISO_MONTH.test(value)

export const validateContextAnswer = (item: ContextFormItem, value: string): string | null => {
  if (!item.contextKey) return null
  const issues = validateContextFormItem(item)
  if (issues.length > 0) return issues[0].message
  if (value === '' && item.required === false) return null
  if (item.contextKey === 'birthYearMonth') {
    if (!isValidYearMonth(value)) return '出生年月必须是 YYYY-MM'
    try {
      ageMonthsAt(value, new Date())
    } catch (error) {
      return error instanceof Error ? error.message : '出生年月无效'
    }
    return null
  }
  if (!canonicalOptionValues(item).has(value)) return `${item.label ?? item.id} 的选项值无效`
  return null
}

export const ageMonthsAt = (birthYearMonth: string, frozenAt: Date): number => {
  if (!isValidYearMonth(birthYearMonth)) throw new Error('出生年月必须是 YYYY-MM')
  const currentIndex = frozenAt.getUTCFullYear() * 12 + frozenAt.getUTCMonth()
  const ageMonths = currentIndex - monthIndex(birthYearMonth)
  if (ageMonths < 0) throw new Error('出生年月不能晚于冻结月份')
  return ageMonths
}

const answerMap = (answers: ContextFormAnswer[]): Map<string, string> => new Map(answers.map((answer) => [answer.formItemId, answer.value]))

const valueFor = (item: ContextFormItem, value: string | undefined): string | undefined => {
  if (value === undefined || value === '') return undefined
  if (item.type === 'single_choice' && !canonicalOptionValues(item).has(value)) throw new Error(`${item.label ?? item.id} 的选项值无效`)
  return value
}

export const buildAssessmentContext = (input: {
  items: ContextFormItem[]
  answers: ContextFormAnswer[]
  frozenAt?: Date
}): AssessmentContextV1 => {
  const frozenAt = input.frozenAt ?? new Date()
  const values: AssessmentContextValues = {}
  const answersByItem = answerMap(input.answers)
  const contextItems = input.items.filter((item) => Boolean(item.contextKey))
  const issues = validateContextFormItems(contextItems)
  if (issues.length > 0) throw new Error(issues[0].message)

  for (const item of contextItems) {
    const key = item.contextKey as AssessmentContextKey
    const value = valueFor(item, answersByItem.get(item.id))
    if (value === undefined) {
      if (item.required !== false) throw new Error(`${item.label ?? item.id} 为必填项`)
      continue
    }
    if (key === 'birthYearMonth') {
      values.birthYearMonth = value
      values.ageMonthsAtFreeze = ageMonthsAt(value, frozenAt)
      values.ageYearsAtFreeze = Math.floor(values.ageMonthsAtFreeze / 12)
    } else if (key === 'sexAtBirth') {
      values.sexAtBirth = sexAtBirthSchema.parse(value)
    } else if (key === 'gradeLevel') {
      values.gradeLevel = gradeLevelSchema.parse(value)
    } else if (key === 'primaryLanguage') {
      if (!BCP_47.test(value)) throw new Error('primaryLanguage 必须是 BCP 47 值')
      values.primaryLanguage = value
    } else if (key === 'countryOrRegion') {
      if (!ISO_REGION.test(value)) throw new Error('countryOrRegion 必须是 ISO 两位地区代码')
      values.countryOrRegion = value
    }
  }

  return {
    schemaVersion: 1,
    frozenAt: frozenAt.toISOString(),
    values,
  }
}

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, sortKeys(entry)]))
}

export const stableContextJson = (context: AssessmentContextV1): string => JSON.stringify(sortKeys(context))

const CONTEXT_HASH_DOMAIN = 'eduK12-assessment-context-hash-v1'

const contextHashKey = (): Buffer => {
  const configuredKey = process.env.ASSESSMENT_CONTEXT_HASH_KEY || process.env.DATA_ENCRYPTION_KEY
  if (!configuredKey || !/^[0-9a-fA-F]{64}$/.test(configuredKey)) {
    throw new Error('ASSESSMENT_CONTEXT_HASH_KEY or DATA_ENCRYPTION_KEY must be a 64-character hex key')
  }
  // Derive a domain-specific HMAC key so the fallback DATA_ENCRYPTION_KEY is
  // not reused directly for this fingerprint purpose.
  return createHmac('sha256', Buffer.from(configuredKey, 'hex')).update(CONTEXT_HASH_DOMAIN).digest()
}

export const hashAssessmentContext = (context: AssessmentContextV1): string => (
  createHmac('sha256', contextHashKey()).update(stableContextJson(context), 'utf8').digest('hex')
)

export const contextKeyToStorage = (key: AssessmentContextKey): string => key

export const contextKeyFromStorage = (key: string | null | undefined): AssessmentContextKey | null => (
  isValidContextKey(key) ? key : null
)

export const contextValueIsReferenceAvailable = (context: AssessmentContextV1 | null | undefined, key: AssessmentContextKey): boolean => {
  const value = context?.values[key]
  return value !== undefined && value !== null && value !== '' && value !== 'not_disclosed'
}
