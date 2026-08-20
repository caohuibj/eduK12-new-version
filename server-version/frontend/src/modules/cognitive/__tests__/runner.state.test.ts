import { describe, it, expect } from 'vitest'
import { initialRunnerState, runnerReducer, type RunnerAction } from '../core/runner.state'
import type { CognitiveSession } from '../types'

const session: CognitiveSession = {
  sessionId: 's1',
  assignmentId: 'a1',
  testType: 'fake',
  attemptNo: 1,
  status: 'IN_PROGRESS',
  configVersion: '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 3, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
  randomSeed: 'seed',
}

const completedSession: CognitiveSession = {
  ...session,
  status: 'COMPLETED',
  finishedAt: '2026-01-01T00:00:00Z',
  result: { score: 66.67, metrics: { correctCount: 2 }, qualityFlags: {} },
}

const act = (state: ReturnType<typeof runnerReducer>, action: RunnerAction) =>
  runnerReducer(state, action)

describe('runner state machine', () => {
  it('LOADING → (IN_PROGRESS session) SESSION_LOADED → READY with proved trialIndex', () => {
    let s = act(initialRunnerState, { type: 'LOADING' })
    s = act(s, { type: 'SESSION_LOADED', session, trialIndex: 2 })
    expect(s.status).toBe('READY')
    expect(s.trialIndex).toBe(2)
    expect(s.taskContext?.randomSeed).toBe('seed')
    expect(s.taskContext?.config).toEqual(session.config)
  })

  it('COMPLETED session → COMPLETED with stored result (no re-scoring)', () => {
    let s = act(initialRunnerState, { type: 'LOADING' })
    s = act(s, { type: 'SESSION_LOADED', session: completedSession, trialIndex: 0 })
    expect(s.status).toBe('COMPLETED')
    expect(s.result?.score).toBe(66.67)
  })

  it('READY → START_RUN → RUNNING', () => {
    let s = act(initialRunnerState, { type: 'SESSION_LOADED', session, trialIndex: 0 })
    s = act(s, { type: 'START_RUN' })
    expect(s.status).toBe('RUNNING')
  })

  it('RUNNING → TRIAL_SUBMIT_START → SUBMITTING_TRIAL → TRIAL_SUBMIT_SUCCESS → RUNNING with trialIndex+1', () => {
    let s = act(initialRunnerState, { type: 'SESSION_LOADED', session, trialIndex: 0 })
    s = act(s, { type: 'START_RUN' })
    s = act(s, { type: 'TRIAL_SUBMIT_START' })
    expect(s.status).toBe('SUBMITTING_TRIAL')
    s = act(s, { type: 'TRIAL_SUBMIT_SUCCESS', trialIndex: 0 })
    expect(s.status).toBe('RUNNING')
    expect(s.trialIndex).toBe(1)
  })

  it('TRIAL_SUBMIT_FAILED → back to RUNNING (retryable)', () => {
    let s = act(initialRunnerState, { type: 'SESSION_LOADED', session, trialIndex: 0 })
    s = act(s, { type: 'START_RUN' })
    s = act(s, { type: 'TRIAL_SUBMIT_START' })
    s = act(s, { type: 'TRIAL_SUBMIT_FAILED', error: { code: '500', message: 'server' } })
    expect(s.status).toBe('RUNNING')
    expect(s.error?.code).toBe('500')
  })

  it('TRIAL_CONFLICT (409) → RECOVERY_REQUIRED, never retry/guess', () => {
    let s = act(initialRunnerState, { type: 'SESSION_LOADED', session, trialIndex: 1 })
    s = act(s, { type: 'START_RUN' })
    s = act(s, { type: 'TRIAL_CONFLICT' })
    expect(s.status).toBe('RECOVERY_REQUIRED')
  })

  it('RUNNER_UNSUPPORTED → UNSUPPORTED', () => {
    const s = act(initialRunnerState, { type: 'RUNNER_UNSUPPORTED' })
    expect(s.status).toBe('UNSUPPORTED')
  })

  it('SESSION_ERROR → ERROR', () => {
    const s = act(initialRunnerState, { type: 'SESSION_ERROR', error: { code: '404', message: 'nope' } })
    expect(s.status).toBe('ERROR')
    expect(s.error?.code).toBe('404')
  })

  it('RUNNING → COMPLETE_START → COMPLETING → COMPLETE_SUCCESS → COMPLETED with server result', () => {
    let s = act(initialRunnerState, { type: 'SESSION_LOADED', session, trialIndex: 3 })
    s = act(s, { type: 'START_RUN' })
    s = act(s, { type: 'COMPLETE_START' })
    expect(s.status).toBe('COMPLETING')
    s = act(s, { type: 'COMPLETE_SUCCESS', result: { score: 100, metrics: {}, qualityFlags: {} } })
    expect(s.status).toBe('COMPLETED')
    expect(s.result?.score).toBe(100)
  })

  it('COMPLETE_FAILED → back to RUNNING (premature completion allowed to retry)', () => {
    let s = act(initialRunnerState, { type: 'SESSION_LOADED', session, trialIndex: 2 })
    s = act(s, { type: 'START_RUN' })
    s = act(s, { type: 'COMPLETE_START' })
    s = act(s, { type: 'COMPLETE_FAILED', error: { code: '400', message: 'premature' } })
    expect(s.status).toBe('RUNNING')
  })
})
