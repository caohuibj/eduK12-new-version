import { canonicalHash } from '../../assessment-runtime/canonical'
import { hashScaleDefinition } from '../scale-definition'
import { getScaleInstrumentSource } from './instrument-registry'
import type { ScaleInstrumentSourceV1 } from './types'

/** A repository source declaration is distinct from a third-party license grant.
 * Never call this pure projection on request data to establish permission. The
 * enforcement helper below resolves the identity from the compiled registry. */
export function selfAuthoredSourceProof(source: ScaleInstrumentSourceV1): string | null {
  if (!source.executable || source.executable.definition.license.status !== 'self_authored'
    || source.executable.definition.license.redistribution !== 'allowed') return null
  return canonicalHash({ identity: source.identity, catalogManifestVersion: source.catalog.catalogManifestVersion,
    authorship: source.authorship ?? null, source: source.executable.definition.source,
    license: source.executable.definition.license, measurementHash: hashScaleDefinition(source.executable.definition) })
}

export function registeredSelfAuthoredSourceProof(instrumentKey: string, instrumentVersion: string): string | null {
  const source = getScaleInstrumentSource(instrumentKey, instrumentVersion)
  return source ? selfAuthoredSourceProof(source) : null
}

/** The deployment territory also identifies scientific applicability. Authorship
 * removes external license checks, not the scope of the reviewed evidence. */
export function registeredSelfAuthoredDeploymentTerritory(instrumentKey: string, instrumentVersion: string): string | null {
  const source = getScaleInstrumentSource(instrumentKey, instrumentVersion)
  if (!source || !selfAuthoredSourceProof(source)) return null
  return source.scientificReview?.territory ?? 'ZZ'
}
