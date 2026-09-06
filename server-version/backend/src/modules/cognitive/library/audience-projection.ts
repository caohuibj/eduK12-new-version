/**
 * COG-P1 Commit 5 — Audience Projection Contract.
 *
 * 显示边界（Pilot-first v2 指令 §12）：
 *  - Student/Parent：产品化信息（名称、大致能力、时长、用途、Pilot 属性、简单局限）。
 *  - Teacher：增加 Domain/Facet、主要 metric 标签、reference 状态、解释边界。
 *  - Admin：完整 identity/version、scientificStatus、rights/provenance、备注。
 *  - 科研背景不得原样进入学生/家长视图（类型层面剔除 + 测试断言）。
 *
 * 数据来源边界：
 *  - 名称 / 免责声明 / metric 标签 / 时长 ← cognitive.registry（唯一真值）；
 *  - Domain/Facet ← evidence-mapping 派生（deriveCatalogDomainSummary）；
 *  - reference 状态必须由调用方在服务时从 Reference Core 解析后传入
 *    （Catalog 不保存、不复制任何 reference 真值）。
 */

import type { CognitiveProfile, RegistryEntry } from '../cognitive.types'
import { requireCatalogForIdentity, deriveCatalogDomainSummary } from './catalog'
import type { CognitiveCatalogDomainFacetSummary } from './catalog'
import type { CognitiveScientificStatus, CognitiveInteractionFamily, CognitiveSensitivity } from './catalog-contract'

export type CatalogAudience = 'student' | 'teacher' | 'admin'

/** 调用方从 Reference Core 解析后的摘要；Catalog 不持有 reference 真值。 */
export interface CatalogReferenceSummary {
  label: string
  available: boolean
}

export interface StudentParentCatalogView {
  displayName: string
  educationalPurpose: string
  plainAbilityHint: string
  /** 来自 registry profiles[profile].estimatedMinutes；未提供 profile 时为 null。 */
  estimatedMinutes: [number, number] | null
  isPilot: boolean
  simpleLimitations: string[]
}

export interface TeacherCatalogView extends StudentParentCatalogView {
  domainSummary: CognitiveCatalogDomainFacetSummary[]
  keyMetricLabels: string[]
  referenceSummary: CatalogReferenceSummary | null
  interpretiveBoundary: string
}

export interface AdminCatalogView extends TeacherCatalogView {
  identity: {
    testType: string
    engineVersion: string
    scoringVersion: string
    profileDefinitionVersion: string
    metricDefinitionVersion: string
    qualityDefinitionVersion: string
    reportDefinitionVersion: string
  }
  scientificStatus: CognitiveScientificStatus
  interactionFamily: CognitiveInteractionFamily
  rtSensitivity: CognitiveSensitivity
  fineMotorSensitivity: CognitiveSensitivity
  adminScientificNotes: string
  knownLimitations: string[]
  sourceNotes: string[]
  rightsProvenance: string
  recommendedForCreate: boolean
  profileEstimatedMinutes: Record<CognitiveProfile, [number, number]>
}

export interface CatalogProjectionInput {
  testType: string
  engineVersion: string
  scoringVersion: string
  /** 学生/家长与教师视图的时长读取哪个 profile；缺省不展示时长。 */
  profile?: CognitiveProfile
  /** 教师视图的 reference 摘要（调用方从 Reference Core 解析）。 */
  referenceSummary?: CatalogReferenceSummary | null
}

const resolveProfileMinutes = (
  registry: RegistryEntry<unknown, unknown>,
  profile?: CognitiveProfile,
): [number, number] | null => {
  if (!profile) return null
  const profileDefinition = registry.profiles[profile]
  if (!profileDefinition) return null
  return [profileDefinition.estimatedMinutes[0], profileDefinition.estimatedMinutes[1]]
}

export const projectCatalogForAudience = (
  audience: CatalogAudience,
  input: CatalogProjectionInput,
): StudentParentCatalogView | TeacherCatalogView | AdminCatalogView => {
  const { catalog, registry } = requireCatalogForIdentity(
    input.testType,
    input.engineVersion,
    input.scoringVersion,
  )

  const studentView: StudentParentCatalogView = {
    displayName: registry.name,
    educationalPurpose: catalog.educationalPurpose,
    plainAbilityHint: catalog.plainAbilityHint,
    estimatedMinutes: resolveProfileMinutes(registry, input.profile),
    isPilot: catalog.scientificStatus === 'PILOT',
    simpleLimitations: [...catalog.knownLimitations],
  }

  if (audience === 'student') return studentView

  const teacherView: TeacherCatalogView = {
    ...studentView,
    domainSummary: deriveCatalogDomainSummary(input.testType, input.engineVersion, input.scoringVersion),
    keyMetricLabels: registry.reportDefinition.primaryMetrics.map(
      (key) => registry.metricDefinitions[key]?.label ?? key,
    ),
    referenceSummary: input.referenceSummary ?? null,
    interpretiveBoundary: registry.reportDefinition.disclaimer,
  }

  if (audience === 'teacher') return teacherView

  const adminView: AdminCatalogView = {
    ...teacherView,
    identity: {
      testType: input.testType,
      engineVersion: input.engineVersion,
      scoringVersion: input.scoringVersion,
      profileDefinitionVersion: registry.profileDefinitionVersion,
      metricDefinitionVersion: registry.metricDefinitionVersion,
      qualityDefinitionVersion: registry.qualityDefinitionVersion,
      reportDefinitionVersion: registry.reportDefinitionVersion,
    },
    scientificStatus: catalog.scientificStatus,
    interactionFamily: catalog.interactionFamily,
    rtSensitivity: catalog.rtSensitivity,
    fineMotorSensitivity: catalog.fineMotorSensitivity,
    adminScientificNotes: catalog.adminScientificNotes,
    knownLimitations: [...catalog.knownLimitations],
    sourceNotes: [...catalog.sourceNotes],
    rightsProvenance: catalog.rightsProvenance,
    recommendedForCreate: registry.recommendedForCreate === true,
    profileEstimatedMinutes: {
      experience: [...registry.profiles.experience.estimatedMinutes] as [number, number],
      standard: [...registry.profiles.standard.estimatedMinutes] as [number, number],
      research: [...registry.profiles.research.estimatedMinutes] as [number, number],
    },
  }

  return adminView
}
