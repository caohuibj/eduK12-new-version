import React from 'react'
import LegacyScaleUnitReportCard, { type SafeScaleUnitReport as LegacySafeScaleUnitReport } from './ScaleUnitReportCard.legacy'
import EducationalFeedback, { type EducationalFeedbackContent } from './EducationalFeedback'

export type SafeScaleUnitReport = LegacySafeScaleUnitReport & {
  reportKind?: 'full' | 'scores' | 'educational' | 'completion' | 'unavailable'
  educationalFeedback?: EducationalFeedbackContent
  reason?: 'POLICY_UNAVAILABLE' | 'RESULT_UNAVAILABLE'
}

const ScaleUnitReportCard: React.FC<{ report: SafeScaleUnitReport }> = ({ report }) => {
  if (report.reportKind === 'unavailable') {
    return (
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800" data-testid="scale-report-unavailable">
        当前结果暂不可展示。请稍后重试或联系测评管理员。
      </p>
    )
  }

  if (report.reportKind === 'completion') {
    return (
      <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700" data-testid="scale-report-completion">
        本次测评已完成。当前受众不提供进一步的个体结果内容。
      </p>
    )
  }

  if (report.reportKind === 'educational') {
    if (!report.educationalFeedback) {
      return <p className="text-sm text-gray-500">本次测评已完成。</p>
    }
    return <EducationalFeedback content={report.educationalFeedback} />
  }

  return <LegacyScaleUnitReportCard report={report} />
}

export default ScaleUnitReportCard
