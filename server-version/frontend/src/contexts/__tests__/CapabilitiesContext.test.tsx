import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../api/capabilities', () => ({ capabilitiesApi: api }))
import { CapabilitiesProvider, useCapabilities } from '../CapabilitiesContext'
function Probe() {
  const c = useCapabilities()
  return (
    <>
      <output>
        {c.status}:{String(c.parentPortalEnabled)}
      </output>
      <button onClick={c.retry}>retry</button>
    </>
  )
}
describe('capability availability', () => {
  beforeEach(() => {
    api.get.mockReset()
  })
  it('separates confirmed closed from read failure and permits retry', async () => {
    api.get.mockRejectedValue(new Error('offline'))
    render(
      <CapabilitiesProvider>
        <Probe />
      </CapabilitiesProvider>,
    )
    await screen.findByText('error:false')
    expect(api.get).toHaveBeenCalledTimes(2)
    api.get.mockResolvedValue({
      code: 0,
      data: { parentPortal: false, cognitive: true },
    })
    fireEvent.click(screen.getByText('retry'))
    await screen.findByText('ready:false')
  })
  it('invalid response cannot expose parent entry; focus detects closure', async () => {
    api.get.mockResolvedValue({ code: 0, data: { cognitive: true } })
    render(
      <CapabilitiesProvider>
        <Probe />
      </CapabilitiesProvider>,
    )
    await screen.findByText('error:false')
    api.get.mockResolvedValue({
      code: 0,
      data: { parentPortal: true, cognitive: true },
    })
    fireEvent.click(screen.getByText('retry'))
    await screen.findByText('ready:true')
    api.get.mockResolvedValue({
      code: 0,
      data: { parentPortal: false, cognitive: true },
    })
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(screen.getByText('ready:false')).toBeTruthy())
  })
})
