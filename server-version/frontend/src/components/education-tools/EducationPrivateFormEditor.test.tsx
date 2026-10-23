import {readFileSync} from 'node:fs'
import {useState} from 'react'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {EducationPrivateFormEditor} from './EducationPrivateFormEditor'
import {ResearchFormEditor} from '../../survey/ResearchFormEditor'
import type {FormDraft,FormQuestion} from '../../survey/builder.types'
const question=(itemKey:string,prompt:string):FormQuestion=>({itemKey,type:'SHORT_TEXT',prompt,required:false,allowRefusal:false,options:[],rows:[]})
const initial=():FormDraft=>({schemaVersion:2,pages:[{pageKey:'p1',title:'第一段',questions:[question('q1','第一题'),question('q2','第二题')]},{pageKey:'p2',title:'第二段',questions:[question('q3','第三题')]}]})
function Harness({changed}:{changed:(value:FormDraft)=>void}){const [value,setValue]=useState(initial);return <EducationPrivateFormEditor value={value} onChange={next=>{changed(next);setValue(next)}}/>}
afterEach(cleanup)
describe('education section and question authoring navigator',()=>{
 it('changes only view selection and keeps unsaved field edits when navigating away and back',()=>{
  const changed=vi.fn();render(<Harness changed={changed}/>)
  expect(screen.getByRole('navigation',{name:'表单区段与题目'})).toBeInTheDocument()
  expect(screen.getAllByLabelText('题干')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'选择区段：第二段'}))
  fireEvent.click(screen.getByRole('button',{name:'编辑题目：第三题'}))
  expect(screen.getByLabelText('题干')).toHaveValue('第三题');expect(changed).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('题干'),{target:{value:'第三题未保存编辑'}})
  expect(changed).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button',{name:'选择区段：第一段'}));fireEvent.click(screen.getByRole('button',{name:'编辑题目：第二题'}))
  expect(screen.getByLabelText('题干')).toHaveValue('第二题')
  fireEvent.click(screen.getByRole('button',{name:'选择区段：第二段'}));fireEvent.click(screen.getByRole('button',{name:'编辑题目：第三题未保存编辑'}))
  expect(screen.getByLabelText('题干')).toHaveValue('第三题未保存编辑');expect(changed).toHaveBeenCalledTimes(1)
 })
 it('selects a copied question by its new stable key and keeps selection through move and neighbour deletion',()=>{
  const changed=vi.fn<(value:FormDraft)=>void>();render(<Harness changed={changed}/>)
  const article=()=>screen.getByLabelText('题干').closest('article')!
  fireEvent.click(within(article()).getByRole('button',{name:'复制'}))
  const copied=changed.mock.calls[changed.mock.calls.length-1][0].pages[0].questions[1]
  expect(copied.itemKey).not.toBe('q1');expect(copied.itemKey).not.toBe('q2')
  expect(article()).toHaveAttribute('id','survey-form-'+copied.itemKey)
  fireEvent.click(within(article()).getByRole('button',{name:'下移'}))
  const moved=changed.mock.calls[changed.mock.calls.length-1][0].pages[0].questions
  expect(moved.map(q=>q.itemKey)).toEqual(['q1','q2',copied.itemKey])
  expect(article()).toHaveAttribute('id','survey-form-'+copied.itemKey)
  fireEvent.click(within(article()).getByRole('button',{name:/^删除$/}))
  expect(changed.mock.calls[changed.mock.calls.length-1][0].pages[0].questions.map(q=>q.itemKey)).toEqual(['q1','q2'])
  expect(article()).toHaveAttribute('id','survey-form-q2')
  expect(screen.getAllByLabelText('题干')).toHaveLength(1)
 })
 it('selects the remaining neighbouring section when the active section is removed',()=>{
  const changed=vi.fn<(value:FormDraft)=>void>();render(<Harness changed={changed}/>)
  fireEvent.click(screen.getByRole('button',{name:'选择区段：第二段'}))
  fireEvent.click(screen.getByRole('button',{name:'删除区段'}))
  expect(changed.mock.calls[changed.mock.calls.length-1][0].pages.map(page=>page.pageKey)).toEqual(['p1'])
  expect(screen.queryByRole('button',{name:'选择区段：第二段'})).not.toBeInTheDocument()
  expect(screen.getByLabelText('题干')).toHaveValue('第一题')
 })
 it('preserves the original Survey pagination wording and fully expanded questions by default',()=>{
  render(<ResearchFormEditor value={initial()} onChange={vi.fn()}/>)
  expect(screen.getByRole('button',{name:'新增分页'})).toBeInTheDocument()
  expect(screen.getAllByRole('button',{name:'删除页'})).toHaveLength(2)
  expect(screen.getAllByLabelText('题干')).toHaveLength(3)
  expect(screen.getByLabelText('第 1 页标题')).toHaveValue('第一段')
  expect(screen.queryByRole('navigation',{name:'表单区段与题目'})).not.toBeInTheDocument()
 })
})

// Static cascade contract: browser diagnostics exercise the same real CSS separately.
it('pairs shared form row and bulk tokens inside each education dark surface only',()=>{
 const palette={'brand-ink': 'ink', 'brand-accent': 'action', 'brand-accent-strong': 'action', 'brand-muted': 'muted', 'brand-soft': 'soft', 'brand-subtle': 'soft', 'brand-canvas': 'surface', 'brand-line': 'line', 'brand-border': 'line', 'brand-border-strong': 'action', 'brand-focus': 'action', 'ui-ink': 'ink', 'ui-body': 'ink', 'ui-muted': 'muted', 'ui-surface': 'surface', 'ui-line': 'line'}
 for(const [entry,prefix] of [['school','hs'],['huiteacher','ht']]){
  const css=readFileSync(`src/${entry}/${entry}-theme.css`,'utf8')
  const selector=`.${prefix}-app[data-theme=dark] .education-private-tools:not([data-cognitive-task-root],[data-cognitive-task-root] *)`
  const rule=css.slice(css.indexOf(selector+'{')).split('}')[0]
  expect(rule.startsWith(selector+'{')).toBe(true)
  for(const [key,value] of Object.entries(palette))expect(rule).toContain(`--survey-${key}:var(--product-${value})`)
  expect(rule).toContain('--survey-ui-danger:#ffbbaa')
  expect(rule).toContain('--survey-ui-success:#b8e6c2')
 }
})
