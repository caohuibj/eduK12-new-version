import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ManagementDialog from '../ManagementDialog'

function Example() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  return <>
    <button onClick={() => setOpen(true)}>Open</button>
    <button>Background</button>
    <ManagementDialog open={open} title="Edit" onClose={() => setOpen(false)} actions={<button onClick={() => setOpen(false)}>Done</button>}>
      <input aria-label="Name" value={value} onChange={event => setValue(event.target.value)} />
      <video controls tabIndex={0} aria-label="Lesson video" />
      <button disabled>Disabled</button>
      <button hidden>Hidden</button>
    </ManagementDialog>
  </>
}

describe('ManagementDialog', () => {
  it.each([false, true])('releases stacked scroll locks even if the lower dialog closes first (%s)', closeLowerFirst => {
    document.body.style.overflow = 'auto'
    const stack = (lowerOpen: boolean) => <>
      <ManagementDialog open={lowerOpen} title="Lower" onClose={() => {}}>Lower content</ManagementDialog>
      <ManagementDialog open title="Upper" onClose={() => {}}>Upper content</ManagementDialog>
    </>
    const view = render(stack(true))
    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getByRole('dialog', { name: 'Lower' }).closest('dialog')).toHaveAttribute('inert')
    expect(screen.getByRole('dialog', { name: 'Upper' }).closest('dialog')).not.toHaveAttribute('inert')
    if (closeLowerFirst) {
      view.rerender(stack(false))
      expect(document.body.style.overflow).toBe('hidden')
    }
    view.unmount()
    expect(document.body.style.overflow).toBe('auto')
    document.body.style.overflow = ''
  })

  it('restores a pointer trigger even when the browser did not focus the clicked button', () => {
    render(<Example />)
    const trigger = screen.getByText('Open')
    fireEvent.pointerDown(trigger)
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Edit' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('focuses once, loops in both directions, survives inline callbacks, and restores the trigger', async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByText('Open')
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Edit' })
    expect(dialog).toHaveFocus()
    expect(dialog.closest('dialog')).toHaveAttribute('open')
    await user.tab()
    expect(within(dialog).getByLabelText('关闭')).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByText('Done')).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByLabelText('关闭')).toHaveFocus()
    await user.tab()
    await user.keyboard('long input')
    expect(screen.getByLabelText('Name')).toHaveValue('long input')
    expect(screen.getByLabelText('Name')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Lesson video')).toHaveFocus()
    await user.tab()
    expect(screen.getByText('Done')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })
})
