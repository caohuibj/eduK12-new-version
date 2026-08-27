export type AssessmentContextKey =
  | 'birthYearMonth'
  | 'sexAtBirth'
  | 'gradeLevel'
  | 'primaryLanguage'
  | 'countryOrRegion'

export interface AssessmentContextOption {
  value: string
  label: string
}

const optionTemplates: Record<AssessmentContextKey, AssessmentContextOption[]> = {
  birthYearMonth: [],
  sexAtBirth: [
    { value: 'female', label: '女' },
    { value: 'male', label: '男' },
    { value: 'intersex', label: '间性' },
    { value: 'not_disclosed', label: '不愿透露' },
  ],
  gradeLevel: [
    { value: 'K', label: 'K' },
    ...Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) })),
    { value: 'other', label: '其他' },
    { value: 'not_disclosed', label: '不愿透露' },
  ],
  primaryLanguage: [
    { value: 'zh-CN', label: '中文（简体）' },
    { value: 'zh-TW', label: '中文（繁体）' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
  ],
  countryOrRegion: [
    { value: 'CN', label: '中国大陆' },
    { value: 'HK', label: '中国香港' },
    { value: 'MO', label: '中国澳门' },
    { value: 'TW', label: '中国台湾' },
    { value: 'SG', label: '新加坡' },
    { value: 'US', label: '美国' },
  ],
}

const hints: Record<AssessmentContextKey, string> = {
  birthYearMonth: '稳定值必须是 YYYY-MM，例如 2014-02。',
  sexAtBirth: '稳定值只能使用 female、male、intersex 或 not_disclosed。',
  gradeLevel: '稳定值只能使用 K、1–12、other 或 not_disclosed。',
  primaryLanguage: '稳定值使用 BCP 47，例如 zh-CN、en 或 en-US。',
  countryOrRegion: '稳定值使用 ISO 3166-1 alpha-2，例如 CN、US。',
}

export const contextOptionsForKey = (key: string): AssessmentContextOption[] => {
  const options = optionTemplates[key as AssessmentContextKey]
  return options ? options.map((option) => ({ ...option })) : []
}

export const contextValueHint = (key: string): string | null => hints[key as AssessmentContextKey] ?? null

/** Parse the compact teacher-editor syntax: value=label,value=label. */
export const parseDelimitedOptions = (input: string): AssessmentContextOption[] => input
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const separator = entry.indexOf('=')
    if (separator <= 0) return { value: entry, label: entry }
    const value = entry.slice(0, separator).trim()
    const label = entry.slice(separator + 1).trim() || value
    return { value, label }
  })
  .filter((option) => option.value.length > 0)

export const serializeDelimitedOptions = (options: AssessmentContextOption[]): string => options
  .map((option) => `${option.value}=${option.label}`)
  .join(',')
