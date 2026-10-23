import {RawScoreFeedbackFields} from '../modules/assessment-core/scale/RawScoreFeedbackFields'
import {SurveyMaterialPicker} from './SurveyMaterialPicker'
import {SurveyMaterialDisplay} from './SurveyMaterialDisplay'
import {surveyAssetBase} from './tool-library-api'
import { useState } from 'react'
import type { ScaleDraft, SurveyImage } from './builder.types'
import { researchKey } from './builder.types'
import { SurveyImageField } from './SurveyImageField'
import { matchRawScoreFeedback, validateRawScoreFeedback } from '../modules/scale/rawScoreFeedback'
import type { RawScoreFeedbackContent, RawScoreFeedbackRule } from '../modules/scale/rawScoreFeedback'

export function SurveyRawScoreFeedbackEditor({value,onChange,projectId,compact=false}:{value:ScaleDraft;onChange:(next:ScaleDraft)=>void;projectId?:string;compact?:boolean}){
  const [sample,setSample]=useState(0)
  const scores=[...value.dimensions.map(d=>({key:d.dimensionKey,label:d.label})),...(value.totalScore?[value.totalScore]:[])]
  const rules=value.rawScoreFeedback?.rules??[]
  const setRules=(next:RawScoreFeedbackRule[])=>onChange({...value,rawScoreFeedback:next.length?{schemaVersion:1,rules:next}:undefined})
  const update=(index:number,next:RawScoreFeedbackRule)=>setRules(rules.map((r,i)=>i===index?next:r))
  const issues=validateRawScoreFeedback(value.rawScoreFeedback,scores.map(s=>s.key))
  const images=(content:RawScoreFeedbackContent,change:(next:RawScoreFeedbackContent)=>void)=>projectId&&<div className="space-y-2">
    <SurveyMaterialPicker label="反馈展示素材" value={content.materials} onChange={materials=>change({...content,materials})}/>
    {content.materials?.map(item=><SurveyMaterialDisplay key={item.asset.assetId} item={item}/>)}
    {(content.images??[]).map((image,index)=><SurveyImageField presentationOnly key={image.order} projectId={projectId}
      image={{...image,rightsStatus:'unknown',rightsNote:''} as SurveyImage} onChange={next=>change({...content,images:next?(content.images??[]).map((old,i)=>i===index?{asset:next.asset,altText:next.altText,...(next.caption?{caption:next.caption}:{}),order:old.order}:old):(content.images??[]).filter((_,i)=>i!==index)})}/>)}
    <SurveyImageField presentationOnly projectId={projectId} onChange={next=>{if(next)change({...content,images:[...(content.images??[]),{asset:next.asset,altText:next.altText,...(next.caption?{caption:next.caption}:{}),order:Math.max(-1,...(content.images??[]).map(image=>image.order))+1}]})}}/>
  </div>
  return <section className="border rounded-xl p-4 space-y-4 bg-white">
    <header className={compact?'survey-scale-panel-heading':undefined}><div><h3 className="font-semibold">原始分区间反馈</h3>{compact&&<p>为维度分或总分设置描述性反馈，并在下方模拟核对。</p>}</div>{compact&&<span>{rules.length} 个指标</span>}</header>
    {compact?<details className="survey-scale-help"><summary>区间、兜底与被试可见范围说明</summary><p>仅描述本次原始分，不提供常模或诊断。区间左闭右开，最后一个可包含上限；空档使用兜底文字。参与者仅在研究发布策略允许时收到服务器已匹配的反馈。</p></details>:<p className="text-xs text-slate-600">仅描述本次原始分，不提供常模或诊断。区间左闭右开，最后一个可包含上限；空档使用兜底文字。参与者仅在研究发布策略允许时收到服务器已匹配的反馈。</p>}
    {compact&&!rules.length&&<p className="survey-scale-empty">{scores.length?'还没有反馈规则。点击“新增指标反馈”，选择指标后设置分数区间与文字。':'先在“计分”分区添加维度或总分，再设置对应的区间反馈。'}</p>}
    {issues.length>0&&<ul role="alert" className="text-sm text-red-700">{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>}
    {rules.map((rule,index)=>{
      const ruleIssues=validateRawScoreFeedback({schemaVersion:1,rules:rules.filter(candidate=>candidate.scoreKey===rule.scoreKey)},scores.map(score=>score.key))
      const preview=ruleIssues.length?null:matchRawScoreFeedback(value.rawScoreFeedback,rule.scoreKey,sample)
      return <article className="border rounded-lg bg-slate-50 p-3 space-y-3" key={rule.scoreKey}>
      <div className="flex flex-wrap gap-2"><label className="text-sm">反馈指标<select className="input block" aria-label={'反馈指标 '+(index+1)} value={rule.scoreKey} onChange={e=>update(index,{...rule,scoreKey:e.target.value})}>{!scores.some(s=>s.key===rule.scoreKey)&&<option value={rule.scoreKey}>已移除的指标</option>}{scores.map(s=><option key={s.key} value={s.key} disabled={rules.some((other,i)=>i!==index&&other.scoreKey===s.key)}>{s.label||s.key}</option>)}</select></label>
      <button type="button" className="btn-secondary" onClick={()=>setRules(rules.filter((_,i)=>i!==index))}>删除此指标反馈</button></div>
      <RawScoreFeedbackFields rule={rule} appearance="survey" labelPrefix={'反馈 '+(index+1)} fallbackTextLabel={'兜底文字 '+(index+1)} fallbackLabel="设置未匹配时的兜底反馈" addLabel="增加反馈区间" onChange={next=>update(index,next)} renderContent={images}/>
      <aside className="border-l-2 border-slate-400 pl-3 text-sm" aria-label="作者模拟反馈"><strong>作者本地模拟（不创建真实作答）</strong><p>{ruleIssues.length?'请先修正此指标反馈配置，再查看模拟结果。':preview?.text||'此原始分没有匹配反馈'}</p>{preview?.materials?.map(item=><SurveyMaterialDisplay key={item.asset.assetId} item={item}/>)}{preview?.images?.map(image=><figure key={image.asset.assetId}>{projectId&&<img className="max-h-48 max-w-full object-contain" src={surveyAssetBase(projectId)+'/'+encodeURIComponent(image.asset.assetId)+'/preview'} alt={image.altText}/>}<figcaption>{image.caption}</figcaption></figure>)}</aside>
    </article>})}
    <button type="button" className="btn-secondary" disabled={!scores.some(s=>!rules.some(r=>r.scoreKey===s.key))} onClick={()=>{const score=scores.find(s=>!rules.some(r=>r.scoreKey===s.key));if(score)setRules([...rules,{scoreKey:score.key,ranges:[{key:researchKey('range'),min:0,max:1,includeMax:true,text:''}]}])}}>新增指标反馈</button>
    {!!rules.length&&<label className="block text-sm">模拟原始分<input className="input block w-36" type="number" value={sample} onChange={e=>setSample(Number(e.target.value))}/></label>}
  </section>
}
