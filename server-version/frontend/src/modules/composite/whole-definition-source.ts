import type { ApiResponse } from '../../types'
import type { WholeQuestionnaireDefinition } from './types'

/** X-05A dual-track delivery: prefer the whole definition that arrived inline
 * with the START response, and fall back to the existing GET endpoint whenever
 * the inline payload is absent, stale (different attempt) or structurally
 * incomplete. The returned inline payload is consumed exactly once, so a later
 * reload always re-fetches from the authoritative endpoint. */
export const wholeDefinitionWithInlineFallback = async (
  inline: WholeQuestionnaireDefinition | null | undefined,
  attemptId: string,
  fallback: () => Promise<ApiResponse<WholeQuestionnaireDefinition>>,
): Promise<ApiResponse<WholeQuestionnaireDefinition>> => {
  const usable = Boolean(
    inline && inline.attemptId === attemptId
      && ((inline.units?.length ?? 0) > 0 || (inline.formSections?.length ?? 0) > 0),
  )
  if (usable) return { code: 0, data: inline!, message: 'OK' }
  return fallback()
}
