import React, { useRef, useState } from 'react'
import api from '../../api/client'
import { ProductButton, ProductStatus } from '../../components/product-ui'
import { ReportCoreSummary, ReportDetails, ReportSection } from '../../modules/reporting/ReportPrimitives'

export type BundleReportData = {
  schemaVersion: number
  snapshotFamily: string
  analysisId: string
  status: string
  purpose: string
  factsHash: string | null
  definitionHash: string
  retryCount: number
  reportDefinition: { title: string; sections: Record<string, string> }
  view: any
}

export default function BundleReport({ report, attemptId, staff, recoveryToken, reload }: {
  report: BundleReportData
  attemptId: string
  staff: boolean
  recoveryToken?: string
  reload: () => void
}) {
  const [history, setHistory] = useState<any[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const requestIdentity = useRef({ payload: '', id: '' })
  const [target, setTarget] = useState('')
  const [version, setVersion] = useState('')
  const [reason, setReason] = useState('')

  async function call(path: string, body?: unknown) {
    const res = body === undefined ? await api.get<any>(path) : await api.post<any>(path, body)
    if (res.code !== 0) throw new Error(res.message)
    return res.data
  }

  async function retry() {
    setBusy(true)
    try {
      if (staff) await call('/bundle-products/attempts/' + attemptId + '/retry', { analysisId: report.analysisId })
      else if (recoveryToken) {
        const response = await api.post('/public/composite-assessments/attempts/' + attemptId + '/bundle-retry', {}, { headers: { 'X-Recovery-Token': recoveryToken } })
        if (response.code !== 0) throw new Error(response.message)
      } else await call('/composite-assessments/attempts/' + attemptId + '/bundle-retry', {})
      reload()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function reanalyze() {
    setBusy(true)
    try {
      const payload = { targetBundleKey: target, targetBundleVersion: version, reason, previousAnalysisId: report.analysisId }
      const fingerprint = JSON.stringify(payload)
      if (requestIdentity.current.payload !== fingerprint) requestIdentity.current = { payload: fingerprint, id: crypto.randomUUID() }
      const next = await call('/bundle-products/attempts/' + attemptId + '/reanalyze', { ...payload, requestId: requestIdentity.current.id })
      setHistory(await call('/bundle-products/attempts/' + attemptId + '/history'))
      window.location.search = '?snapshotId=' + next.analysisId
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    try {
      // Fetch the same authorized server projection; never reconstruct facts in the browser.
      let data
      if (staff) data = await call('/bundle-products/attempts/' + attemptId + '/report?analysisId=' + report.analysisId)
      else {
        const response = await (recoveryToken
          ? api.get<any>('/public/composite-assessments/attempts/' + attemptId + '/report', { headers: { 'X-Recovery-Token': recoveryToken } })
          : api.get<any>('/composite-assessments/attempts/' + attemptId + '/report'))
        if (response.code !== 0) throw new Error(response.message)
        data = response.data.bundleReport
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'bundle-report.json'
      link.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const view = report.view
  const qualityLabels: Record<string, string> = {
    interpretable: '可解释',
    limited: '仅支持有限解释',
    invalid: '结果无效',
    unavailable: '证据不足或未获披露授权',
  }
  const summaryLabels: Record<string, string> = {
    complementary_descriptive: '不同方法提供互补的描述性证据；不能据此判断一致、分歧、异常或诊断。',
    insufficient_quality: '部分证据质量不足，只能在限制范围内阅读结果。',
    age_rejected: '不符合本测评包的适用年龄。',
    missing_sources: '缺少形成综合结果所需的来源。',
  }

  return (
    <section className="space-y-5 break-words" aria-label="Bundle 综合报告">
      <ReportCoreSummary label="Bundle 综合报告">
        <div>
          <h2 className="text-xl font-semibold">{report.reportDefinition.title}</h2>
          {view?.identity && <p className="mt-1 text-sm font-normal text-gray-600">{view.identity.bundleKey} · {view.identity.bundleVersion}</p>}
        </div>
      </ReportCoreSummary>

      {error && <ProductStatus kind="error" title="报告操作失败">{error}</ProductStatus>}
      {report.status === 'PENDING' && <ProductStatus kind="pending" title="综合报告尚未生成">单项作答已保存。</ProductStatus>}
      {report.status === 'FAILED' && <ProductStatus kind="error" title="综合报告生成遇到技术问题">已完成作答不受影响，可重试生成。</ProductStatus>}
      {report.status === 'UNAVAILABLE' && <ProductStatus kind="warning" title="当前无法形成综合结论">现有证据不足以形成可支持的综合结论，请阅读限制说明。</ProductStatus>}
      {['PENDING', 'FAILED'].includes(report.status) && (
        <div data-report-screen-only><ProductButton disabled={busy || report.retryCount >= 5} onClick={() => void retry()}>重试生成报告</ProductButton></div>
      )}

      {view && (
        <>
          <ReportCoreSummary label={report.reportDefinition.sections.summary || '结果概览'}>
            <p className="text-sm font-normal">
              {summaryLabels[view.engineSummary?.domainStatus] || view.engineSummary?.reportingMode || view.engineSummary?.reason || '请结合各项证据和解释范围阅读。'}
            </p>
          </ReportCoreSummary>

          <ReportSection title={report.reportDefinition.sections.quality || '数据质量'} eyebrow="解释前提">
            <p className="text-sm text-gray-700">{qualityLabels[view.quality?.overall] || '暂无质量信息'}</p>
          </ReportSection>

          <ReportSection title={report.reportDefinition.sections.evidence || '证据'} eyebrow="冻结结果">
            <ul className="space-y-2 text-sm text-gray-700">
              {view.evidence?.filter((value: any) => value.sourceKind !== 'CONTEXT_FACT').map((value: any) => (
                <li key={value.evidenceKey} className="report-feedback">
                  <strong>{value.constructKey}</strong>：{value.value?.state === 'present' ? String(value.value.value) : '暂无可展示结果'}
                  （{{ interpretable: '可解释', limited: '有限解释', invalid: '无效', unavailable: '不可用' }[value.quality as string] || value.quality}）
                </li>
              ))}
            </ul>
          </ReportSection>

          {view.limitations?.length > 0 && (
            <ReportSection title={report.reportDefinition.sections.limitations || '限制'} eyebrow="阅读限制">
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
                {view.limitations.map((value: string) => <li key={value}>{value}</li>)}
              </ul>
            </ReportSection>
          )}

          {view.declarativeState && <ReportCoreSummary label="报告状态"><p className="text-sm font-normal">{view.declarativeState}</p></ReportCoreSummary>}

          {view.blocks?.map((block: any) => ['evidence', 'conclusions', 'limitations'].includes(block.kind)
            ? (
              <ReportSection key={block.blockId} title={block.title || '报告区段'}>
                {block.conclusions?.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">{block.conclusions.map((item: any) => <li key={item.ruleId}>{item.text}</li>)}</ul>}
                {block.evidence?.length > 0 && <ul className="mt-2 space-y-1 text-sm text-gray-700">{block.evidence.map((item: any) => <li key={item.evidenceKey}>{item.constructKey}：{item.value?.state === 'present' ? String(item.value.value) : '暂无可展示结果'}</li>)}</ul>}
                {block.limitations?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">{block.limitations.map((text: string) => <li key={text}>{text}</li>)}</ul>}
              </ReportSection>
            )
            : <ProductStatus kind="error" title="报告结构不受支持" key={block.blockId}>请联系管理员。</ProductStatus>)}

          <div data-report-screen-only>
            <ProductButton onClick={() => void download()}>导出综合报告 JSON</ProductButton>
          </div>
        </>
      )}

      {staff && (
        <ReportDetails title="分析历史与显式重分析">
          <ProductButton onClick={() => void call('/bundle-products/attempts/' + attemptId + '/history').then(setHistory).catch(e => setError(e.message))}>读取历史</ProductButton>
          <div className="mt-3 space-y-1">
            {history.map(value => <p key={value.id}><a href={'?snapshotId=' + value.id}>{value.createdAt} · {value.status} · {value.purpose}</a></p>)}
          </div>
          <label className="block mt-3">目标包标识<input className="input w-full" value={target} onChange={e => setTarget(e.target.value)} /></label>
          <label className="block mt-3">精确版本<input className="input w-full" value={version} onChange={e => setVersion(e.target.value)} /></label>
          <label className="block mt-3">重分析原因<input className="input w-full" value={reason} onChange={e => setReason(e.target.value)} /></label>
          <p className="mt-2">重分析使用已有冻结结果，追加历史，不改变原报告或单项评分。</p>
          <ProductButton disabled={busy || !target || !version || !reason || !view} onClick={() => void reanalyze()}>追加重分析</ProductButton>
        </ReportDetails>
      )}
    </section>
  )
}
