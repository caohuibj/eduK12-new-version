import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CognitiveRunner from '../pages/CognitiveRunner'
import { initialRunnerState, runnerReducer } from '../core/runner.state'
import type { RunnerState } from '../core/runner.types'
import type { CognitiveSession } from '../types'
import { resolveRunner } from '../registry'
import { resolveCognitiveReadinessProfile } from '../core/readiness'

const harness = vi.hoisted(() => ({ controller: {
  state: {} as RunnerState,
  start: vi.fn(), appendTrial: vi.fn(), complete: vi.fn(), reload: vi.fn(), restart: vi.fn(),
} }))
vi.mock('../core/useCognitiveSession', () => ({ useCognitiveSession: () => harness.controller }))

const tree = () => <MemoryRouter initialEntries={['/student/cognitive/sessions/readiness20']}>
  <Routes><Route path="/student/cognitive/sessions/:sessionId" element={<CognitiveRunner />} /></Routes>
</MemoryRouter>
const readyState = (testType: string, trialIndex = 0, engineVersion = '1.0.1') => runnerReducer(initialRunnerState, {
  type: 'SESSION_LOADED', trialIndex,
  session: {
    sessionId: 'readiness20', assignmentId: 'synthetic-assignment', testType, engineVersion,
    scoringVersion: resolveRunner(testType, engineVersion)?.scoringVersion ?? '1.0.0', configVersion: engineVersion, attemptNo: 1,
    deliveryMode: 'FINAL_ONLY', status: 'IN_PROGRESS', randomSeed: 'synthetic-readiness',
    // The v1.1 fixed-count auditory short profile has 22 tones (6 targets).
    config: { totalTrials: testType === 'auditorynback' && engineVersion === '1.1.0' ? 22 : 18 },
  } as CognitiveSession,
})
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('intake20 exact readiness through the existing host', () => {
  // Real host, deferred imports and task introduction. Transport is synthetic;
  // this proves code preparation and READY -> RUNNING, not a real administration.
  it.each(['numberline', 'arithverify', 'semanticfluency', 'pursuitrotor', 'auditoryrt'])(
    '%s prepares the exact runner and starts its actual introduction', async testType => {
      harness.controller.state = readyState(testType)
      const view = render(tree())
      harness.controller.start.mockImplementation(() => {
        harness.controller.state = runnerReducer(harness.controller.state, { type: 'START_RUN' })
        view.rerender(tree())
      })
      const start = await screen.findByRole('button', { name: '开始测评' })
      await waitFor(() => expect(start).toBeEnabled())
      fireEvent.click(start)
      await waitFor(() => expect(screen.getByRole('button', { name: '开始练习' })).toBeEnabled())
      expect(harness.controller.start).toHaveBeenCalledTimes(1)
      expect(harness.controller.state.status).toBe('RUNNING')
      expect(harness.controller.appendTrial).not.toHaveBeenCalled()
      expect(harness.controller.complete).not.toHaveBeenCalled()
    },
  )

  it.each(['sentencecheck', 'visualwm', 'auditorynback'])(
    '%s 1.1.0 keeps exact readiness and enters its actual introduction', async testType => {
      expect(resolveRunner(testType, '1.1.0')).toBeDefined()
      expect(resolveCognitiveReadinessProfile(testType, '1.1.0')).toMatchObject({
        testType, engineVersion: '1.1.0', inputs: ['keyboard', 'pointer', 'touch'],
        globalKeyboardCapture: true, resumeDisposition: 'restart-required',
      })
      expect(resolveCognitiveReadinessProfile(testType, '1.1.1')).toBeUndefined()
      harness.controller.state = readyState(testType, 0, '1.1.0')
      const view = render(tree())
      harness.controller.start.mockImplementation(() => {
        harness.controller.state = runnerReducer(harness.controller.state, { type: 'START_RUN' })
        view.rerender(tree())
      })
      const start = await screen.findByRole('button', { name: '开始测评' })
      await waitFor(() => expect(start).toBeEnabled())
      fireEvent.click(start)
      expect(await screen.findByRole('button', { name: '开始练习' })).toBeEnabled()
      expect(harness.controller.state.status).toBe('RUNNING')
      expect(harness.controller.start).toHaveBeenCalledTimes(1)
      expect(harness.controller.appendTrial).not.toHaveBeenCalled()
      expect(harness.controller.complete).not.toHaveBeenCalled()
    },
  )

  it('keeps an incomplete local attempt blocked instead of remounting its task', async () => {
    harness.controller.state = readyState('numberline', 1)
    render(tree())
    expect(await screen.findByText('本地草稿保持不变；请选择返回或创建新的整份提交测评。')).toBeVisible()
    expect(screen.queryByRole('button', { name: '开始测评' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开始练习' })).not.toBeInTheDocument()
    expect(harness.controller.start).not.toHaveBeenCalled()
  })
})
