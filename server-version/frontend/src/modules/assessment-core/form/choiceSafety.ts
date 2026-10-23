import type {FormBulkLine} from './bulkLines'
import type {FormChoiceRow} from './FormChoiceRows'

type ReferenceSource={itemKey?:string;otherOptionKey?:string;exclusiveOptionKeys?:readonly string[];displayIf?:{itemKey:string;optionKey:string}}
export function referencedFormChoiceKeys(question:ReferenceSource,questions:readonly ReferenceSource[]):string[]{
  return [...new Set([question.otherOptionKey,...(question.exclusiveOptionKeys??[]),
    ...questions.filter(item=>!!question.itemKey&&item.displayIf?.itemKey===question.itemKey).map(item=>item.displayIf?.optionKey)]
    .filter((key):key is string=>!!key))]
}

export function choiceReferenceError(previous:readonly FormChoiceRow[],next:readonly FormChoiceRow[],protectedKeys:readonly string[]=[]):string{
  const retained=new Set(next.map(row=>row.value)),protectedSet=new Set(protectedKeys)
  return previous.some(row=>protectedSet.has(row.value)&&!retained.has(row.value))
    ?'将移除被其他填写、互斥或条件显示引用的选项。请保留这些行，或先调整对应设置。':''
}

/** Text replacement keeps identity by position; explicit codes retain identity by code. */
export function planFormBulkChoices({existing,lines,mode,coded=false,create,minimum=0,maximum,protectedKeys=[]}:{
  existing:FormChoiceRow[];lines:FormBulkLine[];mode:'append'|'replace';coded?:boolean;
  create:(existing:FormChoiceRow[],label:string)=>FormChoiceRow;minimum?:number;maximum:number;protectedKeys?:readonly string[]
}):{next:FormChoiceRow[];error:string}{
  const added:FormChoiceRow[]=[]
  const nextLines=lines.map((line,index)=>{
    const retained=mode==='replace'?(coded?existing.find(row=>row.value===line.code):existing[index]):undefined
    const fresh=retained??create([...existing,...added],line.label)
    const next={...fresh,label:line.label,...(coded?{value:line.code??''}:{})}
    added.push(next);return next
  })
  const next=mode==='append'?[...existing.filter(row=>row.label.trim()||protectedKeys.includes(row.value)),...nextLines]:nextLines
  const error=lines.some(line=>line.label.length>2000)?'每行最多 2000 个字符。'
    :next.length>maximum?`应用后共 ${next.length} 项，最多允许 ${maximum} 项。`
    :lines.length&&next.length<minimum?`至少需要 ${minimum} 项。`
    :choiceReferenceError(existing,next,protectedKeys)
  return {next,error}
}
