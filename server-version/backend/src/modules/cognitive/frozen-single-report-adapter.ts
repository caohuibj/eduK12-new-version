/** Adapt a persisted V2 presentation to the existing single-task card.
 * No live definitions, scores, references or raw trials enter this adapter. */
export const adaptFrozenSingleTaskReport = (report: any): any => {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return null
  if (!Array.isArray(report.headline)) return report
  if (!Array.isArray(report.user) || !Array.isArray(report.detail) || !Array.isArray(report.quality)
    || !['interpretable', 'limited', 'invalid'].includes(report.qualityState) || !report.method) return null
  return {
    ...report,
    testType: report.method.testType,
    profile: report.method.profile ?? null,
    interpretable: report.qualityState !== 'invalid',
    interpretationSummary: report.conclusion,
    qualityFlags: report.quality,
    headline: report.qualityState === 'invalid' ? null : report.headline[0] ?? null,
    primaryMetrics: report.qualityState === 'invalid' ? [] : [...report.headline.slice(1), ...report.user],
    secondaryMetrics: report.qualityState === 'invalid' ? [] : report.detail,
    showProductIndex: false,
    productIndex: null,
    caveats: report.qualityState === 'limited' ? ['本次数据存在质量限制，仅阅读报告中可显示的指标；不作能力排名或诊断。'] : [],
  }
}
