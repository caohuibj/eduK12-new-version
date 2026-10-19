import {useState} from 'react'
import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {describe,expect,it} from 'vitest'
import {ResearchPreview} from './ResearchPreview'
import {TaskForm} from './SurveyPublicApp'
import type {FormQuestion,ResearchDraft} from './builder.types'
import type {ProfessionalAnswer} from './ProfessionalFormAnswer'

const question:FormQuestion={type:'MATRIX',itemKey:'matrix',prompt:'学习体验',required:true,
  allowRefusal:true,rows:[{rowKey:'r1',label:'课堂讨论'},{rowKey:'r2',label:'独立思考'}],
  options:[{optionKey:'yes',label:'符合'},{optionKey:'no',label:'不符合'}]}
const pages=[{pageKey:'p1',title:'合成矩阵',questions:[question]}]
const draft:ResearchDraft={id:'matrix-preview',projectId:'synthetic',instrumentKey:'form',kind:'FORM',
  title:'合成矩阵',status:'DRAFT',revision:1,createdAt:'',updatedAt:'',definition:{schemaVersion:1,pages}}
function Host({preview,initial={}}:{preview:boolean;initial?:Record<string,ProfessionalAnswer>}){
  const [answers,setAnswers]=useState(initial)
  return <>{preview?<ResearchPreview draft={draft} initialAnswers={initial} onSimulate={()=>{}}
    onAnswersChange={setAnswers}/>:<TaskForm unit={{kind:'FORM',instrumentKey:'form',title:'合成矩阵',pages}}
    pageIndex={0} onPageChange={()=>{}} answer={answers}
    onChange={(key,value)=>setAnswers(previous=>({...previous,[key]:value}))}/>}
    <output data-testid="answers">{JSON.stringify(answers)}</output></>
}
describe('Survey matrix names in participant and preview tables',()=>{
  it.each([false,true])('names every row/option and preserves keys, refusal, keyboard grouping and restored values (preview=%s)',async preview=>{
    const user=userEvent.setup(),view=render(<Host preview={preview}/>)
    for(const row of ['课堂讨论','独立思考'])for(const option of ['符合','不符合','不愿回答'])
      expect(screen.getByRole('radio',{name:'学习体验 · '+row+' · '+option})).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(6)
    await user.click(screen.getByRole('radio',{name:'学习体验 · 课堂讨论 · 符合'}))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio',{name:'学习体验 · 课堂讨论 · 不符合'})).toBeChecked()
    await user.click(screen.getByRole('radio',{name:'学习体验 · 独立思考 · 不愿回答'}))
    await waitFor(()=>expect(JSON.parse(screen.getByTestId('answers').textContent||'{}')).toEqual({
      'matrix:r1':'no','matrix:r2':{_surveyRefusal:true},
    }))
    view.unmount()
    render(<Host preview={preview} initial={{'matrix:r1':'no','matrix:r2':{_surveyRefusal:true}}}/>)
    expect(screen.getByRole('radio',{name:'学习体验 · 课堂讨论 · 不符合'})).toBeChecked()
    expect(screen.getByRole('radio',{name:'学习体验 · 独立思考 · 不愿回答'})).toBeChecked()
    await user.click(screen.getByRole('radio',{name:'学习体验 · 独立思考 · 符合'}))
    expect(screen.getByRole('radio',{name:'学习体验 · 独立思考 · 不愿回答'})).not.toBeChecked()
    await waitFor(()=>expect(JSON.parse(screen.getByTestId('answers').textContent||'{}')['matrix:r2']).toBe('yes'))
  })
})
