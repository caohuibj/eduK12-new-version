import { useState } from 'react'
import type { ResearchDraft } from './builder.types'
import type { MeasurementTransport } from './measurement-publication'
type Release={releaseId:string;version:string;publishedAt:string;status:string;authoringVersion:number|null}
export function SurveyScaleVersions({projectId,draft,transport}:{projectId:string;draft:ResearchDraft;transport:MeasurementTransport}){
  const [list,setList]=useState<Release[]|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false)
  const load=async()=>{
    setLoading(true);setError('')
    try{const result=await transport<{list:Release[]}>('/projects/'+encodeURIComponent(projectId)+'/instruments/'+encodeURIComponent(draft.id)+'/versions');setList(result.list)}
    catch(failure){setError(failure instanceof Error?failure.message:'版本历史读取失败')}
    finally{setLoading(false)}
  }
  return <section className="border rounded-lg bg-white p-3 space-y-2" aria-label="量表版本谱系">
    <h3 className="font-semibold">量表版本</h3>
    <p className="text-sm">{draft.authoringVersion?`编制版本 v${draft.authoringVersion}`:'历史量表 · 尚无编制版本号'} · 编辑修订 {draft.revision}</p>
    {draft.authoringFamilyId&&<p className="text-xs break-all">版本系列：{draft.authoringFamilyId}</p>}
    {draft.sourceDraftId&&<p className="text-xs break-all">原始复制来源：{draft.sourceDraftId}（当前版本归属以上版本系列）</p>}
    {draft.measurementReleaseId&&<p className="text-xs break-all">当前发布标识：{draft.measurementReleaseId}</p>}
    <button type="button" className="btn-secondary" disabled={loading} onClick={()=>void load()}>查看已发布版本</button>
    {error&&<p role="alert">{error}</p>}
    {list&&<ul className="space-y-2">{list.map(row=><li key={row.releaseId} className="text-sm break-all">{row.version} · {row.status} · {row.publishedAt}<br/>版本标识：{row.releaseId}</li>)}</ul>}
    {list?.length===0&&<p className="text-sm">尚未发布测量版本。</p>}
  </section>
}
