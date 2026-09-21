import type { AssessmentContextKey } from '../../assessment-context/context'
import type { InstrumentApplicabilityV1 } from './types'

/** Only policy-required participant facts are collected, before any items. */
export const requiredScaleContextKeys = (policy: InstrumentApplicabilityV1): AssessmentContextKey[] => {
  const keys = new Set(policy.requiredContextKeys)
  if (policy.subject?.ageMonths) keys.add('birthYearMonth')
  if (policy.subject?.grades?.length) keys.add('gradeLevel')
  return [...keys].sort()
}

export const assertScaleContextCollectable = (input: {
  policy: InstrumentApplicabilityV1
  scalePosition: number
  sections: Array<{ position?: number; contextSection?: boolean; items: Array<{ contextKey?: string | null; required?: boolean }> }>
}): void => {
  const required = requiredScaleContextKeys(input.policy)
  if (!required.length) return
  const available = new Set(input.sections
    .filter(section => section.contextSection && (section.position ?? Infinity) < input.scalePosition)
    .flatMap(section => section.items.filter(item => item.required).map(item => item.contextKey)))
  const missing = required.filter(key => !available.has(key))
  if (missing.length) throw new Error(`SCALE_CONTEXT_CONFIGURATION_MISSING:${missing.join(',')}`)
}
