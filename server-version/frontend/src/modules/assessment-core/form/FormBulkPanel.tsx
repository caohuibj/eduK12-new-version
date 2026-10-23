import {useId,type ReactNode} from 'react'
import type {FormBulkLine} from './bulkLines'

type Props={
  appearance:'survey'|'training'
  title:string
  text:string
  onTextChange:(text:string)=>void
  mode:'append'|'replace'
  onModeChange:(mode:'append'|'replace')=>void
  codeFormat?:{coded:boolean;onChange:(coded:boolean)=>void}
  help:ReactNode
  error:string
  summary:ReactNode
  preview?:FormBulkLine[]
  ready:boolean
  applyLabel:string
  onApply:()=>void
  onLoadExisting?:()=>void
  secondary?:{label:string;onClick:()=>void}
  pendingNote?:ReactNode
}

/** Shared controls; each product owns identity mapping, validation, persistence and theme tokens. */
export function FormBulkPanel({appearance,title,text,onTextChange,mode,onModeChange,codeFormat,help,error,summary,preview,ready,applyLabel,onApply,onLoadExisting,secondary,pendingNote}:Props){
  const id=useId(),survey=appearance==='survey'
  const buttonClass=(primary=false)=>survey?(primary?'btn-primary':'btn-secondary'):`hui-button hui-button--${primary?'primary':'secondary'}`
  return <div className={survey?'survey-form-bulk-body':'qt-choice-bulk'} role="region" aria-label={'批量粘贴'+title}>
    {!survey&&<h3>批量录入{title}</h3>}
    <div className={survey?'survey-form-bulk-toolbar':'qt-choice-bulk-settings'}>
      {codeFormat&&<label>粘贴格式<select aria-label={title+'粘贴格式'} value={codeFormat.coded?'coded':'labels'} onChange={event=>codeFormat.onChange(event.target.value==='coded')}>
        <option value="labels">仅文字（一列）</option><option value="coded">编码 + 文字（两列）</option>
      </select></label>}
      <label>{survey?'写入方式':'应用方式'}<select className={survey?'input':undefined} aria-label={title+(survey?'批量写入方式':'应用方式')} value={mode} onChange={event=>onModeChange(event.target.value as 'append'|'replace')}>
        <option value="append">{survey?'追加到末尾':'追加到现有列表'}</option><option value="replace">{survey?'替换现有列表':'替换当前列表'}</option>
      </select></label>
      {onLoadExisting&&<button type="button" className={buttonClass()} onClick={onLoadExisting}>载入现有{title}</button>}
    </div>
    <p id={id+'-help'} className={survey?undefined:'qt-form-hint'}>{help}</p>
    {!survey&&<label htmlFor={id+'-paste'}>粘贴内容</label>}
    <textarea id={id+'-paste'} className={survey?'input':undefined} aria-label={title+'批量内容'} aria-describedby={id+'-help '+id+'-preview'} aria-invalid={!!text.trim()&&!!error} rows={5} maxLength={100000} placeholder={codeFormat?.coded?'yes\t是\nno\t否':title==='矩阵行'?'我能专注完成任务\n我能合理安排时间\n我能主动寻求帮助':'非常不同意\n不同意\n一般\n同意\n非常同意'} value={text} onChange={event=>onTextChange(event.target.value)}/>
    {!survey&&error&&<p className="qt-choice-error" role="alert">{error}</p>}
    {!survey&&<p id={id+'-preview'} className="qt-form-hint" aria-live="polite">{summary}</p>}
    {!error&&!!preview?.length&&<ol className={survey?'survey-form-bulk-preview':'qt-choice-preview'} aria-label={title+'粘贴预览'}>{preview.map((line,index)=><li key={index}>{line.label}{line.code!==undefined&&<small>{line.code}</small>}</li>)}</ol>}
    <div className={survey?'survey-form-bulk-footer':'qt-choice-toolbar'}>
      {survey&&<span id={id+'-preview'} aria-live="polite">{summary}</span>}
      <button type="button" className={buttonClass(true)} disabled={!ready||!!error} onClick={onApply}>{applyLabel}</button>
      {secondary&&<button type="button" className={buttonClass()} onClick={secondary.onClick}>{secondary.label}</button>}
    </div>
    {survey&&text.trim()&&(error?<p className="survey-form-bulk-error" role="alert">{error}</p>:pendingNote&&<p role="status">{pendingNote}</p>)}
  </div>
}
