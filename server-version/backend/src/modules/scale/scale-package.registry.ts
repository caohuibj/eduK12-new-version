import { validateAudienceReport } from './library/audience-report-gate'
import { hashScaleDefinition, runnerDefinition, validateScaleDefinition, type DefinitionIssue } from './scale-definition'
import { getScaleCustomScorerKeys, scoreScale } from './scale-scoring'
import { validateReferenceSetDefinition } from '../assessment-reference/reference'
import {
  getExecutableScalePackage,
  hasExecutableScalePackage,
  listExecutableScalePackages,
} from './onboarding/executable-registry'
import type { ScaleGoldenCase, ScalePackageV2 } from './onboarding/types'

export type { ScaleGoldenCase, ScalePackageV2 } from './onboarding/types'

const requirePackage = (key: string, version: string): ScalePackageV2 => {
  const pkg = getExecutableScalePackage(key, version)
  if (!pkg) throw new Error(`Missing generated Scale package: ${key}@${version}`)
  return pkg
}

// Compatibility named exports. The executable projection preserves the exact
// legacy identities and PUBLISHED normalization without importing Library data.
export const ADEXI_V2_PACKAGE = requirePackage('adexi_v1', '2.0.0')
export const WHO5_ZH_CN_V1_PACKAGE = requirePackage('who5', '1.0.0')
export const SDQ_PARENT_ZH_CN_V1_PACKAGE = requirePackage('sdq_parent_zh_cn', '1.0.0')
export const SDQ_TEACHER_EN_T4_10_V1_PACKAGE = requirePackage('sdq_teacher_zh_cn', '1.0.0')
export const TEXI_PARENT_EN_V1_PACKAGE = requirePackage('texi_parent_zh_cn', '1.0.0')
export const TEXI_TEACHER_EN_V1_PACKAGE = requirePackage('texi_teacher_zh_cn', '1.0.0')

export const getScalePackage = (key: string, instrumentVersion: string): ScalePackageV2 | undefined => (
  getExecutableScalePackage(key, instrumentVersion)
)

export const listScalePackages = (): ScalePackageV2[] => listExecutableScalePackages()

export const hasScalePackage = (key: string, instrumentVersion: string): boolean => (
  hasExecutableScalePackage(key, instrumentVersion)
)

export interface ScalePackageValidation {
  valid: boolean
  definitionHash: string
  issues: DefinitionIssue[]
}

/**
 * Exact-package executable correctness gate. A package is code-owned, so its
 * runner/report/scoring shape and golden cases are checked together with the
 * definition contract. Scientific evidence, source/rights provenance and
 * deployment authorization are deliberately not publication blockers here.
 *
 * The function is pure and can be used by seed, CI, or admin diagnostics
 * without touching the database.
 */
export const validateScalePackage = (scalePackage: ScalePackageV2): ScalePackageValidation => {
  const identityIssues: DefinitionIssue[] = []
  if (!scalePackage.key.trim()) identityIssues.push({ path: 'key', message: 'package key 不能为空', severity: 'error' })
  if (!scalePackage.instrumentVersion.trim()) identityIssues.push({ path: 'instrumentVersion', message: 'package instrumentVersion 不能为空', severity: 'error' })
  if (!['DRAFT', 'PUBLISHED', 'RETIRED'].includes(scalePackage.releaseStatus)) identityIssues.push({ path: 'releaseStatus', message: 'package releaseStatus 不合法', severity: 'error' })
  const validation = validateScaleDefinition(scalePackage.definition, {
    instrumentClass: 'STANDARD',
    forPublish: false,
    scorerKeys: getScaleCustomScorerKeys(),
  })
  const issues = [...identityIssues, ...validation.issues]

  if (scalePackage.definition.display.randomizeItems) {
    issues.push({ path: 'display.randomizeItems', message: '当前 Runner 不支持题目随机化', severity: 'error' })
  }
  scalePackage.definition.items.forEach((item, index) => {
    if (item.randomizeOptions) issues.push({ path: `items.${index}.randomizeOptions`, message: '当前 Runner 不支持选项随机化', severity: 'error' })
  })
  if (scalePackage.goldenCases.length === 0) {
    issues.push({ path: 'goldenCases', message: '标准量表缺少 golden scoring fixture', severity: 'error' })
  }

  issues.push(...validateAudienceReport(scalePackage.definition))
  const scoreKeys = new Set(scalePackage.definition.scoring.scores.map((score) => score.key))
  const referenceVersions = new Set<string>()
  scalePackage.references.forEach((reference, referenceIndex) => {
    const path = `references.${referenceIndex}`
    const referenceValidation = validateReferenceSetDefinition(reference)
    referenceValidation.issues.forEach((issue) => issues.push({ path: `${path}.${issue.path}`, message: issue.message, severity: issue.severity }))
    if (reference.instrumentType !== 'scale') issues.push({ path: `${path}.instrumentType`, message: 'Scale package 只能携带 instrumentType=scale 的 reference', severity: 'error' })
    if (reference.instrumentKey !== scalePackage.key) issues.push({ path: `${path}.instrumentKey`, message: `reference instrumentKey 必须等于 package key：${scalePackage.key}`, severity: 'error' })
    if (referenceVersions.has(reference.referenceVersion)) issues.push({ path: `${path}.referenceVersion`, message: '同一 package 不能重复声明 referenceVersion', severity: 'error' })
    referenceVersions.add(reference.referenceVersion)
    reference.entries.forEach((entry, entryIndex) => {
      const axes=scalePackage.definition.versionAxes
      if(axes && (!entry.governance || entry.governance.subjectKey!==axes.subjectKey || entry.governance.locale!==axes.locale || entry.governance.measurementHash!==hashScaleDefinition(scalePackage.definition))) issues.push({path:`${path}.entries.${entryIndex}.governance`,message:'REFERENCE_MEASUREMENT_AXES_MISMATCH',severity:'error'})
      if (!scoreKeys.has(entry.scoreKey)) issues.push({ path: `${path}.entries.${entryIndex}.scoreKey`, message: `reference 引用了不存在的 score：${entry.scoreKey}`, severity: 'error' })
      if (entry.instrumentVersion !== scalePackage.instrumentVersion) issues.push({ path: `${path}.entries.${entryIndex}.instrumentVersion`, message: 'reference instrumentVersion 必须与 package 一致', severity: 'error' })
      if (entry.scoringVersion !== scalePackage.definition.scoring.scoringVersion) issues.push({ path: `${path}.entries.${entryIndex}.scoringVersion`, message: 'reference scoringVersion 必须与 definition 一致', severity: 'error' })
    })
  })
  if (scalePackage.definition.referencePolicy.type === 'none' && scalePackage.references.length > 0) {
    issues.push({ path: 'references', message: 'definition.referencePolicy=none 时不能携带未使用的 reference', severity: 'error' })
  }
  if (scalePackage.definition.referencePolicy.type === 'declared') {
    const declaredKeys = new Set<string>()
    scalePackage.definition.referencePolicy.selections.forEach((selection, selectionIndex) => {
      const selectionKey = `${selection.scoreKey}:${selection.referenceVersion}:${selection.referenceKind}`
      if (declaredKeys.has(selectionKey)) issues.push({ path: `definition.referencePolicy.selections.${selectionIndex}`, message: 'reference selection 不能重复', severity: 'error' })
      declaredKeys.add(selectionKey)
      const reference = scalePackage.references.find((candidate) => candidate.referenceVersion === selection.referenceVersion)
      if (!reference) {
        issues.push({ path: `definition.referencePolicy.selections.${selectionIndex}`, message: `package 未提供 referenceVersion：${selection.referenceVersion}`, severity: 'error' })
        return
      }
      const entry = reference.entries.find((candidate) => candidate.scoreKey === selection.scoreKey && candidate.referenceKind === selection.referenceKind)
      if (!entry) issues.push({ path: `definition.referencePolicy.selections.${selectionIndex}`, message: 'package reference 中缺少与 selection 匹配的 scoreKey/referenceKind', severity: 'error' })
      if (reference.status !== 'ACTIVE') issues.push({ path: `references.${scalePackage.references.indexOf(reference)}.status`, message: '当前报告 contract 使用的 reference 必须为 ACTIVE', severity: 'error' })
    })
  }
  if (hashScaleDefinition(scalePackage.definition) !== hashScaleDefinition(validation.definition ?? scalePackage.definition)) {
    issues.push({ path: 'definitionHash', message: 'definition hash 计算不稳定', severity: 'error' })
  }
  try {
    const runner = runnerDefinition(scalePackage.definition)
    if (runner.items.some((item) => item.options.length === 0)) issues.push({ path: 'runner', message: 'Runner 存在没有响应选项的题目', severity: 'error' })
    if (scalePackage.definition.report.interpretations.some((entry) => !entry.headline || !entry.summary)) issues.push({ path: 'report', message: '报告解释缺少 headline 或 summary', severity: 'error' })
  } catch (error) {
    issues.push({ path: 'runner', message: error instanceof Error ? error.message : 'Runner definition 无法构建', severity: 'error' })
  }
  scalePackage.goldenCases.forEach((fixture: ScaleGoldenCase, index) => {
    try {
      const output = scoreScale(scalePackage.definition, fixture.answers)
      if (output.quality.status !== fixture.expected.quality) issues.push({ path: `goldenCases.${index}.quality`, message: `golden case ${fixture.name} 的 quality 不匹配`, severity: 'error' })
      const actualKeys = output.scores.map((score) => score.key)
      if (JSON.stringify(actualKeys) !== JSON.stringify(fixture.expected.totalScoreKeys)) issues.push({ path: `goldenCases.${index}.scores`, message: `golden case ${fixture.name} 的 score key 不匹配`, severity: 'error' })
      Object.entries(fixture.expected.scores).forEach(([key, expected]) => {
        const actual = output.scores.find((score) => score.key === key)?.value ?? null
        if (actual !== expected) issues.push({ path: `goldenCases.${index}.scores.${key}`, message: `golden case ${fixture.name} 的 ${key} 不匹配：期望 ${expected}，实际 ${actual}`, severity: 'error' })
      })
    } catch (error) {
      issues.push({ path: `goldenCases.${index}`, message: error instanceof Error ? error.message : `golden case ${fixture.name} 执行失败`, severity: 'error' })
    }
  })
  return { valid: issues.every((issue) => issue.severity !== 'error'), definitionHash: hashScaleDefinition(scalePackage.definition), issues }
}
