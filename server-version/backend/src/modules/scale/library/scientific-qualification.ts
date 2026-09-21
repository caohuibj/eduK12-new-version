import { evaluateScientificQualification, type ScientificQualificationDecisionV1 } from '../../assessment-governance/scientific-qualification'
import type { ScalePackageV2 } from '../scale-package.registry'
import { evaluateScaleProductReadiness } from './product-readiness'
import { getScaleInstrumentSource, getScaleInstrumentLocalization } from '../onboarding/instrument-registry'
import { materializeCatalogManifest } from '../onboarding/validate-instrument'

const hasText = (value: string | undefined): boolean => Boolean(value?.trim())

/**
 * Scale already owns structured scientific/catalog provenance. Reuse that
 * source instead of copying Scale evidence pointers into the generic evidence
 * registry. This evaluator is read-only governance and never participates in
 * participant runtime or FINAL paths.
 */
export const evaluateScaleScientificQualification = (
  pkg: ScalePackageV2,
): ScientificQualificationDecisionV1 => {
  const source = getScaleInstrumentSource(pkg.key, pkg.instrumentVersion)
  const manifest = source ? materializeCatalogManifest(source) : undefined
  const localization = getScaleInstrumentLocalization(pkg.key, pkg.instrumentVersion)

  const hasResearchFoundation = hasText(pkg.definition.source.citation)
    || hasText(pkg.definition.source.title)
    || (manifest?.evidence.length ?? 0) > 0
  const hasTraceableProvenance = Boolean(
    manifest
    && localization
    && localization.reviewStatus === 'APPROVED',
  )
  const hasEmpiricalReference = pkg.references.some((reference) => (
    reference.status === 'ACTIVE' && reference.entries.length > 0
  )) || (manifest?.referenceApplicability.length ?? 0) > 0
  const hasFormalResearchOutput = manifest?.evidence.some((record) => (
    record.rating === 'SUFFICIENT' && hasText(record.citation)
  )) ?? false

  return evaluateScientificQualification({
    productReadiness: evaluateScaleProductReadiness(pkg),
    hasResearchFoundation,
    hasTraceableProvenance,
    hasEmpiricalReference,
    hasFormalResearchOutput,
  })
}
