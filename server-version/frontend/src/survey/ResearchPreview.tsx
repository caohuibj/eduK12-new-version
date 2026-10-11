import { useEffect, useState } from 'react'
import type { ResearchDraft, FormDraft, ScaleDraft, SjtDraft, FormQuestion, SurveyImage } from './builder.types'
import { visibleFormKeys,sanitizeFormAnswers } from './form-visibility'
import { ProfessionalFormAnswer,type ProfessionalAnswer } from './ProfessionalFormAnswer'

type Refusal={_surveyRefusal:true}
type Answer=ProfessionalAnswer
const refusal=():Refusal=>({_surveyRefusal:true})
const isRefusal=(value:Answer|undefined):value is Refusal=>
  !!value&&typeof value==='object'&&!Array.isArray(value)&&'_surveyRefusal' in value
    &&value._surveyRefusal===true
export function ResearchPreview({draft,onSimulate,onValidateForm}:{draft:ResearchDraft;
  onSimulate:(answers:Record<string,string|number|string[]>)=>void;
  onValidateForm:(answers:Record<string,Answer>)=>void}){
  const [answers,setAnswers]=useState<Record<string,Answer>>({})
  useEffect(()=>{setAnswers({})},[draft.id])
  const choose=(key:string,value:Answer)=>setAnswers(old=>({...old,[key]:value}))
  const visible=draft.kind==='FORM'
    ?visibleFormKeys((draft.definition as FormDraft).pages.flatMap(p=>p.questions),answers)
    :null
  const simulate=()=>{
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
            onChange={e=>choose(q.itemKey,e.target.checked?[...current,o.optionKey]:current.filter(x=>x!==o.optionKey))}/>
          {o.label||'未填写选项'}</label>
      })}
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
    {draft.kind==='FORM'&&(draft.definition as FormDraft).pages.map(page=><div key={page.pageKey}>
      <h4 className="font-semibold">{page.title}</h4>{page.questions.map(question)}</div>)}
    {draft.kind==='SCALE'&&(draft.definition as ScaleDraft).items.map(q=><fieldset className="border rounded-lg bg-white p-3" key={q.itemKey}>
      <legend>{q.prompt||'未填写题干'}</legend>
      {(draft.definition as ScaleDraft).responseOptions.map(o=><label key={o.optionKey} className="block my-1">
        <input type="radio" name={q.itemKey} checked={answers[q.itemKey]===o.optionKey}
          onChange={()=>choose(q.itemKey,o.optionKey)}/> {o.label}</label>)}
    </fieldset>)}
    {draft.kind==='SJT'&&<><div className="font-semibold">{(draft.definition as SjtDraft).stimulus}</div>
      {picture((draft.definition as SjtDraft).image)}
      {(draft.definition as SjtDraft).questions.map(q=><fieldset key={q.questionKey} className="border bg-white rounded-lg p-3">
        <legend>{q.prompt||'未填写题干'} {q.responseType==='MULTIPLE'?'（可多选）':''}</legend>
        {q.responseType==='MULTIPLE'&&<p className="text-xs">
          至少选择 {q.minSelections??1} 项，最多选择 {q.maxSelections??q.options.length} 项。</p>}
        {q.options.map(o=>{
          const multiple=q.responseType==='MULTIPLE'
          const selected=Array.isArray(answers[q.questionKey])?answers[q.questionKey] as string[]:[]
          return <label key={o.optionKey} className="block my-2">
            <input type={multiple?'checkbox':'radio'} name={q.questionKey}
              checked={multiple?selected.includes(o.optionKey):answers[q.questionKey]===o.optionKey}
              onChange={e=>choose(q.questionKey,multiple?
                (e.target.checked?[...selected,o.optionKey]:selected.filter(x=>x!==o.optionKey)):
                o.optionKey)}/> {o.label}</label>
        })}</fieldset>)}</>}
    {draft.kind!=='FORM'&&<button type="button" className="btn-secondary"
      onClick={simulate}>
      计算当前研究性模拟得分</button>}
    {draft.kind==='FORM'&&<><button type="button" className="btn-secondary"
      onClick={()=>onValidateForm(sanitizeFormAnswers(
        (draft.definition as FormDraft).pages.flatMap(p=>p.questions),answers))}>
      按正式 FINAL 规则试提交（不保存数据）</button>
      <p className="text-xs">服务器检查必答、条件显隐、矩阵和拒答，不创建研究 Attempt 或 FINAL。</p></>}
  </section>
}
