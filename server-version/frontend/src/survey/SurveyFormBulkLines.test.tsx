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
  it('ignores a whitespace-only direct paste without removing blank inputs',()=>{
    render(<Host initial={{schemaVersion:2,pages:[]}} commit={vi.fn()}/>)
    fireEvent.paste(screen.getByLabelText('选项 1'),{clipboardData:{getData:()=> ' \r\n\n '}})
    expect(screen.getByLabelText('选项 1')).toHaveValue('')
    expect(screen.getByLabelText('选项 2')).toHaveValue('')
    expect(screen.queryByLabelText('选项 3')).not.toBeInTheDocument()
  })
  it('reuses direct multiline paste and Enter navigation without saving prematurely or including blank spare rows',async()=>{
    const q={...newQuestion('SINGLE'),prompt:'直接粘贴'},commit=vi.fn()
    render(<Host initial={definition(q)} commit={commit}/>)
    fireEvent.click(screen.getByRole('button',{name:'编辑题目：直接粘贴'}))
    fireEvent.paste(screen.getByLabelText('选项 1'),{clipboardData:{getData:()=> '甲,乙\r\na=b\n第三项'}})
    expect(screen.getByLabelText('选项 1')).toHaveValue('甲,乙')
    expect(screen.getByLabelText('选项 2')).toHaveValue('a=b')
    expect(screen.getByLabelText('选项 3')).toHaveValue('第三项')
    expect(screen.queryByLabelText('选项 4')).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText('选项 3'),{key:'Enter',isComposing:true})
    expect(screen.queryByLabelText('选项 4')).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText('选项 3'),{key:'Enter'})
    await waitFor(()=>expect(screen.getByLabelText('选项 4')).toHaveFocus())
    fireEvent.change(screen.getByLabelText('选项 4'),{target:{value:'第四项'}})
    expect(commit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'保存题目修改'}))
    await waitFor(()=>expect(commit).toHaveBeenCalledOnce())
    const saved=commit.mock.calls[0][0].pages[0].questions[0] as FormQuestion
    expect(saved.options.map(row=>row.label)).toEqual(['甲,乙','a=b','第三项','第四项'])
    expect(saved.options[0].optionKey).toBe(q.options[0].optionKey)
  })
  it('reorders options with their scores and all references intact',async()=>{
    const q={...newQuestion('MULTIPLE'),itemKey:'source',prompt:'移动选项',options:[{optionKey:'a',label:'其他',score:1},{optionKey:'b',label:'均无',score:2}],otherOptionKey:'a',otherMaxLength:100,exclusiveOptionKeys:['b']}
    const dependent={...newQuestion('SHORT_TEXT'),displayIf:{itemKey:'source',operator:'INCLUDES' as const,optionKey:'b'}},commit=vi.fn()
    render(<Host initial={definition(q,[dependent])} commit={commit}/>)
    fireEvent.click(screen.getByRole('button',{name:'编辑题目：移动选项'}))
    fireEvent.click(screen.getByRole('button',{name:'下移选项 1'}))
    expect(screen.getByLabelText('选项 1')).toHaveValue('均无')
    fireEvent.click(screen.getByRole('button',{name:'保存题目修改'}))
    await waitFor(()=>expect(commit).toHaveBeenCalledOnce())
    const [saved,next]=commit.mock.calls[0][0].pages[0].questions
    expect(saved).toMatchObject({options:[q.options[1],q.options[0]],otherOptionKey:'a',otherMaxLength:100,exclusiveOptionKeys:['b']})
    expect(next).toEqual(dependent)
  })
  it.each(['MATRIX','MATRIX_MULTIPLE'] as const)('directly pastes and reorders %s statements with stable row identities',async type=>{
    const q={...newQuestion(type),prompt:'矩阵粘贴'},commit=vi.fn()
    render(<Host initial={definition(q)} commit={commit}/>)
    fireEvent.click(screen.getByRole('button',{name:'编辑题目：矩阵粘贴'}))
    fireEvent.paste(screen.getByLabelText('矩阵行 1'),{clipboardData:{getData:()=> '专注\n计划\n协作'}})
    fireEvent.click(screen.getByRole('button',{name:'下移矩阵行 1'}))
    expect(screen.getByLabelText('矩阵行 1')).toHaveValue('计划')
    fireEvent.click(screen.getByRole('button',{name:'保存题目修改'}))
    await waitFor(()=>expect(commit).toHaveBeenCalledOnce())
    const saved=commit.mock.calls[0][0].pages[0].questions[0] as FormQuestion
    expect(saved.rows.map(row=>row.label)).toEqual(['计划','专注','协作'])
    expect(saved.rows[1].rowKey).toBe(q.rows[0].rowKey)
  })
  it('retains an oversized direct paste for correction without changing the question',()=>{
    const q={...newQuestion('SINGLE'),prompt:'超限粘贴',options:[{optionKey:'a',label:'原选项甲'},{optionKey:'b',label:'原选项乙'}]},commit=vi.fn()
    render(<Host initial={definition(q)} commit={commit}/>)
    fireEvent.click(screen.getByRole('button',{name:'编辑题目：超限粘贴'}))
    const text=Array.from({length:31},(_,i)=>'选项'+i).join('\n')
    fireEvent.paste(screen.getByLabelText('选项 1'),{clipboardData:{getData:()=>text}})
    expect(screen.getByLabelText('选项 1')).toHaveValue('原选项甲')
    expect(screen.getByLabelText('选项批量内容')).toHaveValue(text)
    expect(screen.getByRole('alert')).toHaveTextContent('最多允许 30 项')
    expect(screen.getByRole('button',{name:'保存题目修改'})).toBeDisabled()
    expect(commit).not.toHaveBeenCalled()
  })
  it('rejects accidental multi-column pastes without changing existing options',()=>{
    const q={...newQuestion('SINGLE'),prompt:'单列内容'},commit=vi.fn()
    render(<Host initial={definition(q)} commit={commit}/>)
    fireEvent.click(screen.getByRole('button',{name:'编辑题目：单列内容'}));open()
    paste('yes\t是\nno\t否')
    expect(screen.getByRole('alert')).toHaveTextContent('检测到多列内容。请只复制一列文字。')
    expect(screen.getByRole('button',{name:'应用选项'})).toBeDisabled()
    expect(screen.getByLabelText('选项 1')).toHaveValue(q.options[0].label)
    expect(commit).not.toHaveBeenCalled()
  })
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
    paste('新增甲\n新增乙');paste(Array.from({length:41},(_,i)=>'陈述'+i).join('\n'),'矩阵行')
    expect(screen.getByRole('alert')).toHaveTextContent('最多允许 40 项')
    fireEvent.click(screen.getByRole('button',{name:'应用选项'}))
    expect(screen.getByRole('button',{name:'保存题目修改'})).toBeDisabled()
    const rows=screen.getByLabelText('矩阵行批量内容').closest('details')!
    fireEvent.click(within(rows).getByRole('button',{name:'清空输入'}))
    expect(screen.getByRole('button',{name:'保存题目修改'})).toBeEnabled()
  })
})
