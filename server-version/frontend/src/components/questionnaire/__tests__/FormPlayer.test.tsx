import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormPlayer } from '../FormPlayer'
import {useState} from 'react'

const navigationProps = {
  position: 1,
  total: 2,
  onPrevious: vi.fn(),
  onNext: vi.fn(),
}

describe('FormPlayer', () => {
  it('uses native radio semantics for single-choice fields', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <FormPlayer
        item={{ id: 'grade', type: 'single_choice', label: '年级', required: true }}
        options={[{ value: '7', label: '七年级' }, { value: '8', label: '八年级' }]}
        value={null}
        onChange={onChange}
        {...navigationProps}
      />,
    )

    const gradeSeven = screen.getByRole('radio', { name: '七年级' })
    expect(gradeSeven).not.toBeChecked()
    await user.click(gradeSeven)
    expect(onChange).toHaveBeenCalledWith('7')
  })

  it('uses native checkbox semantics and preserves array values for multiple-choice fields', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <FormPlayer
        item={{ id: 'supports', type: 'multiple_choice', label: '可用支持', required: false }}
        options={[{ value: 'family', label: '家庭' }, { value: 'school', label: '学校' }]}
        value={['family']}
        onChange={onChange}
        {...navigationProps}
      />,
    )

    expect(screen.getByRole('checkbox', { name: '家庭' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: '学校' }))
    expect(onChange).toHaveBeenCalledWith(['family', 'school'])
  })

  it('associates text fields and validation errors with the visible label', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <FormPlayer
        item={{ id: 'note', type: 'text_input', label: '补充说明', placeholder: '请输入说明', required: true }}
        options={[]}
        value=""
        errorMessage="请填写补充说明"
        onChange={onChange}
        {...navigationProps}
      />,
    )

    const textarea = screen.getByRole('textbox', { name: /补充说明/ })
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(textarea).toHaveAccessibleDescription('请填写补充说明')
    await user.type(textarea, '内容')
    expect(onChange).toHaveBeenLastCalledWith('容')
  })

  it('keeps month input native and exposes the final-unit submit action', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSubmit = vi.fn()

    render(
      <FormPlayer
        item={{ id: 'month', type: 'year_month', label: '入学年月', required: false }}
        options={[]}
        value="2026-09"
        position={2}
        total={2}
        onChange={onChange}
        onPrevious={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByLabelText('入学年月')).toHaveAttribute('type', 'month')
    await user.click(screen.getByRole('button', { name: '提交整个区段' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
  it('preserves Chinese composition events without submitting or navigating', () => {
    const onChange = vi.fn(), onSubmit = vi.fn(), onNext = vi.fn()
    render(<FormPlayer item={{ id: 'ime', type: 'text_input', label: '意见', required: false }} options={[]} value="" position={1} total={1} onPrevious={vi.fn()} onChange={onChange} onNext={onNext} onSubmit={onSubmit} allowSkip />)
    const input = screen.getByRole('textbox')
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '中文🙂\n第二行' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    fireEvent.compositionEnd(input, { data: '中文🙂\n第二行' })
    expect(onChange).toHaveBeenLastCalledWith('中文🙂\n第二行')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

})

describe('typed basic FormPlayer', () => {
  const base = { itemKey: 'q_id', prompt: '数值', type: 'NUMBER' as const, required: false, options: [], rows: [], min: 0, max: 2, precision: 2, step: 0.25 }
  it('keeps 0 numeric, clears to null and exposes frozen constraints', () => {
    const onChange = vi.fn()
    render(<FormPlayer item={{ id: 'typed', type: 'number', label: '数值', required: false, formDefinition: base }} options={[]} value={0} onChange={onChange} {...navigationProps} allowSkip />)
    const input = screen.getByRole('spinbutton', { name: '数值' })
    expect(input).toHaveValue(0)
    expect(input).toHaveAttribute('min', '0')
    expect(input).toHaveAttribute('max', '2')
    expect(input).toHaveAttribute('step', '0.25')
    fireEvent.change(input, { target: { value: '1.25' } })
    expect(onChange).toHaveBeenLastCalledWith(1.25)
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(null)
    fireEvent.click(screen.getByRole('button', { name: '清空本题（不作答）' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
  it.each(['DATE', 'TIME', 'LONG_TEXT'] as const)('renders %s with typed restoration and disabled guards', type => {
    const value = type === 'DATE' ? '2024-02-29' : type === 'TIME' ? '00:00' : '中文\n长文本'
    const q = { itemKey: 'q_id', prompt: '合成题', type, required: true, options: [], rows: [], ...(type === 'TIME' ? { timeZone: 'UTC' as const } : {}), ...(type === 'LONG_TEXT' ? { maxLength: 123 } : {}) }
    render(<FormPlayer item={{ id: 'typed', type: type.toLowerCase(), label: '合成题', required: true, formDefinition: q }} options={[]} value={value} onChange={vi.fn()} {...navigationProps} answerDisabled />)
    const input = screen.getByLabelText('合成题')
    expect(input).toHaveValue(value)
    expect(input).toBeDisabled()
    if (type === 'TIME') expect(screen.getByText(/时间解释时区：UTC/)).toBeInTheDocument()
    if (type === 'LONG_TEXT') expect(input).toHaveAttribute('maxlength', '123')
  })
})

describe('C05 structured typed adapters', () => {
  const options = [{ optionKey: 'a', label: '甲' }, { optionKey: 'b', label: '乙' }, { optionKey: 'c', label: '丙' }]
  const rows = [{ rowKey: 'r1', label: '第一行' }, { rowKey: 'r2', label: '第二行' }]
  const mount = (type: import('../../../modules/assessment-core/form/types').FormQuestion<never>['type'], value: import('../FormPlayer').FormPlayerValue, patch = {}, disabled = false) => {
    const onChange = vi.fn()
    render(<FormPlayer item={{ id: 'db-id', type: type.toLowerCase(), label: '结构化题', required: false,
      formDefinition: { itemKey: 'q-stable', type, prompt: '结构化题', required: false, options, rows: [], ...patch } }} options={[]}
      value={value} onChange={onChange} allowSkip disabled={disabled} {...navigationProps} />)
    return onChange
  }
  it('renders Likert through shared choices and clears optional answers to null', async () => {
    const change = mount('LIKERT', 'a')
    expect(screen.getByRole('radio', { name: '甲' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: '乙' }))
    expect(change).toHaveBeenLastCalledWith('b')
    await userEvent.click(screen.getByRole('button', { name: '清空本题（不作答）' }))
    expect(change).toHaveBeenLastCalledWith(null)
  })
  it('adapts matrix row keys without dropping another row', async () => {
    const change = mount('MATRIX', { r1: 'a', r2: 'b' }, { rows })
    expect(screen.getAllByRole('radio', { name: '甲' })[0]).toBeChecked()
    await userEvent.click(screen.getAllByRole('radio', { name: '丙' })[0])
    expect(change).toHaveBeenCalledWith({ r1: 'c', r2: 'b' })
  })
  it('adapts multiple matrix row arrays and enforces max selections in controls', async () => {
    const change = mount('MATRIX_MULTIPLE', { r1: ['a', 'b'], r2: ['c'] }, { rows, maxSelections: 2 })
    expect(screen.getAllByRole('checkbox', { name: '丙' })[0]).toBeDisabled()
    await userEvent.click(screen.getAllByRole('checkbox', { name: '甲' })[0])
    expect(change).toHaveBeenCalledWith({ r1: ['b'], r2: ['c'] })
  })
  it('requires explicit ranking confirmation and returns a complete order', async () => {
    const change = mount('RANK_ORDER', null)
    expect(change).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '确认当前排序' }))
    expect(change).toHaveBeenCalledWith(['a', 'b', 'c'])
    await userEvent.click(screen.getByRole('button', { name: '下移第 1 项' }))
    expect(change).toHaveBeenLastCalledWith(['b', 'a', 'c'])
  })
  it('keeps unconfirmed slider distinct from numeric zero', async () => {
    const change = mount('SLIDER', null, { min: 0, max: 10, step: 0.5, options: [] })
    expect(screen.getByText('尚未确认')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '确认当前值' }))
    expect(change).toHaveBeenCalledWith(0)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2.5' } })
    expect(change).toHaveBeenLastCalledWith(2.5)
  })
  it('retains numeric zero and an incomplete constant sum without filling blanks', () => {
    const change = mount('CONSTANT_SUM', { a: 0, b: 100 }, { total: 100 })
    expect(screen.getByLabelText('分值：甲')).toHaveValue(0)
    expect(screen.getByLabelText('分值：丙')).toHaveValue(null)
    expect(screen.getByRole('status')).toHaveTextContent('留空不等于 0')
    fireEvent.change(screen.getByLabelText('分值：丙'), { target: { value: '0' } })
    expect(change).toHaveBeenLastCalledWith({ a: 0, b: 100, c: 0 })
  })
  it.each(['LIKERT', 'MATRIX', 'MATRIX_MULTIPLE', 'RANK_ORDER', 'SLIDER', 'CONSTANT_SUM'] as const)('locks every %s answer control inside the parent disabled fieldset', type => {
    mount(type, null, { rows: type.startsWith('MATRIX') ? rows : [] }, true)
    for (const control of document.querySelectorAll('.form-player input, .form-player button')) expect(control).toBeDisabled()
  })
})

describe('C06 policy controls',()=>{
 const q={itemKey:'q_v3',type:'MULTIPLE' as const,prompt:'选择',required:true,allowRefusal:true,options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'无'},{optionKey:'other',label:'其他'}],rows:[],otherOptionKey:'other',exclusiveOptionKeys:['no']}
 const item={id:'db',type:'multiple_choice',label:'选择',required:true,formDefinition:q,formPolicy:{version:3 as const,requiredRefusal:'ALLOW_SUBMIT' as const,hiddenRequired:'EXEMPT' as const}}
 it('uses the shared exclusive toggle and records explicit refusal',()=>{
  const change=vi.fn();render(<FormPlayer item={item} options={q.options.map(o=>({value:o.optionKey,label:o.label}))} value={['yes']} onChange={change} {...navigationProps}/>)
  fireEvent.click(screen.getByRole('checkbox',{name:'无'}));expect(change).toHaveBeenLastCalledWith(['no'])
  fireEvent.click(screen.getByRole('checkbox',{name:'我选择不回答这一题'}));expect(change).toHaveBeenLastCalledWith({_surveyRefusal:true})
  expect(screen.getByText(/本次任务不会标记为达成/)).toBeInTheDocument()
 })
 it('edits selected other text through a separate typed side field',()=>{
  const other=vi.fn();render(<FormPlayer item={item} options={q.options.map(o=>({value:o.optionKey,label:o.label}))} value={['other']} onChange={vi.fn()} otherText="先前文本" onOtherTextChange={other} {...navigationProps}/>)
  fireEvent.change(screen.getByLabelText('其他填写：q_v3'),{target:{value:'补充'}});expect(other).toHaveBeenCalledWith('补充')
 })
})


it('saves before advancing a School single choice once and keeps the last question manual',async()=>{
 let finish!:(saved:boolean)=>void
 const save=vi.fn().mockImplementationOnce(()=>new Promise<boolean>(resolve=>{finish=resolve})).mockResolvedValue(true),submit=vi.fn()
 function Journey(){
  const [index,setIndex]=useState(0),[answers,setAnswers]=useState<Record<number,string>>({})
  return <FormPlayer autoAdvance scopeKey="page-a" item={{id:'q'+index,type:'single_choice',label:'问题 '+(index+1),required:true}} options={[{value:'a',label:'选项 A'}]} value={answers[index]} position={index+1} total={2}
   onChange={async value=>{const saved=await save(value);if(saved)setAnswers(old=>({...old,[index]:String(value)}));return saved}}
   onPrevious={()=>setIndex(old=>old-1)} onNext={index===0?()=>setIndex(1):undefined} onSubmit={index===1?submit:undefined}/>
 }
 render(<Journey/>)
 const radio=screen.getByRole('radio',{name:'选项 A'})
 fireEvent.click(radio,{detail:1});fireEvent.click(radio,{detail:1})
 expect(save).toHaveBeenCalledTimes(1)
 expect(screen.getByRole('region',{name:'表单题目 1 / 2'})).toBeInTheDocument()
 await act(async()=>finish(true))
 expect(await screen.findByRole('region',{name:'表单题目 2 / 2'})).toHaveFocus()
 await userEvent.click(screen.getByRole('radio',{name:'选项 A'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'提交整个区段'})).toBeEnabled())
 expect(submit).not.toHaveBeenCalled()
 await userEvent.click(screen.getByRole('button',{name:'上一题'}))
 expect(screen.getByRole('radio',{name:'选项 A'})).toBeChecked()
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,260))})
 expect(screen.getByRole('region',{name:'表单题目 1 / 2'})).toBeInTheDocument()
 expect(save).toHaveBeenCalledTimes(2)
})

it.each([false,'reject'] as const)('does not advance a form after an unsuccessful save: %s',async(outcome)=>{
 const next=vi.fn(),save=outcome==='reject'?vi.fn().mockRejectedValue(new Error('本机保存失败')):vi.fn().mockResolvedValue(false)
 render(<FormPlayer autoAdvance item={{id:'choice',type:'single_choice',label:'单选题',required:true}} options={[{value:'a',label:'选项 A'}]} value={undefined} position={1} total={2} onChange={save} onPrevious={vi.fn()} onNext={next}/>)
 await userEvent.click(screen.getByRole('radio',{name:'选项 A'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'下一题'})).toBeEnabled())
 expect(next).not.toHaveBeenCalled()
})

it('keeps multiple choice, Other text and native arrow selection manual',async()=>{
 const next=vi.fn(),save=vi.fn()
 const props={autoAdvance:true,position:1,total:2,onChange:save,onPrevious:vi.fn(),onNext:next}
 const options=[{value:'a',label:'选项 A'},{value:'other',label:'其他'}]
 const view=render(<FormPlayer {...props} item={{id:'multiple',type:'multiple_choice',label:'多选题',required:true}} options={options} value={[]}/>)
 await userEvent.click(screen.getByRole('checkbox',{name:'选项 A'}))
 expect(save).toHaveBeenCalledWith(['a'])
 view.rerender(<FormPlayer {...props} item={{id:'typed',type:'SINGLE',label:'单选题',required:true,formDefinition:{itemKey:'typed',type:'SINGLE',prompt:'单选题',required:true,options:[{optionKey:'a',label:'选项 A'},{optionKey:'other',label:'其他'}],rows:[],otherOptionKey:'other'}}} options={options} value={undefined}/>)
 await userEvent.click(screen.getByRole('radio',{name:'其他'}))
 expect(save).toHaveBeenLastCalledWith('other')
 view.rerender(<FormPlayer {...props} item={{id:'arrows',type:'single_choice',label:'方向键选择',required:true}} options={options} value="a"/>)
 screen.getByRole('radio',{name:'选项 A'}).focus()
 await userEvent.keyboard('{ArrowRight}')
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,260))})
 expect(next).not.toHaveBeenCalled()
})


it.each([true,false])('uses the latest page boundary after saving conditional answers (initial next=%s)',async(initial)=>{
 let finish!:(saved:boolean)=>void
 const save=vi.fn(()=>new Promise<boolean>(resolve=>{finish=resolve})),next=vi.fn()
 const props={autoAdvance:true,item:{id:'conditional',type:'single_choice',label:'条件单选题',required:true},options:[{value:'a',label:'选项 A'}],value:undefined,position:1,onChange:save,onPrevious:vi.fn()}
 const view=render(<FormPlayer {...props} total={initial?2:1} onNext={initial?next:undefined}/>)
 await userEvent.click(screen.getByRole('radio',{name:'选项 A'}))
 view.rerender(<FormPlayer {...props} total={initial?1:2} onNext={initial?undefined:next}/>)
 await act(async()=>{finish(true);await new Promise(resolve=>setTimeout(resolve,260))})
 expect(next).toHaveBeenCalledTimes(initial?0:1)
})
