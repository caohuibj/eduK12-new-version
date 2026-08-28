import { QuestionnaireFormAnswerStatus } from '@prisma/client'

export type FormAnswerState = {
  status?: QuestionnaireFormAnswerStatus | string | null
  value?: string | null
}

/** Compatibility-aware status for rows created before PR25. */
export const answerStatus = (answer: FormAnswerState | null | undefined): QuestionnaireFormAnswerStatus => {
  if (answer?.status === QuestionnaireFormAnswerStatus.ANSWERED) return QuestionnaireFormAnswerStatus.ANSWERED
  if (answer?.status === QuestionnaireFormAnswerStatus.SKIPPED) return QuestionnaireFormAnswerStatus.SKIPPED
  if (answer?.status === QuestionnaireFormAnswerStatus.PENDING) return QuestionnaireFormAnswerStatus.PENDING
  return answer?.value !== null && answer?.value !== undefined
    ? QuestionnaireFormAnswerStatus.ANSWERED
    : QuestionnaireFormAnswerStatus.PENDING
}

const hasValue = (value: string | null | undefined): boolean => (
  value !== null && value !== undefined && (typeof value !== 'string' || value.trim().length > 0)
)

export const isFormAnswerComplete = (
  item: { required?: boolean; contextKey?: string | null },
  answer: FormAnswerState | null | undefined,
): boolean => {
  const status = answerStatus(answer)
  if (status === QuestionnaireFormAnswerStatus.ANSWERED) return hasValue(answer?.value)
  return status === QuestionnaireFormAnswerStatus.SKIPPED && item.required === false && !item.contextKey
}

export const isFormAnswerRequiredComplete = (
  item: { required?: boolean; contextKey?: string | null },
  answer: FormAnswerState | null | undefined,
): boolean => {
  const status = answerStatus(answer)
  if (status === QuestionnaireFormAnswerStatus.ANSWERED) return hasValue(answer?.value)
  // Completion requires an explicit decision for every slot. Optional,
  // non-context fields may use SKIPPED; required and context fields may not.
  return status === QuestionnaireFormAnswerStatus.SKIPPED
    && item.required === false
    && !item.contextKey
}
