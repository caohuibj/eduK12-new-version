import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AuthenticatorHelp from './AuthenticatorHelp'

describe('Authenticator usage help', () => {
  it('opens without submitting credentials and returns focus without losing entered information', () => {
    const submit = vi.fn(event => event.preventDefault())
    render(<form onSubmit={submit}><label>账号<input defaultValue="existing-researcher"/></label><AuthenticatorHelp/></form>)
    const trigger = screen.getByRole('button', { name:'如何使用验证器' })
    trigger.focus(); fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name:'如何使用身份验证器' })
    expect(dialog).toHaveFocus()
    expect(screen.getByText(/这里使用的是验证器动态码，不是短信验证码/)).toBeInTheDocument()
    expect(screen.getByText(/在双因素验证页选择“使用恢复码”/)).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
    fireEvent.keyDown(dialog, { key:'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(screen.getByLabelText('账号')).toHaveValue('existing-researcher')
    expect(document.body.style.overflow).not.toBe('hidden')
  })
  it('describes controlled administrator recovery without promising researcher recovery codes', () => {
    render(<AuthenticatorHelp audience="admin"/>)
    fireEvent.click(screen.getByRole('button', { name:'如何使用验证器' }))
    expect(screen.getByText(/通过受控后台恢复管理员账号后重新绑定/)).toBeInTheDocument()
    expect(screen.queryByText(/在双因素验证页选择“使用恢复码”/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name:'我知道了' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
