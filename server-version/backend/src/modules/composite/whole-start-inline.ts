import { logger } from '../../utils/logger'

export type StartPayloadWithAttempt = { attempt?: { id?: string; executionMode?: string } }
type WholeDefinition = Awaited<ReturnType<typeof import('./whole-questionnaire.service').getWholeQuestionnaireDefinition>>

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
): Promise<T | (T & { wholeDefinition: WholeDefinition })> => {
  if ((data as T & { wholeDefinition?: WholeDefinition }).wholeDefinition) return data
  const attemptId = data?.attempt?.id
  if (!wantsWholeDelivery || !attemptId || data.attempt?.executionMode !== 'WHOLE_LOCAL') return data
  try {
    const { getWholeQuestionnaireDefinition } = await import('./whole-questionnaire.service')
    const wholeDefinition = await getWholeQuestionnaireDefinition(attemptId, principal, preloadedParent)
    return { ...data, wholeDefinition }
  } catch (error) {
    logger.info('whole definition inline delivery', { phase: 'inline_delivery', outcome: 'fallback',
      reason: error instanceof Error ? error.message : 'PROJECTION_ERROR', attemptId })
    return data
  }
}
