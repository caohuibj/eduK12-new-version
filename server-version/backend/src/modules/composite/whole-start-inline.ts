import { logger } from '../../utils/logger'
import { traceAssessmentPhase, withQueryRawLabel } from '../../services/runtimeObservability'

export type StartPayloadWithAttempt = { attempt?: { id?: string; executionMode?: string } }
type WholeDefinition = Awaited<ReturnType<typeof import('./whole-questionnaire.service').getWholeQuestionnaireDefinition>>
type WholeBinding = import('./whole-questionnaire.service').WholeQuestionnaireBindingDto

/** X-05A: deliver the whole questionnaire definition inline with the START
 * response when the client asks for it (delivery=whole) and the started
 * attempt runs in WHOLE_LOCAL mode. The definition entrypoint owns the
 * validation-manifest persistence — a required whole-submit precondition — so
 * inlining reuses that exact call instead of re-projecting the definition.
 * Any failure falls back to the plain START payload; the client then fetches
 * through the existing GET endpoint (dual-track self-healing). Repeated START
 * returns the same IN_PROGRESS attempt and the same definition, without
 * consuming another attempt slot. */
export const startResponseWithInlineWholeDefinition = async <T extends StartPayloadWithAttempt>(
  wantsWholeDelivery: boolean,
  data: T,
  principal: { userId?: string; recoveryTokenHash?: string },
  preloadedParent?: { id: string } | null,
  knownTemplateHashes?: ReadonlySet<string>,
): Promise<T | (T & { wholeDefinition: WholeDefinition }) | (T & { wholeBinding: WholeBinding })> => {
  if ((data as T & { wholeDefinition?: WholeDefinition; wholeBinding?: WholeBinding }).wholeDefinition
    || (data as T & { wholeBinding?: WholeBinding }).wholeBinding) {
    return data
  }
  const attemptId = data?.attempt?.id
  if (!wantsWholeDelivery || !attemptId || data.attempt?.executionMode !== 'WHOLE_LOCAL') return data
  try {
    if (knownTemplateHashes && knownTemplateHashes.size > 0) {
      const { getWholeQuestionnaireDelivery } = await import('./whole-questionnaire.service')
      const delivered = await traceAssessmentPhase('start.inline_whole_definition',
        () => withQueryRawLabel('start.raw.inline_definition', () => getWholeQuestionnaireDelivery(attemptId, principal, {
          preloaded: preloadedParent,
          knownTemplateHashes,
        })))
      return delivered.mode === 'binding'
        ? { ...data, wholeBinding: delivered.binding }
        : { ...data, wholeDefinition: delivered.definition }
    }
    const { getWholeQuestionnaireDefinition } = await import('./whole-questionnaire.service')
    const wholeDefinition = await traceAssessmentPhase('start.inline_whole_definition',
      () => withQueryRawLabel('start.raw.inline_definition', () => getWholeQuestionnaireDefinition(attemptId, principal, preloadedParent)))
    return { ...data, wholeDefinition }
  } catch (error) {
    logger.info('whole definition inline delivery', { phase: 'inline_delivery', outcome: 'fallback',
      reason: error instanceof Error ? error.message : 'PROJECTION_ERROR', attemptId })
    return data
  }
}
