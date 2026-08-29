import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockIo } = vi.hoisted(() => ({ mockIo: vi.fn() }))
vi.mock('socket.io-client', () => ({ io: mockIo }))

import { useClassroomSocket } from '../useClassroomSocket'

const makeSocket = () => ({
  connected: false,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  io: { on: vi.fn() },
})
describe('useClassroomSocket fallback lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIo.mockReturnValue(makeSocket())
  })

  it('does not recreate the socket when the fallback callback changes', () => {
    const firstFallback = vi.fn()
    const secondFallback = vi.fn()
    const { rerender, unmount } = renderHook(
      ({ fallback }) => useClassroomSocket({ classroomId: 'classroom-1', role: 'teacher', onHttpFallback: fallback }),
      { initialProps: { fallback: firstFallback } },
    )

    expect(mockIo).toHaveBeenCalledTimes(1)
    rerender({ fallback: secondFallback })
    expect(mockIo).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('keeps manual retry available after the stable connection is created', () => {
    const { result, unmount } = renderHook(() => useClassroomSocket({ classroomId: 'classroom-1', role: 'teacher' }))
    act(() => result.current.manualRetry())
    expect(mockIo).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('does not disconnect an anonymous student socket on logged-in expiry', () => {
    const studentSocket = makeSocket()
    mockIo.mockReturnValue(studentSocket)
    const { unmount } = renderHook(() => useClassroomSocket({ classroomCode: 'ABC123', role: 'student' }))

    act(() => {
      window.dispatchEvent(new CustomEvent('auth:expired'))
    })

    expect(studentSocket.disconnect).not.toHaveBeenCalled()
    unmount()
  })
})
