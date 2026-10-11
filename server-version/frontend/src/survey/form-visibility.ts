/** Follow the same left-to-right conditional chain as FINAL's formResult.
 * Hidden answers never become ancestors of another display condition.
 * The browser projects the view; the server remains the final authority.
 */
export type ConditionalFormItem={
  itemKey:string
  displayIf?:{itemKey:string;operator:'EQUALS'|'INCLUDES';optionKey:string}
  rows?:readonly {rowKey:string}[]
}
export function visibleFormKeys<T extends ConditionalFormItem>(
  questions:readonly T[],answers:Record<string,unknown>
):Set<string>{
  const previous:Record<string,unknown>={}
  const visible=new Set<string>()
  for(const question of questions){
    const rule=question.displayIf
    const source=rule?previous[rule.itemKey]:undefined
    const shown=!rule||(rule.operator==='INCLUDES'
      ?Array.isArray(source)&&source.includes(rule.optionKey)
      :source===rule.optionKey)
    if(!shown)continue
    visible.add(question.itemKey)
    previous[question.itemKey]=answers[question.itemKey]??null
  }
  return visible
}
export function sanitizeFormAnswers<T>(
  questions:readonly ConditionalFormItem[],answers:Record<string,T>
):Record<string,T>{
  const visible=visibleFormKeys(questions,answers)
  const cleaned={...answers}
  for(const question of questions){
    if(visible.has(question.itemKey))continue
    delete cleaned[question.itemKey]
    for(const row of question.rows??[])delete cleaned[question.itemKey+':'+row.rowKey]
  }
  return cleaned
}
