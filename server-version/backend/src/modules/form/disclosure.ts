import { renderDeclaredReport } from '../measurement-content/report-renderer'
import type { ReportTemplate } from '../measurement-content/report-template'
import { resolveAudienceDisclosure } from '../scale/policy/disclosure'
import { formReleaseProvenanceSchema } from './release'

export function governedFormRelease(provenance: Record<string, unknown> | undefined) {
  if (!provenance || !Object.prototype.hasOwnProperty.call(provenance, 'formRelease')) return undefined
  return formReleaseProvenanceSchema.parse(provenance.formRelease)
}

/** Legacy Form policies keep their already-frozen authority. New Form releases
 * may only expose raw answers to an audience explicitly allowed in C. */
export function governedFormRawAnswersAllowed(provenance: Record<string, unknown> | undefined, audience: string) {
  const release = governedFormRelease(provenance)
  return !release || resolveAudienceDisclosure(release.effectiveDisclosure, audience).rawAnswers
}

export function renderGovernedFormCompletion(template: ReportTemplate, provenance: Record<string, unknown> | undefined, audience: string) {
  const release = governedFormRelease(provenance)
  if (!release) return null
  const visibility = resolveAudienceDisclosure(release.effectiveDisclosure, audience)
  if (!visibility.educationalContent && !visibility.artwork) return null
  const safeTemplate = visibility.educationalContent ? template
    : { blocks: [], limitations: [], ...(template.artworkKey ? { artworkKey: template.artworkKey } : {}),
      ...(template.illustrationKey ? { illustrationKey: template.illustrationKey } : {}) }
  return renderDeclaredReport(safeTemplate, [], [], visibility)
}
