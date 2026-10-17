import { useEffect, useRef, useState } from 'react'
import type { ResearchDraft, FormDraft, ScaleDraft, SjtDraft, FormQuestion, SurveyImage } from './builder.types'
import { visibleFormKeys,sanitizeFormAnswers } from './form-visibility'
import { ProfessionalFormAnswer,type ProfessionalAnswer } from './ProfessionalFormAnswer'
import { FormChoiceExtras,hasSelectedOther,toggleFormMultiple } from './FormChoiceExtras'

type Refusal={_surveyRefusal:true}
type Answer=ProfessionalAnswer
const refusal=():Refusal=>({_surveyRefusal:true})
const isRefusal=(value:Answer|undefined):value is Refusal=>
  !!value&&typeof value==='object'&&!Array.isArray(value)&&'_surveyRefusal' in value
    &&value._surveyRefusal===true
export function ResearchPreview({draft,onSimulate,onValidateForm,errorPath,initialAnswers,onAnswersChange,hideSimulation=false}:{draft:ResearchDraft;
  onSimulate:(answers:Record<string,unknown>)=>void;
  onValidateForm?:(answers:Record<string,Answer>)=>void;
  errorPath?:string;initialAnswers?:Record<string,Answer>;onAnswersChange?:(answers:Record<string,Answer>)=>void;hideSimulation?:boolean}){
  const [answers,setAnswers]=useState<Record<string,Answer>>(initialAnswers??{})
  const [pageIndex,setPageIndex]=useState(0)
  const [scaleIndex,setScaleIndex]=useState(0)
  const answerListener=useRef(onAnswersChange);answerListener.current=onAnswersChange
  useEffect(()=>{answerListener.current?.(answers)},[answers])
  useEffect(()=>{setAnswers(initialAnswers??{});setPageIndex(0);setScaleIndex(0)},[draft.id,draft.revision])
  useEffect(()=>{
    if(draft.kind!=='FORM'||!errorPath)return
    const key=errorPath.match(/^answers\.([a-z][a-z0-9_-]*)/i)?.[1]
    if(!key)return
    const index=(draft.definition as FormDraft).pages.findIndex(p=>p.questions.some(q=>q.itemKey===key))
    if(index>=0)setPageIndex(index)
  },[draft,errorPath])
  const choose=(key:string,value:Answer)=>setAnswers(old=>{
    const next={...old,[key]:value}
    if(draft.kind==='FORM'){
      const question=(draft.definition as FormDraft).pages.flatMap(p=>p.questions)
        .find(q=>q.itemKey===key&&q.otherOptionKey)
      if(question&&!hasSelectedOther(question,value))
        delete next[question.itemKey+':other']
    }
    return next
  })
  const visible=draft.kind==='FORM'
    ?visibleFormKeys((draft.definition as FormDraft).pages.flatMap(p=>p.questions),answers)
    :null
  const formPages=draft.kind==='FORM'
    ?(draft.definition as FormDraft).pages.filter(page=>page.questions.some(q=>visible?.has(q.itemKey)))
    :[]
  const currentIndex=Math.min(pageIndex,Math.max(0,formPages.length-1))
  const currentPage=formPages[currentIndex]
  const simulate=()=>{
    if(draft.kind==='SJT'){onSimulate(answers);return}
    // Score simulation is only offered for SCALE / SJT, not Form refusal answers.
    const scoreAnswers:Record<string,string|number|string[]>={}
    for(const [key,value] of Object.entries(answers))
      if(typeof value==='string'||typeof value==='number'||Array.isArray(value))
        scoreAnswers[key]=value
    onSimulate(scoreAnswers)
  }
  const picture=(image?:SurveyImage)=>image&&<figure className="my-3">
    <img className="max-h-72 object-contain max-w-full rounded border"
      loading="lazy" alt={image.altText}
      src={'/api/survey/projects/'+draft.projectId+'/assets/'+image.asset.assetId+'/preview'}/>
    {image.caption&&<figcaption className="text-xs mt-1">{image.caption}</figcaption>}
  </figure>
  const question=(q:FormQuestion)=>{
    if(visible&&!visible.has(q.itemKey))return null
    return <fieldset key={q.itemKey} id={'survey-preview-'+q.itemKey} tabIndex={-1}
      className="border rounded-lg p-3 my-3 bg-white scroll-mt-5">
      <legend className="font-medium text-sm">{q.prompt||'未填写题干'} {q.required?'*':''}</legend>
      {picture(q.image)}
      {['SINGLE','LIKERT'].includes(q.type)&&q.options.map(o=><label key={o.optionKey} className="flex gap-2 items-center my-2">
        <input type="radio" checked={answers[q.itemKey]===o.optionKey} name={q.itemKey}
          onChange={()=>choose(q.itemKey,o.optionKey)}/>{o.label||'未填写选项'}</label>)}
      {q.type==='MULTIPLE'&&q.options.map(o=>{
        const current=Array.isArray(answers[q.itemKey])?answers[q.itemKey] as string[]:[]
        return <label key={o.optionKey} className="flex gap-2 my-2 items-center">
          <input type="checkbox" checked={current.includes(o.optionKey)}
            onChange={e=>choose(q.itemKey,toggleFormMultiple(current,o.optionKey,e.target.checked,
              q.exclusiveOptionKeys))}/>
          {o.label||'未填写选项'}</label>
      })}
      {['SINGLE','MULTIPLE'].includes(q.type)&&q.otherOptionKey&&
        <FormChoiceExtras question={q} answers={answers} onChange={choose}/>}
      {q.type==='MATRIX'&&<div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
        <thead><tr><th scope="col">题目行</th>{q.options.map(o=><th scope="col" key={o.optionKey}>{o.label}</th>)}{q.allowRefusal&&<th scope="col">不愿回答</th>}</tr></thead>
        <tbody>{q.rows.map(row=><tr key={row.rowKey}><th scope="row" className="text-left">{row.label}</th>
          {q.options.map(o=><td className="text-center" key={o.optionKey}><input type="radio"
            name={q.itemKey+':'+row.rowKey} checked={answers[q.itemKey+':'+row.rowKey]===o.optionKey}
            onChange={()=>choose(q.itemKey+':'+row.rowKey,o.optionKey)}/></td>)}
          {q.allowRefusal&&<td className="text-center"><input type="radio"
            aria-label={'不愿回答：'+row.label} name={q.itemKey+':'+row.rowKey}
            checked={isRefusal(answers[q.itemKey+':'+row.rowKey])}
            onChange={()=>choose(q.itemKey+':'+row.rowKey,refusal())}/></td>}</tr>)}</tbody></table></div>}
      {['SHORT_TEXT','LONG_TEXT'].includes(q.type)&&<textarea className="input block w-full"
        aria-label={q.prompt||'文本回答'} rows={q.type==='SHORT_TEXT'?1:4}
        value={isRefusal(answers[q.itemKey])?'':String(answers[q.itemKey]??'')}
        disabled={isRefusal(answers[q.itemKey])}
        onChange={e=>choose(q.itemKey,e.target.value)}/>}
      {q.allowRefusal&&!['MATRIX','MATRIX_MULTIPLE'].includes(q.type)&&<label className="flex gap-2 items-center text-sm">
        <input type="checkbox" checked={isRefusal(answers[q.itemKey])}
          onChange={e=>choose(q.itemKey,e.target.checked?refusal():null)}/>不愿回答（独立于未作答）
      </label>}
      {['DATE','TIME','RANK_ORDER','SLIDER','CONSTANT_SUM','MATRIX_MULTIPLE'].includes(q.type)&&
        <ProfessionalFormAnswer question={q} answers={answers} prefix="preview" onAnswer={choose}/>}
      {q.type==='NUMBER'&&<input className="input block" aria-label={q.prompt||'数值回答'}
        type="number" min={q.min} max={q.max} step={q.step??(q.integerOnly?1:'any')}
        value={isRefusal(answers[q.itemKey])?'':String(answers[q.itemKey]??'')}
        disabled={isRefusal(answers[q.itemKey])}
        onChange={e=>choose(q.itemKey,e.target.value===''?null:Number(e.target.value))}/>}
    </fieldset>
  }
  return <section className="border rounded-xl p-4 bg-slate-50 space-y-3" aria-label="研究工具试答预览">
    <div><h3 className="text-lg font-semibold">模拟作答（不保存正式数据）</h3>
      <p className="text-xs text-slate-600">预览仅用于检查内容、条件与研究计分，绝不产生正式研究被试或 FINAL。</p></div>
    {draft.kind==='FORM'&&<div>
      <p className="text-sm" role="status">第 {currentPage?currentIndex+1:0} / {formPages.length} 页</p>
      <progress className="w-full" max={Math.max(1,formPages.length)}
        value={currentPage?currentIndex+1:0} aria-label="研究者表单预览进度"/>
      {currentPage&&<div key={currentPage.pageKey}>
        <h4 className="font-semibold">{currentPage.title}</h4>{currentPage.questions.map(question)}
      </div>}
      <nav className="flex justify-between mt-3 gap-2" aria-label="试答分页">
        <button type="button" className="btn-secondary" disabled={currentIndex<=0}
          onClick={()=>setPageIndex(Math.max(0,currentIndex-1))}>上一页</button>
        <button type="button" className="btn-secondary"
          disabled={!currentPage||currentIndex>=formPages.length-1}
          onClick={()=>setPageIndex(currentIndex+1)}>下一页</button>
      </nav>
    </div>}
    {draft.kind==='SCALE'&&(()=>{
      const definition=draft.definition as ScaleDraft
      const oneByOne=definition.presentationMode==='ONE_BY_ONE'
      const index=Math.min(scaleIndex,Math.max(0,definition.items.length-1))
      const items=oneByOne?definition.items.slice(index,index+1):definition.items
      return <div className="space-y-3">
        <p role="status" className="text-xs text-slate-600">
          {oneByOne?`逐题预览 · 第 ${index+1} / ${definition.items.length} 题`
            :'整份量表预览（历史默认呈现方式）'}
        </p>
        {items.map(q=><fieldset className="border rounded-lg bg-white p-3" key={q.itemKey}>
          <legend>{q.prompt||'未填写题干'}</legend>
          {definition.responseOptions.map(o=><label key={o.optionKey} className="block my-1">
            <input type="radio" name={q.itemKey} checked={answers[q.itemKey]===o.optionKey}
              onChange={()=>choose(q.itemKey,o.optionKey)}/> {o.label}</label>)}
        </fieldset>)}
        {oneByOne&&<nav className="flex justify-between gap-2" aria-label="研究量表逐题预览导航">
          <button type="button" className="btn-secondary" disabled={index===0}
            onClick={()=>setScaleIndex(v=>Math.max(0,v-1))}>上一题</button>
          <button type="button" className="btn-secondary" disabled={index>=definition.items.length-1}
            onClick={()=>setScaleIndex(v=>Math.min(definition.items.length-1,v+1))}>下一题</button>
        </nav>}
        {oneByOne&&<p className="text-xs text-slate-600">
          预览用于核对题目呈现，不产生研究者或被试的正式反应时。</p>}
      </div>
    })()}
    {draft.kind==='SJT'&&(()=>{
      const definition=draft.definition as SjtDraft
      const scenes=definition.schemaVersion===2?definition.scenes:[{sceneKey:definition.scenarioKey,title:definition.title,stimulus:definition.stimulus,image:definition.image,questions:definition.questions}]
      return scenes.map(scene=><section key={scene.sceneKey} className="space-y-3"><h4 className="font-semibold">{scene.title}</h4><div className="whitespace-pre-wrap">{scene.stimulus}</div>
      {picture(scene.image)}
      {scene.questions.map(q=><fieldset key={q.questionKey} className="border bg-white rounded-lg p-3">
        <legend>{q.prompt||'未填写题干'} {q.responseType==='MULTIPLE'?'（可多选）':''}</legend>
        {q.responseType==='MULTIPLE'&&<p className="text-xs">
          至少选择 {q.minSelections??1} 项，最多选择 {q.maxSelections??q.options.length} 项。</p>}
        {q.options.map(o=>{
          const multiple=q.responseType==='MULTIPLE'
          const selected=Array.isArray(answers[q.questionKey])?answers[q.questionKey] as string[]:[]
          return <label key={o.optionKey} className="block my-2">
            <input type={multiple?'checkbox':'radio'} name={q.questionKey}
              checked={multiple?selected.includes(o.optionKey):answers[q.questionKey]===o.optionKey}
              disabled={multiple&&!selected.includes(o.optionKey)&&selected.length>=(q.maxSelections??q.options.length)&&!('nonanswerReason' in o&&o.nonanswerReason)&&!('exclusiveOptionKeys' in q&&q.exclusiveOptionKeys?.includes(o.optionKey))}
              onChange={e=>choose(q.questionKey,multiple?toggleFormMultiple(selected,o.optionKey,e.target.checked,
                [...('exclusiveOptionKeys' in q?q.exclusiveOptionKeys??[]:[]),...q.options.filter(x=>'nonanswerReason' in x&&x.nonanswerReason).map(x=>x.optionKey)]):o.optionKey)}/> {o.label}</label>
        })}
        {'allowRefusal' in q&&q.allowRefusal&&<label className="block my-2"><input type="checkbox" checked={isRefusal(answers[q.questionKey])} onChange={e=>choose(q.questionKey,e.target.checked?refusal():null)}/>我选择不回答这一题</label>}
        </fieldset>)}</section>)
    })()}
    {!hideSimulation&&(draft.kind==='SCALE'||draft.kind==='SJT')&&<button type="button" className="btn-secondary"
      onClick={simulate}>
      计算当前研究性模拟得分</button>}
    {draft.kind==='FORM'&&onValidateForm&&<><button type="button" className="btn-secondary"
      onClick={()=>onValidateForm(sanitizeFormAnswers(
        (draft.definition as FormDraft).pages.flatMap(p=>p.questions),answers))}>
      按正式 FINAL 规则试提交（不保存数据）</button>
      <p className="text-xs">服务器检查必答、条件显隐、矩阵和拒答，不创建研究 Attempt 或 FINAL。</p></>}
  </section>
}
