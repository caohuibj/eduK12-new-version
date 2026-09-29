import React from 'react'
import {
  ReportCoreSummary,
  ReportDetails,
  ReportMetric,
  ReportMetricGrid,
  ReportSection,
} from '../reporting/ReportPrimitives'
import type { CompositePackageReport as PackageReport } from './types'

const statusLabel: Record<string, string> = {
  not_measured: '未测量',
  insufficient_quality: '数据不足',
  descriptive_only: '描述性结果',
  interpretable: '可解释',
}

const recommendationPriorityLabel: Record<string, string> = {
  info: '信息',
  watch: '观察',
  follow_up: '跟进',
}

const facetCoverageFor = (domain: PackageReport['cognitiveDomains'][number]) => {
  if (domain.facetCoverage) return domain.facetCoverage
  if (!domain.evidence) return []
  const byFacet = new Map<string, { evidenceCount: number; interpretable: boolean; directionClasses: string[] }>()
  for (const evidence of domain.evidence) {
    const facet = typeof evidence.facet === 'string' ? evidence.facet : '未细分'
    const current = byFacet.get(facet) || { evidenceCount: 0, interpretable: false, directionClasses: [] }
    current.evidenceCount += 1
    current.interpretable = current.interpretable || (evidence.interpretable === true && evidence.value !== null)
    if (typeof evidence.directionClass === 'string' && !current.directionClasses.includes(evidence.directionClass)) {
      current.directionClasses.push(evidence.directionClass)
    }
    byFacet.set(facet, current)
  }
  return [...byFacet.entries()].map(([facet, coverage]) => ({ facet, ...coverage }))
}

const CompositePackageReport: React.FC<{ report: PackageReport }> = ({ report }) => {
  const isTeacher = report.audience === 'teacher'
  const isResearcher = report.audience === 'researcher'

  return (
    <section className="space-y-5" data-testid="composite-package-report">
      <ReportCoreSummary label="报告包范围">
        <div>
          <h2 className="text-xl font-semibold">{report.packageName}</h2>
          <p className="mt-1 text-sm font-normal text-gray-600">
            {report.packageKey} · {report.packageVersion} · {report.profile === 'research' ? '科研 Profile' : '标准 Profile'}
          </p>
          {(isTeacher || isResearcher) && report.snapshotId && (
            <p className="mt-2 text-xs font-normal text-gray-500">
              Snapshot：{report.snapshotId}
              {report.snapshotCreatedAt ? ` · ${new Date(report.snapshotCreatedAt).toLocaleString('zh-CN')}` : ''}
              {report.generationReason ? ` · ${report.generationReason === 'COMPLETION' ? '完成时生成' : '管理员重新分析'}` : ''}
            </p>
          )}
        </div>
      </ReportCoreSummary>

      <ReportSection title="数据质量" eyebrow="解释前提">
        <ReportMetricGrid>
          <ReportMetric label="可解释任务" value={report.qualitySummary.interpretableModules} />
          <ReportMetric label="排除任务" value={report.qualitySummary.excludedModules.length} />
          <ReportMetric label="质量提示" value={report.qualitySummary.warnings.length} />
        </ReportMetricGrid>
        {report.qualitySummary.warnings.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-700">
            {report.qualitySummary.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
      </ReportSection>

      <ReportSection
        title="Domain 与 facet 覆盖"
        eyebrow="结果概览"
        description="这里只展示报告包已定义的 domain/facet 覆盖与描述性摘要，不生成新的综合总分。"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {report.cognitiveDomains.map((domain) => {
            const facetCoverage = facetCoverageFor(domain)
            return (
              <article key={domain.domain} className="report-feedback" data-testid={`composite-domain-${domain.domain}`}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium text-gray-800">{domain.label}</h3>
                  <span className="text-xs text-gray-500">{statusLabel[domain.status] || domain.status}</span>
                </div>
                <p>{domain.summary}</p>
                <p className="text-xs text-gray-500">一致性：{domain.consistency}</p>
                {facetCoverage.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {facetCoverage.map((facet) => (
                      <span key={facet.facet} className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">
                        {facet.facet} · {facet.evidenceCount}
                      </span>
                    ))}
                  </div>
                )}
                {domain.caveats.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-700">
                    {domain.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
      </ReportSection>

      {isTeacher && report.observationPrompts && report.observationPrompts.length > 0 && (
        <ReportSection title="课堂观察线索" eyebrow="教师">
          <ul className="list-disc space-y-2 pl-5 text-sm text-gray-600" data-testid="composite-observation-prompts">
            {report.observationPrompts.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </ReportSection>
      )}

      {isResearcher && report.crossSourceFindings && report.crossSourceFindings.length > 0 && (
        <ReportSection title="跨来源描述性发现" eyebrow="科研" testId="composite-cross-source-findings">
          <div className="report-feedback-list">
            {report.crossSourceFindings.map((finding, index) => {
              const evidenceRefs = Array.isArray(finding.evidenceRefs) ? finding.evidenceRefs.map(String).join('、') : ''
              const availability = typeof finding.availability === 'string' ? finding.availability : ''
              const caveat = typeof finding.caveat === 'string' ? finding.caveat : ''
              return (
                <article key={`${String(finding.construct || 'finding')}-${index}`} className="report-feedback">
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>{String(finding.construct || '—')}</span>
                    <span>{String(finding.type || '—')}</span>
                    {availability && <span>{availability}</span>}
                  </div>
                  <p>{String(finding.summary || '')}</p>
                  {caveat && <p className="text-xs text-amber-700">{caveat}</p>}
                  {evidenceRefs && <p className="text-xs text-gray-400">Evidence refs：{evidenceRefs}</p>}
                </article>
              )
            })}
          </div>
        </ReportSection>
      )}

      {(report.recommendations.length > 0 || report.limitations.length > 0) && (
        <ReportSection title="建议与限制" eyebrow="下一步">
          {report.recommendations.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
              {report.recommendations.map((recommendation, index) => (
                <li key={`${recommendation.priority}-${index}`}>
                  <span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500" data-testid={`recommendation-priority-${index}`}>
                    {recommendationPriorityLabel[recommendation.priority] || recommendation.priority}
                  </span>
                  {recommendation.text}
                </li>
              ))}
            </ul>
          )}
          {report.limitations.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-700">
              {report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
          )}
        </ReportSection>
      )}

      {(isTeacher && report.sourceSummary) || (isResearcher && report.evidence) || isResearcher ? (
        <ReportDetails title="来源、证据与技术信息">
          {isTeacher && report.sourceSummary && (
            <section className="mb-5" data-testid="composite-source-summary">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">来源摘要</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="border-b text-left text-gray-500"><th className="py-2 pr-3">来源</th><th className="py-2 pr-3">任务槽位</th><th className="py-2 pr-3">任务类型</th><th className="py-2 pr-3">facet</th><th className="py-2 pr-3">角色</th><th className="py-2 pr-3">方向</th></tr></thead>
                  <tbody>{report.sourceSummary.map((source, index) => <tr key={`${source.slotKey || 'source'}-${index}`} className="border-b last:border-0"><td className="py-2 pr-3">{source.sourceType === 'self_report' ? '参与者自评' : '行为任务'}</td><td className="py-2 pr-3">{source.slotKey || '—'}</td><td className="py-2 pr-3">{source.taskType || '—'}</td><td className="py-2 pr-3">{source.facet || '—'}</td><td className="py-2 pr-3">{source.role === 'primary' ? '主要' : '支持'}</td><td className="py-2 pr-3">{source.directionClass}</td></tr>)}</tbody>
                </table>
              </div>
              {report.qualityFlags && report.qualityFlags.length > 0 && <p className="mt-3 text-xs text-amber-700">质量 flags：{report.qualityFlags.join('、')}</p>}
            </section>
          )}

          {isResearcher && report.evidence && (
            <section className="mb-5" data-testid="composite-evidence-refs">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">证据引用</h2>
              <div className="space-y-2">
                {report.evidence.map((evidence, index) => (
                  <div key={String(evidence.id || index)} className="report-feedback">
                    <span className="font-medium text-gray-800">{String(evidence.id || 'Evidence')}</span>
                    <span className="ml-2">{String(evidence.sourceType || '')}</span>
                    <span className="ml-2">{String(evidence.sourceResultId || '')}</span>
                    <span className="ml-2">{String(evidence.facet || evidence.construct || '')}</span>
                    <span className="ml-2">{String(evidence.directionClass || '')}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {isResearcher && (
            <section data-testid="composite-package-versions">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">版本信息</h2>
              <div className="grid gap-2 text-xs text-gray-500 md:grid-cols-2">
                <span>分析定义：{report.analysisDefinitionVersion}</span>
                <span>分析协议：{report.analysisProtocolKey} · {report.analysisProtocolVersion}</span>
                <span>分析版本：{report.analysisVersion}</span>
                <span>报告 schema：{report.reportSchemaVersion}</span>
                <span className="break-all md:col-span-2">输入 fingerprint：{report.inputFingerprint}</span>
              </div>
            </section>
          )}
        </ReportDetails>
      ) : null}
    </section>
  )
}

export default CompositePackageReport
