import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResearchFormEditor } from './ResearchFormEditor'
import { ResearchScaleEditor } from './ResearchScaleEditor'
import { ResearchSjtEditor } from './ResearchSjtEditor'
import { ResearchPreview } from './ResearchPreview'
import type { FormDraft, ScaleDraft, SjtDraft, ResearchDraft } from './builder.types'

const scale=():ScaleDraft=>({
  schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
  responseOptions:[{optionKey:'o1',label:'不同意',score:1},{optionKey:'o2',label:'同意',score:2}],
  dimensions:[],items:[],
})
const sjt=():SjtDraft=>({
  schemaVersion:1,respondentType:'student_self_report',scenarioKey:'scene',
  title:'',stimulus:'',author:'自编',sourceNote:'研究探索',licenseStatus:'self_authored',redistribution:'allowed',
  metrics:[],questions:[],
})
function FormHost(){
  const [state,setState]=useState<FormDraft>({schemaVersion:1,pages:[]})
  return <><ResearchFormEditor value={state} onChange={setState} projectId="11111111-1111-4111-8111-111111111111"/>
    <output data-testid="form-state">{JSON.stringify(state)}</output></>
}
function ScaleHost(){
  const [state,setState]=useState(scale())
  return <><ResearchScaleEditor value={state} onChange={setState}/>
    <output data-testid="scale-state">{JSON.stringify(state)}</output></>
}
function SjtHost(){
  const [state,setState]=useState(sjt())
  return <><ResearchSjtEditor value={state} onChange={setState} projectId="11111111-1111-4111-8111-111111111111"/>
    <output data-testid="sjt-state">{JSON.stringify(state)}</output></>
}
describe('Survey Research Builder editing widgets',()=>{
  it('builds pages, stable question IDs, choices and optional display logic without JSON authoring',()=>{
    render(<FormHost/>)
    fireEvent.click(screen.getByRole('button',{name:'新增分页'}))
    fireEvent.click(screen.getByRole('button',{name:'+ 单选'}))
    fireEvent.change(screen.getByLabelText('题干'),{target:{value:'你喜欢哪门课？'}})
    const state=JSON.parse(screen.getByTestId('form-state').textContent||'{}') as FormDraft
    expect(state.pages).toHaveLength(1)
    expect(state.pages[0].questions[0].prompt).toBe('你喜欢哪门课？')
    expect(state.pages[0].questions[0].options).toHaveLength(2)
    const id=state.pages[0].questions[0].itemKey
    fireEvent.click(screen.getByRole('button',{name:'+ 短文本'}))
    const changed=JSON.parse(screen.getByTestId('form-state').textContent||'{}') as FormDraft
    expect(changed.pages[0].questions[0].itemKey).toBe(id)
    expect(changed.pages[0].questions[1].itemKey).not.toBe(id)
  })
  it('supports self-authored shared-response scales with reverse items and dimension assignment',()=>{
    render(<ScaleHost/>)
    fireEvent.click(screen.getByRole('button',{name:'新增维度'}))
    fireEvent.click(screen.getByRole('button',{name:'增加 Likert 题目'}))
    fireEvent.change(screen.getByLabelText('题干 1'),{target:{value:'我愿意探索新的问题'}})
    fireEvent.click(screen.getByLabelText('反向计分'))
    const state=JSON.parse(screen.getByTestId('scale-state').textContent||'{}') as ScaleDraft
    expect(state.dimensions).toHaveLength(1)
    expect(state.items[0].reverse).toBe(true)
    expect(state.items[0].dimensionKeys).toEqual([state.dimensions[0].dimensionKey])
  })
  it('freezes author-selected Scale one-by-one mode and previews a single question',()=>{
    render(<ScaleHost/>)
    fireEvent.change(screen.getByLabelText('量表施测呈现模式'),
      {target:{value:'ONE_BY_ONE'}})
    const selected=JSON.parse(screen.getByTestId('scale-state').textContent||'{}') as ScaleDraft
    expect(selected.presentationMode).toBe('ONE_BY_ONE')
    const draft:ResearchDraft={
      id:'preview-timed',projectId:'test',instrumentKey:'scale',kind:'SCALE',
      title:'计时预览',revision:0,status:'DRAFT',createdAt:'',updatedAt:'',
      definition:{...scale(),presentationMode:'ONE_BY_ONE',items:[
        {itemKey:'a',prompt:'第一题内容',required:true,reverse:false,dimensionKeys:[]},
        {itemKey:'b',prompt:'第二题内容',required:true,reverse:false,dimensionKeys:[]},
      ]},
    }
    render(<ResearchPreview draft={draft} onSimulate={()=>{}}/>)
    expect(screen.getByText('第一题内容')).toBeInTheDocument()
    expect(screen.queryByText('第二题内容')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'下一题'}))
    expect(screen.queryByText('第一题内容')).toBeNull()
    expect(screen.getByText('第二题内容')).toBeInTheDocument()
  })
  it('configures a research-only SJT question as bounded multi-select without writing JSON',()=>{
    render(<SjtHost/>)
    fireEvent.click(screen.getByRole('button',{name:'增加构念'}))
    fireEvent.click(screen.getByRole('button',{name:'增加问题'}))
    fireEvent.change(screen.getByLabelText('作答方式'),{target:{value:'MULTIPLE'}})
    const state=JSON.parse(screen.getByTestId('sjt-state').textContent||'{}') as SjtDraft
    expect(state.questions[0].responseType).toBe('MULTIPLE')
    expect(state.questions[0].minSelections).toBe(1)
    expect(state.questions[0].maxSelections).toBe(2)
    expect(state.questions[0].aggregationPolicy).toBeUndefined()
    fireEvent.change(screen.getByLabelText('多选计分聚合规则'),{target:{value:'MEAN'}})
    const configured=JSON.parse(screen.getByTestId('sjt-state').textContent||'{}') as SjtDraft
    expect(configured.questions[0].aggregationPolicy).toBe('MEAN')
  })
  it('records nonuniform contribution weights per SJT option and construct',()=>{
    render(<SjtHost/>)
    fireEvent.click(screen.getByRole('button',{name:'增加构念'}))
    fireEvent.click(screen.getByRole('button',{name:'增加问题'}))
    const weights=screen.getAllByLabelText(/权重/)
    expect(weights.length).toBe(2)
    fireEvent.change(weights[0],{target:{value:'3'}})
    const result=JSON.parse(screen.getByTestId('sjt-state').textContent||'{}') as SjtDraft
    const dimension=result.metrics[0].metricKey
    expect(result.questions[0].options[0].contributions[dimension]).toBe(3)
    expect(result.questions[0].options[1].contributions[dimension]).toBe(0)
  })
  it('distinguishes literal REFUSED text from structured refusal and supports matrix row refusal',()=>{
    const draft:ResearchDraft={
      id:'refusal-preview',projectId:'test',instrumentKey:'instrument',kind:'FORM',
      title:'拒答契约',revision:0,status:'DRAFT',createdAt:'',updatedAt:'',
      definition:{schemaVersion:1,pages:[{pageKey:'page',title:'作答',questions:[
        {itemKey:'message',type:'SHORT_TEXT',prompt:'自由文本',required:false,
          allowRefusal:true,options:[],rows:[]},
        {itemKey:'matrix',type:'MATRIX',prompt:'多行评价',required:false,
          allowRefusal:true,options:[{optionKey:'low',label:'低'},{optionKey:'high',label:'高'}],
          rows:[{rowKey:'first',label:'课堂参与'}]},
      ]}]},
    }
    render(<ResearchPreview draft={draft} onSimulate={()=>{throw new Error('Form 不应评分')}}/>)
    const field=screen.getByLabelText('自由文本')
    const refusal=screen.getByRole('checkbox',{name:/不愿回答/})
    fireEvent.change(field,{target:{value:'REFUSED'}})
    expect(field).toHaveValue('REFUSED')
    expect(refusal).not.toBeChecked()
    fireEvent.click(refusal)
    expect(refusal).toBeChecked()
    expect(field).toBeDisabled()
    fireEvent.click(refusal)
    expect(refusal).not.toBeChecked()
    expect(screen.getByRole('radio',{name:'不愿回答：课堂参与'})).toBeInTheDocument()
  })
  it('offers preview of a form without creating real responses',()=>{
    const draft:ResearchDraft={
      id:'test',projectId:'test',instrumentKey:'instrument',kind:'FORM',title:'预览',
      revision:0,status:'DRAFT',createdAt:'',updatedAt:'',
      definition:{schemaVersion:1,pages:[{pageKey:'pageone',title:'第一页',questions:[
        {itemKey:'question',type:'SHORT_TEXT',prompt:'你今天学到了什么？',required:false,options:[],rows:[]},
      ]}]},
    }
    render(<ResearchPreview draft={draft} onSimulate={()=>{throw new Error('Form 不应调用评分')}}/>)
    expect(screen.getByLabelText('你今天学到了什么？')).toBeInTheDocument()
    expect(screen.queryByText('真实 FINAL')).toBeNull()
  })
})
