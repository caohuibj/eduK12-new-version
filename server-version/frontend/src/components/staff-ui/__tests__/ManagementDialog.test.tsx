import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
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
      <button disabled>Disabled</button>
      <button hidden>Hidden</button>
    </ManagementDialog>
  </>
}

describe('ManagementDialog', () => {
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
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })
})
