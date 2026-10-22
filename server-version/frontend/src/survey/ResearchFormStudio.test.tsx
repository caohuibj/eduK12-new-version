import {useState} from 'react'
import {fireEvent,render,screen,within,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {ResearchFormEditor} from './ResearchFormEditor'
import {newQuestion,type FormDraft} from './builder.types'
function Host({initial,commit=async()=>true}:{initial:FormDraft;commit?:(next:FormDraft)=>Promise<boolean>}){const [value,setValue]=useState(initial);return <><ResearchFormEditor value={value} onChange={setValue} appearance="studio" onCommit={async next=>{if(!await commit(next))return false;setValue(next);return true}}/><output data-testid="definition">{JSON.stringify(value)}</output></>}
const current=()=>JSON.parse(screen.getByTestId('definition').textContent||'{}') as FormDraft
const data:FormDraft={schemaVersion:2,pages:[{pageKey:'p1',title:'背景信息',questions:[{...newQuestion('SINGLE'),itemKey:'q1',prompt:'你的年级'},{...newQuestion('SHORT_TEXT'),itemKey:'q2',prompt:'补充说明'}]},{pageKey:'p2',title:'时间安排',questions:[{...newQuestion('DATE'),itemKey:'q3',prompt:'参与日期'}]}]}
describe('Survey form workspace follows Training editing flow',()=>{
 it('starts at new question and saves existing edits only after explicit save',async()=>{
  const commit=vi.fn(async()=>true);render(<Host initial={structuredClone(data)} commit={commit}/>)
  expect(screen.getByRole('heading',{name:'添加新题'})).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'编辑题目：你的年级'}));fireEvent.change(screen.getByLabelText('题干'),{target:{value:'请选择年级'}})
  expect(current().pages[0].questions[0].prompt).toBe('你的年级')
  expect(screen.getByRole('button',{name:'编辑题目：补充说明'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'保存题目修改'}))
  await waitFor(()=>expect(screen.getByRole('heading',{name:'添加新题'})).toBeVisible())
  expect(current().pages[0].questions[0].prompt).toBe('请选择年级');expect(commit).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button',{name:'编辑题目：补充说明'}))
  const rule=screen.getByText('作答规则与格式').closest('details');expect(rule).not.toHaveAttribute('open')
  fireEvent.change(screen.getByLabelText('题干'),{target:{value:'不要保留'}});fireEvent.click(screen.getByRole('button',{name:'取消编辑'}))
  expect(current().pages[0].questions[1].prompt).toBe('补充说明');expect(commit).toHaveBeenCalledOnce()
 })
 it('explains legacy compatibility and upgrades only this draft when requested',async()=>{
  render(<Host initial={{...data,schemaVersion:1,pages:[data.pages[0]]}}/> )
  const help=screen.getByText(/旧版兼容表单/).closest('details')!;expect(help).not.toHaveAttribute('open');expect(current().schemaVersion).toBe(1)
  fireEvent.click(help.querySelector('summary')!);fireEvent.click(within(help).getByRole('button',{name:'启用扩展题型'}))
  await waitFor(()=>expect(current().schemaVersion).toBe(2))
  expect(current().pages).toEqual([data.pages[0]]);expect(screen.getByRole('combobox',{name:'选择题型'}).querySelectorAll('option')).toHaveLength(13)
 })
 it('adds first question and page in one save, preserves failed input and supports retry',async()=>{
  let succeeds=false;const commit=vi.fn(async()=>succeeds);render(<Host initial={{schemaVersion:2,pages:[]}} commit={commit}/>)
  fireEvent.change(screen.getByRole('combobox',{name:'选择题型'}),{target:{value:'DATE'}})
  fireEvent.change(screen.getByLabelText('题干'),{target:{value:'参与日期'}});fireEvent.click(screen.getByRole('button',{name:'添加题目'}))
  await waitFor(()=>expect(commit).toHaveBeenCalledOnce());expect(current().pages).toHaveLength(0);expect(screen.getByLabelText('题干')).toHaveValue('参与日期')
  succeeds=true;fireEvent.click(screen.getByRole('button',{name:'添加题目'}));await waitFor(()=>expect(current().pages).toHaveLength(1))
  expect(current().pages[0].questions[0]).toMatchObject({prompt:'参与日期',type:'DATE'})
  await waitFor(()=>expect(screen.getByLabelText('题干')).toHaveValue(''))
 })
 it('copies option references safely, renames and reorders pages, and removes the chosen question',async()=>{
  const q={...newQuestion('MULTIPLE'),itemKey:'source',prompt:'选择活动',otherOptionKey:'o1',exclusiveOptionKeys:['o2'],options:[{optionKey:'o1',label:'其他'},{optionKey:'o2',label:'均不符合'}]}
  render(<Host initial={{schemaVersion:2,pages:[{pageKey:'p',title:'活动',questions:[q]},data.pages[1]]}}/> )
  fireEvent.click(screen.getByRole('button',{name:'复制题目：选择活动'}));await waitFor(()=>expect(current().pages[0].questions).toHaveLength(2))
  const clone=current().pages[0].questions[1];expect(clone.itemKey).not.toBe('source');expect(clone.otherOptionKey).toBe(clone.options[0].optionKey);expect(clone.exclusiveOptionKeys).toEqual([clone.options[1].optionKey])
  fireEvent.click(screen.getByRole('button',{name:'重命名分页：活动'}));fireEvent.change(screen.getByLabelText('分页标题'),{target:{value:'活动情况'}});fireEvent.click(screen.getByRole('button',{name:'保存分页标题'}));await waitFor(()=>expect(current().pages[0].title).toBe('活动情况'))
  fireEvent.click(screen.getByRole('button',{name:'上移分页：时间安排'}));await waitFor(()=>expect(current().pages[0].pageKey).toBe('p2'))
  fireEvent.click(screen.getAllByRole('button',{name:'移除题目：选择活动'})[1]);await waitFor(()=>expect(current().pages[1].questions).toEqual([q]))
 })
})
