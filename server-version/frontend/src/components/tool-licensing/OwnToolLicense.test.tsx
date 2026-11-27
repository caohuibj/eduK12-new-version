import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import OwnToolLicense, { type OwnToolLicenseView } from './OwnToolLicense'

it('loads only after opening and shows the frozen period, remaining quota and assignment state', async () => {
  const view: OwnToolLicenseView = {
    enforcing: true,
    license: {
      startsAt: '2027-01-01T01:00:00Z', expiresAt: '2027-07-01T01:00:00Z', status: 'ACTIVE',
      tools: [{ key: 'FORM:fixture', name: '公开表单', limit: 20, used: 6, assignment: 'PENDING' }],
    },
  }
  const load = vi.fn().mockResolvedValue(view), openSources = vi.fn()
  render(<OwnToolLicense title="本校可用工具" load={load} onOpenSources={openSources}/>)
  expect(load).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('本校可用工具'))
  expect(await screen.findByText('公开表单')).toBeVisible()
  expect(screen.getByText('剩余 14 / 20 次')).toBeVisible()
  expect(screen.getByText('待入口管理员分配')).toBeVisible()
  fireEvent.click(screen.getByRole('button', {name:'查看已分配版本'}))
  expect(openSources).toHaveBeenCalledOnce()
})
