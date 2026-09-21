import { buildFormBackgroundReport, buildScaleUnitReport, projectScaleUnitReport, type ScaleUnitReport } from './scale-unit-report'
import { readContextFormAnswers } from '../assessment-context'
import { safeDecrypt } from '../../utils/encryption'
import { isFormAnswerComplete } from '../../services/questionnaireFormAnswerState'
import type { CanonicalUnitResultCoreV1 } from '../assessment-runtime/unit-result'
import type { FormSectionCollectionFactsV1 } from '../assessment-runtime/form-facts'
import { createScaleProjectionContext } from '../scale/projection/context-factory'
import type { ScaleProjectionContext } from '../scale/projection/types'

const readStoredAggregate = (qa: any): any => {
  if (qa?.aggregateReportEncrypted) {
    const decrypted = safeDecrypt<any>(qa.aggregateReportEncrypted)
    if (decrypted !== null && decrypted !== undefined) return decrypted
  }
  return qa?.aggregateReport ?? null
}

export interface QuestionnaireCollectionProjectionOptions {
  contextForScale?: (report: ScaleUnitReport) => ScaleProjectionContext
}

const defaultContextForScale = (report: ScaleUnitReport): ScaleProjectionContext => createScaleProjectionContext({
  instrumentKey: report.scaleCode,
  instrumentVersion: report.method?.instrumentVersion ?? report.result?.instrument.instrumentVersion ?? null,
  audience: 'respondent',
  purpose: 'report',
})

const projectUnit = (report: ScaleUnitReport, options?: QuestionnaireCollectionProjectionOptions) => (
  projectScaleUnitReport(report, options?.contextForScale?.(report) ?? defaultContextForScale(report))
)

/** Collection-only external projection; stored aggregates are always re-projected. */
export const buildQuestionnaireCollectionReport = (qa: any, options?: QuestionnaireCollectionProjectionOptions): any => {
  const storedAggregate = readStoredAggregate(qa)
  if (
    storedAggregate?.reportDefinitionVersion === 'collection-only-v2'
    && Array.isArray(storedAggregate.scaleReports)
    && Array.isArray(storedAggregate.backgroundValues)
  ) {
    const unitReports = storedAggregate.scaleReports.map((stored: ScaleUnitReport) => projectUnit(stored, options))
    const totalDimensions = unitReports.reduce(
      (sum: number, report: any) => sum + (Array.isArray(report?.scores) ? report.scores.length : 0),
      0,
    )
    return {
      questionnaireName: qa.questionnaire?.name || '问卷',
      totalDimensions,
      backgroundValues: storedAggregate.backgroundValues,
      unitReports,
    }
  }

  const questionnaireScales = [...(qa.questionnaire?.questionnaireScales || [])]
    .sort((left: any, right: any) => (left.position ?? 0) - (right.position ?? 0))
  const assessments = Array.isArray(qa.scaleAssessments) ? qa.scaleAssessments : []
  const storedScaleReports = Array.isArray(storedAggregate?.scaleReports)
    ? storedAggregate.scaleReports
    : []
  const seen = new Set<string>()
  const reportFor = (input: {
    itemId: string
    scaleId: string
    scale?: any
    assessment?: any
    stored?: any
  }) => {
    const { scale, assessment, stored } = input
    const internal = buildScaleUnitReport({
      itemId: input.itemId,
      scaleId: input.scaleId,
      scaleCode: scale?.code ?? stored?.scaleCode,
      scaleName: scale?.name || stored?.scaleName || '未知量表',
      result: assessment?.result ?? stored?.result,
      caveats: stored?.caveats,
      disclaimer: stored?.disclaimer,
      completedAt: assessment?.completedAt ?? stored?.completedAt,
      totalTime: assessment?.totalTime ?? stored?.totalTime,
    })
    // Stored unified aggregates can have result=null with already-materialized
    // score/reference fields. Preserve them only as internal input before the
    // audience projection below.
    const mergedInternal: ScaleUnitReport = stored && internal.result === null ? {
      ...internal,
      quality: stored.quality ?? internal.quality,
      scores: Array.isArray(stored.scores) ? stored.scores : internal.scores,
      references: Array.isArray(stored.references) ? stored.references : internal.references,
      interpretations: Array.isArray(stored.interpretations) ? stored.interpretations : internal.interpretations,
      method: stored.method ?? internal.method,
      ...(stored.decryptError ? { decryptError: true } : {}),
    } : internal
    return projectUnit(mergedInternal, options)
  }

  const unitReports = [
    ...questionnaireScales.map((questionnaireScale: any) => {
      const scaleId = questionnaireScale.scaleId
      seen.add(scaleId)
      const assessment = assessments.find((candidate: any) => candidate.scaleId === scaleId)
      const stored = storedScaleReports.find((candidate: any) => candidate.scaleId === scaleId)
      return reportFor({ itemId: questionnaireScale.id || scaleId, scaleId, scale: questionnaireScale.scale, assessment, stored })
    }),
    ...assessments
      .filter((assessment: any) => !seen.has(assessment.scaleId))
      .map((assessment: any) => {
        const stored = storedScaleReports.find((candidate: any) => candidate.scaleId === assessment.scaleId)
        return reportFor({ itemId: assessment.id, scaleId: assessment.scaleId, scale: assessment.scale, assessment, stored })
      }),
    ...storedScaleReports
      .filter((stored: any) => !seen.has(stored.scaleId) && !assessments.some((assessment: any) => assessment.scaleId === stored.scaleId))
      .map((stored: any) => reportFor({ itemId: stored.scaleId, scaleId: stored.scaleId, stored })),
  ]

  const formItems = [...(qa.questionnaire?.formItems || [])]
    .sort((left: any, right: any) => (left.position ?? 0) - (right.position ?? 0))
  const readableFormAnswers = readContextFormAnswers(formItems, qa.formAnswers || [])
  const formItemById = new Map(formItems.map((item: any) => [item.id, item]))
  const formAnswers = new Map(readableFormAnswers
    .filter((answer: any) => isFormAnswerComplete(formItemById.get(answer.formItemId) || {}, answer))
    .map((answer: any) => [answer.formItemId, answer.value]))
  const backgroundValues = formItems.map((item: any) => buildFormBackgroundReport({
    itemId: item.id,
    label: item.label,
    value: formAnswers.has(item.id) ? String(formAnswers.get(item.id)) : null,
  }))
  return {
    questionnaireName: qa.questionnaire?.name || '问卷',
    totalDimensions: unitReports.reduce((sum: number, report: any) => sum + (Array.isArray(report.scores) ? report.scores.length : 0), 0),
    backgroundValues,
    unitReports,
  }
}

/** Internal storage payload; it is not audience-safe and must be projected on read. */
export const collectionReportForStorage = (report: any) => ({
  reportDefinitionVersion: 'collection-only-v2',
  scaleReports: report.unitReports,
  totalDimensions: report.totalDimensions,
  ...(Array.isArray(report.backgroundValues) ? { backgroundValues: report.backgroundValues } : {}),
})

/**
 * Internal V32-2 collection materialization. It consumes canonical unit result
 * and form facts only. The returned object is for encrypted aggregate storage,
 * not direct HTTP serialization.
 */
export const buildQuestionnaireCollectionReportFromUnifiedInput = (input: {
  questionnaireName: string
  scales: Array<{
    itemId: string
    scaleId: string
    scaleCode: string
    scaleName: string
    completedAt: Date | string | null
    totalTime: number | null
    core: CanonicalUnitResultCoreV1
  }>
  formSections: Array<{ itemId: string; facts: FormSectionCollectionFactsV1 }>
}): any => {
  const unitReports = input.scales.map((scale) => {
    const quality = {
      status: scale.core.quality.status,
      flags: [...scale.core.quality.flags],
    }
    const scores = scale.core.metrics
      .filter((metric) => typeof metric.value === 'number' && Number.isFinite(metric.value))
      .map((metric) => ({
        key: metric.key,
        label: metric.key,
        type: 'dimension',
        value: metric.value,
        status: metric.quality ?? scale.core.quality.status,
      }))
    return {
      itemId: scale.itemId,
      type: 'SCALE',
      kind: 'scale',
      scaleId: scale.scaleId,
      scaleCode: scale.scaleCode,
      label: scale.scaleName,
      scaleName: scale.scaleName,
      result: null,
      quality,
      scores,
      references: scale.core.references,
      interpretations: [],
      caveats: [],
      disclaimer: '量表结果仅反映本次作答，不构成医学诊断或人口常模。',
      completedAt: scale.completedAt,
      totalTime: scale.totalTime,
      method: {
        instrumentKey: scale.core.instrumentKey,
        instrumentVersion: scale.core.instrumentVersion,
        compiledRuntimeHash: scale.core.compiledRuntimeHash,
      },
    }
  })
  const backgroundValues = input.formSections.flatMap((section) => section.facts.items.map((item) => buildFormBackgroundReport({
    itemId: item.key,
    label: item.label,
    value: Array.isArray(item.value) ? item.value.join(', ') : item.value,
  })))
  return {
    questionnaireName: input.questionnaireName || '问卷',
    totalDimensions: unitReports.reduce((sum, report) => sum + report.scores.length, 0),
    backgroundValues,
    unitReports,
  }
}
