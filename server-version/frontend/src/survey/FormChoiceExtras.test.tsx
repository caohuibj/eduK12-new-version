import { useState } from 'react'
import { fireEvent,render,screen } from '@testing-library/react'
import { describe,expect,it } from 'vitest'
import { FormChoiceExtras,hasSelectedOther,toggleFormMultiple } from './FormChoiceExtras'
import type { ProfessionalAnswer } from './ProfessionalFormAnswer'
import { sanitizeFormAnswers } from './form-visibility'

const options=[{optionKey:'a',label:'选项 A'},{optionKey:'other',label:'其他情况'},
  {optionKey:'none',label:'均不符合'}]
const question={itemKey:'source',type:'MULTIPLE',options,otherOptionKey:'other',
  otherMaxLength:20,exclusiveOptionKeys:['none']}
function Host(){
  const [answers,setAnswers]=useState<Record<string,ProfessionalAnswer>>({source:['other']})
  return <><FormChoiceExtras question={question} answers={answers}
    onChange={(key,value)=>setAnswers(old=>({...old,[key]:value}))}/>
    <output data-testid="answers">{JSON.stringify(answers)}</output></>
}
describe('Form V2 other text and exclusive-choice UI contracts',()=>{
  it('exclusive selection replaces ordinary choices and ordinary choices replace exclusive',()=>{
    expect(toggleFormMultiple(['a','other'],'none',true,['none'])).toEqual(['none'])
    expect(toggleFormMultiple(['none'],'a',true,['none'])).toEqual(['a'])
    expect(toggleFormMultiple(['a'],'other',true,['none'])).toEqual(['a','other'])
    expect(toggleFormMultiple(['a','other'],'a',false,['none'])).toEqual(['other'])
  })
  it('renders only after Other is selected and preserves explicit free text',()=>{
    expect(hasSelectedOther(question,['a','other'])).toBe(true)
    expect(hasSelectedOther(question,['a'])).toBe(false)
    render(<Host/>)
    const field=screen.getByRole('textbox',{name:'其他填写：source'})
    expect(field).toBeRequired()
    fireEvent.change(field,{target:{value:'具体情况'}})
    const answers=JSON.parse(screen.getByTestId('answers').textContent||'{}')
    expect(answers['source:other']).toBe('具体情况')
  })
  it('drops stale other text on deselection or hidden branches without losing regular answers',()=>{
    const questions=[question,{itemKey:'follow',otherOptionKey:'other',
      displayIf:{itemKey:'source',operator:'INCLUDES' as const,optionKey:'a'}}]
    const dirty={source:['none'],'source:other':'不应泄漏',follow:'other','follow:other':'泄漏'}
    expect(sanitizeFormAnswers(questions,dirty)).toEqual({source:['none']})
    expect(dirty['source:other']).toBe('不应泄漏')
    const valid={source:['other'],'source:other':'仍然保留'}
    expect(sanitizeFormAnswers(questions,valid)).toEqual(valid)
  })
})
