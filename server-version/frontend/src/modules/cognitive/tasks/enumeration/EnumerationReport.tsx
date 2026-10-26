import React from 'react'
import { projectEnumerationReport, projectStoredEnumerationReport, type EnumerationStoredSnapshot, type EnumerationPublicResult } from './generated/report'
import type { EnumerationConfig } from './generated/protocol'
export interface EnumerationReportProps {
  result?: EnumerationPublicResult
  storedResult?: EnumerationStoredSnapshot
  config: EnumerationConfig
  randomSeed: string
  language: 'zh' | 'en'
}
/** Uses the shared pure projection; never reads raw internal metrics directly. */
export function EnumerationReport({ result, storedResult, config, randomSeed, language }: EnumerationReportProps) {
  const en = language === 'en'
  const empty: EnumerationPublicResult = { metrics: {}, quality: { state: 'invalid', flags: {}, reasons: [] } }
  const report = storedResult && !result ? projectStoredEnumerationReport(storedResult, { config, randomSeed })
    : projectEnumerationReport(storedResult ? empty : result ?? empty, { config, randomSeed })
  const summary = report.summary
  return <div className="enum-state" data-report-state={report.state}>
    {!summary ? <><h2>{en ? 'No usable result to describe yet' : '暂时没有可描述的作答结果'}</h2>
      <p>{en ? 'There are no usable answer records, or the matching result is not available. No performance conclusion is given.' : '没有可用作答记录，或对应结果尚不可用。本次不输出表现结论。'}</p></>
      : <><h2>{en ? `You matched the dot count on ${summary.correct} of ${summary.included} included trials` : `本次纳入的${summary.included}次作答中，你有${summary.correct}次判断正确`}</h2>
        <p>{report.state === 'limited'
          ? (en ? `${summary.received} of ${summary.expected} planned trials were recorded; ${summary.excluded} recorded trials were excluded. This is a partial record.` : `计划${summary.expected}次，已记录${summary.received}次，其中${summary.excluded}次未纳入。这是一份部分记录。`)
          : (en ? `All ${summary.expected} planned trials were recorded and included.` : `计划的${summary.expected}次作答均已记录并纳入。`)}</p>
        <p>{en ? `You reported more dots on ${summary.overReported} trials and fewer on ${summary.underReported} trials.` : `其中，报告的点数偏多${summary.overReported}次，偏少${summary.underReported}次。`}</p>
        <p>{en ? 'These counts describe this attempt, rather than a stable ability or a comparison with other people.' : '这些次数只描述本轮作答，不代表稳定能力，也不是与他人的比较。'}</p></>}
  </div>
}
