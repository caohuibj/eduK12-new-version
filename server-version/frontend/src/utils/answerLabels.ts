import type { Question } from '../components/QuestionEditor'

/** Support Web index keys and native question-ID keys without changing stored data. */
export const readAssignmentAnswer = (answers: Record<string, unknown> | undefined, question: Question, index: number): unknown =>
  answers?.[String(index)] ?? answers?.[question.id]

export const assignmentChoiceValues = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String)
  const text = String(value ?? '')
  if (text.startsWith('[')) {
    try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) return parsed.map(String) } catch { /* Older answers use comma-separated keys. */ }
  }
  return text.split(',').map(item => item.trim()).filter(Boolean)
}

/** Choice labels are for display only; the persisted answer remains unchanged. */
export const formatAssignmentAnswer = (questions: Question[] | undefined, key: string, value: unknown): string => {
  const index = /^\d+$/.test(key) ? Number(key) : -1
  const question = index >= 0 ? questions?.[index] : questions?.find(item => item.id === key)
  const questionIndex = question ? questions!.indexOf(question) : index
  const heading = questionIndex >= 0 ? `题目${questionIndex + 1}` : '题目'
  if (!question || question.type === 'text') return `${heading}：${String(value ?? '—')}`
  const values = question.type === 'multiple_choice' ? assignmentChoiceValues(value) : [value]
  const labels = values.map(selected => question.options?.find(option => option.key === String(selected).trim())?.text || String(selected ?? '—'))
  return `${heading}：${labels.join('、') || '—'}`
}

export const assignmentAnswerHeading = (questions: Question[] | undefined): string => {
  if (!questions?.length) return '题目答案'
  if (questions.every(question => question.type === 'text')) return '主观题答案'
  if (questions.every(question => question.type !== 'text')) return '选择题答案'
  return '题目答案'
}
