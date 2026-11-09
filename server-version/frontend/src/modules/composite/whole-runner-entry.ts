import type { CompositeAttemptState } from './types'

/** X-05A review fix: the whole runner mounts on the server's trusted
 * execution mode, not on whether the first unit happens to be a Scale.
 * Form-first linear questionnaires are equally WHOLE_LOCAL-eligible, and the
 * legacy heuristic (first unit is SCALE) is retained only as the fallback
 * discovery path for servers that do not send executionMode. The runner
 * itself still falls back to the stepped UI whenever whole delivery is
 * refused (409/STALE) or the definition fails its structural checks. */
export const shouldUseWholeRunner = (
  state: Pick<CompositeAttemptState, 'trainingFlow' | 'productKind' | 'currentItem' | 'executionMode'> | null,
  relationalMode: boolean,
): boolean => {
  if (!state) return false
  if (state.trainingFlow || relationalMode) return false
  if (state.productKind !== 'QUESTIONNAIRE') return false
  return state.executionMode === 'WHOLE_LOCAL' || state.currentItem?.type === 'SCALE'
}
