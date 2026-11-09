import type { ApiResponse } from '../../types'
import type { WholeQuestionnaireDefinition } from './types'

/** The frozen attempt identity the inline payload must match before it may be
 * consumed. slotSetHash is intentionally absent: the attempt state does not
 * carry it, and slot-set drift is already fenced by the runner's draft meta
 * identity check (FinalDraftIdentityConflictError), which refuses to reuse a
 * sealed draft across different frozen slot sets. */
export type InlineWholeDefinitionIdentity = {
  attemptId: string
  attemptEpoch?: number
  contextSnapshotHash?: string | null
}

/** X-05A dual-track delivery: prefer the whole definition that arrived inline
 * with the START response, and fall back to the existing GET endpoint whenever
 * the inline payload is absent, stale (identity mismatch) or structurally
 * incomplete. The returned inline payload is consumed exactly once, so a later
 * reload always re-fetches from the authoritative endpoint. The runner keeps
 * its own second-layer validation on whatever this returns. */
export const wholeDefinitionWithInlineFallback = async (
  inline: WholeQuestionnaireDefinition | null | undefined,
  identity: InlineWholeDefinitionIdentity,
  fallback: () => Promise<ApiResponse<WholeQuestionnaireDefinition>>,
): Promise<ApiResponse<WholeQuestionnaireDefinition>> => {
  const identityMatches = Boolean(
    inline && inline.attemptId === identity.attemptId
      && (identity.attemptEpoch === undefined || inline.attemptEpoch === identity.attemptEpoch)
      && (identity.contextSnapshotHash === undefined
        || (inline.contextSnapshotHash ?? null) === (identity.contextSnapshotHash ?? null)),
  )
  const usable = Boolean(
    identityMatches
      && ((inline!.units?.length ?? 0) > 0 || (inline!.formSections?.length ?? 0) > 0),
  )
  if (usable) return { code: 0, data: inline!, message: 'OK' }
  return fallback()
}
