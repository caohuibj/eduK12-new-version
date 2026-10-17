import type { FormChoiceExtrasQuestion, ProfessionalAnswer } from './types'

/** A checked exclusive item replaces previous selections; ordinary choices
 * replace an earlier exclusive choice. The FINAL validator independently enforces it.
 */
export function toggleFormMultiple(
  current:readonly string[],key:string,checked:boolean,exclusive:readonly string[]=[],
):string[]{
  if(!checked)return current.filter(x=>x!==key)
  if(exclusive.includes(key))return [key]
  return [...current.filter(x=>!exclusive.includes(x)&&x!==key),key]
}
export function hasSelectedOther(question:FormChoiceExtrasQuestion,answer:unknown):boolean{
  if(!question.otherOptionKey)return false
  return answer===question.otherOptionKey||
    (Array.isArray(answer)&&answer.includes(question.otherOptionKey))
}
/** Visible only for selected Other. Ordinary blank and explicit numeric zero
 * remain distinct, and hidden/stale text is stripped before final submission.
 */
export function FormChoiceExtras({question,answers,onChange}:{
  question:FormChoiceExtrasQuestion;answers:Record<string,ProfessionalAnswer>;
  onChange:(key:string,value:ProfessionalAnswer)=>void
}){
  if(!hasSelectedOther(question,answers[question.itemKey]))return null
  const otherKey=question.itemKey+':other'
  const label=question.options.find(o=>o.optionKey===question.otherOptionKey)?.label||'其他'
  const text=answers[otherKey]
  return <label className="block mt-3 text-sm space-y-1">
    <span className="block">请说明「{label}」（必填，最多 {question.otherMaxLength??300} 字）</span>
    <input className="input block w-full" required type="text"
      aria-label={'其他填写：'+question.itemKey} maxLength={question.otherMaxLength??300}
      value={typeof text==='string'?text:''}
      onChange={e=>onChange(otherKey,e.target.value)}/>
  </label>
}
