import {
  evaluateAuthorizationOverlayStatus,
  resolveEffectiveAuthorization,
  type InstrumentAuthorizationRecordV1,
} from '../../assessment-authorization'
import {
  buildScaleLibraryReadModel,
  filterScaleLibraryEntries,
  getScaleLibraryEntry,
  type ScaleLibraryEntry,
  type ScaleLibraryFilterInput,
  type ScaleLibraryReadModelContext,
} from './scale-library-read-model'
import type { ScaleEvidenceRecord } from './catalog-manifest'
import type { LocalizationManifestV1 } from './localization-manifest'
import {
  getWave1P1LocalizationManifest,
  WAVE1_P1_SCALE_CATALOG_MANIFESTS,
} from './wave1-p1-catalog'

export type CatalogFirstPackageStatus = 'NOT_BUILT'

export interface Wave1P1CatalogGovernance {
  catalogManifestVersion: number
  catalogStatus: string
  scientificMaturity: string
  bindingStatus: 'PACKAGE_MISSING'
  packageReleaseStatus: CatalogFirstPackageStatus
  definitionHash: 'NOT_APPLICABLE_CATALOG_FIRST'
  evidence: ScaleEvidenceRecord[]
  referenceApplicability: Array<Record<string, unknown>>
  gate: {
    publishable: false
    errors: string[]
    warnings: string[]
    reportEligibility: {
      maxEligibleLevel: null
      pilotWordingRequired: false
      requiredReferenceWording: string[]
      forbiddenClaims: string[]
    }
  }
  authorization?: { authorizationId: string; status: string; basis: string }
}

export type Wave1P1CatalogEntry = Omit<ScaleLibraryEntry, 'governance'> & {
  governance?: Wave1P1CatalogGovernance
}

export type ExpandedScaleLibraryEntry = ScaleLibraryEntry | Wave1P1CatalogEntry

export interface ExpandedScaleLibraryReadModel {
  schemaVersion: 1
  generatedAt: string
  entries: ExpandedScaleLibraryEntry[]
  diagnostics: Array<{ severity: 'error' | 'warning'; code: string; message: string }>
}

const ORIGINAL_SOURCES: Record<string, ScaleLibraryEntry['source']> = {
  dass21_zh_cn: {
    title: 'Depression Anxiety Stress Scales — 21-item (DASS-21)',
    citation: 'Lovibond, S. H., & Lovibond, P. F. (1995). Manual for the Depression Anxiety Stress Scales (2nd ed.). Psychology Foundation.',
    url: 'https://www2.psy.unsw.edu.au/dass/',
    publicationYear: 1995,
  },
  gse_zh_cn: {
    title: 'General Self-Efficacy Scale (GSE)',
    citation: 'Schwarzer, R., & Jerusalem, M. (1995). Generalized Self-Efficacy Scale. In J. Weinman, S. Wright, & M. Johnston (Eds.), Measures in Health Psychology: A User’s Portfolio.',
    url: 'https://userpage.fu-berlin.de/health/selfscal.htm',
    publicationYear: 1995,
  },
  mpfi24_zh_cn: {
    title: 'Multidimensional Psychological Flexibility Inventory — 24-item short form (MPFI-24)',
    citation: 'Rolffs, J. L., Rogge, R. D., & Wilson, K. G. (2018). Disentangling Components of Flexibility via the Hexaflex Model: Development and Validation of the Multidimensional Psychological Flexibility Inventory. Assessment, 25, 458–482.',
    url: 'https://doi.org/10.1177/1073191116645905',
    publicationYear: 2018,
  },
  pss10_zh_cn: {
    title: 'Perceived Stress Scale — 10-item (PSS-10)',
    citation: 'Cohen, S., Kamarck, T., & Mermelstein, R. (1983). A global measure of perceived stress. Journal of Health and Social Behavior, 24, 385–396; 10-item form/scoring commonly referenced to Cohen & Williamson (1988).',
    url: 'https://www.cmu.edu/dietrich/psychology/stress-immunity-disease-lab/scales/index.html',
    publicationYear: 1983,
  },
}

const REPORT_PLANS: Record<string, { dimensionLabels: string[]; limitations: string[]; disclaimer: string }> = {
  dass21_zh_cn: {
    dimensionLabels: ['抑郁相关体验', '焦虑相关体验', '压力/紧张相关体验'],
    limitations: [
      '当前仅为报告设计，不代表已有可执行量表包或可向被试自动反馈的临床解释。',
      '儿童青少年中国证据提示三个维度存在较强重叠；不得把分量表直接解释为彼此独立的临床障碍。',
      '不提供诊断、严重程度标签、中国常模、百分位或高风险自动判定。',
    ],
    disclaimer: '计划报告仅作描述性心理状态反思；在官方 DASS respondent-feedback 使用条件闭环前，本工具不可启动且不生成个人结果。',
  },
  gse_zh_cn: {
    dimensionLabels: ['一般自我效能'],
    limitations: [
      '当前仅为报告设计；exact-form 中文文本、canonical scoring 与受限在线使用条件尚未冻结为 runtime package。',
      '自我效能是自我报告信念，不等同于智力、学业成绩、执行功能任务表现或客观能力。',
      '不提供群体百分位或常模判断。',
    ],
    disclaimer: '计划报告描述个体对困难与挑战的总体应对信念，不用于诊断、能力鉴定或高风险决策。',
  },
  mpfi24_zh_cn: {
    dimensionLabels: ['心理灵活性', '心理不灵活性'],
    limitations: [
      '当前仅为报告设计；简体中文 exact-form 条目、24 项计分映射及数字再分发 provenance 尚未冻结。',
      '心理灵活性与不灵活性按相关但不同的过程维度呈现，不合并为单一“好/坏人格”结论。',
      '不作心理障碍诊断或治疗效果声明。',
    ],
    disclaimer: '计划报告用于 ACT 过程层面的描述性反思，不替代临床评估或治疗判断。',
  },
  pss10_zh_cn: {
    dimensionLabels: ['知觉压力'],
    limitations: [
      '当前仅为报告设计；使用许可与中文翻译权利未闭环前不生成可执行 package。',
      '分数描述过去一个月的主观不可预测、不可控制与负荷感，不等同于精神疾病诊断。',
      '不提供临床 cut-off、常模或百分位。',
    ],
    disclaimer: '计划报告仅描述本次自评的知觉压力水平，不用于诊断或高风险决策。',
  },
}

const summarizeCandidateRights = (input: {
  instrumentKey: string
  instrumentVersion: string
  authorizations: readonly InstrumentAuthorizationRecordV1[]
  locale: string
  territory: string
  nowIso: string
}): ScaleLibraryEntry['rights'] => {
  const effective = resolveEffectiveAuthorization({
    authorizations: [...input.authorizations],
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    nowIso: input.nowIso,
  })
  if (!effective) return { status: 'NOT_GRANTED', commercialNature: 'UNSPECIFIED', locales: [], territories: [] }

  const overlay = evaluateAuthorizationOverlayStatus(effective, input.nowIso)
  const scopeMatches = effective.scope.locales.includes(input.locale) && effective.scope.territories.includes(input.territory)
  const eligibleStatus = effective.status === 'APPROVED' || effective.status === 'EVIDENCE_PENDING'
  const status: ScaleLibraryEntry['rights']['status'] = !eligibleStatus || overlay === 'EXPIRED' || overlay === 'REVOKED' || overlay === 'DRAFT'
    ? 'INELIGIBLE'
    : (scopeMatches ? (effective.status === 'APPROVED' ? 'APPROVED' : 'EVIDENCE_PENDING') : 'SCOPE_MISMATCH')

  return {
    status,
    commercialNature: effective.scope.commercialNature,
    locales: [...effective.scope.locales],
    territories: [...effective.scope.territories],
    validTo: effective.validTo,
  }
}

const localizationSummary = (manifest: LocalizationManifestV1): ScaleLibraryEntry['localization'] => ({
  sourceLocale: manifest.sourceLocale,
  targetLocale: manifest.targetLocale,
  localizationVersion: manifest.localizationVersion,
  adaptationMethod: manifest.adaptationMethod,
  reviewStatus: manifest.reviewStatus,
  expertReviewStatus: manifest.expertReviewStatus,
  cognitiveDebriefStatus: manifest.cognitiveDebriefStatus,
})

const buildCandidateEntry = (input: {
  manifest: (typeof WAVE1_P1_SCALE_CATALOG_MANIFESTS)[number]
  localization: LocalizationManifestV1
  context: ScaleLibraryReadModelContext
  generatedAt: string
}): Wave1P1CatalogEntry => {
  const { manifest, localization, context, generatedAt } = input
  const locale = context.locale ?? localization.targetLocale
  const territory = context.territory ?? 'CN'
  const respondent = context.respondent ?? manifest.population.respondentTypes[0]
  const authorizations = context.authorizations ?? []
  const rights = summarizeCandidateRights({
    instrumentKey: manifest.identity.instrumentKey,
    instrumentVersion: manifest.identity.instrumentVersion,
    authorizations,
    locale,
    territory,
    nowIso: generatedAt,
  })
  const reportPlan = REPORT_PLANS[manifest.identity.instrumentKey]
  const respondentMatches = manifest.population.respondentTypes.includes(respondent)
  const localeMatches = localization.targetLocale === locale
  const reasons = [
    '已进入 Wave 1 P1 科学目录，但尚无经治理审核的可执行 Scale package。',
    ...(localization.reviewStatus !== 'APPROVED' ? ['简体中文 exact-form 本地化仍处于 PENDING，尚未冻结为 runtime 内容。'] : []),
    ...(rights.status !== 'APPROVED' ? ['电子施测/显示/计分所需的有效授权或权利证据尚未闭环。'] : []),
    ...(!respondentMatches ? ['当前作答者类型不在已记录的适用范围内。'] : []),
    ...(!localeMatches ? [`当前目录目标语言为 ${localization.targetLocale}，不提供 ${locale} 版本。`] : []),
  ]

  const entry: Wave1P1CatalogEntry = {
    identity: { ...manifest.identity },
    source: ORIGINAL_SOURCES[manifest.identity.instrumentKey] ?? {},
    construct: {
      ...manifest.construct,
      secondaryDomains: [...manifest.construct.secondaryDomains],
      constructOverlapTags: [...manifest.construct.constructOverlapTags],
    },
    applicability: { ...manifest.population, respondentTypes: [...manifest.population.respondentTypes] },
    administration: {
      ...manifest.administration,
      administrationModes: [...manifest.administration.administrationModes],
      layoutConstraints: [...manifest.administration.layoutConstraints],
    },
    intendedUse: {
      intendedUses: manifest.intendedUse.intendedUses.map((use) => ({ ...use })),
      forbiddenUses: [...manifest.intendedUse.forbiddenUses],
    },
    localization: localizationSummary(localization),
    rights,
    evidence: {
      recordCount: manifest.evidence.length,
      status: manifest.evidence.length > 0 ? 'EVIDENCE_RECORDED' : 'NO_EVIDENCE_RECORDED',
      coverageText: manifest.evidence.length > 0
        ? '已记录简体中文/中国场域心理测量证据；证据只支持其明确样本人群，不自动扩展为常模、诊断依据或其他年龄/职业群体的验证。'
        : '尚无本地证据记录。',
    },
    references: {
      policy: 'none',
      packageReferenceCount: 0,
      applicabilityCount: manifest.referenceApplicability.length,
      referenceVersions: [],
      displayText: '当前没有可执行 package 或激活的 reference set；不提供常模、百分位或阈值解释。',
    },
    report: {
      maxEligibleLevel: null,
      levels: {
        L1_SCORE_ONLY: { eligible: false },
        L2_DESCRIPTIVE: { eligible: false },
        L3_REFERENCED_INTERPRETIVE: { eligible: false },
      },
      scoreCount: reportPlan?.dimensionLabels.length ?? 0,
      dimensionLabels: reportPlan?.dimensionLabels ?? [],
      limitations: reportPlan?.limitations ?? ['当前没有 executable report contract。'],
      disclaimer: reportPlan?.disclaimer ?? '当前条目仅用于科学目录发现，尚不可启动测评。',
    },
    availability: {
      status: 'NOT_AVAILABLE',
      locale,
      territory,
      respondent,
      reasons: [...new Set(reasons)],
    },
  }

  if (context.viewerRole === 'ADMIN') {
    const effective = resolveEffectiveAuthorization({
      authorizations: [...authorizations],
      instrumentKey: manifest.identity.instrumentKey,
      instrumentVersion: manifest.identity.instrumentVersion,
      nowIso: generatedAt,
    })
    entry.governance = {
      catalogManifestVersion: manifest.catalogManifestVersion,
      catalogStatus: manifest.catalogStatus,
      scientificMaturity: manifest.scientificMaturity,
      bindingStatus: 'PACKAGE_MISSING',
      packageReleaseStatus: 'NOT_BUILT',
      definitionHash: 'NOT_APPLICABLE_CATALOG_FIRST',
      evidence: manifest.evidence.map((record) => ({ ...record })),
      referenceApplicability: manifest.referenceApplicability.map((record) => ({ ...record })),
      gate: {
        publishable: false,
        errors: ['缺少可执行 Scale package；catalog-first REVIEWED entry 不允许启动测评或生成个人报告。'],
        warnings: [
          ...(localization.reviewStatus !== 'APPROVED' ? ['本地化 manifest 尚未 APPROVED。'] : []),
          ...(rights.status !== 'APPROVED' ? ['当前 authorization scope 尚未满足发布条件。'] : []),
        ],
        reportEligibility: {
          maxEligibleLevel: null,
          pilotWordingRequired: false,
          requiredReferenceWording: [],
          forbiddenClaims: ['全国常模', '中国学生正式常模', '标准化全国排名', '诊断结论'],
        },
      },
      ...(effective ? { authorization: { authorizationId: effective.authorizationId, status: effective.status, basis: effective.basis } } : {}),
    }
  }

  return entry
}

export const buildExpandedScaleLibraryReadModel = (context: ScaleLibraryReadModelContext = {}): ExpandedScaleLibraryReadModel => {
  const base = buildScaleLibraryReadModel(context)
  const candidates = WAVE1_P1_SCALE_CATALOG_MANIFESTS.flatMap((manifest) => {
    const localization = getWave1P1LocalizationManifest(manifest.identity.instrumentKey, manifest.identity.instrumentVersion)
    if (!localization) return []
    return [buildCandidateEntry({ manifest, localization, context, generatedAt: base.generatedAt })]
  })
  return {
    schemaVersion: 1,
    generatedAt: base.generatedAt,
    entries: [...base.entries, ...candidates],
    diagnostics: [
      ...base.diagnostics,
      ...candidates.map((entry) => ({
        severity: 'warning' as const,
        code: 'CATALOG_FIRST_PACKAGE_PENDING',
        message: `${entry.identity.instrumentKey}:${entry.identity.instrumentVersion} 已进入 REVIEWED 目录，等待 exact-form package / rights closure。`,
      })),
    ],
  }
}

export const filterExpandedScaleLibraryEntries = (
  entries: readonly ExpandedScaleLibraryEntry[],
  filters: ScaleLibraryFilterInput = {},
): ExpandedScaleLibraryEntry[] => filterScaleLibraryEntries(entries as readonly ScaleLibraryEntry[], filters) as ExpandedScaleLibraryEntry[]

export const getExpandedScaleLibraryEntry = (
  model: ExpandedScaleLibraryReadModel,
  instrumentKey: string,
  instrumentVersion: string,
): ExpandedScaleLibraryEntry | undefined => getScaleLibraryEntry(
  { schemaVersion: 1, generatedAt: model.generatedAt, entries: model.entries as ScaleLibraryEntry[], diagnostics: model.diagnostics },
  instrumentKey,
  instrumentVersion,
) as ExpandedScaleLibraryEntry | undefined
