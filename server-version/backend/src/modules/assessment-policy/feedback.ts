/** Completion feedback is independent of score disclosure. It never serializes a result. */
export interface RespondentCompletionFeedbackV1 {
  schemaVersion: 1
  kind: 'SELF_COMPLETION' | 'OBSERVATION_COMPLETION' | 'EXPERIENCE_COMPLETION'
  title: string
  message: string
}

export function respondentCompletionFeedback(input: { state: string; perspective: string | null }): RespondentCompletionFeedbackV1 | null {
  if (input.state !== 'COMPLETED') return null
  if (input.perspective === 'SELF_REPORT') return {
    schemaVersion: 1, kind: 'SELF_COMPLETION', title: '你已完成本次测评',
    message: '本次作答已保存。可提供的个人反馈按本测评的说明展示；多次结果不一定具有可比性。',
  }
  if (input.perspective === 'OBSERVER_REPORT') return {
    schemaVersion: 1, kind: 'OBSERVATION_COMPLETION', title: '你的观察记录已保存',
    message: '这份回答反映你在本次观察中的体验，不等同于被评价者的完整情况，也不能单独用于诊断。可提供的观察反馈按本测评的说明展示。',
  }
  return {
    schemaVersion: 1, kind: 'EXPERIENCE_COMPLETION', title: '感谢你分享本次体验',
    message: '本次回答已保存。涉及他人的反馈会按本测评的保护规则处理，不向你展示被评价者的个人得分或排名。',
  }
}
