import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Download, FileArchive, FileSpreadsheet, ShieldCheck, X } from 'lucide-react'
import ModalSurface from '../../components/shared-ui/ModalSurface'
import { sessionFetch } from '../../api/client'
import { compositeApi } from '../../modules/composite/api'
import { assertExportDownload, clearExportIntentKey, ExportJobFailedError, requestExportIntent, triggerExportDownload, waitForExportArtifacts } from '../../utils/exportJobs'
import './training-questionnaire-list.css'

type Row = { id: string; name: string; kind: string; status: string; editHref: string }

export default function AssessmentDataExport({ row, actorId, onClose, course }: { row: Row; actorId: string; onClose: () => void; course?: { id: string; title: string } }) {
 const [format, setFormat] = useState<'csv'|'zip'>('csv')
 const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('')
 const pending = useRef(false), alive = useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const close = () => { if (!pending.current) onClose() }
 async function run() {
  if (pending.current) return
  pending.current=true;setBusy(true);setError('');setNotice('正在提交导出…')
  const scope=`training-list:${actorId}:${row.id}:summary:${format}:anonymized${course ? ':'+course.id : ''}`
  try {
   const response=await requestExportIntent(scope,key=>compositeApi.exportData(row.id,{detail:'summary',format,anonymize:true,...(course ? {courseId:course.id} : {})},key))
   if (!alive.current) return
   if(response.code!==0||!response.data?.artifacts)throw Error(response.message||'导出失败')
   setNotice('导出已受理，正在生成文件，请稍候。')
   const [artifact]=await waitForExportArtifacts(response.data.artifacts)
   if (!alive.current) return
   const download=await sessionFetch(artifact.downloadUrl,{signal:AbortSignal.timeout(60000)})
   assertExportDownload(download)
   const blob=await download.blob()
   if (!alive.current) return
   triggerExportDownload(blob,artifact.fileName);clearExportIntentKey(scope)
   setNotice('已请求下载，请查看浏览器下载列表。')
  } catch(cause) {
   if (!alive.current) return
   if(cause instanceof ExportJobFailedError)clearExportIntentKey(scope)
   setNotice('');setError(cause instanceof Error ? cause.message : '导出失败，请重试。')
  } finally { pending.current=false;if(alive.current)setBusy(false) }
 }
 return <ModalSurface open onClose={close} className="tql-modal-surface"><section className="tql-export-dialog" role="dialog" aria-modal="true" aria-labelledby="tql-export-title" aria-describedby="tql-export-description" tabIndex={-1} aria-busy={busy}>
  <header><span className="tql-export-icon"><Download size={22} aria-hidden="true"/></span><div><small>数据与分析</small><h2 id="tql-export-title">导出脱敏摘要</h2></div><button type="button" disabled={busy} onClick={close} aria-label="关闭数据导出"><X size={20}/></button></header>
  <p className="tql-export-name">{row.name}</p><p id="tql-export-description">{course ? `仅导出「${course.title}」中明确绑定本课程的已完成作答摘要，不合并其他课程或无法确定课程的历史记录。` : '导出此测评的已完成作答摘要，按系统现有授权提供可用字段。'}</p>
  <fieldset disabled={busy}><legend>选择文件格式</legend><div className="tql-format-options">{([
   ['csv','CSV 数据表','便于用 Excel、R 等工具读取',FileSpreadsheet],['zip','ZIP 数据与字典','包含数据表和字段说明，适合留存与分析',FileArchive],
  ] as const).map(([value,label,hint,Icon])=><label key={value} className={format===value?'is-selected':''}><input type="radio" name="tql-format" value={value} checked={format===value} onChange={()=>setFormat(value)}/><Icon size={22} aria-hidden="true"/><strong>{label}</strong><small>{hint}</small></label>)}</div></fieldset>
  <div className="tql-privacy"><ShieldCheck size={18} aria-hidden="true"/><div><strong>始终启用脱敏</strong><p>隐藏系统姓名，保留参与者编号和获授权的数据字段。背景题中自行填写的信息仍需留意，分享文件前请检查。</p></div></div>
  <details className="tql-export-help"><summary>摘要包含什么？还有哪些格式？</summary><p>摘要包含获授权的测评结果；高级表单摘要不含自由文本和“其他”说明。原始回答、认知逐试次和计时仍受各自权限控制。</p><p>本入口提供 CSV 和 ZIP。完整明细和独立报告 JSON 请到测评配置中查看；高级表单暂不支持 SPSS SAV。历史问卷的 CSV / SAV 使用原有导出入口。</p><Link to={row.editHref} onClick={event=>{if(pending.current)event.preventDefault()}} aria-disabled={busy || undefined}>前往测评配置 <ArrowRight size={13} aria-hidden="true"/></Link></details>
  {notice && <p role="status" className="tql-export-notice">{notice}</p>}{error && <p role="alert" className="tql-export-error">{error}</p>}
  <footer><button type="button" disabled={busy} onClick={close}>关闭</button><button type="button" className="tql-primary" disabled={busy} onClick={()=>void run()}><Download size={16} aria-hidden="true"/>{busy?'正在生成…':`导出 ${format.toUpperCase()}`}</button></footer>
 </section></ModalSurface>
}

