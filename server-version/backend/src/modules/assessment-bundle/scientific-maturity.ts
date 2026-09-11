import {
  DEFAULT_SCIENTIFIC_MATURITY,
  isScientificMaturity,
  type ResearchPlanV1,
  type ScientificMaturity,
} from '../assessment-governance/scientific-maturity'
import type { AssessmentBundleDefinitionV1 } from './types'

/**
 * Governance-only metadata for an exact Bundle identity.
 *
 * Deliberately NOT part of AssessmentBundleDefinitionV1 or its frozen runtime
 * snapshot: a PILOT -> RESEARCH_READY upgrade must not change bundle execution,
 * definition hashes, scoring/aggregation, reports or historical attempts.
 */
export interface BundleScientificMaturityManifestV1 {
  schemaVersion: 1
  bundleKey: string
  bundleVersion: string
  scientificMaturity: ScientificMaturity
  researchPlan: ResearchPlanV1
  evidenceRefs: string[]
  reviewedAt: string | null
}

export const bundleScientificMaturityIdentity = (bundleKey: string, bundleVersion: string): string => (
  `${bundleKey}@${bundleVersion}`
)

export const validateBundleScientificMaturityManifest = (
  manifest: BundleScientificMaturityManifestV1,
): BundleScientificMaturityManifestV1 => {
  if (manifest.schemaVersion !== 1) throw new Error('bundle scientific maturity manifest schemaVersion must be 1')
  if (!manifest.bundleKey.trim()) throw new Error('bundleKey is required')
  if (!manifest.bundleVersion.trim()) throw new Error('bundleVersion is required')
  if (!isScientificMaturity(manifest.scientificMaturity)) throw new Error('invalid bundle scientific maturity')
  return manifest
}

export const createBundleScientificMaturityRegistry = (
  manifests: readonly BundleScientificMaturityManifestV1[],
): ReadonlyMap<string, BundleScientificMaturityManifestV1> => {
  const registry = new Map<string, BundleScientificMaturityManifestV1>()
  for (const candidate of manifests) {
    const manifest = validateBundleScientificMaturityManifest(candidate)
    const identity = bundleScientificMaturityIdentity(manifest.bundleKey, manifest.bundleVersion)
    if (registry.has(identity)) throw new Error(`duplicate bundle scientific maturity identity: ${identity}`)
    registry.set(identity, manifest)
  }
  return registry
}

/**
 * Absence of an explicit reviewed governance record is intentionally PILOT.
 * This keeps publication permissive while making maturity upgrades explicit.
 */
export const resolveBundleScientificMaturity = (
  definition: Pick<AssessmentBundleDefinitionV1, 'bundleKey' | 'bundleVersion'>,
  registry: ReadonlyMap<string, BundleScientificMaturityManifestV1>,
): ScientificMaturity => (
  registry.get(bundleScientificMaturityIdentity(definition.bundleKey, definition.bundleVersion))?.scientificMaturity
  ?? DEFAULT_SCIENTIFIC_MATURITY
)
