import {EducationApplicabilityFields,EducationApplicabilitySummary,useEducationApplicabilityDraft} from './EducationApplicabilityFields'
import { useEffect, useState } from 'react'
import { submissionStatusLabel, type SubmissionMetadata } from '../../api/scaleLibraryGovernance'
import { ScaleLibraryMediaPreview } from './ScaleLibraryMediaPreview'
import { useScaleLibrarySubmission } from './useScaleLibrarySubmission'

const labels: Record<keyof SubmissionMetadata, string> = { title: '量表名称', author: '作者 / 来源', copyright: '版权与授权依据', applicability: '用途与适用范围', scoringDescription: '计分说明', reportDescription: '报告说明' }
const empty: SubmissionMetadata = { title: '', author: '', copyright: '', applicability: '', scoringDescription: '', reportDescription: '' }
export function TrainingScaleLibrarySubmission({ sourceId }: { sourceId: string }) {
  const [expanded, setExpanded] = useState(false)
  return <section className="staff-panel staff-panel--padded p-6 mt-5"><h2 className="font-semibold">共用库申请与状态</h2><p>发布自用无需审批；申请入库需选择精确的已发布版本。</p><button type="button" className="hui-button hui-button--secondary" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>申请进入共用库 / 查看申请状态</button>{expanded && <TrainingScaleLibrarySubmissionDetails sourceId={sourceId}/>}</section>
}
function TrainingScaleLibrarySubmissionDetails({ sourceId }: { sourceId: string }) {
  const state = useScaleLibrarySubmission('TRAINING', sourceId)
  const [consentedManifest, setConsentedManifest] = useState('')
  const [open, setOpen] = useState(false), [releaseId, setReleaseId] = useState(''), [metadata, setMetadata] = useState<SubmissionMetadata>(empty), [reason, setReason] = useState('')
  useEffect(() => { if (state.source) setReleaseId(current => state.source?.releases.some(row => row.releaseId === current) ? current : '') }, [state.source])
  const applicability=useEducationApplicabilityDraft(JSON.stringify([sourceId,releaseId]))
  const release = state.source?.releases.find(row => row.releaseId === releaseId)
  const defaults = release?.defaults ?? (release && state.source?.releases.length === 1 ? state.source.defaults : empty)
  useEffect(() => { setMetadata({ ...empty, ...defaults }) }, [defaults])
  const manifest = release?.mediaManifest
  const mediaReady = Boolean(manifest?.schemaVersion === 1 && Array.isArray(manifest.items) && manifest.manifestHash && (!manifest.items.length || consentedManifest === manifest.manifestHash))
  useEffect(() => { setConsentedManifest('') }, [releaseId, manifest?.manifestHash])
  const duplicate = state.submissions.some(row => row.releaseId === releaseId && ['SUBMITTED', 'APPROVED'].includes(row.status))
  return <section className="staff-panel staff-panel--padded p-6 mt-5" aria-label="共用库申请">
    <h2 className="font-semibold">发布自用与共用库</h2>
    <p className="scale-edit-multiset-note">私有量表自行编辑、检查、发布，不需要入库审批。共用库收录另行申请精确的已发布版本；批准不代表全员可用，不改变自编量表类别，也不是科学有效性认证。入库版本由平台统一管理和授权，使用时仍校验目标入口的实际权限。</p>
    {state.error && <p role="alert">{state.error} <button type="button" className="hui-button hui-button--secondary" onClick={() => void state.refresh()} disabled={state.busy}>刷新核对</button></p>}
    {state.status && <p role="status">{state.status}</p>}
    {state.loading && <p role="status">正在读取已发布版本与申请状态…</p>}
    <button type="button" className="hui-button hui-button--secondary" onClick={() => setOpen(value => !value)} aria-expanded={open}>申请进入共用库</button>
    {open && <form onSubmit={event => { event.preventDefault(); if (release?.eligible && !duplicate && mediaReady && applicability.valid) { const consent=manifest?.items.length ? { manifestHash: manifest.manifestHash, shareWithAuthorizedUsers: true as const } : undefined; const request=applicability.value?state.submit(releaseId,metadata,consent,applicability.value):state.submit(releaseId,metadata,consent); void request?.then(ok=>{if(ok)applicability.clear()}) } }}>
      <fieldset disabled={state.loading || state.busy || !!state.error} className="space-y-3 mt-4"><legend>选择精确版本并补齐资料</legend>
        <label className="block">已发布版本<select className="input block w-full" value={releaseId} onChange={event => {if(applicability.confirmDiscard()){applicability.clear();setReleaseId(event.target.value)}}} required><option value="">请选择已发布版本</option>{state.source?.releases.map(row => <option key={row.releaseId} value={row.releaseId} disabled={!row.eligible}>{row.title} · v{row.version}{row.eligible ? '' : ' · ' + (row.unavailableReason || '不可申请')}</option>)}</select></label>
        {!state.loading && !state.source?.releases.length && <p>暂无可申请版本。请先完成发布自用。</p>}
        {release && <><p className="break-all">版本标识：{release.releaseId}。本申请不会随后续修订自动升级。</p><p>兼容入口：{release.supportedEntrypoints?.join('、') || '尚未确认'}</p>{Object.entries(release.compatibilityReasons || {}).map(([entry, reason]) => <p key={entry}>{entry}：{reason}</p>)}</>}
        {release && <section aria-label="随版本申请的附件" className="border rounded p-3 space-y-2"><h3>关联图片与视频</h3><p>附件随精确量表版本一起申请、一次审核；批准后进入平台受控公共媒体库，仅供获授权使用，不生成匿名公开链接。退回或撤回申请不会发布附件，原作者后续修改或删除不覆盖批准版及旧问卷。</p>{!manifest ? <p role="alert">附件清单尚未确认，请刷新后再申请。</p> : <><p className="break-all">固定清单摘要：{manifest.manifestHash}</p>{!manifest.items.length && <p>此精确版本没有关联托管媒体。</p>}{manifest.items.map(item => <article key={item.assetId + item.assetVersion} className="border rounded p-3"><p className="break-all">{item.assetId} · {item.mimeType} · {item.sizeBytes} 字节 · 版本 {item.assetVersion}</p><p className="break-all">内容摘要：{item.contentHash}</p><p>用途：{item.usages.join('、')}。共享权限：仅随此批准量表供获授权使用者 / 对应任务使用，不允许脱离量表独立复用。</p><ScaleLibraryMediaPreview product="TRAINING" context={{ kind: 'sources', id: sourceId, releaseId }} item={item}/></article>)}{manifest.items.length > 0 && <label><input type="checkbox" checked={consentedManifest === manifest.manifestHash} onChange={event => setConsentedManifest(event.target.checked ? manifest.manifestHash : '')}/>确认我有权将以上固定版本附件随量表提交审核，并在批准后仅随此量表供获授权使用者 / 对应任务使用，不独立复用</label>}</>}</section>}
        {(Object.keys(labels) as (keyof SubmissionMetadata)[]).map(key => <label key={key} className="block">{labels[key]}{defaults[key]?.trim() ? '（沿用已有资料）' : '（请补充）'}<textarea className="input block w-full" required disabled={!release} value={metadata[key]} readOnly={Boolean(defaults[key]?.trim())} onChange={event => setMetadata(current => ({ ...current, [key]: event.target.value }))}/></label>)}
        <EducationApplicabilityFields product="TRAINING" rows={applicability.rows} onChange={applicability.setRows} valid={applicability.valid} disabled={!release||duplicate}/>
        {duplicate && <p role="status">此精确版本已提交或获准，请查看下方状态，不要重复申请。</p>}
        <button type="submit" className="hui-button hui-button--primary" disabled={!release?.eligible || !mediaReady || duplicate || !applicability.valid || Object.values(metadata).some(value => !value.trim())}>提交入库申请</button>
      </fieldset>
    </form>}
    {state.submissions.length > 0 && <div className="mt-4 space-y-3"><h3 className="font-semibold">申请记录</h3>{state.submissions.map(row => <article key={row.id} className="border rounded p-3"><p>{row.metadata.title} · {submissionStatusLabel[row.status]}</p><p className="break-all text-sm">精确版本：{state.source?.releases.find(release => release.releaseId === row.releaseId)?.version || row.releaseId}</p><EducationApplicabilitySummary value={row.educationApplicability} hash={row.educationApplicabilityHash}/>{row.reason && <p>审核 / 撤回说明：{row.reason}</p>}{row.status === 'SUBMITTED' && <><label>撤回说明<input className="input block" value={reason} onChange={event => setReason(event.target.value)}/></label><button type="button" className="hui-button hui-button--secondary" disabled={state.busy || !reason.trim()} onClick={() => void state.withdraw(row, reason.trim())}>撤回申请</button></>}</article>)}</div>}
  </section>
}
