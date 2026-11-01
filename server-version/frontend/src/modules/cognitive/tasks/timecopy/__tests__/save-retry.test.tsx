import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCognitiveSession } from '../../../core/useCognitiveSession'
import type { CognitiveSession } from '../../../types'
import { finalDraftStore } from '../../../../../services/persistence/finalDraftStore'
import { TimecopyTask } from '../TimecopyTask'

vi.mock('../../../../../services/persistence/flushLifecycle', () => ({ useCheckpointLifecycle: vi.fn() }))
const session: CognitiveSession = {
  sessionId: 'timecopy-save-retry-synthetic', assignmentId: 'synthetic-assignment',
  testType: 'timecopy', engineVersion: '1.0.1', scoringVersion: '1.0.0', configVersion: '1.0.1',
  attemptNo: 1, attemptEpoch: 1, status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY',
  definitionHash: 'synthetic-timecopy-definition', contextSnapshotHash: null, randomSeed: 'save-retry',
  config: { totalTrials: 2, targetMinMs: 1000, targetMaxMs: 1000, maxResponseMs: 10000 },
}
const api = {
  getSession: vi.fn(async () => ({ code: 0, message: 'ok', data: session })),
  appendTrial: vi.fn(), appendTrials: vi.fn(), completeSession: vi.fn(), submitFinal: vi.fn(),
}
const draftKey = `cognitive:${session.sessionId}`
function Harness() {
  // Actual hook catches putTrial failure and returns false through the real reducer.
  const controller = useCognitiveSession(session.sessionId, api)
  const { state } = controller
  return <><output aria-label="saved-index">{state.trialIndex}</output>
    {state.status === 'READY' ? <button onClick={controller.start}>开始测评</button> : null}
    {state.taskContext && (state.status === 'RUNNING' || state.status === 'SUBMITTING_TRIAL') ?
      <TimecopyTask taskContext={state.taskContext} trialIndex={state.trialIndex}
        onTrialComplete={controller.appendTrial} onTaskComplete={controller.complete} /> : null}
  </>
}
const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms) }) }
const click = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })) }) }
async function beginFormal() {
  render(<Harness />)
  fireEvent.click(await screen.findByRole('button', { name: '开始测评' }))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
  await click('开始练习'); await advance(1700)
  await click('开始复制'); await advance(1500); await click('结束复制')
  await click('开始正式测评'); await advance(1200)
}
async function reproduce(ms: number) {
  await click('开始复制'); await advance(ms); await click('结束复制')
}
afterEach(async () => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); await finalDraftStore.delete(draftKey) })

describe('timecopy persistence retry with the actual FINAL_ONLY session hook', () => {
  it('retries the first response unchanged after a real hook false-save, then advances', async () => {
    await beginFormal()
    const put = vi.spyOn(finalDraftStore, 'putTrial').mockRejectedValueOnce(new Error('synthetic quota failure'))
    await reproduce(1250)
    const firstPayload = put.mock.calls[0][0].payload
    expect(firstPayload).toMatchObject({ responseMs: 1250 })
    expect(screen.getByLabelText('saved-index').textContent).toBe('0')
    expect(await finalDraftStore.listTrials(draftKey)).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '开始复制' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '结束复制' })).not.toBeInTheDocument()
    await advance(5000) // Waiting to retry must not create a new measured interval.
    await click('重试保存')
    const trials = await finalDraftStore.listTrials(draftKey)
    expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls[1][0].payload).toEqual(firstPayload)
    expect(trials).toHaveLength(1)
    expect(trials[0].payload).toEqual(firstPayload)
    expect(screen.getByLabelText('saved-index').textContent).toBe('1')
    expect(screen.queryByRole('button', { name: '重试保存' })).not.toBeInTheDocument()
    await advance(1200)
    expect(screen.getByRole('button', { name: '开始复制' })).toBeEnabled()
    expect(api.submitFinal).not.toHaveBeenCalled()
  })

  it('continues to the next target after an ordinary successful save', async () => {
    await beginFormal()
    const put = vi.spyOn(finalDraftStore, 'putTrial')
    await reproduce(1600)
    const trials = await finalDraftStore.listTrials(draftKey)
    expect(put).toHaveBeenCalledTimes(1)
    expect(trials).toHaveLength(1)
    expect(trials[0].payload).toMatchObject({ responseMs: 1600 })
    expect(screen.getByLabelText('saved-index').textContent).toBe('1')
    expect(screen.queryByRole('button', { name: '重试保存' })).not.toBeInTheDocument()
    await advance(1200)
    expect(screen.getByRole('button', { name: '开始复制' })).toBeEnabled()
    expect(api.submitFinal).not.toHaveBeenCalled()
  })
})
