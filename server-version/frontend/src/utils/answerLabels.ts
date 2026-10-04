import type { Question } from '../components/QuestionEditor'

/** Choice labels are for display only; the persisted answer remains unchanged. */
export const formatAssignmentAnswer = (questions: Question[] | undefined, key: string, value: unknown): string => {
  const index = /^\d+$/.test(key) ? Number(key) : -1
  const question = index >= 0 ? questions?.[index] : questions?.find(item => item.id === key)
  const questionIndex = question ? questions!.indexOf(question) : index
  const heading = questionIndex >= 0 ? `题目${questionIndex + 1}` : '题目'
  if (!question || question.type === 'text') return `${heading}：${String(value ?? '—')}`
  const values = Array.isArray(value) ? value : question.type === 'multiple_choice' ? String(value ?? '').split(',') : [value]
  const labels = values.map(selected => question.options?.find(option => option.key === String(selected).trim())?.text || String(selected))
  return `${heading}：${labels.join('、')}`
}
