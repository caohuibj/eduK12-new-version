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

import { CapabilitiesProvider, useCognitiveEnabled } from '../../../contexts/CapabilitiesContext'

const Probe = () => {
  const enabled = useCognitiveEnabled()
  return <div>cognitive:{String(enabled)}</div>
}

describe('CapabilitiesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the backend cognitive flag as the runtime source of truth', async () => {
    mockGet.mockResolvedValue({ code: 0, message: 'ok', data: { cognitive: false } })

    render(
      <CapabilitiesProvider>
        <Probe />
      </CapabilitiesProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('cognitive:false')).toBeInTheDocument()
    })
    expect(mockGet).toHaveBeenCalledWith('/capabilities')
  })
})
