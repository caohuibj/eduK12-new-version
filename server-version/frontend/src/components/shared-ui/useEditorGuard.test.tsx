import { useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ManagementDialog from '../staff-ui/ManagementDialog'
import { useEditorGuard } from './useEditorGuard'

function Editor({ save }: { save: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('original')
  const guard = useEditorGuard({ open, value, onClose: () => setOpen(false) })
  const submit = async () => {
    if (!guard.begin()) return
    try { await save(); setOpen(false) } catch { guard.fail('保存失败') } finally { guard.finish() }
  }
  return <><button onClick={() => setOpen(true)}>打开编辑器</button>
    <ManagementDialog open={open} title="编辑任务" onClose={guard.close} closeDisabled={guard.busy} actions={<button disabled={guard.busy} onClick={() => void submit()}>保存</button>}>
      <input aria-label="标题" disabled={guard.busy} value={value} onChange={event => setValue(event.target.value)} />{guard.error}
    </ManagementDialog>{guard.confirmation}</>
}

describe('editor protection', () => {
  it('confirms a dirty exit, preserves a canceled draft, and restores parent and trigger focus', async () => {
    const user = userEvent.setup()
    render(<Editor save={vi.fn()} />)
    const trigger = screen.getByText('打开编辑器')
    await user.click(trigger)
    await user.type(screen.getByLabelText('标题'), ' edited')
    await user.keyboard('{Escape}')
    const confirmation = screen.getByRole('dialog', { name: '放弃未保存的修改？' })
    await user.click(within(confirmation).getByText('继续编辑'))
    expect(screen.getByLabelText('标题')).toHaveValue('original edited')
    expect(screen.getByLabelText('标题')).toHaveFocus()
    await user.keyboard('{Escape}')
    await user.click(screen.getByText('放弃修改'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('synchronously deduplicates saves, blocks dismissal, keeps failed drafts and allows retry', async () => {
    let reject!: () => void
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = () => fail(new Error('offline')) })).mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<Editor save={save} />)
    await user.click(screen.getByText('打开编辑器'))
    await user.type(screen.getByLabelText('标题'), ' draft')
    const button = screen.getByText('保存')
    act(() => { fireEvent.click(button); fireEvent.click(button) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('标题')).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: '编辑任务' })).toBeInTheDocument()
    await act(async () => reject())
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败')
    expect(screen.getByLabelText('标题')).toHaveValue('original draft')
    expect(screen.getByLabelText('标题')).not.toBeDisabled()
    await user.click(button)
    expect(save).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
