import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormPlayer } from '../FormPlayer'

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
