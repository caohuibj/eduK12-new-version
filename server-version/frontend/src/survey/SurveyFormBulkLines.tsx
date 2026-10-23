import {FormBulkPanel} from '../modules/assessment-core/form/FormBulkPanel'
import {parseFormBulkLines,type FormBulkLine} from '../modules/assessment-core/form/bulkLines'
import type {FormChoiceRow} from '../modules/assessment-core/form/FormChoiceRows'
import {planFormBulkChoices} from '../modules/assessment-core/form/choiceSafety'
import {useFormBulkDraft} from '../modules/assessment-core/form/useFormBulkDraft'

type Props={
  id:string
  kind:'选项'|'矩阵行'
  choices:FormChoiceRow[]
  createChoice:(existing:FormChoiceRow[],label:string)=>FormChoiceRow
  limit:number
  minimum:number
  protectedKeys?:readonly string[]
  onApply:(next:FormChoiceRow[],mode:'append'|'replace')=>void
  onPendingChange?:(id:string,pending:boolean)=>void
  initialText?:string
}

export function SurveyFormBulkLines({id,kind,choices,createChoice,limit,minimum,protectedKeys=[],onApply,onPendingChange,initialText=''}:Props){
  const {text,update,mode,setMode}=useFormBulkDraft(id,onPendingChange,initialText)
  let lines:FormBulkLine[]=[],parseError=''
  try{lines=parseFormBulkLines(text)}catch(error){parseError=(error as Error).message}
  const plan=planFormBulkChoices({existing:choices,lines,mode,create:createChoice,minimum,maximum:limit,protectedKeys})
  const error=parseError||plan.error
  return <details className="survey-form-bulk-lines" open={initialText?true:undefined}>
    <summary>批量编辑{kind}<span>每行一项</span></summary>
    <FormBulkPanel appearance="survey" title={kind} text={text} onTextChange={update} mode={mode} onModeChange={setMode}
      help={<>一行一个{kind==='矩阵行'?'题干（矩阵的一行）':'选项'}，空行会忽略。{kind==='矩阵行'?'回答列请在上方“选项”中设置。':'可直接粘贴 Excel 的单列内容。'}{mode==='replace'&&(kind==='矩阵行'?'替换按行对应，保留原行标识。':'替换按行对应，保留原行标识；调整顺序时请留意引用该选项的条件。')}</>}
      error={error} summary={lines.length?`识别 ${lines.length} 项 · 应用后 ${plan.next.length}/${limit} 项`:`当前 ${choices.length}/${limit} 项 · 每行一项`}
      preview={lines}
      ready={!!lines.length} applyLabel={'应用'+kind} onApply={()=>{onApply(plan.next,mode);update('')}}
      onLoadExisting={()=>{setMode('replace');update(choices.map(row=>row.label).join('\n'))}}
      secondary={text?{label:'清空输入',onClick:()=>update('')}:undefined}
      pendingNote="批量内容尚未应用。应用后，再点击“添加题目”或“保存题目修改”保存。"/>
  </details>
}
