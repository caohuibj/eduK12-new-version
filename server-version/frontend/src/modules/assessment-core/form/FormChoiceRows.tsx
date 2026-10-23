import {useId,useRef,type ReactNode} from 'react'
import {ArrowDown,ArrowUp,Plus,Trash2} from 'lucide-react'
import {parseFormBulkLines} from './bulkLines'

export type FormChoiceRow={id:string;value:string;label:string}
type Props={
  appearance:'survey'|'training'
  title:string
  choices:FormChoiceRow[]
  onChange:(choices:FormChoiceRow[])=>void
  createChoice:(existing:FormChoiceRow[],label?:string)=>FormChoiceRow
  max:number
  codesVisible?:boolean
  onPasteFailure:(text:string,error:string)=>void
  onNotice:(notice:string)=>void
  validate?:(choices:FormChoiceRow[])=>string
  toolbarExtras?:ReactNode
}

/** Both products use the same keyboard, paste, order and identity-preserving row controls. */
export function FormChoiceRows({appearance,title,choices,onChange,createChoice,max,codesVisible=false,onPasteFailure,onNotice,validate,toolbarExtras}:Props){
  const id=useId(),survey=appearance==='survey'
  const inputs=useRef(new Map<string,HTMLInputElement>())
  const focus=(row:FormChoiceRow)=>requestAnimationFrame(()=>inputs.current.get(row.id)?.focus())
  const insert=(index:number)=>{
    if(choices.length>=max)return
    const row=createChoice(choices)
    onChange([...choices.slice(0,index+1),row,...choices.slice(index+1)]);focus(row)
  }
  const move=(index:number,by:number)=>{
    const next=[...choices];[next[index],next[index+by]]=[next[index+by],next[index]]
    onChange(next);focus(next[index+by])
  }
  const pasteAt=(index:number,text:string)=>{
    try{
      const lines=parseFormBulkLines(text)
      if(!lines.length)return
      const replacingEmpty=!choices[index].label.trim()
      const keep=replacingEmpty?choices.filter((_,i)=>i!==index):choices
      const pasted:FormChoiceRow[]=[]
      for(const line of lines){
        if(line.label.length>2000)throw new Error('每项文字最多 2000 个字符。')
        pasted.push(replacingEmpty&&!pasted.length?{...choices[index],label:line.label}:createChoice([...keep,...pasted],line.label))
      }
      const at=index+(replacingEmpty?0:1)
      const inserted=[...keep.slice(0,at),...pasted,...keep.slice(at)]
      const next=inserted.filter(row=>row.label.trim())
      if(next.length>max)throw new Error(`最多支持 ${max} 项，请减少后再添加。`)
      if(new Set(next.filter(row=>row.label.trim()).map(row=>row.value.trim())).size!==next.filter(row=>row.label.trim()).length)throw new Error('选项编码重复，请检查。')
      const problem=validate?.(next)
      if(problem)throw new Error(problem)
      onChange(next);onNotice(`已粘贴 ${pasted.length} 项，可继续逐项编辑。`)
      if(pasted.length)focus(pasted[pasted.length-1])
    }catch(error){onPasteFailure(text,(error as Error).message)}
  }
  const buttonClass=survey?'btn-secondary':'hui-button hui-button--secondary'
  return <>
    <p id={id+'-hint'} className={survey?'survey-form-setting-note':'qt-form-hint'}>每项单独填写，按 Enter 继续下一项。也可直接粘贴多行文字；逗号和等号会保留。</p>
    <ol className={survey?'survey-form-choice-list':'qt-choice-list'} aria-label={title+'列表'}>
      {choices.map((choice,index)=><li key={choice.id} className={survey?'survey-form-option-row':'qt-choice-row'+(codesVisible?' has-code':'')}>
        <span className={survey?'survey-form-option-number':'qt-choice-number'} aria-hidden="true">{index+1}</span>
        {codesVisible&&<input aria-label={`${title} ${index+1} 编码`} className="qt-choice-code" value={choice.value} onChange={event=>onChange(choices.map((row,i)=>i===index?{...row,value:event.target.value}:row))}/>}
        <input className={survey?'input flex-1':undefined} aria-label={`${title} ${index+1}${survey?'':' 文字'}`} aria-describedby={id+'-hint'} placeholder={`填写${title} ${index+1}`} ref={element=>{if(element)inputs.current.set(choice.id,element);else inputs.current.delete(choice.id)}} value={choice.label}
          onChange={event=>onChange(choices.map((row,i)=>i===index?{...row,label:event.target.value}:row))}
          onKeyDown={event=>{
            if(event.key!=='Enter'||event.nativeEvent.isComposing||event.keyCode===229)return
            event.preventDefault()
            if(index<choices.length-1)focus(choices[index+1]);else insert(index)
          }}
          onPaste={event=>{
            const text=event.clipboardData.getData('text/plain')
            if(!/[\r\n\t]/.test(text))return
            event.preventDefault();pasteAt(index,text)
          }}/>
        <div className={survey?'survey-form-choice-actions':'qt-choice-actions'}>
          <button type="button" className={buttonClass} aria-label={`上移${title} ${index+1}`} title="上移" disabled={index===0} onClick={()=>move(index,-1)}><ArrowUp size={14}/></button>
          <button type="button" className={buttonClass} aria-label={`下移${title} ${index+1}`} title="下移" disabled={index===choices.length-1} onClick={()=>move(index,1)}><ArrowDown size={14}/></button>
          <button type="button" className={buttonClass} aria-label={`删除${title} ${index+1}`} title="删除" onClick={()=>{
            const next=choices.filter((_,i)=>i!==index)
            onChange(next.length?next:survey?[]:[createChoice(choices)])
            if(next.length)focus(next[Math.min(index,next.length-1)])
          }}><Trash2 size={14}/></button>
        </div>
      </li>)}
    </ol>
    <div className={survey?'survey-form-choice-toolbar':'qt-choice-toolbar'}><button type="button" className={buttonClass+(survey?' survey-form-choice-add':'')} disabled={choices.length>=max} onClick={()=>insert(choices.length-1)}><Plus size={14}/>{survey?(title==='选项'?'增加选项':'增加矩阵行'):'添加'+title}</button>{toolbarExtras}</div>
  </>
}
