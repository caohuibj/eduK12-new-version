import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AssessmentToolPicker from '../AssessmentToolPicker'

const options = Array.from({ length: 26 }, (_, i) => ({ id: `id-${i}`, name: `工具 ${i}`, version: `1.${i}`, code: `CODE${i}` }))
describe('searchable assessment tool picker', () => {
  it('pages cards and searches all available pages by code before selecting the exact identity', () => {
    const select = vi.fn()
    render(<AssessmentToolPicker label="量表" options={options} value="" onChange={select} />)
    fireEvent.click(screen.getByRole('button', { name: /选择量表/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('textbox', { name: '检索工具' })).toHaveFocus()
    expect(within(dialog).getAllByRole('button', { name: /^选择 工具/ })).toHaveLength(12)
    fireEvent.click(within(dialog).getByRole('button', { name: '下一页工具' }))
    expect(within(dialog).getByRole('button', { name: '选择 工具 12，版本 1.12' })).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('textbox', { name: '检索工具' }), { target: { value: 'code25' } })
    expect(within(dialog).getAllByRole('button', { name: /^选择 工具/ })).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: '选择 工具 25，版本 1.25' }))
    expect(select).toHaveBeenCalledExactlyOnceWith('id-25')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('distinguishes same-name versions and retains selected state when reopening', () => {
    function Example() { const [value, setValue] = useState(''); return <AssessmentToolPicker label="认知测验" value={value} onChange={setValue} options={[{ id: 'old', name: '注意力', configVersion: '1' }, { id: 'new', name: '注意力', configVersion: '2' }]} /> }
    render(<Example />)
    fireEvent.click(screen.getByRole('button', { name: /选择认知测验/ }))
    fireEvent.click(screen.getByRole('button', { name: '选择 注意力，版本 2' }))
    fireEvent.click(screen.getByRole('button', { name: /注意力 点击重新选择/ }))
    expect(screen.getByRole('button', { name: '选择 注意力，版本 2' })).toHaveTextContent('已选择')
    expect(screen.getByRole('button', { name: '选择 注意力，版本 1' })).not.toHaveTextContent('已选择')
  })
  it('returns focus on cancellation and never changes the existing selection', () => {
    const change = vi.fn()
    render(<AssessmentToolPicker label="情境判断" value="id-0" options={options} onChange={change} />)
    const trigger = screen.getByRole('button', { name: /工具 0 点击重新选择/ })
    trigger.focus(); fireEvent.click(trigger)
    fireEvent.change(screen.getByRole('textbox', { name: '检索工具' }), { target: { value: '不存在' } })
    expect(screen.getByText('没有找到匹配的工具，请更换关键词。')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('textbox', { name: '检索工具' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
    expect(change).not.toHaveBeenCalled()
  })
  it('does not open a disabled picker or invent tools for an empty catalog', () => {
    const view = render(<AssessmentToolPicker label="量表" value="" options={[]} onChange={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: /选择量表/ })).toBeDisabled()
    view.rerender(<AssessmentToolPicker label="量表" value="" options={[]} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /选择量表/ }))
    expect(screen.getByText(/暂无可选工具/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一页工具' })).toBeDisabled()
  })
})

it('keeps an unavailable fixed configuration visible with its business reason and prevents selection',()=>{
 const select=vi.fn();render(<AssessmentToolPicker label="量表" value="" options={[{id:'fixed',name:'注意力 · 教学简报',disabled:true,unavailableReason:'配置名称冲突，请管理员调整'}]} onChange={select}/>)
 fireEvent.click(screen.getByRole('button',{name:/选择量表/}));const card=screen.getByRole('button',{name:/选择 注意力 · 教学简报.*暂不可用/});expect(card).toBeDisabled();expect(screen.getByText('配置名称冲突，请管理员调整')).toBeVisible();fireEvent.click(card);expect(select).not.toHaveBeenCalled()
})
