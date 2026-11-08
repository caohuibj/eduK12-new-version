export interface WholeLocalEligibilityCandidate {
  items?: Array<{ type: string; position?: number }>
  formSections?: Array<unknown>
  trainingFlowDraft?: unknown
  trainingFlowFrozen?: unknown
  trainingFlowDigest?: string | null
  trainingFlowSnapshotHash?: string | null
}

/**
 * Evaluates whether a composite assessment is eligible for Scheme X Local-First execution.
 * Eligible: Pure linear questionnaires composed exclusively of SCALE and FORM units,
 * without dynamic conditional branching or cognitive/situational interactive tasks.
 */
export function isWholeLocalEligible(candidate?: WholeLocalEligibilityCandidate | null): boolean {
  if (!candidate) return false
  if (
    candidate.trainingFlowDraft != null ||
    candidate.trainingFlowFrozen != null ||
    candidate.trainingFlowDigest != null ||
    candidate.trainingFlowSnapshotHash != null
  ) {
    return false
  }
  if (!candidate.items || candidate.items.length === 0) {
    return false
  }
  const hasOnlyLinearItems = candidate.items.every(
    item => item.type === 'SCALE' || item.type === 'FORM'
  )
  if (!hasOnlyLinearItems) {
    return false
  }
  const hasInteractiveOrTimed = candidate.items.some(
    item => item.type === 'COGNITIVE' || item.type === 'SITUATIONAL'
  )
  if (hasInteractiveOrTimed) {
    return false
  }
  return true
}
