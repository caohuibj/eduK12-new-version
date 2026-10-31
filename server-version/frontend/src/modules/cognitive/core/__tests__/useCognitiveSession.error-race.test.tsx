import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { CognitiveSessionApi } from '../../api'
import type { CognitiveSession } from '../../types'

vi.mock('../../../../services/persistence/flushLifecycle', () => ({ useCheckpointLifecycle: vi.fn() }))
vi.mock('../../../../services/persistence/checkpointScheduler', () => ({
  checkpointScheduler: { register: vi.fn() },
  CheckpointTransportError: class extends Error {}, checkpointErrorStatus: () => undefined,
}))
import { useCognitiveSession } from '../useCognitiveSession'

const completed: CognitiveSession = {
  sessionId: 'session-b', assignmentId: 'assignment-b', testType: 'synthetic', status: 'COMPLETED', attemptNo: 1,
  configVersion: '1', engineVersion: '1', scoringVersion: '1', randomSeed: 'synthetic',
  config: { trialCount: 1, trialDurationMs: 1000, allowPractice: false, maxRtMs: 1000 },
}
it.each(['rejection', 'error response'])('ignores a late session read %s after the next session completes', async kind => {
  let resolve!: (value: unknown) => void, reject!: (reason: Error) => void
  const old = new Promise((yes, no) => { resolve = yes; reject = no })
  const api = { getSession: vi.fn((id: string) => id === 'session-a' ? old : Promise.resolve({ code: 0, data: completed })) }
  const { result, rerender } = renderHook(({ id }) => useCognitiveSession(id, api as unknown as CognitiveSessionApi), { initialProps: { id: 'session-a' } })
  rerender({ id: 'session-b' })
  await waitFor(() => expect(result.current.state.status).toBe('COMPLETED'))
  await act(async () => {
    if (kind === 'rejection') reject(Error('旧会话读取失败'))
    else resolve({ code: 404, message: '旧会话不存在' })
  })
  expect(result.current.state.status).toBe('COMPLETED')
  expect(result.current.state.session?.sessionId).toBe('session-b')
  expect(result.current.state.error).toBeNull()
})
it('preserves a current session read error', async () => {
  const api = { getSession: vi.fn().mockRejectedValue(Error('当前读取失败')) }
  const { result } = renderHook(() => useCognitiveSession('current', api as unknown as CognitiveSessionApi))
  await waitFor(() => expect(result.current.state.status).toBe('ERROR'))
  expect(result.current.state.error?.message).toBe('当前读取失败')
})
