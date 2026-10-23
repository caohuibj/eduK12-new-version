import {useState} from 'react'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,describe,expect,it} from 'vitest'
import {privateFormRuntimeItem} from '../../../../backend/src/modules/education-tools/private-tool.form-runtime-adapter'
import {formQuestionSchema} from '../../../../backend/src/modules/assessment-core/form/definition'
import {normalizeFormAnswers} from '../../../../backend/src/modules/assessment-core/form/runtime'
import {normalizeTypedCompositeFormAnswer} from '../../../../backend/src/modules/assessment-runtime/typed-form'
import {FormPlayer,type FormPlayerValue,type FormPlayerOption} from '../questionnaire/FormPlayer'
import {PrivateToolPreview} from './PrivateToolPreview'
import type {PrivateTool} from './privateToolClient'
import type {FormQuestion,ProfessionalAnswer} from '../../modules/assessment-core/form/types'
import {trainingVisibleFields,type TrainingFormPolicy} from '../../modules/assessment-core/form/training-policy'

const options=[{optionKey:'yes',label:'愿意'},{optionKey:'no',label:'不愿意'}]
const question=(type:'SINGLE'|'MULTIPLE'|'MATRIX'|'MATRIX_MULTIPLE',key='q')=>formQuestionSchema.parse({
 itemKey:key,type,prompt:key,required:true,allowRefusal:true,options,
 rows:type.startsWith('MATRIX')?[{rowKey:'r1',label:'第一行'},{rowKey:'r2',label:'第二行'}]:[],
})
const compiled=(q:ReturnType<typeof question>,position=0)=>{
 const row=privateFormRuntimeItem(q,`field-${q.itemKey}`,position,position)
 return {...row,formOptions:row.formOptions as FormPlayerOption[],
  formDefinition:formQuestionSchema.parse(row.formDefinition),formPolicy:row.formPolicy as TrainingFormPolicy}
}
const field=(row:ReturnType<typeof compiled>)=>({formItemId:row.id,id:row.id,type:row.formType,label:row.formLabel,
 required:row.required,formDefinition:row.formDefinition as FormQuestion<never>,formPolicy:row.formPolicy})
function Player({row}:{row:ReturnType<typeof compiled>}){
 const [value,setValue]=useState<FormPlayerValue>(null)
 return <><FormPlayer item={field(row)} options={row.formOptions} value={value} onChange={setValue}
  position={1} total={1} onPrevious={()=>{}}/><output data-testid="value">{JSON.stringify(value)}</output></>
}
afterEach(cleanup)
describe('immutable private FORM adapter to real renderers',()=>{
 it('renders actual uppercase SINGLE and MULTIPLE DTOs and preserves conditional visibility and frozen identity',()=>{
  const single=compiled(question('SINGLE','first'))
  const multiple=compiled({...question('MULTIPLE','second'),displayIf:{itemKey:'first',operator:'EQUALS',optionKey:'yes'}},1)
  const frozen=JSON.stringify([single,multiple])
  expect(single.formType).toBe('SINGLE');expect(multiple.formType).toBe('MULTIPLE')
  const fields=[field(single),field(multiple)]
  expect(trainingVisibleFields(fields,{}).map(f=>f.id)).toEqual([single.id])
  const view=render(<Player row={single}/>)
  fireEvent.click(screen.getByRole('radio',{name:'愿意'}))
  const answer=JSON.parse(screen.getByTestId('value').textContent!)
  expect(answer).toBe('yes');expect(normalizeTypedCompositeFormAnswer(single,answer)).toBe('yes')
  expect(trainingVisibleFields(fields,{[single.id]:answer}).map(f=>f.id)).toEqual([single.id,multiple.id])
  view.unmount();render(<Player row={multiple}/>)
  fireEvent.click(screen.getByRole('checkbox',{name:'愿意'}))
  fireEvent.click(screen.getByRole('checkbox',{name:'不愿意'}))
  const selected=JSON.parse(screen.getByTestId('value').textContent!)
  expect(selected).toEqual(['yes','no'])
  expect(normalizeFormAnswers({schemaVersion:2,pages:[{pageKey:'page',title:'条件',questions:[single.formDefinition,multiple.formDefinition]}]}, {first:answer,second:selected}).rawAnswers.second).toEqual(['yes','no'])
  expect(trainingVisibleFields(fields,{[single.id]:'no',[multiple.id]:selected}).map(f=>f.id)).toEqual([single.id])
  expect(JSON.stringify([single,multiple])).toBe(frozen)
 })
 it.each(['MATRIX','MATRIX_MULTIPLE'] as const)('previews %s row refusal and cancellation without a forbidden aggregate key',type=>{
  const q=question(type)
  const definition={schemaVersion:2 as const,pages:[{pageKey:'page',title:'试填',questions:[q]}]}
  const tool={id:'private',title:'试填',kind:'FORM',revision:1,contentHash:'hash',definition} as PrivateTool
  function Preview(){const [answers,setAnswers]=useState<Record<string,ProfessionalAnswer>>({});return <>
   <PrivateToolPreview tool={tool} answers={answers} onAnswer={(key,value)=>setAnswers(old=>({...old,[key]:value}))}/>
   <output data-testid="answers">{JSON.stringify(answers)}</output></>}
  render(<Preview/>)
  expect(screen.queryByRole('checkbox',{name:/^不愿回答$/})).not.toBeInTheDocument()
  const first=within(screen.getByRole('group',{name:'第一行'})),second=within(screen.getByRole('group',{name:'第二行'}))
  fireEvent.click(first.getByRole('checkbox',{name:'不愿回答本行'}))
  fireEvent.click(second.getByRole(type==='MATRIX'?'radio':'checkbox',{name:'愿意'}))
  const read=()=>JSON.parse(screen.getByTestId('answers').textContent!)
  expect(read()).not.toHaveProperty('q')
  expect(normalizeFormAnswers(definition,read()).missing).toContainEqual({itemKey:'q:r1',reason:'REFUSED'})
  expect(first.getByRole(type==='MATRIX'?'radio':'checkbox',{name:'愿意'})).toBeDisabled()
  fireEvent.click(first.getByRole('checkbox',{name:'不愿回答本行'}))
  expect(read()['q:r1']).toBeNull();expect(read()).not.toHaveProperty('q')
  expect(()=>normalizeFormAnswers(definition,read())).toThrow(/必答/)
  fireEvent.click(first.getByRole(type==='MATRIX'?'radio':'checkbox',{name:'愿意'}))
  expect(normalizeFormAnswers(definition,read()).missing).toEqual([])
 })
 it('uses row refusal in the formal MATRIX player without changing the validated aggregate wire shape',()=>{
  const row=compiled(question('MATRIX'))
  render(<Player row={row}/>)
  fireEvent.click(within(screen.getByRole('group',{name:'第一行'})).getByRole('checkbox',{name:'不愿回答本行'}))
  fireEvent.click(within(screen.getByRole('group',{name:'第二行'})).getByRole('radio',{name:'愿意'}))
  const read=()=>JSON.parse(screen.getByTestId('value').textContent!)
  expect(read()).toEqual({r1:{_surveyRefusal:true},r2:'yes'})
  expect(normalizeTypedCompositeFormAnswer(row,read())).toEqual({r2:'yes'})
  fireEvent.click(within(screen.getByRole('group',{name:'第一行'})).getByRole('checkbox',{name:'不愿回答本行'}))
  expect(read()).toEqual({r2:'yes'})
  expect(()=>normalizeTypedCompositeFormAnswer(row,read())).toThrow(/必答/)
 })
})
