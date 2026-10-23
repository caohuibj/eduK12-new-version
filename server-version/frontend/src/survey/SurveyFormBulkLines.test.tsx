import {useState} from 'react'
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {ResearchFormEditor} from './ResearchFormEditor'
import {newQuestion,type FormDraft,type FormQuestion} from './builder.types'

function Host({initial,commit,risk}:{initial:FormDraft;commit:(next:FormDraft)=>void;risk?:(dirty:boolean)=>void}){
  const [value,setValue]=useState(initial)
  return <ResearchFormEditor appearance="studio" value={value} onChange={setValue} onDraftRiskChange={risk} onCommit={async next=>{commit(next);setValue(next);return true}}/>
}
const definition=(question:FormQuestion,extra:FormQuestion[]=[]):FormDraft=>({schemaVersion:2,pages:[{pageKey:'page',title:'第一页',questions:[question,...extra]}]})
const open=(kind='选项')=>fireEvent.click(screen.getByText('批量编辑'+kind))
const paste=(text:string,kind='选项')=>fireEvent.change(screen.getByLabelText(kind+'批量内容'),{target:{value:text}})
const replace=(kind='选项')=>fireEvent.change(screen.getByLabelText(kind+'批量写入方式'),{target:{value:'replace'}})

describe('Survey form multiline authoring',()=>{
  it.each(['SINGLE','MULTIPLE','LIKERT','MATRIX','MATRIX_MULTIPLE'] as const)('replaces %s options in one action and saves only on question commit',async type=>{
    const q={...newQuestion(type),prompt:'测试题'},commit=vi.fn(),risk=vi.fn()
    render(<Host initial={definition(q)} commit={commit} risk={risk}/>)
    fireEvent.click(screen.getByRole('button',{name:'编辑题目：测试题'}));open();replace()
    paste('  不同意\r\n\r\n一般\r同意  \n')
    expect(screen.getByText('识别 3 项 · 应用后 3/30 项')).toBeVisible()
    expect(screen.getByRole('button',{name:'保存题目修改'})).toBeDisabled()
    expect(screen.getByLabelText('选择题型')).toBeDisabled()
    expect(risk).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button',{name:'应用选项'}))
    expect(screen.getByLabelText('选项 1')).toHaveValue('不同意')
    expect(commit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'保存题目修改'}))
    await waitFor(()=>expect(commit).toHaveBeenCalledOnce())
    const saved=commit.mock.calls[0][0].pages[0].questions[0] as FormQuestion
    expect(saved.options.map(option=>option.label)).toEqual(['不同意','一般','同意'])
    expect(saved.options.slice(0,2).map(option=>option.optionKey)).toEqual(q.options.map(option=>option.optionKey))
    expect(new Set(saved.options.map(option=>option.optionKey)).size).toBe(3)
  })
  it('appends without changing existing identities or other/exclusive/conditional references',async()=>{
    const q={...newQuestion('MULTIPLE'),itemKey:'source',prompt:'选项设置',options:[{optionKey:'a',label:'其他'},{optionKey:'b',label:'以上均无'}],otherOptionKey:'a',otherMaxLength:100,exclusiveOptionKeys:['b']}
    const dependent={...newQuestion('SHORT_TEXT'),prompt:'后续问题',displayIf:{itemKey:'source',operator:'INCLUDES' as const,optionKey:'b'}}
    const commit=vi.fn();render(<Host initial={definition(q,[dependent])} commit={commit}/> )
    fireEvent.click(screen.getByRole('button',{name:'编辑题目：选项设置'}));open();paste('新增甲\n新增乙')
    fireEvent.click(screen.getByRole('button',{name:'应用选项'}));fireEvent.click(screen.getByRole('button',{name:'保存题目修改'}))
    await waitFor(()=>expect(commit).toHaveBeenCalledOnce())
    const [saved,next]=commit.mock.calls[0][0].pages[0].questions
    expect(saved.options.slice(0,2)).toEqual(q.options)
    expect(saved.options.map((o:{label:string})=>o.label)).toEqual(['其他','以上均无','新增甲','新增乙'])
    expect(saved).toMatchObject({otherOptionKey:'a',otherMaxLength:100,exclusiveOptionKeys:['b']})
    expect(next).toEqual(dependent)
  })
  it.each(['other','exclusive','condition'])('blocks replacement that removes an option used by %s',kind=>{
    const q={...newQuestion('MULTIPLE'),itemKey:'source',prompt:'保留引用',options:[{optionKey:'a',label:'甲'},{optionKey:'b',label:'乙'},{optionKey:'c',label:'丙'}],...(kind==='other'?{otherOptionKey:'c',otherMaxLength:100}:kind==='exclusive'?{exclusiveOptionKeys:['c']}:{})}
    const dependent={...newQuestion('SHORT_TEXT'),displayIf:{itemKey:'source',operator:'INCLUDES' as const,optionKey:'c'}}
    render(<Host initial={definition(q,kind==='condition'?[dependent]:[])} commit={vi.fn()}/>)
    fireEvent.click(screen.getByRole('button',{name:'编辑题目：保留引用'}));open();replace();paste('甲\n乙')
    expect(screen.getByRole('alert')).toHaveTextContent('将移除被其他填写、互斥或条件显示引用的选项')
    expect(screen.getByRole('button',{name:'应用选项'})).toBeDisabled()
    paste('新甲\n新乙\n新丙');fireEvent.click(screen.getByRole('button',{name:'应用选项'}))
    expect(screen.getByLabelText('选项 3')).toHaveValue('新丙')
  })
  it('loads existing lines, validates option and character limits, and cancels unapplied input',async()=>{
    const q={...newQuestion('SINGLE'),prompt:'原有题目'},commit=vi.fn(),risk=vi.fn()
    render(<Host initial={definition(q)} commit={commit} risk={risk}/> )
    fireEvent.click(screen.getByRole('button',{name:'编辑题目：原有题目'}));open()
    fireEvent.click(screen.getByRole('button',{name:'载入现有选项'}))
    expect(screen.getByLabelText('选项批量内容')).toHaveValue(q.options.map(o=>o.label).join('\n'))
    paste(Array.from({length:31},(_,i)=>'选项'+i).join('\n'))
    expect(screen.getByRole('alert')).toHaveTextContent('最多允许 30 项')
    expect(screen.getByRole('button',{name:'应用选项'})).toBeDisabled()
    paste('一'.repeat(2001)+'\n二');expect(screen.getByRole('alert')).toHaveTextContent('每行最多 2000 个字符')
    paste('只有一项');expect(screen.getByRole('alert')).toHaveTextContent('至少需要 2 项')
    fireEvent.click(screen.getByRole('button',{name:'取消编辑'}))
    await waitFor(()=>expect(risk).toHaveBeenLastCalledWith(false))
    expect(commit).not.toHaveBeenCalled()
    open();expect(screen.getByLabelText('选项批量内容')).toHaveValue('')
  })
  it.each(['MATRIX','MATRIX_MULTIPLE'] as const)('bulk replaces %s rows, keeps row keys and enforces row/field budgets',async type=>{
    const q={...newQuestion(type),prompt:'矩阵题'},commit=vi.fn()
    const extra=[...Array.from({length:12},()=>({...newQuestion('MATRIX'),rows:Array.from({length:40},(_,i)=>({rowKey:'r'+i,label:'已有行'+i}))})),...Array.from({length:18},()=>newQuestion('SHORT_TEXT'))]
    render(<Host initial={definition(q,extra)} commit={commit}/>)
    fireEvent.click(screen.getByRole('button',{name:'编辑题目：矩阵题'}));open('矩阵行');replace('矩阵行')
    paste('专注\n计划\n协作','矩阵行')
    expect(screen.getByRole('alert')).toHaveTextContent('最多允许 2 项')
    paste('专注\n计划','矩阵行');fireEvent.click(screen.getByRole('button',{name:'应用矩阵行'}))
    fireEvent.click(screen.getByRole('button',{name:'保存题目修改'}))
    await waitFor(()=>expect(commit).toHaveBeenCalledOnce())
    const saved=commit.mock.calls[0][0].pages[0].questions[0] as FormQuestion
    expect(saved.rows.map(row=>row.label)).toEqual(['专注','计划'])
    expect(saved.rows[0].rowKey).toBe(q.rows[0].rowKey)
    expect(saved.rows[1].rowKey).not.toBe(q.rows[0].rowKey)
    expect(saved.options).toEqual(q.options)
  })
  it('keeps independent pending option and matrix buffers from being silently saved',()=>{
    const q={...newQuestion('MATRIX'),prompt:'矩阵题'}
    render(<Host initial={definition(q)} commit={vi.fn()}/>)
    fireEvent.click(screen.getByRole('button',{name:'编辑题目：矩阵题'}));open();open('矩阵行')
    paste('新增选项');paste(Array.from({length:41},(_,i)=>'陈述'+i).join('\n'),'矩阵行')
    expect(screen.getByRole('alert')).toHaveTextContent('最多允许 40 项')
    fireEvent.click(screen.getByRole('button',{name:'应用选项'}))
    expect(screen.getByRole('button',{name:'保存题目修改'})).toBeDisabled()
    const rows=screen.getByLabelText('矩阵行批量内容').closest('details')!
    fireEvent.click(within(rows).getByRole('button',{name:'清空输入'}))
    expect(screen.getByRole('button',{name:'保存题目修改'})).toBeEnabled()
  })
})
