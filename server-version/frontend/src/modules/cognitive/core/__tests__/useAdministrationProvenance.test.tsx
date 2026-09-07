import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CognitiveSession } from '../../types'

const { draftStore } = vi.hoisted(() => ({
  draftStore: {
    get: vi.fn(),
    setInstrumentMetadata: vi.fn(),
  },
}))

vi.mock('../../../../../services/persistence/finalDraftStore', () => ({
  finalDraftStore: draftStore,
}))

import { useAdministrationProvenance } from '../useAdministrationProvenance'

const session: CognitiveSession = {
  sessionId: 'provenance-hook-session',
  assignmentId: null,
  testType: 'fake',
  attemptNo: 1,
  deliveryMode: 'FINAL_ONLY',
  status: 'IN_PROGRESS',
  configVersion: '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 1 },
  randomSeed: 'seed',
  nextTrialIndex: 0,
}

const pointerDown = (pointerType: string) => {
  const event = new Event('pointerdown', { bubbles: true })
  Object.defineProperty(event, 'pointerType', { value: pointerType })
  return event
}

const taskRoot = () => {
  const root = document.createElement('div')
  root.dataset.cognitiveTaskRoot = 'true'
  const response = document.createElement('button')
  response.type = 'button'
  root.append(response)
  document.body.append(root)
  return { root, response }
}

describe('useAdministrationProvenance', () => {
  beforeEach(() => {
    draftStore.get.mockResolvedValue(null)
    draftStore.setInstrumentMetadata.mockResolvedValue(null)
  })

  it('records task pointer and keyboard modalities while ignoring editable input', async () => {
    const { root, response } = taskRoot()
    const input = document.createElement('input')
    root.append(input)
    const { result, unmount } = renderHook(() => useAdministrationProvenance(session, 'RUNNING'))

    act(() => response.dispatchEvent(pointerDown('touch')))
    await waitFor(() => expect(result.current.snapshot()?.administrationMode).toBe('TOUCH'))

    const beforeEditableKey = draftStore.setInstrumentMetadata.mock.calls.length
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' })))
    expect(draftStore.setInstrumentMetadata.mock.calls.length).toBe(beforeEditableKey)

    act(() => response.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })))
    await waitFor(() => expect(result.current.snapshot()?.administrationMode).toBe('MIXED'))

    unmount()
    root.remove()
  })

  it('ignores controls outside the task root and removes listeners on unmount', async () => {
    const { root, response } = taskRoot()
    const outside = document.createElement('button')
    document.body.append(outside)
    const { result, unmount } = renderHook(() => useAdministrationProvenance(session, 'RUNNING'))

    const before = draftStore.setInstrumentMetadata.mock.calls.length
    act(() => outside.dispatchEvent(pointerDown('touch')))
    await Promise.resolve()
    expect(result.current.snapshot()?.administrationMode).toBe('UNKNOWN')
    expect(draftStore.setInstrumentMetadata.mock.calls.length).toBe(before)

    unmount()
    act(() => response.dispatchEvent(pointerDown('mouse')))
    await Promise.resolve()
    expect(draftStore.setInstrumentMetadata.mock.calls.length).toBe(before)

    root.remove()
    outside.remove()
  })

  it('restores draft provenance across refresh and merges later keyboard input', async () => {
    draftStore.get.mockResolvedValue({
      instrumentMetadata: {
        cognitiveAdministrationProvenance: {
          schemaVersion: 1,
          deviceClass: 'PHONE',
          administrationMode: 'TOUCH',
        },
      },
    })
    const { root, response } = taskRoot()
    const { result, unmount } = renderHook(() => useAdministrationProvenance(session, 'RUNNING'))

    await waitFor(() => expect(result.current.snapshot()).toEqual({
      schemaVersion: 1,
      deviceClass: 'PHONE',
      administrationMode: 'TOUCH',
    }))

    act(() => response.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })))
    await waitFor(() => expect(result.current.snapshot()?.administrationMode).toBe('MIXED'))

    unmount()
    root.remove()
  })
})
