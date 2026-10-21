import { useState } from 'react'
import { fireEvent,render,screen,within } from '@testing-library/react'
import { describe,it,expect } from 'vitest'
import { ResearchScaleEditor } from './ResearchScaleEditor'
import type { ScaleDraft } from './builder.types'
const initial:ScaleDraft={schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'不同意',score:1},{optionKey:'b',label:'同意',score:2}],dimensions:[{dimensionKey:'d',label:'维度',direction:'descriptive'}],items:[{itemKey:'q',prompt:'内容题',reverse:true,required:true,dimensionKeys:['d']}],totalScore:{key:'total',label:'总分',aggregation:'sum',itemKeys:['q']}}
function Host(){const [value,onChange]=useState(initial);return <><ResearchScaleEditor value={value} onChange={onChange}/><output data-testid="draft">{JSON.stringify(value)}</output></>}
const draft=()=>JSON.parse(screen.getByTestId('draft').textContent!) as ScaleDraft

describe('Survey research scale quality and feedback',()=>{
 it('keeps stable IDs/shared options while excluding quality items from all scoring',()=>{
  render(<Host/>);fireEvent.change(screen.getByLabelText('题目用途 1'),{target:{value:'ATTENTION_CHECK'}})
  expect(draft().items[0]).toMatchObject({itemKey:'q',purpose:'ATTENTION_CHECK',reverse:false,dimensionKeys:[]})
  expect(draft().totalScore?.itemKeys).toEqual([])
  expect(screen.queryByLabelText('反向计分')).toBeNull()
  expect(within(screen.getByLabelText('目标选项 1')).getByRole('option',{name:'同意'})).toHaveValue('b')
  fireEvent.change(screen.getByLabelText('目标选项 1'),{target:{value:'b'}})
  expect(draft().items[0].attentionTarget).toBe('b')
  fireEvent.change(screen.getByLabelText('题目用途 1'),{target:{value:'SOCIAL_DESIRABILITY'}})
  expect(draft().items[0].attentionTarget).toBeUndefined()
  expect(draft().responseOptions).toEqual(initial.responseOptions)
  fireEvent.click(screen.getByRole('button',{name:'复制'}))
  expect(draft().items[1].itemKey).not.toBe('q')
  expect(draft().items[1].purpose).toBe('SOCIAL_DESIRABILITY')
 })
 it('creates interval feedback, previews boundaries and flags overlap with shared validation',()=>{
  render(<Host/>);fireEvent.click(screen.getByRole('button',{name:'新增指标反馈'}))
  fireEvent.change(screen.getByLabelText('反馈 1 区间 1 文字'),{target:{value:'第一段'}})
  fireEvent.click(screen.getByRole('button',{name:'增加反馈区间'}))
  fireEvent.change(screen.getByLabelText('反馈 1 区间 2 文字'),{target:{value:'第二段'}})
  fireEvent.change(screen.getByLabelText('模拟原始分'),{target:{value:'1'}})
  expect(within(screen.getByLabelText('作者模拟反馈')).getByText('第二段')).toBeInTheDocument()
  expect(draft().rawScoreFeedback?.rules[0].ranges[0].includeMax).toBe(false)
  fireEvent.change(screen.getByLabelText('反馈 1 区间 2 下限'),{target:{value:'0.5'}})
  expect(screen.getByRole('alert')).toHaveTextContent('不能重叠')
  fireEvent.click(screen.getByLabelText('设置未匹配时的兜底反馈'))
  fireEvent.change(screen.getByLabelText('兜底文字 1'),{target:{value:'其他范围'}})
  fireEvent.change(screen.getByLabelText('模拟原始分'),{target:{value:'99'}})
  expect(within(screen.getByLabelText('作者模拟反馈')).getByText('其他范围')).toBeInTheDocument()
 })
 it('offers recovery for removed score keys and preserves Survey cards',()=>{
  const feedback={schemaVersion:1 as const,rules:[{scoreKey:'removed',ranges:[{key:'r',min:0,max:1,includeMax:true,text:'旧反馈'}]}]}
  const {container}=render(<ResearchScaleEditor value={{...initial,rawScoreFeedback:feedback}} onChange={()=>{}}/>)
  expect(screen.getByRole('option',{name:'已移除的指标'})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'删除此指标反馈'})).toBeEnabled()
  expect(container.querySelector('section.bg-white')).not.toBeNull()
  expect(container.querySelector('article.bg-slate-50')).not.toBeNull()
 })
})
