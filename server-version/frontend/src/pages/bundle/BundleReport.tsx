import React, { useRef, useState } from 'react'
import api from '../../api/client'
export type BundleReportData = {
  schemaVersion: number; snapshotFamily: string; analysisId: string; status: string; purpose: string;
  factsHash: string|null; definitionHash: string; retryCount: number;
  reportDefinition: { title: string; sections: Record<string,string> }; view: any
}
export default function BundleReport({ report, attemptId, staff, recoveryToken, reload }: {
  report: BundleReportData; attemptId: string; staff: boolean; recoveryToken?: string; reload: ()=>void
}) {
  const [history,setHistory] = useState<any[]>([]), [error,setError] = useState(''), [busy,setBusy] = useState(false)
  const requestIdentity=useRef({payload:'',id:''})
  const [target,setTarget] = useState(''), [version,setVersion] = useState(''), [reason,setReason] = useState('')
  async function call(path:string, body?:unknown) {
    const res=body===undefined?await api.get<any>(path):await api.post<any>(path,body)
    if(res.code!==0)throw new Error(res.message); return res.data
  }
  async function retry() {
    setBusy(true)
    try {
      if(staff)await call('/bundle-products/attempts/'+attemptId+'/retry',{analysisId:report.analysisId})
      else if(recoveryToken) { const response=await api.post('/public/composite-assessments/attempts/'+attemptId+'/bundle-retry',{}, {headers:{'X-Recovery-Token':recoveryToken}}); if(response.code!==0)throw new Error(response.message) }
      else await call('/composite-assessments/attempts/'+attemptId+'/bundle-retry',{})
      reload()
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  async function reanalyze() {
    setBusy(true)
    try {
      const payload={targetBundleKey:target,targetBundleVersion:version,reason,previousAnalysisId:report.analysisId}
      const fingerprint=JSON.stringify(payload)
      if(requestIdentity.current.payload!==fingerprint)requestIdentity.current={payload:fingerprint,id:crypto.randomUUID()}
      const next=await call('/bundle-products/attempts/'+attemptId+'/reanalyze',{...payload,requestId:requestIdentity.current.id})
      setHistory(await call('/bundle-products/attempts/'+attemptId+'/history'))
      window.location.search='?snapshotId='+next.analysisId
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  async function download() {
    try {
      // Fetch the same authorized server projection; never reconstruct facts in the browser.
      let data
      if(staff) data=await call('/bundle-products/attempts/'+attemptId+'/report?analysisId='+report.analysisId)
      else {
        const response=await (recoveryToken?api.get<any>('/public/composite-assessments/attempts/'+attemptId+'/report',{headers:{'X-Recovery-Token':recoveryToken}})
          :api.get<any>('/composite-assessments/attempts/'+attemptId+'/report'))
        if(response.code!==0)throw new Error(response.message)
        data=response.data.bundleReport
      }
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}))
      const link=document.createElement('a');link.href=url;link.download='bundle-report.json';link.click();URL.revokeObjectURL(url)
    }catch(e:any){setError(e.message)}
  }
  const view=report.view
  const qualityLabels:Record<string,string>={interpretable:'可解释',limited:'仅支持有限解释',invalid:'结果无效',unavailable:'证据不足或未获披露授权'}
  const summaryLabels:Record<string,string>={complementary_descriptive:'不同方法提供互补的描述性证据；不能据此判断一致、分歧、异常或诊断。',insufficient_quality:'部分证据质量不足，只能在限制范围内阅读结果。',age_rejected:'不符合本测评包的适用年龄。',missing_sources:'缺少形成综合结果所需的来源。'}
  return <section className="card p-6 space-y-3 break-words" aria-label="Bundle 综合报告">
    <h2 className="text-xl font-semibold">{report.reportDefinition.title}</h2>
    {error && <p role="alert">{error}</p>}
    {report.status==='PENDING' && <p>综合报告尚未生成，单项作答已保存。</p>}
    {report.status==='FAILED' && <p>综合报告生成遇到技术问题，已完成作答不受影响，可重试生成。</p>}
    {report.status==='UNAVAILABLE' && <p>现有证据不足以形成可支持的综合结论，请阅读限制说明。</p>}
    {['PENDING','FAILED'].includes(report.status) && <button disabled={busy||report.retryCount>=5} onClick={()=>void retry()}>重试生成报告</button>}
    {view && <><p>{view.identity?.bundleKey} · {view.identity?.bundleVersion}</p>
      <h3 className="text-lg font-semibold">{report.reportDefinition.sections.summary}</h3><p>{summaryLabels[view.engineSummary?.domainStatus] || view.engineSummary?.reportingMode || view.engineSummary?.reason || '请结合各项证据和解释范围阅读。'}</p>
      <h3 className="text-lg font-semibold">{report.reportDefinition.sections.quality}</h3><p>{qualityLabels[view.quality?.overall] || '暂无质量信息'}</p>
      <h3 className="text-lg font-semibold">{report.reportDefinition.sections.evidence}</h3>
      <ul>{view.evidence?.filter((v:any)=>v.sourceKind!=='CONTEXT_FACT').map((v:any)=><li key={v.evidenceKey}>{v.constructKey}：{v.value?.state==='present'?String(v.value.value):'暂无可展示结果'}（{{interpretable:'可解释',limited:'有限解释',invalid:'无效',unavailable:'不可用'}[v.quality as string] || v.quality}）</li>)}</ul>
      <h3 className="text-lg font-semibold">{report.reportDefinition.sections.limitations}</h3><ul>{view.limitations?.map((v:string)=><li key={v}>{v}</li>)}</ul>
      <button onClick={()=>void download()}>导出综合报告 JSON</button>
    </>}
    {staff && <details><summary>分析历史与显式重分析</summary>
      <button onClick={()=>void call('/bundle-products/attempts/'+attemptId+'/history').then(setHistory).catch(e=>setError(e.message))}>读取历史</button>
      {history.map(v=><p key={v.id}><a href={'?snapshotId='+v.id}>{v.createdAt} · {v.status} · {v.purpose}</a></p>)}
      <label className="block mt-3">目标包标识<input className="input w-full" value={target} onChange={e=>setTarget(e.target.value)} /></label>
      <label className="block mt-3">精确版本<input className="input w-full" value={version} onChange={e=>setVersion(e.target.value)} /></label>
      <label className="block mt-3">重分析原因<input className="input w-full" value={reason} onChange={e=>setReason(e.target.value)} /></label>
      <p>重分析使用已有冻结结果，追加历史，不改变原报告或单项评分。</p>
      <button disabled={busy||!target||!version||!reason||!view} onClick={()=>void reanalyze()}>追加重分析</button>
    </details>}
  </section>
}
