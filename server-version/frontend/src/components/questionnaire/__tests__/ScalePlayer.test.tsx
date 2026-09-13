import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScalePlayer } from '../ScalePlayer'

const item = {
  itemCode: 'q1',
  content: '我能专注完成任务',
  required: true,
  options: [
    { value: 1, label: '不同意' },
    { value: 2, label: '同意' },
  ],
}

describe('ScalePlayer', () => {
  it('preserves string/number option values and selected state', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <ScalePlayer
        item={item}
        value={1}
        position={1}
        total={2}
        onChange={onChange}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '不同意' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '同意' }))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('keeps navigation callbacks presentation-only', async () => {
    const user = userEvent.setup()
    const onPrevious = vi.fn()
    const onSubmit = vi.fn()

    const { rerender } = render(
      <ScalePlayer
        item={item}
        value={undefined}
        position={1}
        total={2}
        onChange={vi.fn()}
        onPrevious={onPrevious}
        onNext={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /上一题/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /下一题/ })).toBeEnabled()

    rerender(
      <ScalePlayer
        item={item}
        value={2}
        position={2}
        total={2}
        onChange={vi.fn()}
        onPrevious={onPrevious}
        onSubmit={onSubmit}
      />,
    )

    await user.click(screen.getByRole('button', { name: /上一题/ }))
    await user.click(screen.getByRole('button', { name: /提交整份量表/ }))
    expect(onPrevious).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('locks answer and navigation controls while disabled', () => {
    render(
      <ScalePlayer
        item={item}
        value={undefined}
        disabled
        position={2}
        total={2}
        onChange={vi.fn()}
        onPrevious={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '不同意' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /上一题/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /提交整份量表/ })).toBeDisabled()
  })
})
