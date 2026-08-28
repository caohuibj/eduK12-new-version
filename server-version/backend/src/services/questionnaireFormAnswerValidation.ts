import { validateContextAnswer, type ContextFormItem } from '../modules/assessment-context'

export type QuestionnaireFormAnswerItem = Omit<ContextFormItem, 'id' | 'type'> & {
  id?: string
  type?: string
  required?: boolean
}

const optionValues = (item: QuestionnaireFormAnswerItem): Set<string> => {
  if (!Array.isArray(item.options)) return new Set()
  return new Set(
    item.options
      .filter((option): option is { value: string } => (
        Boolean(option)
        && typeof option === 'object'
        && !Array.isArray(option)
        && typeof (option as { value?: unknown }).value === 'string'
      ))
      .map((option) => option.value),
  )
}

const parseMultipleValue = (value: unknown): string[] | null => {
  if (Array.isArray(value)) return value.every((entry) => typeof entry === 'string') ? value : null
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string') ? parsed : null
  } catch {
    return null
  }
}

/**
 * Validate the value at the API boundary before it is persisted. The same
 * rules are used by authenticated, public and batch questionnaire saves.
 */
export const validateQuestionnaireFormAnswer = (
  item: QuestionnaireFormAnswerItem,
  value: unknown,
): string | null => {
  const label = item.label ?? item.id

  if (item.type === 'multiple_choice') {
    const values = parseMultipleValue(value)
    if (!values) return `${label} 的答案格式无效`
    const uniqueValues = [...new Set(values)]
    if (item.required && uniqueValues.length === 0) return `${label} 为必填项`
    const allowed = optionValues(item)
    if (uniqueValues.some((entry) => !allowed.has(entry))) return `${label} 的选项值无效`
    return item.contextKey
      ? validateContextAnswer({ ...item, id: item.id ?? 'formItem', type: item.type ?? '' }, JSON.stringify(uniqueValues))
      : null
  }

  if (typeof value !== 'string') return `${label} 的答案格式无效`
  const trimmed = value.trim()
  if (!trimmed) return item.required ? `${label} 为必填项` : null

  if (item.type === 'single_choice') {
    if (!optionValues(item).has(value)) return `${label} 的选项值无效`
  } else if (item.type === 'year_month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return `${label} 必须是 YYYY-MM`
  }

  if (item.contextKey) return validateContextAnswer({ ...item, id: item.id ?? 'formItem', type: item.type ?? '' }, value)
  return null
}

/** Store a canonical representation after validation (notably de-duplicated multi-select values). */
export const normalizeQuestionnaireFormAnswer = (
  item: QuestionnaireFormAnswerItem,
  value: unknown,
): unknown => {
  if (item.type === 'fill_blank' || item.type === 'text_input') {
    return typeof value === 'string' ? value.trim() : value
  }
  if (item.type !== 'multiple_choice') return value
  const values = parseMultipleValue(value)
  return values ? [...new Set(values)] : value
}
