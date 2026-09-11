/**
 * Scale Product Publication Policy.
 *
 * Product release answers one question only: can this exact Scale package run
 * the declared Huisurvey workflow? Rights, locale/deployment fit, respondent
 * applicability and scientific evidence remain valuable governance facts, but
 * they do not turn an otherwise executable product back into DRAFT.
 *
 * This module is a pure classifier: no runtime imports, no DB queries, and no
 * participant submit-path use.
 */
import type {
  ScaleCatalogManifestV1,
  ScientificMaturity,
} from './catalog-manifest'
import type { AssessmentReferenceSetDefinition } from '../../assessment-reference/reference'

/** Local-sample heuristic affects research-gap wording only. */
export const LOCAL_SAMPLE_SUFFICIENT_N = 300

export interface ScientificCompletenessSummary {
  scientificMaturity: ScientificMaturity
  evidenceCount: number
  hasLocalNorm: boolean
  hasValidatedNorm: boolean
  hasMeasurementInvariance: boolean
  hasTestRetest: boolean
  hasResponsiveness: boolean
  hasDeviceEquivalence: boolean
  hasCompleteCoreValidityMatrix: boolean
  hasSufficientLocalSample: boolean
}

const hasUsableEvidence = (
  manifest: ScaleCatalogManifestV1,
  evidenceType: ScaleCatalogManifestV1['evidence'][number]['evidenceType'],
): boolean => (
  manifest.evidence.some((record) => (
    record.evidenceType === evidenceType
    && (record.rating === 'SUFFICIENT' || record.rating === 'MIXED')
  ))
)

export const evaluateScientificCompleteness = (input: {
  manifest: ScaleCatalogManifestV1
  references: AssessmentReferenceSetDefinition[]
  deploymentTerritory: string
}): ScientificCompletenessSummary => {
  const { manifest, references, deploymentTerritory } = input
  const hasSufficientLocalSample = manifest.evidence.some((record) => (
    record.territory === deploymentTerritory
    && (record.sampleSize ?? 0) >= LOCAL_SAMPLE_SUFFICIENT_N
  ))
  return {
    scientificMaturity: manifest.scientificMaturity,
    evidenceCount: manifest.evidence.length,
    hasLocalNorm: manifest.referenceApplicability.some((record) => (
      record.referenceKind === 'normative_distribution' && record.territory === deploymentTerritory
    )),
    hasValidatedNorm: references.some((set) => (
      set.status === 'ACTIVE' && set.entries.some((entry) => entry.evidenceLevel === 'validated_norm')
    )),
    hasMeasurementInvariance: hasUsableEvidence(manifest, 'MEASUREMENT_INVARIANCE'),
    hasTestRetest: hasUsableEvidence(manifest, 'TEST_RETEST'),
    hasResponsiveness: hasUsableEvidence(manifest, 'RESPONSIVENESS'),
    hasDeviceEquivalence: false,
    hasCompleteCoreValidityMatrix: (['CONTENT_VALIDITY', 'STRUCTURAL_VALIDITY', 'INTERNAL_CONSISTENCY'] as const)
      .every((evidenceType) => hasUsableEvidence(manifest, evidenceType)),
    hasSufficientLocalSample,
  }
}

export type ResearchGapCode =
  | 'NO_LOCAL_NORM'
  | 'NO_VALIDATED_NORM'
  | 'NO_MEASUREMENT_INVARIANCE'
  | 'NO_DEVICE_EQUIVALENCE'
  | 'NO_TEST_RETEST'
  | 'NO_RESPONSIVENESS'
  | 'INCOMPLETE_CORE_VALIDITY_MATRIX'
  | 'LIMITED_LOCAL_SAMPLE'

export interface ResearchGap {
  code: ResearchGapCode
  message: string
}

export interface HardLayerResult {
  ok: boolean
  errors: string[]
}

export interface PilotPublicationPolicyInput {
  executableCorrectness: HardLayerResult
  /** Governance/deployment diagnostics only; not Product Release blockers. */
  rights: HardLayerResult
  localization: HardLayerResult
  respondentMatch: HardLayerResult
  scientific: ScientificCompletenessSummary
}

export interface PilotPublicationDecision {
  /** Product Release depends only on executable correctness. */
  publishable: boolean
  /** Product-readiness blockers only. */
  errors: string[]
  /** Non-product governance/deployment/scientific diagnostics. */
  warnings: string[]
  limitations: string[]
  researchGaps: ResearchGap[]
}

const RESEARCH_GAP_DEFINITIONS: Array<{ code: ResearchGapCode; missing: (summary: ScientificCompletenessSummary) => boolean; message: string }> = [
  { code: 'NO_LOCAL_NORM', missing: (s) => !s.hasLocalNorm, message: '尚无本地 norm：PILOT 下允许，作为 research gap 记录' },
  { code: 'NO_VALIDATED_NORM', missing: (s) => !s.hasValidatedNorm, message: '尚无 validated norm：PILOT 下允许，作为 research gap 记录' },
  { code: 'NO_MEASUREMENT_INVARIANCE', missing: (s) => !s.hasMeasurementInvariance, message: '尚无测量不变性证据：跨组比较不受支持，作为 research gap 记录' },
  { code: 'NO_DEVICE_EQUIVALENCE', missing: (s) => !s.hasDeviceEquivalence, message: '尚无设备/施测方式等价性证据：维度保留，采集在后续研究中' },
  { code: 'NO_TEST_RETEST', missing: (s) => !s.hasTestRetest, message: '尚无正式重测信度研究：作为 research gap 记录' },
  { code: 'NO_RESPONSIVENESS', missing: (s) => !s.hasResponsiveness, message: '尚无 responsiveness 证据：进展监测适用性未建立，作为 research gap 记录' },
  { code: 'INCOMPLETE_CORE_VALIDITY_MATRIX', missing: (s) => !s.hasCompleteCoreValidityMatrix, message: '核心效度矩阵（内容/结构/内部一致性）不完整：作为 research gap 记录' },
  { code: 'LIMITED_LOCAL_SAMPLE', missing: (s) => !s.hasSufficientLocalSample, message: '本地样本量有限：作为 research gap 记录' },
]

const collectResearchGaps = (summary: ScientificCompletenessSummary): ResearchGap[] => (
  RESEARCH_GAP_DEFINITIONS
    .filter((definition) => definition.missing(summary))
    .map(({ code, message }) => ({ code, message }))
)

const governanceWarnings = (input: PilotPublicationPolicyInput): string[] => [
  ...input.rights.errors.map((message) => `[rights/governance] ${message}`),
  ...input.localization.errors.map((message) => `[localization/deployment] ${message}`),
  ...input.respondentMatch.errors.map((message) => `[respondent/deployment] ${message}`),
]

export const evaluatePilotPublicationPolicy = (input: PilotPublicationPolicyInput): PilotPublicationDecision => {
  const errors = input.executableCorrectness.errors.map((message) => `[executableCorrectness] ${message}`)
  const publishable = input.executableCorrectness.ok && errors.length === 0

  const researchGaps = collectResearchGaps(input.scientific)
  const limitations: string[] = []
  const warnings: string[] = governanceWarnings(input)
  if (input.scientific.scientificMaturity === 'PILOT') {
    limitations.push('scientificMaturity=PILOT：本工具可作为完整产品运行；科研证据成熟度单独治理。')
    warnings.push('PILOT maturity：报告解释必须遵守当前 reference/applicability 边界，不得暗示正式常模。')
  }
  if (input.scientific.evidenceCount === 0) {
    limitations.push('Evidence Matrix 当前为空：按 research backlog 管理，不是 Product Release blocker。')
  }

  return { publishable, errors, warnings, limitations, researchGaps }
}
