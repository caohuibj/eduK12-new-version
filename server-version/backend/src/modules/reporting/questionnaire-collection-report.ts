import { buildFormBackgroundReport, buildScaleUnitReport } from './scale-unit-report'

/**
 * Collection-only questionnaire projection shared by authenticated and public
 * endpoints.  Legacy aggregateReport is an input compatibility source only;
 * it never becomes an aggregate score in the response.
 */
export const buildQuestionnaireCollectionReport = (qa: any): any => {
  const questionnaireScales = [...(qa.questionnaire?.questionnaireScales || [])]
    .sort((left: any, right: any) => (left.position ?? 0) - (right.position ?? 0))
  const assessments = Array.isArray(qa.scaleAssessments) ? qa.scaleAssessments : []
  const storedScaleReports = Array.isArray(qa.aggregateReport?.scaleReports)
    ? qa.aggregateReport.scaleReports
    : []
  const seen = new Set<string>()
  const unitReports = [
    ...questionnaireScales.map((questionnaireScale: any) => {
      const scaleId = questionnaireScale.scaleId
      seen.add(scaleId)
      const assessment = assessments.find((candidate: any) => candidate.scaleId === scaleId)
      const stored = storedScaleReports.find((candidate: any) => candidate.scaleId === scaleId)
      const scale = questionnaireScale.scale || assessment?.scale
      return buildScaleUnitReport({
        itemId: questionnaireScale.id || scaleId,
        scaleId,
        scaleCode: scale?.code,
        scaleName: scale?.name || stored?.scaleName || '未知量表',
        scores: stored?.dimensionScores ?? assessment?.scores,
        feedback: stored?.feedback ?? assessment?.feedback,
        dimensions: scale?.dimensions,
        caveats: stored?.caveats ?? assessment?.caveats,
        disclaimer: stored?.disclaimer ?? assessment?.disclaimer,
        completedAt: assessment?.completedAt ?? stored?.completedAt,
        totalTime: assessment?.totalTime ?? stored?.totalTime,
      })
    }),
    ...assessments
      .filter((assessment: any) => !seen.has(assessment.scaleId))
      .map((assessment: any) => {
        const stored = storedScaleReports.find((candidate: any) => candidate.scaleId === assessment.scaleId)
        return buildScaleUnitReport({
          itemId: assessment.id,
          scaleId: assessment.scaleId,
          scaleCode: assessment.scale?.code,
          scaleName: assessment.scale?.name || stored?.scaleName || '未知量表',
          scores: stored?.dimensionScores ?? assessment.scores,
          feedback: stored?.feedback ?? assessment.feedback,
          dimensions: assessment.scale?.dimensions,
          caveats: stored?.caveats ?? assessment.caveats,
          disclaimer: stored?.disclaimer ?? assessment.disclaimer,
          completedAt: assessment.completedAt ?? stored?.completedAt,
          totalTime: assessment.totalTime ?? stored?.totalTime,
        })
      }),
    ...storedScaleReports
      .filter((stored: any) => !seen.has(stored.scaleId) && !assessments.some((assessment: any) => assessment.scaleId === stored.scaleId))
      .map((stored: any) => buildScaleUnitReport({
        itemId: stored.scaleId,
        scaleId: stored.scaleId,
        scaleName: stored.scaleName || '未知量表',
        scores: stored.dimensionScores,
        feedback: stored.feedback,
        caveats: stored.caveats,
        disclaimer: stored.disclaimer,
        completedAt: stored.completedAt,
        totalTime: stored.totalTime,
      })),
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
    totalDimensions: unitReports.reduce((sum: number, report: any) => sum + report.dimensionScores.length, 0),
    backgroundValues,
    unitReports,
  }
}

export const collectionReportForStorage = (report: any) => ({
  reportDefinitionVersion: 'collection-only-v1',
  scaleReports: report.unitReports,
  totalDimensions: report.totalDimensions,
})
