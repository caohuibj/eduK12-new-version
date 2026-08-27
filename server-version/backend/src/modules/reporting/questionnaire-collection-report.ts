import { buildFormBackgroundReport, buildScaleUnitReport } from './scale-unit-report'

/** Collection-only questionnaire projection; it never creates a combined score. */
export const buildQuestionnaireCollectionReport = (qa: any): any => {
  const questionnaireScales = [...(qa.questionnaire?.questionnaireScales || [])]
    .sort((left: any, right: any) => (left.position ?? 0) - (right.position ?? 0))
  const assessments = Array.isArray(qa.scaleAssessments) ? qa.scaleAssessments : []
  const storedScaleReports = Array.isArray(qa.aggregateReport?.scaleReports)
    ? qa.aggregateReport.scaleReports
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
    return buildScaleUnitReport({
      itemId: input.itemId,
      scaleId: input.scaleId,
      scaleCode: scale?.code,
      scaleName: scale?.name || stored?.scaleName || '未知量表',
      result: assessment?.result ?? stored?.result,
      caveats: stored?.caveats,
      disclaimer: stored?.disclaimer,
      completedAt: assessment?.completedAt ?? stored?.completedAt,
      totalTime: assessment?.totalTime ?? stored?.totalTime,
    })
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
  const formAnswers = new Map((qa.formAnswers || []).map((answer: any) => [answer.formItemId, answer.value]))
  const backgroundValues = formItems.map((item: any) => buildFormBackgroundReport({
    itemId: item.id,
    label: item.label,
    value: formAnswers.has(item.id) ? String(formAnswers.get(item.id)) : null,
  }))
  return {
    questionnaireName: qa.questionnaire?.name || '问卷',
    totalDimensions: unitReports.reduce((sum: number, report: any) => sum + report.scores.length, 0),
    backgroundValues,
    unitReports,
  }
}

export const collectionReportForStorage = (report: any) => ({
  reportDefinitionVersion: 'collection-only-v2',
  scaleReports: report.unitReports,
  totalDimensions: report.totalDimensions,
})
