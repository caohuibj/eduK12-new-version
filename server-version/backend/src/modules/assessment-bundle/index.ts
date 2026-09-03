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
  BundleReportAudienceV1,
  BundleReportEnginePayloadV1,
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
  BundleRuleSetRefV1,
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
  assertContextDefinitionHashMatchesSnapshot,
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
  assertUniqueCognitiveSources,
  assertUniqueScaleSources,
  assertUniqueValueSelectors,
  projectBundleCognitiveSource,
  projectBundleScaleSource,
  validateBundleEngineSourceSet,
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

export {
  MENTAL_HEALTH_FEEDBACK_VERSION,
  MENTAL_HEALTH_RULE_ENGINE_KEY,
  MENTAL_HEALTH_RULE_ENGINE_VERSION,
  MENTAL_HEALTH_RULE_PAYLOAD_SCHEMA,
  hashMentalHealthRuleSet,
  rollupEvidenceQuality,
  runMentalHealthRuleV1,
  validateMentalHealthRuleSet,
} from './engines/mental-health-rule-v1'
export type {
  MentalHealthActionTierV1,
  MentalHealthCoreRuleV1,
  MentalHealthDetailRuleV1,
  MentalHealthFeedbackBlockV1,
  MentalHealthOutcomeCodeV1,
  MentalHealthRulePayloadV1,
  MentalHealthRuleSetV1,
  MentalHealthSafetyRuleV1,
} from './engines/mental-health-rule-v1'

export {
  BUNDLE_CONTEXT_DEFINITION_SCHEMA,
  buildBundleContextFactsFromValues,
  contextSnapshotHashIgnoresFrozenAt,
  decryptBundleContextFacts,
  encryptBundleContextFacts,
  freezeBundleContext,
  hashBundleContextDefinition,
  normalizeBundleContextValues,
  parseBundleContextDefinition,
  validateBundleContextDefinition,
} from './context'
export type {
  BundleContextDefinitionV1,
  BundleContextFieldDefinitionV1,
  BundleContextFreezeStateV1,
  BundleContextValueTypeV1,
} from './context'

export {
  exportHistoricalBundleSnapshot,
  projectAllBundleAudienceViews,
  projectBundleAudienceView,
  projectBundleReportFacts,
  projectCognitiveEvidenceItems,
  renderBundleReportHtml,
  renderBundleReportMarkdown,
} from './report-facts'
export type {
  BundleAudienceProjectionV1,
  BundleHistoricalSnapshotExportV1,
} from './report-facts'

export {
  SDQ_PARENT_OBSERVER_ZH_CN_V1,
  SDQ_TEACHER_OBSERVER_ZH_CN_V1,
  TEXI_PARENT_OBSERVER_ZH_CN_V1,
  TEXI_TEACHER_OBSERVER_ZH_CN_V1,
} from './bundles/sdq-texi-observer-stubs'

export {
  INTEGRATED_ADULT_MIN_AGE_YEARS,
  INTEGRATED_EVIDENCE_ENGINE_KEY,
  INTEGRATED_EVIDENCE_ENGINE_VERSION,
  INTEGRATED_EVIDENCE_PAYLOAD_SCHEMA,
  assertEvidenceRolesSafeForIntegrated,
  assertIntegratedAdultAge,
  projectIntegratedEvidenceItems,
  runIntegratedEvidenceV1,
} from './engines/integrated-evidence-v1'
export type {
  IntegratedEvidencePayloadV1,
  IntegratedEvidenceStatusV1,
  IntegratedMethodObservationV1,
} from './engines/integrated-evidence-v1'
export { INTEGRATED_GONOGO_ADEXI_ADULT_ZH_CN_V1 } from './bundles/integrated-gonogo-adexi-adult-zh-cn-v1'
