/**
 * Pilot-first Publication Policy（SL2-C3）。
 *
 * 核心裁定：PUBLISHED + PILOT 是完整、正式、可上线的正常产品状态。
 * 只有「缺失直接意味着当前产品输出不成立或具有误导性」的问题才构成 hard
 * blocker（可执行正确性 / rights / 本地化不可用 / 作答者不匹配）；
 * 科学证据不完整（无常模、无 invariance、无 device 等价性、Evidence Matrix
 * 不完整……）一律进入 researchGaps / limitations / warnings，永不阻止发布。
 *
 * 本模块是纯分类器：输入各 hard 层的判定结果与科学完备性摘要，输出统一
 * decision；不导入 runtime，不查询 DB，不在 submit 路径出现。
 * 真正的组合接线（validateScalePackage + evaluateDurableInstrumentRights +
 * content locale + LocalizationManifestV1）在 pilot-publication-gate.ts（SL2-C6）。
 */
import type {
  ScaleCatalogManifestV1,
  ScientificMaturity,
} from './catalog-manifest'
import type { AssessmentReferenceSetDefinition } from '../../assessment-reference/reference'

/** 本地样本量的启发式阈值：只影响 gap 措辞，永不影响 publishable。 */
export const LOCAL_SAMPLE_SUFFICIENT_N = 300

export interface ScientificCompletenessSummary {
  scientificMaturity: ScientificMaturity
  evidenceCount: number
  hasLocalNorm: boolean
  hasValidatedNorm: boolean
  hasMeasurementInvariance: boolean
  hasTestRetest: boolean
  hasResponsiveness: boolean
  /** SL2 仅保留维度（§24）；device/admin-mode 证据采集属于 PR-SL3。 */
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
  const localSampleN = manifest.evidence
    .filter((record) => record.territory === deploymentTerritory)
    .reduce((sum, record) => sum + (record.sampleSize ?? 0), 0)
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
    hasSufficientLocalSample: localSampleN >= LOCAL_SAMPLE_SUFFICIENT_N,
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
  rights: HardLayerResult
  localization: HardLayerResult
  respondentMatch: HardLayerResult
  scientific: ScientificCompletenessSummary
}

export interface PilotPublicationDecision {
  /** 没有 hard 层 error 即可发布；科学证据不完整不影响本字段。 */
  publishable: boolean
  errors: string[]
  warnings: string[]
  limitations: string[]
  researchGaps: ResearchGap[]
}

const RESEARCH_GAP_DEFINITIONS: Array<{ code: ResearchGapCode; missing: (summary: ScientificCompletenessSummary) => boolean; message: string }> = [
  { code: 'NO_LOCAL_NORM', missing: (s) => !s.hasLocalNorm, message: '尚无本地 norm：PILOT 下允许，作为 research gap 记录' },
  { code: 'NO_VALIDATED_NORM', missing: (s) => !s.hasValidatedNorm, message: '尚无 validated norm：PILOT 下允许，作为 research gap 记录' },
  { code: 'NO_MEASUREMENT_INVARIANCE', missing: (s) => !s.hasMeasurementInvariance, message: '尚无测量不变性证据：跨组比较不受支持，作为 research gap 记录' },
  { code: 'NO_DEVICE_EQUIVALENCE', missing: (s) => !s.hasDeviceEquivalence, message: '尚无设备/施测方式等价性证据：维度保留，采集在 SL3' },
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

/**
 * 纯分类器：hard 层 fail-closed；科学层永不 block（§13/§14）。
 */
export const evaluatePilotPublicationPolicy = (input: PilotPublicationPolicyInput): PilotPublicationDecision => {
  const hardLayers = [
    ['executableCorrectness', input.executableCorrectness],
    ['rights', input.rights],
    ['localization', input.localization],
    ['respondentMatch', input.respondentMatch],
  ] as const
  const errors = hardLayers.flatMap(([layer, result]) => result.errors.map((error) => `[${layer}] ${error}`))
  const publishable = errors.length === 0

  const researchGaps = collectResearchGaps(input.scientific)
  const limitations: string[] = []
  const warnings: string[] = []
  if (input.scientific.scientificMaturity === 'PILOT') {
    limitations.push('scientificMaturity=PILOT：本工具为完整可用的 PILOT 产品；科研证据持续补充中，不构成使用限制。')
    warnings.push('PILOT maturity：报告解释必须遵守当前 reference/applicability 边界，不得暗示正式常模。')
  }
  if (input.scientific.evidenceCount === 0) {
    limitations.push('Evidence Matrix 当前为空：按 research backlog 管理，不是发布 blocker。')
  }

  return { publishable, errors, warnings, limitations, researchGaps }
}
