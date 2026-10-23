import {useRef,useState} from 'react'
import {sessionFetch} from '../../api/client'
import {compositeApi} from './api'
import {waitForExportArtifacts,requestExportIntent,assertExportDownload,triggerExportDownload,clearExportIntentKey,ExportJobFailedError} from '../../utils/exportJobs'
/** Uses the original durable export intent, status polling and authenticated
 * artifact download. No direct client-side dataset serialization. */
export function TypedFormExportActions({assessmentId}:{assessmentId:string}) {
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('')
  const pending=useRef(false)
  async function run(detail:'summary'|'full',format:'csv'|'zip') {
    if(pending.current)return
    pending.current=true
    setBusy(true);setNotice('正在提交导出…')
    const scope=`compositeApi:${assessmentId}:${JSON.stringify({detail,format})}`
    try {
      const response=await requestExportIntent(scope,key=>compositeApi.exportData(assessmentId,{detail,format},key))
      if(response.code!==0||!response.data?.artifacts)throw Error(response.message||'导出失败')
      setNotice('导出已受理，正在生成文件。')
      const [artifact]=await waitForExportArtifacts(response.data.artifacts)
      const download=await sessionFetch(artifact.downloadUrl,{signal:AbortSignal.timeout(60000)})
      assertExportDownload(download);triggerExportDownload(await download.blob(),artifact.fileName);clearExportIntentKey(scope)
      setNotice('已请求下载，请查看浏览器下载列表。')
    } catch(error) {
      if(error instanceof ExportJobFailedError)clearExportIntentKey(scope)
      setNotice(error instanceof Error?error.message:'导出失败，请重试同一任务。')
    } finally {pending.current=false;setBusy(false)}
  }
  return <section aria-label="表单数据导出" className="space-y-2">
    <p className="text-sm text-gray-600">高级表单支持 CSV/ZIP，暂不支持 SAV。摘要不含自由文本及其他说明；完整导出包含这些回答。ZIP 字典说明冻结选项、四态和文本公式防护。</p>
    <div className="flex flex-wrap gap-2">{([['summary','csv','导出表单摘要（CSV）'],['summary','zip','摘要与字段字典（ZIP）'],['full','zip','完整表单与字段字典（ZIP）']] as const).map(([detail,format,label])=><button key={detail+format} type="button" disabled={busy} className="hui-button hui-button--secondary" onClick={()=>void run(detail,format)}>{label}</button>)}</div>
    {notice&&<p role="status">{notice}</p>}
  </section>
}
