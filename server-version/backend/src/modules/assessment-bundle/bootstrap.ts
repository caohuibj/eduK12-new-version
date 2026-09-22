import { runDeclarativeEvidence } from './onboarding/engine'
import {
  BundleAnalysisEngineRegistry,
  createBundleAnalysisEngineRegistry,
} from './registry'
import {
  COGNITIVE_DOMAIN_ENGINE_KEY,
  COGNITIVE_DOMAIN_ENGINE_VERSION,
  runCognitiveDomainV1,
} from './engines/cognitive-domain-v1'
import {
  SCALE_EVIDENCE_ENGINE_KEY,
  SCALE_EVIDENCE_ENGINE_VERSION,
  runScaleEvidenceV1,
} from './engines/scale-evidence-v1'
import {
  MENTAL_HEALTH_RULE_ENGINE_KEY,
  MENTAL_HEALTH_RULE_ENGINE_VERSION,
  runMentalHealthRuleV1,
} from './engines/mental-health-rule-v1'
import {
  INTEGRATED_EVIDENCE_ENGINE_KEY,
  INTEGRATED_EVIDENCE_ENGINE_VERSION,
  runIntegratedEvidenceV1,
} from './engines/integrated-evidence-v1'

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
  registry.register(
    SCALE_EVIDENCE_ENGINE_KEY,
    SCALE_EVIDENCE_ENGINE_VERSION,
    runScaleEvidenceV1,
  )
  registry.register(
    MENTAL_HEALTH_RULE_ENGINE_KEY,
    MENTAL_HEALTH_RULE_ENGINE_VERSION,
    runMentalHealthRuleV1,
  )
  registry.register(
    INTEGRATED_EVIDENCE_ENGINE_KEY,
    INTEGRATED_EVIDENCE_ENGINE_VERSION,
    runIntegratedEvidenceV1,
  )
  registry.register('declarative-evidence-v1', '1.0.0', runDeclarativeEvidence)
  return registry
}

export const createProductBundleAnalysisEngineRegistry = (): BundleAnalysisEngineRegistry => (
  registerProductBundleEngines(createBundleAnalysisEngineRegistry())
)
