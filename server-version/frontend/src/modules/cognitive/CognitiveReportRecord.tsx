import { formatReportCompletedAt } from './report-record'

/** Record context belongs in the report itself so screen and print stay aligned. */
export default function CognitiveReportRecord({ anonymousCode, reportId, assignmentTitle, finishedAt }: {
  anonymousCode?: string | null
  reportId?: string | null
  assignmentTitle?: string | null
  finishedAt?: string | null
}) {
  const date = formatReportCompletedAt(finishedAt)
  if (!anonymousCode && !reportId && !assignmentTitle && !date) return null
  return <dl className="cognitive-report-record" aria-label="报告记录信息">
    {assignmentTitle && <div><dt>任务</dt><dd>{assignmentTitle}</dd></div>}
    {anonymousCode && <div><dt>匿名编号</dt><dd>{anonymousCode}</dd></div>}
    {reportId && <div><dt>报告标识</dt><dd>{reportId}</dd></div>}
    {date && <div><dt>完成时间</dt><dd><time dateTime={finishedAt!}>{date}</time></dd></div>}
  </dl>
}
