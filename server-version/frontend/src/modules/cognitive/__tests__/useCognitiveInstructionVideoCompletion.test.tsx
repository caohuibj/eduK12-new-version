import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CognitiveSession } from '../types'
import type { CognitiveVideoPresentationEntry } from '../video-presentation'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  mark: vi.fn(),
}))

vi.mock('../../assessment-media/required-video-completion', () => ({
  readRequiredVideoCompletion: mocks.read,
  markRequiredVideoComplete: mocks.mark,
}))

import { useCognitiveInstructionVideoCompletion } from '../useCognitiveInstructionVideoCompletion'

const session = {
  sessionId: 'session-1',
  assignmentId: 'assignment-1',
  testType: 'fake',
  attemptNo: 1,
  deliveryMode: 'FINAL_ONLY',
  status: 'IN_PROGRESS',
  configVersion: '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: {},
  randomSeed: 'seed',
} as CognitiveSession

const entry: CognitiveVideoPresentationEntry = {
  key: 'instruction:0',
  slot: 'instruction',
  index: 0,
  presentation: {
    schemaVersion: 1,
    video: {
      assetId: 'video-1',
      contentHash: 'a'.repeat(64),
      mimeType: 'video/mp4',
    },
  },
}

describe('useCognitiveInstructionVideoCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.read.mockResolvedValue(null)
    mocks.mark.mockResolvedValue({ completedAt: 1 })
  })

  it('fails closed until the exact instruction video completion marker is durable', async () => {
    const { result } = renderHook(() => useCognitiveInstructionVideoCompletion(session, [entry]))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.required).toBe(true)
    expect(result.current.allComplete).toBe(false)
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({
      draftKey: 'cognitive:session-1',
      slotKey: 'cognitive-instruction:0:video',
      assetId: 'video-1',
      contentHash: 'a'.repeat(64),
    }))

    await act(async () => {
      await result.current.markComplete(entry)
    })

    expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({
      draftKey: 'cognitive:session-1',
      slotKey: 'cognitive-instruction:0:video',
      assetId: 'video-1',
      contentHash: 'a'.repeat(64),
    }))
    expect(result.current.allComplete).toBe(true)
  })

  it('does not schedule an adapter state update when there is no instruction video', async () => {
    let renders = 0
    renderHook(() => {
      renders += 1
      return useCognitiveInstructionVideoCompletion(session, [])
    })
    await Promise.resolve()
    expect(renders).toBe(1)
    expect(mocks.read).not.toHaveBeenCalled()
  })
})
