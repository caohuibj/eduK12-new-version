import {useState} from 'react'
import {SurveyScaleLibrarySubmission} from './SurveyScaleLibrarySubmission'
import type {LibraryTool} from './tool-library-api'

export function SurveyToolManagementGuide({tool,disabled,busy,onPublish,onBusyChange}:{tool:LibraryTool;disabled:boolean;busy:boolean;onPublish:()=>Promise<string|null>;onBusyChange:(busy:boolean)=>void}){
  const [published,setPublished]=useState<{id:string;generation:number}|null>(null)
  if(tool.kind!=='SCALE')return <section className="survey-tool-management-card" aria-label="公共库申请说明"><h3>申请入库</h3><p>目前开放自建量表的入库申请。表单和普通组合问卷的公共库审核尚未开放；你仍可在自己的研究中选用。</p></section>
  return <section className="survey-tool-management-card survey-tool-application" aria-label="公共库申请说明">
    <header><h3>申请入库</h3><span>平台审核 · 按授权使用</span></header>
    <p>先发布当前已保存修订，再选择精确版本核对资料并提交。无需加入研究；发布版本不会开启采集，也不会自动进入公共库。</p>
    <div className="survey-tool-application-publish"><span>当前草稿 · 修订 {tool.revision}</span><button type="button" className="btn-secondary" disabled={disabled||busy} onClick={async()=>{const id=await onPublish();if(id)setPublished(value=>({id,generation:(value?.generation??0)+1}))}}>发布当前修订供申请</button></div>
    {disabled&&<p>请先保存修改，并完成或清空尚未导入、未保存的内容。</p>}
    <SurveyScaleLibrarySubmission key={published?.generation??0} sourceId={tool.id} initialReleaseId={published?.id} onBusyChange={onBusyChange}/>
  </section>
}
