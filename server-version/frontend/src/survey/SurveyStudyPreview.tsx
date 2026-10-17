import { useState } from 'react'
import type { FormDraft,ResearchDraft } from './builder.types'
import { ResearchPreview } from './ResearchPreview'
import { ResearchCognitivePreview,type CognitivePreviewSnapshot } from './ResearchCognitivePreview'
import { resolveClientSurveyFlow,previewSurveyFlow,type FlowDraft,type PublicFlow } from './flow.client'
import type { ProfessionalAnswer } from './ProfessionalFormAnswer'
export function SurveyStudyPreview({drafts,flow,consentText,generalText,cognitiveSnapshots,onClose}:{
  drafts:ResearchDraft[];flow:FlowDraft|null;consentText:string;generalText:string;
  cognitiveSnapshots:Record<string,CognitivePreviewSnapshot>;onClose:()=>void}){
  const [answers,setAnswers]=useState<Record<string,Record<string,ProfessionalAnswer>>>({})
  const [consented,setConsented]=useState(false),[index,setIndex]=useState(0),[finished,setFinished]=useState(false)
  const [groupKey,setGroupKey]=useState(flow?.experiment?.groups[0]?.groupKey??'')
  const [tested,setTested]=useState<string[]>([]),[skipped,setSkipped]=useState<string[]>([])
  const variants=flow?.experiment?.mode==='QUESTIONNAIRE_VARIANTS'
  const definition:PublicFlow=flow?previewSurveyFlow(flow,groupKey):{schemaVersion:1,flowDigest:'PREVIEW_ONLY',embeddedData:[],
    blocks:drafts.map(d=>({blockKey:d.instrumentKey,kind:'INSTRUMENT',instrumentKey:d.instrumentKey}))}
  const assignedKeys=new Set(definition.blocks.filter(b=>b.kind==='INSTRUMENT').map(b=>b.instrumentKey))
  const assignedDrafts=drafts.filter(d=>assignedKeys.has(d.instrumentKey))
  const route=resolveClientSurveyFlow(definition,drafts.map(d=>({kind:d.kind,instrumentKey:d.instrumentKey,
    ...(d.kind==='FORM'?{pages:(d.definition as FormDraft).pages}:{})})),answers)
  const position=Math.min(index,Math.max(0,route.blocks.length-1)),block=route.blocks[position]
  const draft=block?.kind==='INSTRUMENT'?drafts.find(d=>d.instrumentKey===block.instrumentKey):undefined
  const updateAnswers=(key:string,next:Record<string,ProfessionalAnswer>)=>setAnswers(old=>
    JSON.stringify(old[key])===JSON.stringify(next)?old:{...old,[key]:next})
  const next=()=>{if(position>=route.blocks.length-1)setFinished(true);else setIndex(position+1)}
  const needsCognitivePreview=!!draft&&draft.kind==='COGNITIVE'&&!tested.includes(draft.instrumentKey)&&!skipped.includes(draft.instrumentKey)
  return <section className="border-2 border-sky-700 rounded-xl bg-sky-50 p-4 space-y-4" aria-label="全流程研究预览">
    <div className="flex justify-between gap-3"><h3 className="font-semibold">全流程预览 · 不产生正式研究记录</h3><button type="button" className="btn-secondary" onClick={onClose}>关闭全流程预览</button></div>
    <p className="text-sm">使用已保存的工具和当前波次草稿。可改变试答检查条件路径；预览结束提示不代表正式提交、计分或设备精度验证。</p>
    {!consented?<div className="space-y-3"><h4 className="font-medium">参与说明与知情同意预览</h4><p className="whitespace-pre-wrap">{consentText||'尚未填写参与说明'}</p>
      {assignedDrafts.some(d=>d.kind==='COGNITIVE')&&<p className="text-sm">本轮含桌面键盘认知任务、练习和试次暂存。正式任务开始前会锁定前置答案；每个任务及整轮研究分别确认提交。</p>}
      {flow?.experiment&&<label className="block text-sm">{variants?'模拟预览 A/B问卷子版本（不进行正式随机分配）':'预览实验材料组（不进行正式随机分配）'}<select className="input block w-full" value={groupKey} onChange={e=>setGroupKey(e.target.value)}>{flow.experiment.groups.map(g=><option key={g.groupKey} value={g.groupKey}>{variants?(g.variantLabel||g.groupKey):g.groupKey}</option>)}</select></label>}
      <button type="button" className="btn-primary" onClick={()=>setConsented(true)}>模拟同意并进入预览</button></div>:
      finished?<div role="status" className="space-y-3"><h4 className="font-semibold">预览路径已结束</h4>
        <p>{route.termination==='SCREEN_OUT'?'本测试答案进入资格筛除路径，不应生成正式测量样本。':generalText||'感谢参与说明尚未填写'}</p>
        <p>没有创建参与者、任务子结果或整轮 FINAL。{skipped.length?`跳过了 ${skipped.length} 个认知任务预览，不能据此认为任务已经验证。`:''}</p>
        {assignedDrafts.filter(d=>d.kind==='COGNITIVE').map(d=><p key={d.id} className="text-sm">{d.title}：{(d.definition as {feedback?:{mode:string;release:string}}).feedback?.mode==='DESCRIPTIVE'?'正式反馈仅在整轮提交并达到设置的开放时机后，由服务端返回获准指标；预览不编造数值。':'默认只提供一般提交回执。'}</p>)}
        <button type="button" className="btn-secondary" onClick={()=>{setFinished(false);setIndex(0)}}>返回检查路径</button></div>:
      <div className="space-y-3"><p className="text-sm">预览步骤 {position+1} / {route.blocks.length}</p>
        {block?.kind==='MATERIAL'&&<article className="bg-white border rounded-lg p-4"><h4>{block.title}</h4><p className="whitespace-pre-wrap">{block.body}</p></article>}
        {block?.kind==='END'&&<p>{block.termination==='SCREEN_OUT'?'资格筛除结束':'按配置提前完成'}：{block.title}</p>}
        {draft&&(draft.kind==='COGNITIVE'?<ResearchCognitivePreview key={draft.id} snapshot={cognitiveSnapshots[draft.instrumentKey]} onCompleted={()=>setTested(old=>old.includes(draft.instrumentKey)?old:[...old,draft.instrumentKey])}/>:
          <ResearchPreview key={draft.id} draft={draft} hideSimulation initialAnswers={answers[draft.instrumentKey]} onAnswersChange={next=>updateAnswers(draft.instrumentKey,next)} onSimulate={()=>{}}/>)}
        {needsCognitivePreview&&<button type="button" className="btn-secondary" onClick={()=>setSkipped(old=>[...old,draft!.instrumentKey])}>仅预览：跳过此任务操作并检查后续路径</button>}
        <nav aria-label="全流程预览导航" className="flex gap-3"><button type="button" className="btn-secondary" disabled={!position} onClick={()=>setIndex(position-1)}>上一步预览</button>
          <button type="button" className="btn-primary" disabled={needsCognitivePreview} onClick={next}>{position>=route.blocks.length-1?'查看预览结束说明':'下一步预览'}</button></nav>
      </div>}
  </section>
}
