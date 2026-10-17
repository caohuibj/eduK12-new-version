import type { FormDraft } from './definition'
import { FormAnswerValidationError, isRefusal, optionValue, type AnswerMap, type MissingItem } from './answers'

function invalid(path:string,message:string):never {throw new FormAnswerValidationError(path,message)}
/** Normalize against a previously validated frozen definition. No entry identities,
 * persistence, authorization, digesting or scoring are performed here. */
export const normalizeFormAnswers=(d:FormDraft,answers:AnswerMap):{rawAnswers:AnswerMap;missing:MissingItem[]}=>{
  const valid=new Set(d.pages.flatMap(p=>p.questions.map(q=>q.itemKey)))
  const matrixSubkeys=new Set(d.pages.flatMap(p=>p.questions
    .filter(q=>q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE')
    .flatMap(q=>q.rows.map(r=>q.itemKey+':'+r.rowKey))))
  const otherSubkeys=new Set(d.pages.flatMap(p=>p.questions
    .filter(q=>q.otherOptionKey!==undefined).map(q=>q.itemKey+':other')))
  const permitted=new Set([...valid,...matrixSubkeys,...otherSubkeys])
  for(const answerKey of Object.keys(answers))if(!permitted.has(answerKey))
    invalid('answers.'+answerKey,'提交包含不存在的或未授权题目')
  const normalized:AnswerMap={},missing:MissingItem[]=[]
  const previous:AnswerMap={}
  for(const p of d.pages)for(const q of p.questions){
    const path='answers.'+q.itemKey
    let shown=true
    if(q.displayIf){
      const source=previous[q.displayIf.itemKey]
      shown=q.displayIf.operator==='INCLUDES'
        ?Array.isArray(source)&&source.includes(q.displayIf.optionKey)
        :source===q.displayIf.optionKey
    }
    if(!shown){
      if(Object.prototype.hasOwnProperty.call(answers,q.itemKey)||
        q.rows.some(row=>Object.prototype.hasOwnProperty.call(answers,q.itemKey+':'+row.rowKey))||
        (q.otherOptionKey!==undefined&&Object.prototype.hasOwnProperty.call(answers,q.itemKey+':other')))
        invalid(path,'隐藏的题目不能提交回答')
      missing.push({itemKey:q.itemKey,reason:'NOT_SHOWN'})
      if(q.otherOptionKey)missing.push({itemKey:q.itemKey+':other',reason:'NOT_SHOWN'})
      continue
    }
    const value=answers[q.itemKey]
    if(q.type!=='MATRIX'&&q.type!=='MATRIX_MULTIPLE'&&isRefusal(value)){
      if(!q.allowRefusal)invalid(path,'此题未声明允许明确拒答')
      if(q.otherOptionKey){
        if(Object.prototype.hasOwnProperty.call(answers,q.itemKey+':other'))
          invalid(path+'.other','明确拒答时不能同时提交其他填写内容')
        missing.push({itemKey:q.itemKey+':other',reason:'NOT_SHOWN'})
      }
      missing.push({itemKey:q.itemKey,reason:'REFUSED'})
      previous[q.itemKey]=null
      continue
    }
    if(q.type==='SINGLE'||q.type==='LIKERT'){
      const v=optionValue(value,q.options.map(x=>x.optionKey),path,q.required)
      if(v===null)missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      else normalized[q.itemKey]=v
    }else if(q.type==='MULTIPLE'){
      if(value===undefined||value===null){
        if(q.required)invalid(path,'必答多选题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(!Array.isArray(value)||value.some(x=>typeof x!=='string')||
          new Set(value).size!==value.length||value.some(x=>!q.options.some(o=>o.optionKey===x)))
          invalid(path,'多选内容必须为无重复的有效选项')
        if(q.required&&!value.length)invalid(path,'必答多选题没有选择')
        if(value.length>1&&value.some(key=>q.exclusiveOptionKeys?.includes(key)))
          invalid(path,'互斥选项不能与其他选项同时选择')
        if(value.length&&((q.minSelections!==undefined&&value.length<q.minSelections)||
          (q.maxSelections!==undefined&&value.length>q.maxSelections)))
          invalid(path,'多选题选择数量不在规定范围内')
        normalized[q.itemKey]=value
      }
    }else if(q.type==='RANK_ORDER'){
      if(value===undefined||value===null){
        if(q.required)invalid(path,'必答排序题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        const codes=q.options.map(o=>o.optionKey)
        if(!Array.isArray(value)||value.length!==codes.length||
          value.some(x=>typeof x!=='string'||!codes.includes(x))||
          new Set(value).size!==value.length)
          invalid(path,'排序必须包含每个选项且不可重复')
        normalized[q.itemKey]=value
      }
    }else if(q.type==='CONSTANT_SUM'){
      if(value===undefined||value===null){
        if(q.required)invalid(path,'必答恒定总和题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(typeof value!=='object'||Array.isArray(value)||isRefusal(value))
          invalid(path,'恒定总和题必须提交选项到数值的对象')
        const numbers=value as Record<string,unknown>
        const codes=q.options.map(o=>o.optionKey)
        if(Object.keys(numbers).length!==codes.length||
          Object.keys(numbers).some(k=>!codes.includes(k)))
          invalid(path,'恒定总和题必须为每个选项提交一个数值')
        const values=codes.map(k=>numbers[k])
        if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||
          (q.integerOnly&&!Number.isSafeInteger(v))))
          invalid(path,'恒定总和题必须是非负的有效数值')
        const sum=(values as number[]).reduce((a,b)=>a+b,0)
        if(!Number.isFinite(sum)||Math.abs(sum-(q.total??NaN))>1e-7)
          invalid(path,'各选项之和必须等于规定总值')
        normalized[q.itemKey]=Object.fromEntries(codes.map(k=>[k,numbers[k] as number]))
      }
    }else if(q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE'){
      if(value!==undefined)invalid(path,'矩阵题请按独立行提交，不能提交未经验证的汇总字段')
      const rows:Record<string,string|string[]>={}
      for(const row of q.rows){
        const rowKey=q.itemKey+':'+row.rowKey
        if(isRefusal(answers[rowKey])){
          if(!q.allowRefusal)invalid(path+'.'+row.rowKey,'此矩阵行未声明允许明确拒答')
          missing.push({itemKey:rowKey,reason:'REFUSED'})
          continue
        }
        if(q.type==='MATRIX_MULTIPLE'){
          const selected=answers[rowKey]
          if(selected===undefined||selected===null){
            if(q.required)invalid(path+'.'+row.rowKey,'必答矩阵多选行未完成')
            missing.push({itemKey:rowKey,reason:'SHOWN_MISSING'})
          }else{
            const codes=q.options.map(o=>o.optionKey)
            if(!Array.isArray(selected)||selected.some(x=>typeof x!=='string'||!codes.includes(x))||
              new Set(selected).size!==selected.length||selected.length>codes.length)
              invalid(path+'.'+row.rowKey,'矩阵多选行包含无效或重复选项')
            if(q.required&&!selected.length)invalid(path+'.'+row.rowKey,'必答矩阵行不能空选')
            if(selected.length&&((q.minSelections!==undefined&&selected.length<q.minSelections)||
               (q.maxSelections!==undefined&&selected.length>q.maxSelections)))
              invalid(path+'.'+row.rowKey,'矩阵行选择数量不在规定范围内')
            rows[row.rowKey]=selected
          }
        }else{
          const v=optionValue(answers[rowKey],q.options.map(x=>x.optionKey),path+'.'+row.rowKey,q.required)
          if(v!==null)rows[row.rowKey]=v
          else missing.push({itemKey:rowKey,reason:'SHOWN_MISSING'})
        }
      }
      normalized[q.itemKey]=rows
    }else if(q.type==='NUMBER'||q.type==='SLIDER'){
      if(value===undefined||value===null||value===''){
        if(q.required)invalid(path,'必答数值题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(typeof value!=='number'||!Number.isFinite(value)
          ||(q.min!==undefined&&value<q.min)||(q.max!==undefined&&value>q.max))
          invalid(path,'数值超出允许范围或格式错误')
        if(q.integerOnly&&!Number.isSafeInteger(value))
          invalid(path,'请填写有效整数')
        if(q.precision!==undefined){
          const factor=10**q.precision
          if(Math.abs(Math.round(value*factor)-value*factor)>1e-7)
            invalid(path,`此题最多允许 ${q.precision} 位小数`)
        }
        if(q.step!==undefined){
          // The HTML number input anchors step to min when it is configured.
          const steps=(value-(q.min??0))/q.step
          if(!Number.isFinite(steps)||Math.abs(steps-Math.round(steps))>1e-7)
            invalid(path,`数值必须以 ${q.step} 为步长`)
        }
        normalized[q.itemKey]=value
      }
    }else if(q.type==='DATE'||q.type==='TIME'){
      if(value===undefined||value===null||value===''){
        if(q.required)invalid(path,'必答日期/时间题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(typeof value!=='string')invalid(path,'日期/时间回答必须是 ISO 格式字符串')
        if(q.type==='DATE'){
          if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000-')||
            Number.isNaN(Date.parse(value+'T00:00:00.000Z'))||
            !new Date(value+'T00:00:00.000Z').toISOString().startsWith(value+'T'))
            invalid(path,'日期必须是有效的 YYYY-MM-DD')
        }else if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
          invalid(path,'时间必须是 24 小时 HH:mm 格式')
        normalized[q.itemKey]=value
      }
    }else{
      if(value===undefined||value===null||value===''){
        if(q.required)invalid(path,'必答文本题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(typeof value!=='string'||value.length>(q.maxLength??(q.type==='SHORT_TEXT'?300:10000)))
          invalid(path,'文本回答格式或长度不合法')
        if(q.textValidation==='EMAIL'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          invalid(path,'请填写有效电子邮箱格式')
        if(q.textValidation==='DIGITS'&&!/^\d+$/.test(value))
          invalid(path,'文本只能包含数字')
        if(q.textValidation==='ALPHANUMERIC'&&!/^[a-z0-9]+$/i.test(value))
          invalid(path,'文本只能包含英文字母及数字')
        normalized[q.itemKey]=value
      }
    }
    if(q.otherOptionKey){
      const otherKey=q.itemKey+':other'
      const chosen=typeof value==='string'?value===q.otherOptionKey:
        Array.isArray(value)&&value.includes(q.otherOptionKey)
      const provided=Object.prototype.hasOwnProperty.call(answers,otherKey)
      if(chosen){
        const text=answers[otherKey]
        if(typeof text!=='string'||!text.trim()||text.length>(q.otherMaxLength??300))
          invalid('answers.'+otherKey,'请选择其他选项后填写非空文本，并遵守字数限制')
        normalized[otherKey]=text
      }else{
        if(provided)invalid('answers.'+otherKey,'未选择其他选项时不能提交其他填写内容')
        missing.push({itemKey:otherKey,reason:'NOT_SHOWN'})
      }
    }
    // Display conditions must be evaluated from previously verified answers,
    // never from attacker-provided hidden/off-page state.
    previous[q.itemKey]=normalized[q.itemKey]??null
  }
  return {rawAnswers:normalized,missing}
}
