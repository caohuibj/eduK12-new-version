import { buildAssessmentContext, hashAssessmentContext, type ContextFormItem } from '../assessment-context'
import { encryptAssessmentContext } from '../assessment-context/security'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'

/** Validation uses normalized answers; storedValue may already be encrypted. */
export const contextForNormalizedFormEntries = (
  entries: Array<{ item: { id: string; contextKey: string | null }; normalizedValue: string | string[] | null; storedValue?: string | null }>,
  items: ContextFormItem[],
): { encrypted: string; hash: string } => {
  const answers = entries.filter(entry => entry.item.contextKey && entry.normalizedValue !== null).map(entry => {
    if (typeof entry.normalizedValue !== 'string') {
      throw new InstrumentFinalSubmitError('FORM_ANSWER_INVALID', '人口学字段必须是单个选项或出生年月', 400)
    }
    return { formItemId: entry.item.id, value: entry.normalizedValue }
  })
  let context: ReturnType<typeof buildAssessmentContext>
  try {
    context = buildAssessmentContext({ items, answers })
  } catch (error) {
    throw new InstrumentFinalSubmitError('FORM_ANSWER_INVALID', error instanceof Error ? error.message : '人口学上下文无效', 400)
  }
  // Infrastructure/encryption failures must remain server errors.
  return { encrypted: encryptAssessmentContext(context), hash: hashAssessmentContext(context) }
}
