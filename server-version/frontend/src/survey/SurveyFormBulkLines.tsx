import {useEffect,useId,useState} from 'react'

type Props={
  id:string
  kind:'选项'|'矩阵行'
  labels:string[]
  limit:number
  minimum:number
  minimumRetained?:number
  onApply:(lines:string[],mode:'append'|'replace')=>void
  onPendingChange?:(id:string,pending:boolean)=>void
}

export function SurveyFormBulkLines({id,kind,labels,limit,minimum,minimumRetained=0,onApply,onPendingChange}:Props){
  const [text,setText]=useState(''),[mode,setMode]=useState<'append'|'replace'>('append')
  const helpId=useId(),previewId=useId()
  useEffect(()=>()=>onPendingChange?.(id,false),[id,onPendingChange])
  const lines=text.split(/\r\n?|\n/).map(line=>line.trim()).filter(Boolean)
  const total=mode==='append'?labels.length+lines.length:lines.length
  const error=lines.some(line=>line.length>2000)?'每行最多 2000 个字符。'
    :total>limit?`应用后共 ${total} 项，最多允许 ${limit} 项。`
    :lines.length&&total<minimum?`至少需要 ${minimum} 项。`
    :mode==='replace'&&lines.length<minimumRetained?'将移除被其他填写、互斥或条件显示引用的选项。请保留这些行，或先调整对应设置。':''
  const update=(next:string)=>{setText(next);onPendingChange?.(id,!!next.trim())}
  return <details className="survey-form-bulk-lines">
    <summary>批量编辑{kind}<span>每行一项</span></summary>
    <div className="survey-form-bulk-body">
      <div className="survey-form-bulk-toolbar">
        <label>写入方式<select className="input" aria-label={kind+'批量写入方式'} value={mode} onChange={event=>setMode(event.target.value as 'append'|'replace')}>
          <option value="append">追加到末尾</option><option value="replace">替换现有列表</option>
        </select></label>
        <button type="button" className="btn-secondary" onClick={()=>{setMode('replace');update(labels.join('\n'))}}>载入现有{kind}</button>
      </div>
      <p id={helpId}>一行一个{kind==='矩阵行'?'题干（矩阵的一行）':'选项'}，空行会忽略。{kind==='矩阵行'?'回答列请在上方“选项”中设置。':'可直接粘贴 Excel 的单列内容。'}{mode==='replace'&&(kind==='矩阵行'?'替换按行对应，保留原行标识。':'替换按行对应，保留原行标识；调整顺序时请留意引用该选项的条件。')}</p>
      <textarea className="input" aria-label={kind+'批量内容'} aria-describedby={helpId+' '+previewId} aria-invalid={!!text.trim()&&!!error} rows={5} maxLength={100000} placeholder={kind==='矩阵行'?'我能专注完成任务\n我能合理安排时间\n我能主动寻求帮助':'非常不同意\n不同意\n一般\n同意\n非常同意'} value={text} onChange={event=>update(event.target.value)}/>
      <div className="survey-form-bulk-footer">
        <span id={previewId} aria-live="polite">{lines.length?`识别 ${lines.length} 项 · 应用后 ${total}/${limit} 项`:`当前 ${labels.length}/${limit} 项 · 每行一项`}</span>
        <button type="button" className="btn-primary" disabled={!lines.length||!!error} onClick={()=>{onApply(lines,mode);update('')}}>应用{kind}</button>
        {text&&<button type="button" className="btn-secondary" onClick={()=>update('')}>清空输入</button>}
      </div>
      {text.trim()&&(error?<p className="survey-form-bulk-error" role="alert">{error}</p>:<p role="status">批量内容尚未应用。应用后，再点击“添加题目”或“保存题目修改”保存。</p>)}
    </div>
  </details>
}
