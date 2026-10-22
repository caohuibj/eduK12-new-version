import {useState} from 'react'
import {fireEvent,render,screen,within} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {ResearchScaleEditor} from './ResearchScaleEditor'
import type {ScaleDraft} from './builder.types'

const initial:ScaleDraft={schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'不同意',score:2},{optionKey:'b',label:'同意',score:7}],dimensions:[{dimensionKey:'effort',label:'学习投入',direction:'descriptive'}],items:[{itemKey:'q1',prompt:'原有题目',required:true,reverse:true,dimensionKeys:['effort']}],totalScore:{key:'total',label:'总分',aggregation:'sum',itemKeys:['q1']}}
function Host({seed=initial,disabled=false,onSave=()=>{},onRisk=()=>{}}:{seed?:ScaleDraft;disabled?:boolean;onSave?:()=>void;onRisk?:(risk:boolean)=>void}){
 const [value,onChange]=useState(seed)
 return <><ResearchScaleEditor appearance="studio" value={value} onChange={onChange} disabled={disabled} onSave={onSave} canSave onDraftRiskChange={onRisk}/><output data-testid="draft">{JSON.stringify(value)}</output></>
}
const draft=()=>JSON.parse(screen.getByTestId('draft').textContent!) as ScaleDraft
const tab=(name:string)=>fireEvent.click(screen.getByRole('tab',{name}))

describe('Survey scale studio authoring',()=>{
 it('keeps edits and unapplied paste across five tabs, with keyboard navigation and save protection',()=>{
  const onSave=vi.fn(),onRisk=vi.fn();render(<Host onSave={onSave} onRisk={onRisk}/>)
  expect(screen.getAllByRole('tab')).toHaveLength(5)
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  tab('响应选项');fireEvent.change(screen.getByLabelText('响应选项 1'),{target:{value:'很少'}})
  fireEvent.click(screen.getByText('批量粘贴选项'))
  fireEvent.change(screen.getByLabelText('选项批量内容'),{target:{value:'从不\n总是'}})
  tab('题目');fireEvent.change(screen.getByLabelText('题干 1'),{target:{value:'修改后的题目'}})
  expect(screen.getByRole('button',{name:'保存当前草稿'})).toBeDisabled()
  expect(onRisk).toHaveBeenLastCalledWith(true)
  tab('响应选项');expect(screen.getByLabelText('选项批量内容')).toHaveValue('从不\n总是')
  expect(screen.getByLabelText('响应选项 1')).toHaveValue('很少')
  fireEvent.click(screen.getByRole('button',{name:'应用选项文字'}))
  expect(onRisk).toHaveBeenLastCalledWith(false)
  expect(draft().items[0].prompt).toBe('修改后的题目')
  fireEvent.keyDown(screen.getByRole('tab',{name:'响应选项'}),{key:'End'})
  expect(screen.getByRole('tab',{name:'报告反馈'})).toHaveFocus()
  expect(screen.getByRole('tab',{name:'报告反馈'})).toHaveAttribute('aria-selected','true')
  fireEvent.click(screen.getByRole('button',{name:'保存当前草稿'}));expect(onSave).toHaveBeenCalledOnce()
 })
 it('preserves option keys and scores while rejecting over-limit replacements without partial changes',()=>{
  render(<Host/>);tab('响应选项')
  fireEvent.click(screen.getByRole('button',{name:'5级频率'}))
  expect(draft().responseOptions.slice(0,2)).toEqual([{optionKey:'a',label:'从不',score:2},{optionKey:'b',label:'很少',score:7}])
  const before=draft().responseOptions
  fireEvent.click(screen.getByText('批量粘贴选项'))
  fireEvent.change(screen.getByLabelText('选项批量内容'),{target:{value:Array.from({length:16},(_,i)=>'选项'+i).join('\n')}})
  fireEvent.click(screen.getByRole('button',{name:'应用选项文字'}))
  expect(screen.getByRole('alert')).toHaveTextContent('最多支持 15')
  expect(draft().responseOptions).toEqual(before)
  expect(screen.getByRole('button',{name:'保存当前草稿'})).toBeDisabled()
 })
 it('appends Training-format bulk questions with fresh keys and reverse markers, without replacing existing work',()=>{
  render(<Host/>);tab('题目');fireEvent.click(screen.getByText('批量录入与辅助题'))
  fireEvent.change(screen.getByLabelText('题干批量内容'),{target:{value:'第一道新题\n第二道新题 [反向]\n(R) 第三道新题'}})
  fireEvent.click(screen.getByRole('button',{name:'追加题目'}))
  expect(draft().items[0]).toEqual(initial.items[0])
  expect(draft().items.slice(1).map(q=>[q.prompt,q.reverse,q.dimensionKeys])).toEqual([['第一道新题',false,['effort']],['第二道新题',true,['effort']],['第三道新题',true,['effort']]])
  expect(new Set(draft().items.map(q=>q.itemKey)).size).toBe(4)
  expect(draft().totalScore?.itemKeys).toEqual(['q1'])
  fireEvent.change(screen.getByLabelText('题干批量内容'),{target:{value:'有效题\n[反向]'}})
  fireEvent.click(screen.getByRole('button',{name:'追加题目'}))
  expect(screen.getByRole('alert')).toHaveTextContent('还需要填写题干')
  expect(draft().items).toHaveLength(4)
 })
 it('guards the Survey question limit before changing the draft',()=>{
  const seed={...initial,items:Array.from({length:41},(_,i)=>({...initial.items[0],itemKey:'q'+i}))}
  render(<Host seed={seed}/>);tab('题目');fireEvent.click(screen.getByText('批量录入与辅助题'))
  fireEvent.change(screen.getByLabelText('题干批量内容'),{target:{value:Array.from({length:200},(_,i)=>'新题'+i).join('\n')}})
  fireEvent.click(screen.getByRole('button',{name:'追加题目'}))
  expect(screen.getByRole('alert')).toHaveTextContent('不能超过 240')
  expect(draft().items).toHaveLength(41)
 })
 it('assigns dimension membership in scoring and removes auxiliary questions from every score',()=>{
  render(<Host/>);tab('计分')
  fireEvent.click(screen.getByLabelText('学习投入 纳入第 1 题'));expect(draft().items[0].dimensionKeys).toEqual([])
  fireEvent.click(screen.getByLabelText('学习投入 纳入第 1 题'));expect(draft().items[0].dimensionKeys).toEqual(['effort'])
  tab('题目');fireEvent.click(screen.getByText('题目用途与辅助题设置'))
  fireEvent.change(screen.getByLabelText('题目用途 1'),{target:{value:'ATTENTION_CHECK'}})
  expect(draft().items[0]).toMatchObject({itemKey:'q1',reverse:false,dimensionKeys:[],purpose:'ATTENTION_CHECK'})
  expect(draft().totalScore?.itemKeys).toEqual([])
  tab('计分');expect(screen.queryByLabelText('学习投入 纳入第 1 题')).toBeNull()
 })
 it('retains feedback simulation across sections and keeps shared overlap validation',()=>{
  render(<Host/>);tab('报告反馈');fireEvent.click(screen.getByRole('button',{name:'新增指标反馈'}))
  fireEvent.change(screen.getByLabelText('反馈 1 区间 1 文字'),{target:{value:'区间反馈'}})
  fireEvent.change(screen.getByLabelText('模拟原始分'),{target:{value:'0.5'}})
  tab('题目');tab('报告反馈')
  expect(screen.getByLabelText('模拟原始分')).toHaveValue(0.5)
  expect(within(screen.getByLabelText('作者模拟反馈')).getByText('区间反馈')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'增加反馈区间'}))
  fireEvent.change(screen.getByLabelText('反馈 1 区间 2 下限'),{target:{value:'0.5'}})
  expect(screen.getByRole('alert')).toHaveTextContent('不能重叠')
 })
 it('lets read-only users inspect every section while all draft edits and saving remain disabled',()=>{
  render(<Host disabled/>);tab('题目')
  expect(screen.getByLabelText('题干 1')).toBeDisabled()
  expect(screen.getByRole('button',{name:'增加题目'})).toBeDisabled()
  tab('计分');expect(screen.getByLabelText('维度 1')).toBeDisabled()
  expect(screen.getByRole('button',{name:'保存当前草稿'})).toBeDisabled()
  tab('报告反馈');expect(screen.getByRole('button',{name:'新增指标反馈'})).toBeDisabled()
 })
})
