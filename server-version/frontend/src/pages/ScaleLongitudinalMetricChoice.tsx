import type {Dispatch,SetStateAction} from 'react'
import type {ScaleDefinition} from './scaleDefinitionEditorModel'
/** Source-owner declaration for future fixed versions. No old source, task or
 * audience is changed by showing this editor. Task tracking is chosen later. */
export function ScaleLongitudinalMetricChoice({definition,onChange,disabled}:{definition:ScaleDefinition;onChange:Dispatch<SetStateAction<ScaleDefinition>>;disabled:boolean}){
 const contract=definition.report.audienceContract
 if(!contract||!(contract.respondent==='STUDENT_SELF'&&contract.audience==='student'||contract.respondent==='ADULT_SELF'&&contract.audience==='teacher'))return null
 const selected=contract.longitudinalMetricKeys??[]
 return <fieldset disabled={disabled} className="rounded border p-3 my-3"><legend>允许本人纵向查看的原始指标</legend>
  <p>明确选择本人数字反馈中的子集，保存并固定为新版本后生效。具体任务另行选择追踪指标。</p>
  {definition.scoring.scores.map(score=><label className="block" key={score.key}><input type="checkbox" checked={selected.includes(score.key)} onChange={event=>{
   const checked=event.target.checked
   onChange(current=>{const audience=current.report.audienceContract;if(!audience)return current;const keys=audience.longitudinalMetricKeys??[];return {...current,report:{...current.report,audienceContract:{...audience,longitudinalMetricKeys:checked?[...new Set([...keys,score.key])]:keys.filter(key=>key!==score.key)}}}})
  }}/>{score.label}</label>)}
 </fieldset>
}
