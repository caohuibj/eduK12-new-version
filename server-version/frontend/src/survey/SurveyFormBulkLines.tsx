import {useEffect,useState} from 'react'
import {FormBulkPanel} from '../modules/assessment-core/form/FormBulkPanel'
import {parseFormBulkLines} from '../modules/assessment-core/form/bulkLines'

type Props={
  id:string
  kind:'选项'|'矩阵行'
  labels:string[]
  limit:number
  minimum:number
  minimumRetained?:number
  onApply:(lines:string[],mode:'append'|'replace')=>void
  onPendingChange?:(id:string,pending:boolean)=>void
  initialText?:string
}

export function SurveyFormBulkLines({id,kind,labels,limit,minimum,minimumRetained=0,onApply,onPendingChange,initialText=''}:Props){
  const [text,setText]=useState(initialText),[mode,setMode]=useState<'append'|'replace'>('append')
  useEffect(()=>{onPendingChange?.(id,!!initialText.trim());return()=>onPendingChange?.(id,false)},[id,onPendingChange,initialText])
  let lines:string[]=[],parseError=''
  try{lines=parseFormBulkLines(text).map(line=>line.label)}catch(error){parseError=(error as Error).message}
  const total=mode==='append'?labels.filter(label=>label.trim()).length+lines.length:lines.length
  const error=parseError|| (lines.some(line=>line.length>2000)?'每行最多 2000 个字符。'
    :total>limit?`应用后共 ${total} 项，最多允许 ${limit} 项。`
    :lines.length&&total<minimum?`至少需要 ${minimum} 项。`
    :mode==='replace'&&lines.length<minimumRetained?'将移除被其他填写、互斥或条件显示引用的选项。请保留这些行，或先调整对应设置。':'')
  const update=(next:string)=>{setText(next);onPendingChange?.(id,!!next.trim())}
  return <details className="survey-form-bulk-lines" open={initialText?true:undefined}>
    <summary>批量编辑{kind}<span>每行一项</span></summary>
    <FormBulkPanel appearance="survey" title={kind} text={text} onTextChange={update} mode={mode} onModeChange={setMode}
      help={<>一行一个{kind==='矩阵行'?'题干（矩阵的一行）':'选项'}，空行会忽略。{kind==='矩阵行'?'回答列请在上方“选项”中设置。':'可直接粘贴 Excel 的单列内容。'}{mode==='replace'&&(kind==='矩阵行'?'替换按行对应，保留原行标识。':'替换按行对应，保留原行标识；调整顺序时请留意引用该选项的条件。')}</>}
      error={error} summary={lines.length?`识别 ${lines.length} 项 · 应用后 ${total}/${limit} 项`:`当前 ${labels.length}/${limit} 项 · 每行一项`}
      preview={lines.map(label=>({label}))}
      ready={!!lines.length} applyLabel={'应用'+kind} onApply={()=>{onApply(lines,mode);update('')}}
      onLoadExisting={()=>{setMode('replace');update(labels.join('\n'))}}
      secondary={text?{label:'清空输入',onClick:()=>update('')}:undefined}
      pendingNote="批量内容尚未应用。应用后，再点击“添加题目”或“保存题目修改”保存。"/>
  </details>
}
