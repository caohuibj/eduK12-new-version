import { cognitivePresentations } from './generated/presentation'
import type { CognitiveParticipantPresentationV1 } from './participant-presentation.types'
export type { CognitiveParticipantPresentationV1 } from './participant-presentation.types'
type PresentationIdentity = { testType: string; engineVersion: string; scoringVersion: string; reportVersion?: string }
const keyOf = (v: PresentationIdentity) => `${v.testType}/${v.engineVersion}/${v.scoringVersion}`
const presentations = new Map<string, CognitiveParticipantPresentationV1>()
const reportVariants = new Map<string, CognitiveParticipantPresentationV1>()
for (const presentation of cognitivePresentations) {
  const key = keyOf(presentation)
  const reportVersion = presentation.reportReading?.version ?? presentation.presentationVersion
  const variantKey = `${key}/${reportVersion}`
  if (reportVariants.has(variantKey)) throw new Error(`COG_PRESENTATION_DUPLICATE: ${variantKey}`)
  reportVariants.set(variantKey, presentation)
  // No-version consumers and historical config aliases retain the original presentation.
  if (!presentations.has(key)) presentations.set(key, presentation)
}
export const resolveParticipantPresentation = (identity: PresentationIdentity): CognitiveParticipantPresentationV1 | undefined => {
  const key = keyOf(identity)
  if (identity.reportVersion) {
    const variant = reportVariants.get(`${key}/${identity.reportVersion}`)
    if (variant) return variant
    // R3 must be selected explicitly and must never silently resolve to an older R.
    if (identity.reportVersion === '3.0.0') return undefined
  }
  return presentations.get(key)
}
