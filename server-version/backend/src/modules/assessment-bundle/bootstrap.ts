import {
  BundleAnalysisEngineRegistry,
  createBundleAnalysisEngineRegistry,
} from './registry'
import {
  COGNITIVE_DOMAIN_ENGINE_KEY,
  COGNITIVE_DOMAIN_ENGINE_VERSION,
  runCognitiveDomainV1,
} from './engines/cognitive-domain-v1'

/**
 * Register product engines used by PUBLISHED/DRAFT Bundle definitions.
 * Tests and future finalizer wiring should prefer this over a bare registry.
 */
export const registerProductBundleEngines = (
  registry: BundleAnalysisEngineRegistry,
): BundleAnalysisEngineRegistry => {
  registry.register(
    COGNITIVE_DOMAIN_ENGINE_KEY,
    COGNITIVE_DOMAIN_ENGINE_VERSION,
    runCognitiveDomainV1,
  )
  return registry
}

export const createProductBundleAnalysisEngineRegistry = (): BundleAnalysisEngineRegistry => (
  registerProductBundleEngines(createBundleAnalysisEngineRegistry())
)
