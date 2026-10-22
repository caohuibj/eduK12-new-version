import {AssessmentImagePreview,type ImageAuthoringAdapter} from '../../modules/assessment-media/AssessmentImageField'
import type {PrivateTool} from './privateToolClient'
import type {ScaleDefinition} from '../../pages/scaleDefinitionEditorModel'
import type {FormDraft} from '../../survey/builder.types'
import {BasicFormAnswer} from '../../modules/assessment-core/form/BasicFormAnswer'
import {ProfessionalFormAnswer} from '../../modules/assessment-core/form/ProfessionalFormAnswer'
import {FormChoiceExtras,toggleFormMultiple} from '../../modules/assessment-core/form/FormChoiceExtras'
import {visibleFormKeys} from '../../modules/assessment-core/form/form-visibility'
import type {ProfessionalAnswer} from '../../modules/assessment-core/form/types'

export function PrivateToolPreview({tool,answers,onAnswer,imageAdapter}:{tool:PrivateTool;answers:Record<string,ProfessionalAnswer>;onAnswer:(key:string,value:ProfessionalAnswer)=>void;imageAdapter?:ImageAuthoringAdapter}){
 if(tool.kind==='SCALE'){
  const definition=tool.definition as ScaleDefinition
  return <div className="education-private-preview">{[...definition.items].sort((a,b)=>a.sortOrder-b.sortOrder).map((item,index)=><fieldset key={item.itemCode}>
   <legend>{index+1}. {item.content}</legend>
   {imageAdapter&&[...(item.images??[])].sort((a,b)=>a.order-b.order).map((image,index)=><AssessmentImagePreview key={`${image.asset.assetId}:${index}`} adapter={imageAdapter} image={image}/>)}
   {definition.responseSets.find(set=>set.key===item.responseSetKey)?.options.map(option=><label key={JSON.stringify(option.value)}>
    <input type="radio" name={`private-${tool.id}-${item.itemCode}`} checked={answers[item.itemCode]===option.value} onChange={()=>onAnswer(item.itemCode,option.value)}/>{option.label}
   </label>)}
  </fieldset>)}</div>
 }
 const definition=tool.definition as FormDraft
 const visible=visibleFormKeys(definition.pages.flatMap(page=>page.questions),answers)
 return <div className="education-private-preview">{definition.pages.map(page=><section key={page.pageKey}>
  <h4>{page.title}</h4>{page.questions.filter(q=>visible.has(q.itemKey)).map(q=>{
   const answer=answers[q.itemKey]
   const refused=Boolean(answer&&typeof answer==='object'&&!Array.isArray(answer)&&'_surveyRefusal' in answer)
   return <fieldset key={q.itemKey}><legend>{q.prompt}{q.required?'（必答）':''}</legend>
    {q.image&&imageAdapter&&<AssessmentImagePreview adapter={imageAdapter} image={q.image}/>}
    <fieldset disabled={refused}>
     {['SHORT_TEXT','LONG_TEXT','NUMBER'].includes(q.type)?<BasicFormAnswer question={q} value={typeof answer==='string'||typeof answer==='number'?answer:null} onChange={value=>onAnswer(q.itemKey,value)}/>
      :q.type==='SINGLE'||q.type==='MULTIPLE'?q.options.map(option=><label key={option.optionKey}><input type={q.type==='MULTIPLE'?'checkbox':'radio'} name={`private-${tool.id}-${q.itemKey}`} checked={q.type==='MULTIPLE'?Array.isArray(answer)&&answer.includes(option.optionKey):answer===option.optionKey} onChange={event=>onAnswer(q.itemKey,q.type==='MULTIPLE'?toggleFormMultiple(Array.isArray(answer)?answer as string[]:[],option.optionKey,event.target.checked,q.exclusiveOptionKeys):option.optionKey)}/>{option.label}</label>)
      :<ProfessionalFormAnswer question={q} answers={answers} onAnswer={onAnswer} prefix={`private-${tool.id}`}/>}
     <FormChoiceExtras question={q} answers={answers} onChange={onAnswer}/>
    </fieldset>
    {q.allowRefusal&&!['MATRIX','MATRIX_MULTIPLE'].includes(q.type)&&<label><input type="checkbox" checked={refused} onChange={event=>onAnswer(q.itemKey,event.target.checked?{_surveyRefusal:true}:null)}/>不愿回答</label>}
   </fieldset>
  })}
 </section>)}</div>
}
