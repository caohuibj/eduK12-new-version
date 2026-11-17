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
 * without dynamic conditional branching, cognitive/situational interactive tasks,
 * or context (demographics) section dependencies. Context sections keep their
 * existing stepped submission semantics — their frozen context hash feeds
 * downstream admission and dynamic item projection, so a whole envelope must
 * not swallow them in the first whole-submission phase.
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
  const hasContextDependency = (candidate.formSections ?? []).some(section => {
    const typed = section as { contextSection?: unknown; items?: Array<{ contextKey?: unknown }> }
    return Boolean(typed?.contextSection) || (typed?.items ?? []).some(item => Boolean(item.contextKey))
  })
  if (hasContextDependency) {
    return false
  }
  return true
}

/** Client mode follows the same admission the submit path will enforce. */
export function wholeLocalExecutionMode(input: {
  shapeEligible: boolean
  admissionOpen: boolean
  units: Array<{ type: string; completed: boolean }>
}): 'WHOLE_LOCAL' | 'STEPPED' {
  const partialFinal = input.units.some(unit =>
    (unit.type === 'SCALE' || unit.type === 'FORM_SECTION') && unit.completed)
  return input.shapeEligible && input.admissionOpen && !partialFinal ? 'WHOLE_LOCAL' : 'STEPPED'
}
