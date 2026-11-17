import { logger } from '../../utils/logger'
import { traceAssessmentPhase, withQueryRawLabel } from '../../services/runtimeObservability'

export const parseKnownTemplateHashes = (req: {
  headers?: Record<string, string | string[] | undefined>
  query?: Record<string, unknown>
}): ReadonlySet<string> | undefined => {
  const rawHeader = req.headers?.['x-whole-template-hash']
  const rawQuery = req.query?.knownTemplateHash
  const parts: string[] = []
  for (const source of [rawHeader, rawQuery]) {
    if (typeof source === 'string') {
      for (const token of source.split(',')) {
        const trimmed = token.trim().toLowerCase()
        if (/^[a-f0-9]{64}$/.test(trimmed)) parts.push(trimmed)
      }
    } else if (Array.isArray(source)) {
      for (const item of source) {
        if (typeof item !== 'string') continue
        for (const token of item.split(',')) {
          const trimmed = token.trim().toLowerCase()
          if (/^[a-f0-9]{64}$/.test(trimmed)) parts.push(trimmed)
        }
      }
    }
    if (parts.length >= 8) break
  }
  return parts.length > 0 ? new Set(parts.slice(0, 8)) : undefined
}

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

/** Shared additive inline whole delivery for authenticated School and Teacher
 * START endpoints. Only runs when the already-projected attempt uses
 * WHOLE_LOCAL, preserving STEPPED/child-unit payloads unchanged. */
export const attachEducationInlineWhole = async (input: {
  currentUnit: { id?: string; executionMode?: string }
  userId: string
  freshlyCreated: boolean
  preloadedParent?: { id: string } | null
  knownTemplateHashes?: ReadonlySet<string>
}): Promise<{
  freshlyCreated: boolean
  wholeDefinition?: WholeDefinition
  wholeBinding?: WholeBinding
} | null> => {
  if (input.currentUnit.executionMode !== 'WHOLE_LOCAL') return null
  const inlined = await startResponseWithInlineWholeDefinition(
    true,
    { attempt: input.currentUnit },
    { userId: input.userId },
    input.preloadedParent,
    input.knownTemplateHashes,
  )
  return {
    freshlyCreated: input.freshlyCreated,
    ...('wholeDefinition' in inlined && inlined.wholeDefinition ? { wholeDefinition: inlined.wholeDefinition } : {}),
    ...('wholeBinding' in inlined && inlined.wholeBinding ? { wholeBinding: inlined.wholeBinding } : {}),
  }
}
