import {useEffect,useMemo,useRef,useState} from 'react'
import type {PublicMaterial} from '../modules/assessment-media/material'
import {BasicFormAnswer} from '../modules/assessment-core/form/BasicFormAnswer'
import type {SurveyPublicImage} from './builder.types'
import {SurveyMaterialDisplay} from './SurveyMaterialDisplay'
import {SurveyCatalogScaleMedia,type SurveyScaleMedia} from './SurveyCatalogScaleMedia'
import {ProfessionalFormAnswer,type ProfessionalAnswer} from './ProfessionalFormAnswer'
import {FormChoiceExtras,hasSelectedOther,toggleFormMultiple} from './FormChoiceExtras'
import {SurveyParticipantImage,type SurveyImageProof} from './SurveyParticipantImage'
import {visibleFormKeys} from './form-visibility'

type Choice={optionKey:string;label:string;nonanswerReason?:'DECLINED'|'UNABLE_TO_JUDGE'}
export type TaskFormQuestion=SurveyScaleMedia&{materials?:PublicMaterial[];responseOptions?:Choice[];itemKey:string;questionKey?:string;type:string;prompt:string;image?:SurveyPublicImage;required:boolean;
  options:Choice[];rows?:{rowKey:string;label:string}[];allowRefusal?:boolean;displayIf?:{itemKey:string;operator:'EQUALS'|'INCLUDES';optionKey:string};
  min?:number;max?:number;integerOnly?:boolean;step?:number;precision?:number;
  maxLength?:number;minSelections?:number;maxSelections?:number;
  total?:number;timeZone?:string;textValidation?:'EMAIL'|'DIGITS'|'ALPHANUMERIC';
  otherOptionKey?:string;otherMaxLength?:number;exclusiveOptionKeys?:string[]}
type SjtPublicQuestion={questionKey:string;prompt:string;responseType?:'SINGLE'|'MULTIPLE';required?:boolean;allowRefusal?:boolean;exclusiveOptionKeys?:string[];minSelections?:number;maxSelections?:number;options:Choice[]}
export type TaskFormUnit={executionProtocol?:'SITUATIONAL_NATIVE_V1';materials?:PublicMaterial[];kind:'FORM'|'SCALE'|'SJT'|'COGNITIVE';instrumentKey:string;title:string;image?:SurveyPublicImage;instruction?:string;
  presentationMode?:'ONE_BY_ONE'|'ALL_AT_ONCE';
  stimulus?:string;scenarioTitle?:string;
  pages?:{pageKey:string;title:string;description?:string;questions:TaskFormQuestion[]}[];
  responseOptions?:Choice[];
  items?:TaskFormQuestion[];
  feedback?:{mode:'GENERAL'|'DESCRIPTIVE';release:'AFTER_FINAL'|'AFTER_COLLECTION'};
  scenes?:{sceneKey:string;title:string;stimulus:string;image?:SurveyPublicImage;questions:SjtPublicQuestion[]}[];
  questions?:SjtPublicQuestion[]}
type Answer=ProfessionalAnswer
export const isTaskFormRefusal=(answer:Answer|undefined):answer is {_surveyRefusal:true}=>
  !!answer&&typeof answer==='object'&&!Array.isArray(answer)&&'_surveyRefusal' in answer
  &&answer._surveyRefusal===true
const refusal=():{_surveyRefusal:true}=>({_surveyRefusal:true})

export function TaskForm({unit,answer,onChange,proof,pageIndex,onPageChange,purpose='SURVEY',readOnly=false,advanceSingleChoiceFocus=false,videoComplete,onVideoComplete,imageReady,onImageReadyChange}:{unit:TaskFormUnit;answer:Record<string,Answer>;
  onChange:(name:string,value:Answer)=>void;proof?:SurveyImageProof;
  pageIndex:number;onPageChange:(next:number)=>void;
  purpose?:'SURVEY'|'HUITEACHER';readOnly?:boolean;advanceSingleChoiceFocus?:boolean;videoComplete?:Record<string,boolean>;onVideoComplete?:(itemKey:string)=>void;imageReady?:Record<string,boolean>;onImageReadyChange?:(itemKey:string,ready:boolean)=>void}){
  const [pageError,setPageError]=useState('')
  const surveyForm=purpose==='SURVEY'&&unit.kind==='FORM'

  const formQuestions=useMemo(()=>unit.pages?.flatMap(p=>p.questions)??[],[unit])
  const shownFormKeys=useMemo(()=>unit.kind==='FORM'
    ?visibleFormKeys(formQuestions,answer):null,[unit,formQuestions,answer])
  const visiblePages=useMemo(()=>unit.kind==='FORM'?(unit.pages??[])
    .filter(p=>p.questions.some(q=>shownFormKeys?.has(q.itemKey))):[],[unit,shownFormKeys])
  const currentIndex=Math.min(pageIndex,Math.max(0,visiblePages.length-1))
  const activePage=visiblePages[currentIndex]
  const pendingChoiceFocus=useRef<{key:string;value:string;unit:string;page:string}|null>(null)
  useEffect(()=>{
    const pending=pendingChoiceFocus.current
    if(!advanceSingleChoiceFocus||readOnly||!pending||answer[pending.key]!==pending.value)return
    pendingChoiceFocus.current=null
    if(!activePage||pending.unit!==unit.instrumentKey||pending.page!==activePage.pageKey)return
    const questions=activePage.questions.filter(q=>shownFormKeys?.has(q.itemKey))
    const index=questions.findIndex(q=>q.itemKey===pending.key),question=questions[index]
    if(!question||hasSelectedOther(question,answer[pending.key]))return
    const next=questions[index+1]
    if(!next)return // A page/block boundary always requires the existing manual action.
    const target=document.getElementById('survey-answer-'+unit.instrumentKey+'-'+next.itemKey)
    target?.focus({preventScroll:true});target?.scrollIntoView?.({block:'start'})
  },[advanceSingleChoiceFocus,readOnly,answer,unit.instrumentKey,activePage,shownFormKeys])

  // A one-page form often repeats the tool name with only a generic suffix.
  const headingKey=(title:string)=>title.trim().replace(/\s+/g,'').replace(/(?:表单|问卷|表)$/u,'')
  const repeatedPageHeading=surveyForm&&visiblePages.length===1&&!!activePage
    &&!!headingKey(unit.title)&&headingKey(activePage.title)===headingKey(unit.title)
  const nextPage=()=>{
    if(!activePage||currentIndex>=visiblePages.length-1)return
    for(const q of activePage.questions){
      if(!shownFormKeys?.has(q.itemKey)||!q.required)continue
      if(q.allowRefusal&&!['MATRIX','MATRIX_MULTIPLE'].includes(q.type)&&
        isTaskFormRefusal(answer[q.itemKey]))continue
      const keys=['MATRIX','MATRIX_MULTIPLE'].includes(q.type)
        ?(q.rows||[]).map(row=>q.itemKey+':'+row.rowKey):[q.itemKey]
      const empty=keys.some(key=>{
        const value=answer[key]
        return !isTaskFormRefusal(value)&&(value===null||value===undefined||value===''||
          (Array.isArray(value)&&value.length===0))
      })
      const rankInvalid=q.type==='RANK_ORDER'&&
        (!Array.isArray(answer[q.itemKey])||(answer[q.itemKey] as string[]).length!==q.options.length)
      const totalInvalid=q.type==='CONSTANT_SUM'&&(()=>{
        const v=answer[q.itemKey]
        if(!v||typeof v!=='object'||Array.isArray(v)||isTaskFormRefusal(v))return true
        const numbers=v as Record<string,number>
        return q.options.some(opt=>!Number.isFinite(numbers[opt.optionKey]))||
          Math.abs(q.options.reduce((n,opt)=>n+numbers[opt.optionKey],0)-(q.total??0))>1e-7
      })()
      const otherInvalid=hasSelectedOther(q,answer[q.itemKey])&&
        (typeof answer[q.itemKey+':other']!=='string'||
          !(answer[q.itemKey+':other'] as string).trim())
      if(empty||rankInvalid||totalInvalid||otherInvalid){
        setPageError('请先完成当前页的必答题：'+q.prompt)
        document.getElementById('survey-answer-'+unit.instrumentKey+'-'+q.itemKey)?.focus()
        return
      }
    }
    setPageError('')
    onPageChange(currentIndex+1)
    window.requestAnimationFrame(()=>document.getElementById(
      'survey-page-'+unit.instrumentKey)?.focus())
  }
  const choice=(q:TaskFormQuestion,options:Choice[],kind:'SINGLE'|'MULTIPLE'|'MATRIX'|'LIKERT')=>
    kind==='MULTIPLE'?options.map(o=>{
      const selected=Array.isArray(answer[q.itemKey])?answer[q.itemKey] as string[]:[]
      return <label className={surveyForm?'survey-form-choice':'block my-2 text-sm'} key={o.optionKey}>
        <input type="checkbox" checked={selected.includes(o.optionKey)}
          disabled={!selected.includes(o.optionKey)&&q.maxSelections!==undefined
            &&selected.length>=q.maxSelections&&!q.exclusiveOptionKeys?.includes(o.optionKey)}
          onChange={e=>onChange(q.itemKey,toggleFormMultiple(
            selected,o.optionKey,e.target.checked,q.exclusiveOptionKeys))}/><span>{o.label}</span></label>
    }):options.map(o=><label className={surveyForm?'survey-form-choice':'block my-2 text-sm'} key={o.optionKey}>
      <input type="radio" name={unit.instrumentKey+'-'+q.itemKey}
        checked={answer[q.itemKey]===o.optionKey} disabled={unit.kind==='SCALE'&&!!q.images?.length&&imageReady?.[q.itemKey]!==true}
        onChange={()=>{if(advanceSingleChoiceFocus&&activePage)pendingChoiceFocus.current={key:q.itemKey,value:o.optionKey,unit:unit.instrumentKey,page:activePage.pageKey};onChange(q.itemKey,o.optionKey)}}/><span>{o.label}</span></label>)
  const item=(q:TaskFormQuestion,index?:number)=>{
    if(shownFormKeys&&!shownFormKeys.has(q.itemKey))return null
    return <fieldset disabled={readOnly} className={'border rounded-lg p-4 my-4 bg-white scroll-mt-4'+(surveyForm?' survey-form-item survey-form-item--'+q.type.toLowerCase():'')}
      id={'survey-answer-'+unit.instrumentKey+'-'+q.itemKey} tabIndex={-1} key={q.itemKey}>
      <legend className="font-medium text-sm">{surveyForm?<><span className="survey-form-number" aria-hidden="true">{String((index??0)+1).padStart(2,'0')}</span><span className="survey-form-prompt">{q.prompt}</span><span className="survey-form-requirement">{q.required?'必答':'选填'}</span></>:<>{q.prompt}{q.required?' *':''}</>}</legend>
      {unit.kind==='SCALE'&&proof&&<SurveyCatalogScaleMedia item={q} proof={proof} instrumentKey={unit.instrumentKey} itemKey={q.itemKey} complete={videoComplete?.[q.itemKey]} onComplete={()=>onVideoComplete?.(q.itemKey)} onImagesReadyChange={ready=>onImageReadyChange?.(q.itemKey,ready)} readOnly={readOnly}/>}
      {q.materials?.map(item=><SurveyMaterialDisplay key={item.asset.assetId} item={item} proof={proof}/>)}
      {q.image&&proof&&<SurveyParticipantImage image={q.image} proof={proof}/>}
      {q.type==='MULTIPLE'&&q.maxSelections!==undefined&&<p className="text-xs mb-2">
        请选 {q.minSelections??1} 至 {q.maxSelections} 项。</p>}
      {['SINGLE','LIKERT','MULTIPLE'].includes(q.type)&&choice(q,q.options,q.type as 'SINGLE'|'LIKERT'|'MULTIPLE')}
      {unit.kind==='FORM'&&['SINGLE','MULTIPLE'].includes(q.type)&&q.otherOptionKey&&
        <FormChoiceExtras question={q} answers={answer} onChange={onChange}/>}
      {q.type==='MATRIX'&&<div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr><th scope="col">项目</th>{q.options.map(o=><th scope="col" key={o.optionKey}>{o.label}</th>)}
          {q.allowRefusal&&<th scope="col">不愿回答</th>}</tr></thead>
        <tbody>{(q.rows||[]).map(row=><tr key={row.rowKey}><th scope="row">{row.label}</th>{q.options.map(o=><td className="text-center" key={o.optionKey}>
          <input type="radio" name={unit.instrumentKey+'-'+q.itemKey+'-'+row.rowKey}
            aria-label={q.prompt+' · '+row.label+' · '+o.label}
            checked={answer[q.itemKey+':'+row.rowKey]===o.optionKey}
            onChange={()=>onChange(q.itemKey+':'+row.rowKey,o.optionKey)}/>
        </td>)}
        {q.allowRefusal&&<td className="text-center"><input type="radio"
          aria-label={q.prompt+' · '+row.label+' · 不愿回答'}
          name={unit.instrumentKey+'-'+q.itemKey+'-'+row.rowKey}
          checked={isTaskFormRefusal(answer[q.itemKey+':'+row.rowKey])}
          onChange={()=>onChange(q.itemKey+':'+row.rowKey,refusal())}/></td>}</tr>)}</tbody></table></div>}
      {['DATE','TIME','RANK_ORDER','SLIDER','CONSTANT_SUM','MATRIX_MULTIPLE'].includes(q.type)&&
        <ProfessionalFormAnswer question={q} answers={answer} prefix={unit.instrumentKey} onAnswer={onChange}/>}
      {q.type==='NUMBER'&&<BasicFormAnswer question={{...q,prompt:q.prompt||'数值回答'}} className="input block w-full" value={typeof answer[q.itemKey]==='number'?answer[q.itemKey] as number:null} disabled={isTaskFormRefusal(answer[q.itemKey])} onChange={value=>onChange(q.itemKey,value)}/>}
      {q.allowRefusal&&!['MATRIX','MATRIX_MULTIPLE'].includes(q.type)&&<label className="block my-3 text-sm">
        <input type="checkbox" checked={isTaskFormRefusal(answer[q.itemKey])}
          onChange={e=>onChange(q.itemKey,e.target.checked?refusal():null)}/>
        我选择不回答这一题（REFUSED）
      </label>}
      {['SHORT_TEXT','LONG_TEXT'].includes(q.type)&&<BasicFormAnswer question={{...q,prompt:q.prompt||'文本回答'}} value={typeof answer[q.itemKey]==='string'?answer[q.itemKey] as string:null} disabled={isTaskFormRefusal(answer[q.itemKey])} onChange={value=>onChange(q.itemKey,value)}/>}
    </fieldset>
  }
  return <section className={'border rounded-xl bg-slate-50 p-4 my-5'+(purpose==='SURVEY'?' survey-answer-panel'+(surveyForm?' survey-form-experience':''):'')}>
    <h3 className="text-lg font-semibold">{unit.title}</h3>
    {unit.instruction&&<p className="survey-answer-guide" role="note">{unit.instruction}</p>}
    {purpose==='SURVEY'&&unit.kind==='SJT'&&<p className="survey-answer-guide">请先阅读情境，再选择你的回答。* 为必答。</p>}
    {unit.kind==='FORM'&&<div>
      {(!surveyForm||visiblePages.length>1)&&<div className="survey-form-page-progress"><p className="text-sm mt-3" role="status">第 {activePage?currentIndex+1:0} / {visiblePages.length} 页
        {purpose==='HUITEACHER'&&'（所有页面完成后一次性提交正式评价）'}</p>
      <progress className="w-full" max={Math.max(1,visiblePages.length)}
        value={activePage?currentIndex+1:0} aria-label="本工具作答进度"/></div>}
      {activePage&&<div key={activePage.pageKey} className={surveyForm?'survey-form-page':undefined}>
        <h4 className={'mt-4 font-medium scroll-mt-5'+(repeatedPageHeading?' sr-only':'')} id={'survey-page-'+unit.instrumentKey}
          tabIndex={-1}>{activePage.title}</h4>{activePage.description&&<p className="whitespace-pre-wrap text-sm">{activePage.description}</p>}
        {activePage.questions.filter(q=>shownFormKeys?.has(q.itemKey)).map((q,index)=>item(q,index))}
      </div>}
      {pageError&&<p role="alert" className="text-sm text-red-700 my-2">{pageError}</p>}
      {(purpose!=='SURVEY'||visiblePages.length>1)&&<nav aria-label="问卷分页" className={purpose==='SURVEY'?'survey-question-navigation':'flex justify-between gap-3 mt-4'}>
        <button type="button" className="btn-secondary" disabled={currentIndex===0}
          onClick={()=>{setPageError('');onPageChange(Math.max(0,currentIndex-1));window.requestAnimationFrame(()=>document.getElementById('survey-page-'+unit.instrumentKey)?.focus())}}>上一页</button>
        <button type="button" className="btn-secondary"
          disabled={!activePage||currentIndex>=visiblePages.length-1} onClick={nextPage}>下一页</button>
      </nav>}
    </div>}
    {unit.kind==='SCALE'&&unit.items?.map(q=>item({...q,type:'LIKERT',options:q.responseOptions??unit.responseOptions??[]}))}
    {purpose==='SURVEY'&&unit.kind!=='SJT'&&!surveyForm&&<p className="survey-answer-guide">* 为必答。</p>}
    {unit.kind==='SJT'&&(unit.scenes??[{sceneKey:'legacy',title:unit.scenarioTitle,stimulus:unit.stimulus,image:unit.image,questions:unit.questions??[]}]).map(scene=><section key={scene.sceneKey} aria-label={'情境 '+scene.title} className="mt-4 space-y-3">
      <h4 className="font-medium">{scene.title}</h4><p className="whitespace-pre-wrap text-sm">{scene.stimulus}</p>
      {scene.image&&proof&&<SurveyParticipantImage image={scene.image} proof={proof}/>}
      {scene.questions.map(q=>item({itemKey:q.questionKey,type:q.responseType==='MULTIPLE'?'MULTIPLE':'SINGLE',
        prompt:q.prompt,options:q.options,required:q.required??true,allowRefusal:q.allowRefusal,
        minSelections:q.minSelections,maxSelections:q.maxSelections,
        exclusiveOptionKeys:[...(q.exclusiveOptionKeys??[]),...q.options.filter(o=>o.nonanswerReason).map(o=>o.optionKey)]}))}
    </section>)}
  </section>
}
