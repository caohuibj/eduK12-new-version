import type {ReactNode} from 'react'
import type {RawScoreFeedbackRule,RawScoreFeedbackContent} from '../../scale/rawScoreFeedback'

/** The product supplies assets, identity and persistence; interval editing is shared. */
export function RawScoreFeedbackFields({rule,disabled=false,onChange,appearance,labelPrefix,fallbackLabel,fallbackTextLabel,addLabel,renderContent}:{
  rule:RawScoreFeedbackRule;disabled?:boolean;onChange:(rule:RawScoreFeedbackRule)=>void;
  appearance:'survey'|'training';labelPrefix:string;fallbackLabel:string;fallbackTextLabel:string;addLabel:string;
  renderContent?:(content:RawScoreFeedbackContent,onChange:(content:RawScoreFeedbackContent)=>void)=>ReactNode
}){
  const survey=appearance==='survey'
  const button=survey?'btn-secondary':'hui-button hui-button--secondary'
  return <>
    {rule.ranges.map((range,index)=>{
      const change=(patch:Partial<typeof range>)=>onChange({...rule,ranges:rule.ranges.map((entry,i)=>i===index?{...entry,...patch}:entry)})
      return <fieldset key={range.key} disabled={disabled} className={survey?'border rounded-lg bg-white p-3 space-y-3':'scale-feedback-range'}>
        <legend className={survey?'text-sm':undefined}>区间 {index+1}</legend>
        <div className={survey?'flex flex-wrap gap-3':'scale-feedback-boundaries'}>
          <label className={survey?'text-sm':undefined}>下限（包含）<input className={survey?'input block w-28':'input'} aria-label={`${labelPrefix} 区间 ${index+1} 下限`} type="number" step="any" value={Number.isFinite(range.min)?range.min:''} onChange={event=>change({min:event.target.value===''?NaN:Number(event.target.value)})}/></label>
          <label className={survey?'text-sm':undefined}>上限<input className={survey?'input block w-28':'input'} aria-label={`${labelPrefix} 区间 ${index+1} 上限`} type="number" step="any" value={Number.isFinite(range.max)?range.max:''} onChange={event=>change({max:event.target.value===''?NaN:Number(event.target.value)})}/></label>
          <label className={survey?'text-sm':undefined}><input type="checkbox" disabled={disabled||index!==rule.ranges.length-1} checked={range.includeMax} onChange={event=>change({includeMax:event.target.checked})}/>包含上限（仅最后区间）</label>
        </div>
        <label className={survey?'block text-sm':undefined}>反馈文字<textarea className={survey?'input block w-full':'input'} aria-label={`${labelPrefix} 区间 ${index+1} ${survey?'文字':'反馈文字'}`} rows={3} value={range.text} onChange={event=>change({text:event.target.value})}/></label>
        {renderContent?.(range,next=>change(next))}
        <button type="button" disabled={disabled} className={button} onClick={()=>onChange({...rule,ranges:rule.ranges.filter((_,i)=>i!==index)})}>删除区间</button>
      </fieldset>
    })}
    <button type="button" disabled={disabled} className={button} onClick={()=>{
      const min=rule.ranges[rule.ranges.length-1]?.max??0
      onChange({...rule,ranges:[...rule.ranges.map(range=>({...range,includeMax:false})),{key:`range_${crypto.randomUUID().replace(/-/g,'')}`,min,max:min+1,includeMax:true,text:''}]})
    }}>{addLabel}</button>
    <label className={survey?'flex gap-2 text-sm':'scale-feedback-fallback'}><input type="checkbox" disabled={disabled||(!survey&&!rule.ranges.length)} checked={!!rule.fallback} onChange={event=>{
      const next={...rule};if(event.target.checked)next.fallback={text:''};else delete next.fallback;onChange(next)
    }}/>{fallbackLabel}</label>
    {rule.fallback&&<div className={survey?'space-y-2':undefined}>
      <label className={survey?'block text-sm':undefined}>{survey?'兜底文字':'未匹配时的文字'}<textarea className={survey?'input block w-full':'input'} aria-label={fallbackTextLabel} disabled={disabled} value={rule.fallback.text} onChange={event=>onChange({...rule,fallback:{...rule.fallback!,text:event.target.value}})}/></label>
      {renderContent?.(rule.fallback,next=>onChange({...rule,fallback:next}))}
    </div>}
  </>
}
