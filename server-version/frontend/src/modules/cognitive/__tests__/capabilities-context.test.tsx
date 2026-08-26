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
  const { cognitiveEnabled, isLoading } = useCapabilities()
  return <div>{`cognitive:${String(cognitiveEnabled)} loading:${String(isLoading)}`}</div>
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
    expect(mockGet).toHaveBeenCalledWith('/capabilities')
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

  it('falls back to the build-time flag when the capabilities endpoint fails', async () => {
    mockGet.mockRejectedValue(new Error('network'))

    render(
      <CapabilitiesProvider>
        <Probe />
      </CapabilitiesProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('cognitive:true loading:false')).toBeInTheDocument()
    })
  })
})
