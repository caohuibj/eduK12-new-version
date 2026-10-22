import { useEffect, useState } from 'react'
import { ScaleLibraryMediaPreview } from '../components/scale-governance/ScaleLibraryMediaPreview'
import { useScaleLibrarySubmission } from '../components/scale-governance/useScaleLibrarySubmission'
import { submissionStatusLabel, type SubmissionMetadata } from '../api/scaleLibraryGovernance'

const fields:{key:keyof SubmissionMetadata;label:string}[]=[
  {key:'title',label:'量表名称'},{key:'author',label:'作者/来源'},
  {key:'copyright',label:'版权与共享许可'},{key:'applicability',label:'用途与适用范围'},
  {key:'scoringDescription',label:'计分说明'},{key:'reportDescription',label:'报告说明'},
]
export function SurveyScaleLibrarySubmission({sourceId,initialReleaseId='',onBusyChange}:{sourceId:string;initialReleaseId?:string;onBusyChange?:(busy:boolean)=>void}){
  const {source,submissions,loading,busy,error,status,refresh,submit,withdraw}=useScaleLibrarySubmission('SURVEY',sourceId)
  const [releaseId,setReleaseId]=useState(initialReleaseId),[supplement,setSupplement]=useState<Partial<SubmissionMetadata>>({})
  const [mediaConsentKey,setMediaConsentKey]=useState('')
  useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false)},[busy,onBusyChange])
  const [withdrawReasons,setWithdrawReasons]=useState<Record<string,string>>({})
  const release=source?.releases.find(row=>row.releaseId===releaseId)
  const manifest=release?.mediaManifest
  const manifestReady=manifest?.schemaVersion===1&&Array.isArray(manifest.items)&&!!manifest.manifestHash
  const consentKey=release&&manifestReady?release.releaseId+':'+manifest.manifestHash:''
  const needsMediaConsent=!!manifest?.items.length
  const mediaReady=manifestReady&&(!needsMediaConsent||mediaConsentKey===consentKey)
  const defaults=release?(release.defaults??(source?.releases.length===1?source.defaults:undefined)):undefined
  const metadata=Object.fromEntries(fields.map(({key})=>[key,defaults?.[key]?.trim()||supplement[key]||''])) as SubmissionMetadata
  const complete=fields.every(({key})=>!!metadata[key].trim())
  const alreadySubmitted=submissions.some(row=>row.releaseId===releaseId&&['SUBMITTED','APPROVED'].includes(row.status))
  return <section aria-label="申请进入共用库" className="border border-sky-200 rounded-xl bg-white p-4 space-y-3">
    <h3 className="font-semibold text-sky-900">申请进入共用库</h3>
    <p className="text-sm text-slate-600">自用发布与共用库审核分开。这里只申请一个已发布的精确版本，不提交当前未保存草稿。批准入库不代表全员可用，也不代表标准科学量表；后续使用仍需明确授权；入库版本由平台统一管理和授权，使用时校验目标入口实际权限。</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {status&&<p role="status" className="text-sky-800">{status}</p>}
    <button className="btn-secondary" type="button" disabled={loading||busy} onClick={()=>void refresh()}>刷新发布版本与申请</button>
    {loading&&<p role="status">正在读取精确发布版本…</p>}
    {source&&<form onSubmit={event=>{event.preventDefault();if(release?.eligible&&complete&&!alreadySubmitted&&mediaReady&&!busy&&!loading&&!error){
      if(needsMediaConsent&&manifest)void submit(releaseId,metadata,{manifestHash:manifest.manifestHash,shareWithAuthorizedUsers:true})
      else void submit(releaseId,metadata)
    }}}>
      <fieldset disabled={busy||loading||!!error} className="space-y-3">
        <label className="block text-sm">申请的测量发布版本
          <select className="input block w-full" value={releaseId} onChange={event=>{setReleaseId(event.target.value);setSupplement({});setMediaConsentKey('')}}>
            <option value="">请选择精确版本</option>
            {source.releases.map(row=><option key={row.releaseId} value={row.releaseId} disabled={!row.eligible}>{row.title} · {row.version}{row.eligible?'':' · 不可申请'}</option>)}
          </select>
        </label>
        {!source.releases.length&&<p>尚无已发布版本，请先在上方发布测量版本。</p>}
        {source.releases.filter(row=>!row.eligible).map(row=><p key={row.releaseId} className="text-sm">{row.version}：{row.unavailableReason||'此版本当前不可申请'}</p>)}
        {release&&<><p className="text-xs break-all">版本标识：{release.releaseId} · 内容摘要：{release.contentHash}</p><p className="text-sm">兼容入口：{release.supportedEntrypoints?.join('、')||'尚未确认'}</p>{Object.entries(release.compatibilityReasons||{}).map(([entry,reason])=><p className="text-sm" key={entry}>{entry}：{reason}</p>)}</>}
        {release&&<section aria-label="随版本申请的图片与视频" className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-3">
          <h4 className="font-semibold text-sky-900">随此精确版本申请的图片与视频</h4>
          {!manifestReady&&<p role="alert">此版本的媒体清单尚未确认，暂不能提交。请刷新后核对。</p>}
          {manifestReady&&manifest&&<>
            <p className="text-xs break-all">清单摘要：{manifest.manifestHash}</p>
            {!manifest.items.length&&<p className="text-sm">此版本无关联图片或视频。</p>}
            <ul className="space-y-3">{manifest.items.map(item=><li key={item.assetId+':'+item.assetVersion} className="rounded-lg border bg-white p-3 space-y-2">
              <p className="text-sm break-all">附件：{item.assetId} · 版本 {item.assetVersion}</p>
              <p className="text-xs">{item.mimeType} · {item.sizeBytes.toLocaleString()} 字节</p>
              <p className="text-xs break-all">内容摘要：{item.contentHash}</p>
              <p className="text-sm">用途：{item.usages.length?item.usages.join('、'):'未标注'}</p>
              <p className="text-sm">共享范围：{item.rights==='AUTHOR_SHARED_FOR_BOUND_SCALE'?'仅随此批准量表供获授权使用者/对应任务使用，不允许脱离量表独立复用':'共享权限尚未确认'}</p>
              {item.dependencyReleaseIds.length>0&&<p className="text-xs break-all">关联版本：{item.dependencyReleaseIds.join('、')}</p>}
              <ScaleLibraryMediaPreview product="SURVEY" context={{kind:'sources',id:sourceId,releaseId:release.releaseId}} item={item}/>
            </li>)}</ul>
            {needsMediaConsent&&<label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={mediaConsentKey===consentKey} onChange={event=>setMediaConsentKey(event.target.checked?consentKey:'')}/>
              我确认有权将清单中的图片与视频随此精确版本一并申请共享。批准后进入平台受控公共媒体库，仅随此批准量表供获授权使用者/对应任务使用，不允许脱离量表独立复用，不生成匿名公开链接；退回或撤回不入库。
            </label>}
          </>}
        </section>}
        <p className="text-sm">已有来源资料沿用且只读；仅补充缺失内容。</p>
        {fields.map(({key,label})=><label key={key} className="block text-sm">{label}
          <textarea className="input block w-full" required maxLength={4000} disabled={!release} readOnly={!!defaults?.[key]?.trim()}
            value={metadata[key]} onChange={event=>setSupplement(value=>({...value,[key]:event.target.value}))}/>
        </label>)}
        {alreadySubmitted&&<p>此精确版本已有待审核或已批准的申请，不重复提交。</p>}
        <button className="btn-primary" type="submit" disabled={!release?.eligible||!complete||alreadySubmitted||!mediaReady}>提交此版本的入库申请</button>
      </fieldset>
    </form>}
    <ul className="space-y-3" aria-label="共用库申请记录">
      {submissions.map(row=><li key={row.id} className="border rounded-lg p-3 space-y-2">
        <p>{row.metadata.title} · {submissionStatusLabel[row.status]}</p>
        <p className="text-xs break-all">精确版本：{row.releaseId}</p>
        {row.reason&&<p className="text-sm">处理说明：{row.reason}</p>}
        {row.status==='SUBMITTED'&&<div className="space-y-2">
          <label className="block text-sm">撤回说明<input className="input block w-full" maxLength={4000} value={withdrawReasons[row.id]||''} onChange={event=>setWithdrawReasons(value=>({...value,[row.id]:event.target.value}))}/></label>
          <button type="button" className="btn-secondary" disabled={busy||loading||!withdrawReasons[row.id]?.trim()} onClick={()=>void withdraw(row,withdrawReasons[row.id].trim())}>撤回申请</button>
        </div>}
      </li>)}
    </ul>
  </section>
}
