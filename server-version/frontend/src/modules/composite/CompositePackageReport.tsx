import React from 'react'
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
    <section className="space-y-4" data-testid="composite-package-report">
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">报告包范围</p>
            <h2 className="text-xl font-semibold text-gray-800 mt-1">{report.packageName}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {report.packageKey} · {report.packageVersion} · {report.profile === 'research' ? '科研 Profile' : '标准 Profile'}
            </p>
          </div>
          {(isTeacher || isResearcher) && report.snapshotId && (
            <div className="text-right text-xs text-gray-500">
              <p>Snapshot：{report.snapshotId}</p>
              {report.snapshotCreatedAt && <p>{new Date(report.snapshotCreatedAt).toLocaleString('zh-CN')}</p>}
              {report.generationReason && <p>{report.generationReason === 'COMPLETION' ? '完成时生成' : '管理员重新分析'}</p>}
            </div>
          )}
        </div>
        {isResearcher && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-500" data-testid="composite-package-versions">
            <span>分析定义：{report.analysisDefinitionVersion}</span>
            <span>分析协议：{report.analysisProtocolKey} · {report.analysisProtocolVersion}</span>
            <span>分析版本：{report.analysisVersion}</span>
            <span>报告 schema：{report.reportSchemaVersion}</span>
            <span className="md:col-span-2 break-all">输入 fingerprint：{report.inputFingerprint}</span>
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">数据质量</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg bg-gray-50 p-3"><span className="text-gray-500">可解释任务</span><strong className="block text-gray-800 mt-1">{report.qualitySummary.interpretableModules}</strong></div>
          <div className="rounded-lg bg-gray-50 p-3"><span className="text-gray-500">排除任务</span><strong className="block text-gray-800 mt-1">{report.qualitySummary.excludedModules.length}</strong></div>
          <div className="rounded-lg bg-gray-50 p-3"><span className="text-gray-500">质量提示</span><strong className="block text-gray-800 mt-1">{report.qualitySummary.warnings.length}</strong></div>
        </div>
        {report.qualitySummary.warnings.length > 0 && <ul className="mt-3 list-disc list-inside text-sm text-amber-700 space-y-1">{report.qualitySummary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Domain 与 facet 覆盖</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {report.cognitiveDomains.map((domain) => {
            const facetCoverage = facetCoverageFor(domain)
            return (
              <article key={domain.domain} className="rounded-lg border border-gray-100 p-4" data-testid={`composite-domain-${domain.domain}`}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium text-gray-800">{domain.label}</h3>
                  <span className="text-xs text-gray-500">{statusLabel[domain.status] || domain.status}</span>
                </div>
                <p className="text-sm text-gray-600 mt-2">{domain.summary}</p>
                <p className="text-xs text-gray-500 mt-2">一致性：{domain.consistency}</p>
                {facetCoverage.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {facetCoverage.map((facet) => <span key={facet.facet} className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">{facet.facet} · {facet.evidenceCount}</span>)}
                  </div>
                )}
                {domain.caveats.length > 0 && <ul className="mt-3 list-disc list-inside text-xs text-amber-700 space-y-1">{domain.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>}
              </article>
            )
          })}
        </div>
      </div>

      {isTeacher && report.sourceSummary && (
        <div className="card p-6" data-testid="composite-source-summary">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">来源摘要</h2>
          <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="text-left text-gray-500 border-b"><th className="py-2 pr-3">来源</th><th className="py-2 pr-3">任务槽位</th><th className="py-2 pr-3">任务类型</th><th className="py-2 pr-3">facet</th><th className="py-2 pr-3">角色</th><th className="py-2 pr-3">方向</th></tr></thead><tbody>{report.sourceSummary.map((source, index) => <tr key={`${source.slotKey || 'source'}-${index}`} className="border-b last:border-0"><td className="py-2 pr-3">{source.sourceType === 'self_report' ? '参与者自评' : '行为任务'}</td><td className="py-2 pr-3">{source.slotKey || '—'}</td><td className="py-2 pr-3">{source.taskType || '—'}</td><td className="py-2 pr-3">{source.facet || '—'}</td><td className="py-2 pr-3">{source.role === 'primary' ? '主要' : '支持'}</td><td className="py-2 pr-3">{source.directionClass}</td></tr>)}</tbody></table></div>
          {report.qualityFlags && report.qualityFlags.length > 0 && <p className="mt-3 text-xs text-amber-700">质量 flags：{report.qualityFlags.join('、')}</p>}
        </div>
      )}

      {isTeacher && report.observationPrompts && report.observationPrompts.length > 0 && (
        <div className="card p-6" data-testid="composite-observation-prompts">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">课堂观察线索</h2>
          <ul className="list-disc list-inside text-sm text-gray-600 space-y-2">{report.observationPrompts.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}

      {isResearcher && report.evidence && (
        <div className="card p-6" data-testid="composite-evidence-refs">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">证据引用</h2>
          <div className="space-y-2">{report.evidence.map((evidence, index) => <div key={String(evidence.id || index)} className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600"><span className="font-medium text-gray-800">{String(evidence.id || 'Evidence')}</span><span className="ml-2">{String(evidence.sourceType || '')}</span><span className="ml-2">{String(evidence.sourceResultId || '')}</span><span className="ml-2">{String(evidence.facet || evidence.construct || '')}</span><span className="ml-2">{String(evidence.directionClass || '')}</span></div>)}</div>
        </div>
      )}

      {isResearcher && report.crossSourceFindings && report.crossSourceFindings.length > 0 && (
        <div className="card p-6" data-testid="composite-cross-source-findings">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">跨来源描述性发现</h2>
          <div className="space-y-3">
            {report.crossSourceFindings.map((finding, index) => {
              const evidenceRefs = Array.isArray(finding.evidenceRefs)
                ? finding.evidenceRefs.map(String).join('、')
                : ''
              const availability = typeof finding.availability === 'string' ? finding.availability : ''
              const caveat = typeof finding.caveat === 'string' ? finding.caveat : ''
              return (
                <article key={`${String(finding.construct || 'finding')}-${index}`} className="rounded-lg border border-gray-100 p-4 text-sm text-gray-600">
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                    <span>{String(finding.construct || '—')}</span>
                    <span>{String(finding.type || '—')}</span>
                    {availability && <span>{availability}</span>}
                  </div>
                  <p className="mt-2">{String(finding.summary || '')}</p>
                  {caveat && <p className="mt-2 text-xs text-amber-700">{caveat}</p>}
                  {evidenceRefs && <p className="mt-2 text-xs text-gray-400">Evidence refs：{evidenceRefs}</p>}
                </article>
              )
            })}
          </div>
        </div>
      )}

      {(report.recommendations.length > 0 || report.limitations.length > 0) && <div className="card p-6"><h2 className="text-lg font-semibold text-gray-800 mb-3">建议与限制</h2>{report.recommendations.length > 0 && <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">{report.recommendations.map((recommendation, index) => <li key={`${recommendation.priority}-${index}`}><span className="mr-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500" data-testid={`recommendation-priority-${index}`}>{recommendationPriorityLabel[recommendation.priority] || recommendation.priority}</span>{recommendation.text}</li>)}</ul>}{report.limitations.length > 0 && <ul className="mt-3 list-disc list-inside text-sm text-amber-700 space-y-1">{report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>}</div>}
    </section>
  )
}

export default CompositePackageReport
