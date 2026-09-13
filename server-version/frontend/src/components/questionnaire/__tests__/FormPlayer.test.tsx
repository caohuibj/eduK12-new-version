import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
