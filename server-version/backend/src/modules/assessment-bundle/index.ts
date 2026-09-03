export { BundleContractError, bundleContractFail } from './errors'
export {
  ASSESSMENT_BUNDLE_DEFINITION_SCHEMA,
  ASSESSMENT_BUNDLE_SNAPSHOT_FAMILY,
  ASSESSMENT_BUNDLE_SNAPSHOT_VERSION,
  BUNDLE_CONTEXT_FACTS_SCHEMA_VERSION,
  BUNDLE_ENGINE_KEYS,
  BUNDLE_REPORT_FACTS_SCHEMA_VERSION,
  BUNDLE_SNAPSHOT_HASH_SCHEME,
} from './types'
export type {
  AssessmentBundleDefinitionV1,
  AssessmentBundleStatusV1,
  BundleCategoryV1,
  BundleContextFactV1,
  BundleContextFactsV1,
  BundleEngineKeyV1,
  BundleEngineRefV1,
  BundleInitiationModeV1,
  BundlePopulationConstraintV1,
  BundlePublicationRequirementsV1,
  BundleReportFactsV1,
  BundleRespondentTypeV1,
  BundleRightsRequirementsV1,
  BundleSafetyCapabilityV1,
  BundleSlotDefinitionV1,
  BundleSlotUnitTypeV1,
  BundleSubjectPopulationV1,
  ConstructKey,
  EvidenceItemV1,
  EvidenceQualityStateV1,
  EvidenceRoleV1,
  EvidenceSourceV1,
  FactPresenceV1,
  FrozenAssessmentBundleSnapshotV3,
  FrozenBundleSlotBindingV3,
  FrozenRuntimeSnapshotFamily,
  LegacyUnavailableFieldsV1,
  MentalHealthRuleBindingV1,
  MentalHealthRuleTierV1,
} from './types'
export {
  assessmentBundleResourceId,
  cloneAssessmentBundleDefinition,
  hashAssessmentBundleDefinition,
  isBundleEngineKey,
  parseAssessmentBundleDefinition,
  validateAssessmentBundleCatalog,
  validateAssessmentBundleDefinition,
} from './definition'
export {
  buildBundleContextFacts,
  buildBundleReportFacts,
  contextFactToEvidenceSource,
  deriveEvidenceSourceHashes,
  hashBundleContextFacts,
  hashBundleReportFacts,
  validateBundleContextFacts,
  validateBundleReportFacts,
  validateEvidenceItem,
  validateEvidenceSource,
} from './evidence'
export {
  buildFrozenAssessmentBundleSnapshot,
  decryptFrozenAssessmentBundleSnapshot,
  encryptFrozenAssessmentBundleSnapshot,
  hashFrozenAssessmentBundleSnapshot,
  parseFrozenAssessmentBundleSnapshot,
  validateFrozenAssessmentBundleSnapshot,
} from './snapshot'
export {
  classifyDecryptedRuntimeSnapshot,
  parseFrozenRuntimeSnapshot,
} from './compatibility'
export type { FrozenRuntimeSnapshotRead } from './compatibility'
export { compileBundleRuntimeFromFrozenRead } from './compile'

export {
  BundleAnalysisEngineRegistry,
  createBundleAnalysisEngineRegistry,
} from './registry'
export type {
  BundleAnalysisEngineV1,
  BundleEngineInputV1,
  BundleEngineResultV1,
} from './registry'

export type {
  BundleFrozenCognitiveSourceV1,
  BundleFrozenScaleScoreV1,
  BundleFrozenScaleSourceV1,
  BundleFrozenSourceQualityV1,
} from './sources'
export {
  COGNITIVE_DOMAIN_ENGINE_KEY,
  COGNITIVE_DOMAIN_ENGINE_VERSION,
  COGNITIVE_DOMAIN_PAYLOAD_SCHEMA,
  runCognitiveDomainV1,
} from './engines/cognitive-domain-v1'
export type {
  CognitiveDomainFacetObservationV1,
  CognitiveDomainPayloadV1,
  CognitiveDomainSlotAssessmentV1,
  CognitiveDomainStatusV1,
} from './engines/cognitive-domain-v1'
export { COGNITIVE_RESPONSE_INHIBITION_V1 } from './bundles/cognitive-response-inhibition-v1'
export {
  createProductBundleAnalysisEngineRegistry,
  registerProductBundleEngines,
} from './bootstrap'

export {
  SCALE_EVIDENCE_ENGINE_KEY,
  SCALE_EVIDENCE_ENGINE_VERSION,
  SCALE_EVIDENCE_PAYLOAD_SCHEMA,
  projectScaleEvidenceItems,
  runScaleEvidenceV1,
  selectScaleScores,
} from './engines/scale-evidence-v1'
export type {
  ScaleEvidencePayloadV1,
  ScaleEvidenceScoreObservationV1,
} from './engines/scale-evidence-v1'
export { WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1 } from './bundles/wellbeing-who5-youth-self-zh-cn-v1'
