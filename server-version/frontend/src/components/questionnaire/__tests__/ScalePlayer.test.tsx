import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScalePlayer } from '../ScalePlayer'

const item = {
  itemCode: 'q1',
  type: 'single',
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
  it('advances once after saving, focuses the next question, and keeps the final submit explicit', async () => {
    let finishSave!: (saved: boolean) => void
    const save = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finishSave = resolve })).mockResolvedValue(true)
    const submit = vi.fn()
    function Journey() {
      const [index, setIndex] = useState(0)
      const [answers, setAnswers] = useState<Record<number, number>>({})
      return <ScalePlayer autoAdvance item={{ ...item, itemCode: `q${index}`, content: `问题 ${index + 1}` }} value={answers[index]}
        position={index + 1} total={3} onChange={async value => { const saved = await save(value); if (saved) setAnswers(old => ({ ...old, [index]: Number(value) })); return saved }}
        onPrevious={() => setIndex(old => old - 1)} onNext={index < 2 ? () => setIndex(old => old + 1) : undefined} onSubmit={index === 2 ? submit : undefined} />
    }
    const user = userEvent.setup()
    render(<Journey />)
    const option = screen.getByRole('button', { name: '同意' })
    fireEvent.click(option, { detail: 1 }); fireEvent.click(option, { detail: 1 })
    expect(save).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: /问题 1/ })).toBeInTheDocument()
    await act(async () => finishSave(true))
    const next = await screen.findByRole('heading', { name: /问题 2/ })
    expect(next).toHaveFocus()
    expect(screen.queryByRole('heading', { name: /问题 3/ })).not.toBeInTheDocument()
    screen.getByRole('button', { name: '同意' }).focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: /问题 3/ })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: '不同意' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /提交整份量表/ })).toBeEnabled())
    expect(submit).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /上一题/ }))
    expect(screen.getByRole('button', { name: '同意' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: /问题 2/ })).toHaveFocus()
  })

  it.each([false, 'reject'] as const)('stays on the question after an unsuccessful save: %s', async outcome => {
    const next = vi.fn()
    const save = outcome === 'reject' ? vi.fn().mockRejectedValue(new Error('本机保存失败')) : vi.fn().mockResolvedValue(false)
    render(<ScalePlayer autoAdvance item={item} value={undefined} position={1} total={2} onChange={save} onNext={next} onPrevious={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '同意' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '同意' })).toBeEnabled())
    expect(next).not.toHaveBeenCalled()
  })

  it('does not advance on restored answers or unsupported intermediate input types', async () => {
    const next = vi.fn(), save = vi.fn()
    const view = render(<ScalePlayer autoAdvance item={item} value={2} position={1} total={2} onChange={save} onNext={next} onPrevious={vi.fn()} />)
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)) })
    expect(next).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    view.rerender(<ScalePlayer autoAdvance item={{ ...item, type: 'multiple' }} value={undefined} position={1} total={2} onChange={save} onNext={next} onPrevious={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '同意' }))
    expect(save).toHaveBeenCalledWith(2)
    expect(next).not.toHaveBeenCalled()
  })

  it('cancels a pending advance when the question changes outside this selection', async () => {
    let finish!: (saved: boolean) => void
    const save = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve }))
    const next = vi.fn()
    const view = render(<ScalePlayer autoAdvance scopeKey="unit-a" item={item} value={undefined} position={1} total={2} onChange={save} onNext={next} onPrevious={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '同意' }))
    view.rerender(<ScalePlayer autoAdvance scopeKey="unit-b" item={item} value={2} position={1} total={2} onChange={save} onNext={next} onPrevious={vi.fn()} />)
    view.rerender(<ScalePlayer autoAdvance scopeKey="unit-a" item={item} value={2} position={1} total={2} onChange={save} onNext={next} onPrevious={vi.fn()} />)
    await act(async () => { finish(true); await new Promise(resolve => setTimeout(resolve, 250)) })
    expect(next).not.toHaveBeenCalled()
  })

})

it.each([false,true])('restores keyboard focus after asynchronous final-item save without stealing another target (%s)',async moved=>{
 let finish!:()=>void
 const save=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve}))
 render(<><button type="button">另一个控件</button><ScalePlayer autoAdvance item={item} value={undefined} position={1} total={1} onChange={save} onPrevious={vi.fn()}/></>)
 const button=screen.getByRole('button',{name:'同意'});button.focus();fireEvent.click(button,{detail:0})
 await waitFor(()=>expect(button).toBeDisabled())
 // Chromium blurs a natively disabled focused button; jsdom needs that state explicitly.
 const other=screen.getByRole('button',{name:'另一个控件'});other.focus();if(!moved)other.blur()
 expect(document.activeElement).toBe(moved?other:document.body)
 await act(async()=>finish())
 expect(button).toBeEnabled()
 expect(moved?screen.getByRole('button',{name:'另一个控件'}):button).toHaveFocus()
 expect(save).toHaveBeenCalledTimes(1)
})
