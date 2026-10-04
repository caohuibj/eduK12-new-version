import { describe, expect, it } from 'vitest'
import { dateTimeInputValue, deadlineToIso, formatLocalDateTime } from '../dateTime'
import { formatAssignmentAnswer, assignmentAnswerHeading } from '../answerLabels'
import type { Question } from '../../components/QuestionEditor'
describe('acceptance formatting', () => {
  it('round-trips local deadline inputs and labels display offsets', () => {
    for (const local of ['2026-10-11T23:59', '2026-12-31T23:59']) {
      expect(dateTimeInputValue(deadlineToIso(local)!)).toBe(local)
      expect(formatLocalDateTime(deadlineToIso(local)!)).toContain('UTC')
    }
    expect(deadlineToIso('')).toBeUndefined()
    expect(dateTimeInputValue('invalid')).toBe('')
  })
  it('labels ordinal and ID keyed answers without interpreting free text', () => {
    const questions: Question[] = [{ id: 'q1', type: 'single_choice', question: '颜色', options: [{ key: 'C', text: '绿色系' }] }, { id: 'q2', type: 'multiple_choice', question: '多选', options: [{ key: 'A', text: '红色' }, { key: 'B', text: '绿色' }] }, { id: 'q3', type: 'text', question: '文字' }]
    expect(formatAssignmentAnswer(questions, '0', 'C')).toBe('题目1：绿色系')
    expect(formatAssignmentAnswer(questions, 'q2', 'A,B')).toBe('题目2：红色、绿色')
    expect(formatAssignmentAnswer(questions, '2', '["A","B"]')).toBe('题目3：["A","B"]')
    expect(formatAssignmentAnswer(questions, '0', 'missing')).toBe('题目1：missing')
  })
  it('labels subjective, choice and mixed submissions according to their question types', () => {
    const text: Question = { id: 't', type: 'text', question: '说明' }
    const choice: Question = { id: 'c', type: 'single_choice', question: '颜色' }
    expect(assignmentAnswerHeading([text])).toBe('主观题答案')
    expect(assignmentAnswerHeading([choice])).toBe('选择题答案')
    expect(assignmentAnswerHeading([text, choice])).toBe('题目答案')
    expect(assignmentAnswerHeading(undefined)).toBe('题目答案')
    expect(formatAssignmentAnswer([text], '0', '合成答案')).toBe('题目1：合成答案')
  })

})
