import { CognitiveFocusStage } from './CognitiveFocusStage'
import { CognitivePracticeAnswer, type PracticeAnswerFeedback } from './CognitiveTaskPresentation'

export type PracticeReview = PracticeAnswerFeedback

/** Practice-only pause. The task supplies facts and retains its own pass threshold. */
export function CognitivePracticeReview({ feedback, completed, total, onContinue, continueLabel, visual }: {
  feedback: PracticeReview
  completed: number
  total: number
  onContinue: () => void
  continueLabel?: string
  visual?: ReactNode
}) {
  return <CognitiveFocusStage ariaLabel="练习逐题解析" progress={{ completed, total, label: '练习 · 已完成 / 总量' }}>
    {visual ? <div className="cognitive-practice-review__visual" aria-label="回看本题">{visual}</div> : null}
    <CognitivePracticeAnswer feedback={feedback} />
    <div className="cognitive-practice-feedback__footer">
      <button type="button" className="btn-primary" onClick={onContinue}>{continueLabel ?? (completed >= total ? '查看练习结果' : '继续下一题')}</button>
    </div>
  </CognitiveFocusStage>
}
import type { ReactNode } from 'react'
