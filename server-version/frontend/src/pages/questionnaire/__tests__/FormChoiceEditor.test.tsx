import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FormChoiceEditor } from '../FormChoiceEditor'
import { emptyChoices } from '../formChoices'

function Editor({ max = 30 }: { max?: number }) {
  const [choices, setChoices] = useState(() => emptyChoices('option'))
  return <FormChoiceEditor title="选项" prefix="option" choices={choices} onChange={setChoices} max={max} portableKeys />
}
const input = (index: number) => screen.getByRole('textbox', { name: `选项 ${index} 文字` })
const paste = (index: number, text: string) => fireEvent.paste(input(index), { clipboardData: { getData: () => text } })

describe('Training choice authoring', () => {
  it('moves focus with Enter, appends at the end and keeps composition Enter intact', async () => {
    render(<Editor />)
    fireEvent.keyDown(input(1), { key: 'Enter', isComposing: true })
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    fireEvent.keyDown(input(1), { key: 'Enter' })
    await waitFor(() => expect(input(2)).toHaveFocus())
    fireEvent.keyDown(input(2), { key: 'Enter' })
    await waitFor(() => expect(input(3)).toHaveFocus())
  })
  it('pastes CRLF lines into an empty row without splitting punctuation or losing other rows', () => {
    render(<Editor />)
    fireEvent.change(input(2), { target: { value: '已有选项' } })
    paste(1, '中文, English\r\na=b\r\n\r\n第三项')
    expect(input(1)).toHaveValue('中文, English')
    expect(input(2)).toHaveValue('a=b')
    expect(input(3)).toHaveValue('第三项')
    expect(input(4)).toHaveValue('已有选项')
  })
  it('keeps codes stable when editing labels, reordering and deleting', async () => {
    render(<Editor />)
    fireEvent.change(input(1), { target: { value: '甲' } })
    fireEvent.change(input(2), { target: { value: '乙' } })
    await userEvent.setup().click(screen.getByRole('button', { name: '编辑编码' }))
    const firstCode = (screen.getByLabelText('选项 1 编码') as HTMLInputElement).value
    fireEvent.click(screen.getByRole('button', { name: '下移选项 1' }))
    expect(input(2)).toHaveValue('甲')
    expect(screen.getByLabelText('选项 2 编码')).toHaveValue(firstCode)
    fireEvent.change(input(2), { target: { value: '甲（新文字）' } })
    expect(screen.getByLabelText('选项 2 编码')).toHaveValue(firstCode)
    fireEvent.click(screen.getByRole('button', { name: '删除选项 1' }))
    expect(input(1)).toHaveValue('甲（新文字）')
    expect(screen.getByLabelText('选项 1 编码')).toHaveValue(firstCode)
  })
  it('previews bulk labels, cancels safely and appends by default', async () => {
    render(<Editor />)
    fireEvent.change(input(1), { target: { value: '原选项' } })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '批量粘贴选项' }))
    fireEvent.change(screen.getByLabelText('选项批量内容'), { target: { value: '同意\n不同意' } })
    expect(within(screen.getByRole('list', { name: '选项粘贴预览' })).getAllByRole('listitem')).toHaveLength(2)
    expect(input(1)).toHaveValue('原选项')
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(input(1)).toHaveValue('原选项')
    await user.click(screen.getByRole('button', { name: '批量粘贴选项' }))
    fireEvent.change(screen.getByLabelText('选项批量内容'), { target: { value: '同意\n不同意' } })
    await user.click(screen.getByRole('button', { name: '应用 2 项' }))
    expect(input(1)).toHaveValue('原选项')
    expect(input(2)).toHaveValue('同意')
    expect(input(3)).toHaveValue('不同意')
  })
  it('imports two Excel columns only in explicit coded mode and replaces only on request', async () => {
    render(<Editor />)
    fireEvent.change(input(1), { target: { value: '原选项' } })
    paste(1, 'yes\t是\nno\t否')
    expect(screen.getByRole('button', { name: '应用' })).toBeDisabled()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('选项粘贴格式'), 'coded')
    await user.selectOptions(screen.getByLabelText('选项应用方式'), 'replace')
    await user.click(screen.getByRole('button', { name: '应用 2 项' }))
    expect(input(1)).toHaveValue('是')
    expect(input(2)).toHaveValue('否')
    await user.click(screen.getByRole('button', { name: '编辑编码' }))
    expect(screen.getByLabelText('选项 1 编码')).toHaveValue('yes')
    expect(screen.getByLabelText('选项 2 编码')).toHaveValue('no')
  })
  it('blocks duplicate codes and over-limit pastes without truncating or changing the draft', async () => {
    render(<Editor max={2} />)
    fireEvent.change(input(1), { target: { value: '原选项' } })
    paste(2, '甲\n乙\n丙')
    expect(input(1)).toHaveValue('原选项')
    expect(input(2)).toHaveValue('')
    expect(screen.getByRole('button', { name: '应用 3 项' })).toBeDisabled()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('选项粘贴格式'), 'coded')
    await user.selectOptions(screen.getByLabelText('选项应用方式'), 'replace')
    fireEvent.change(screen.getByLabelText('选项批量内容'), { target: { value: 'same\t甲\nsame\t乙' } })
    expect(screen.getByRole('button', { name: '应用 2 项' })).toBeDisabled()
    expect(screen.getByText('选项编码重复，请展开“编辑编码”检查。')).toBeInTheDocument()
    expect(input(1)).toHaveValue('原选项')
  })
  it('accepts a full-size paste without counting spare blank inputs against the limit', () => {
    render(<Editor max={2} />)
    paste(1, '甲\n乙')
    expect(input(1)).toHaveValue('甲')
    expect(input(2)).toHaveValue('乙')
    expect(screen.queryByRole('region', { name: '批量粘贴选项' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
