import {useState} from 'react'
import {FormChoiceRows,type FormChoiceRow} from '../modules/assessment-core/form/FormChoiceRows'
import {researchKey,type FormQuestion} from './builder.types'
import {SurveyFormBulkLines} from './SurveyFormBulkLines'

type Props={
  question:FormQuestion
  kind:'选项'|'矩阵行'
  limit:number
  minimumRetained?:number
  onChange:(next:FormQuestion)=>void
  onPendingChange?:(id:string,pending:boolean)=>void
}
export function SurveyFormChoiceList({question:q,kind,limit,minimumRetained,onChange,onPendingChange}:Props){
  const options=kind==='选项'
  const [notice,setNotice]=useState(''),[paste,setPaste]=useState<{text:string;nonce:number}>({text:'',nonce:0})
  const choices=options?q.options.map(row=>({id:row.optionKey,value:row.optionKey,label:row.label})):q.rows.map(row=>({id:row.rowKey,value:row.rowKey,label:row.label}))
  const change=(next:FormChoiceRow[])=>{
    if(options){
      const keys=new Set(next.map(row=>row.value)),hasOther=!!q.otherOptionKey&&keys.has(q.otherOptionKey)
      onChange({...q,options:next.map(row=>({...q.options.find(option=>option.optionKey===row.value),optionKey:row.value,label:row.label})),
        otherOptionKey:hasOther?q.otherOptionKey:undefined,otherMaxLength:hasOther?q.otherMaxLength:undefined,
        exclusiveOptionKeys:q.exclusiveOptionKeys?.filter(key=>keys.has(key))})
    }else onChange({...q,rows:next.map(row=>({rowKey:row.value,label:row.label}))})
  }
  const create=(_existing:FormChoiceRow[],label=''):FormChoiceRow=>{const key=researchKey(options?'o':'r');return {id:key,value:key,label}}
  return <div className="survey-form-options survey-form-rows-editor space-y-2">
    <p className="text-sm font-medium">{kind}</p>
    <FormChoiceRows appearance="survey" title={kind} choices={choices} onChange={change} createChoice={create} max={limit} onNotice={setNotice}
      onPasteFailure={(text,error)=>{setNotice(error);setPaste(previous=>({text,nonce:previous.nonce+1}))}}/>
    {notice&&<p className="survey-form-setting-note" role="status">{notice}</p>}
    <SurveyFormBulkLines key={paste.nonce} id={q.itemKey+kind} kind={kind} labels={choices.map(row=>row.label)} limit={limit} minimum={options?2:1} minimumRetained={minimumRetained} onPendingChange={onPendingChange} initialText={paste.text}
      onApply={(lines,mode)=>{
        const next=mode==='append'?[...choices.filter(row=>row.label.trim()),...lines.map(label=>create(choices,label))]:lines.map((label,i)=>choices[i]?{...choices[i],label}:create(choices,label))
        change(next);setNotice(`已${mode==='append'?'追加':'替换'} ${lines.length} 项，请保存题目。`)
      }}/>
  </div>
}
