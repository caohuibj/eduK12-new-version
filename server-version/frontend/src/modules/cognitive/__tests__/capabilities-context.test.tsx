import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
  default: {
    get: mockGet,
  },
}))

vi.mock('../feature', () => ({
  cognitiveBuildEnabled: true,
  cognitiveModuleEnabled: true,
}))

import { CapabilitiesProvider, useCapabilities } from '../../../contexts/CapabilitiesContext'

const Probe = () => {
  const { cognitiveEnabled, parentPortalEnabled, isLoading } = useCapabilities()
  return <div>{`cognitive:${String(cognitiveEnabled)} loading:${String(isLoading)}`}<span>{`parent:${String(parentPortalEnabled)}`}</span></div>
}

describe('CapabilitiesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps cognitive UI off while the capabilities request is in flight', () => {
    mockGet.mockReturnValue(new Promise(() => {}))

    render(
      <CapabilitiesProvider>
        <Probe />
      </CapabilitiesProvider>
    )

    expect(screen.getByText('cognitive:false loading:true')).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledWith('/capabilities', expect.objectContaining({ timeout: 3000 }))
  })

  it('uses the backend cognitive flag as the runtime source of truth', async () => {
    mockGet.mockResolvedValue({ code: 0, message: 'ok', data: { cognitive: false } })

    render(
      <CapabilitiesProvider>
        <Probe />
      </CapabilitiesProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('cognitive:false loading:false')).toBeInTheDocument()
    })
  })

  it('fails closed locally after bounded retries when capabilities fail', async () => {
    mockGet.mockRejectedValue(new Error('network'))

    render(
      <CapabilitiesProvider>
        <Probe />
      </CapabilitiesProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('cognitive:false loading:false')).toBeInTheDocument()
    })
  })
})

it('bounds an indefinitely hanging capability request while unrelated children remain rendered', async () => {
  mockGet.mockClear()
  vi.useFakeTimers()
  mockGet.mockReturnValue(new Promise(() => {}))
  const { act } = await import('@testing-library/react')
  const view = render(<CapabilitiesProvider><p>登录入口</p><Probe /></CapabilitiesProvider>)
  expect(screen.getByText('登录入口')).toBeVisible()
  await act(async () => { await vi.advanceTimersByTimeAsync(6100) })
  expect(screen.getByText('cognitive:false loading:false')).toBeVisible()
  expect(mockGet).toHaveBeenCalledTimes(2)
  view.unmount(); vi.useRealTimers()
})

it.each([true, false, undefined])('uses only an explicit backend parent portal flag (%s)', async flag => {
  mockGet.mockResolvedValue({ code: 0, data: { cognitive: true, parentPortal: flag } })
  render(<CapabilitiesProvider><Probe /></CapabilitiesProvider>)
  await waitFor(() => expect(screen.getByText(`parent:${String(flag === true)}`)).toBeVisible())
})
