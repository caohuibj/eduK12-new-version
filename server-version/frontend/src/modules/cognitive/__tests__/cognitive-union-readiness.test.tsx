import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import identities from '../../../../../../docs/cognitive/reports-47-20261101/identities.json'
import { cognitiveSeeds } from '../../../../../backend/src/modules/cognitive/generated/seeds'
import { cognitiveExecutionEntries as executionEntries } from '../../../../../backend/src/modules/cognitive/generated/execution'
import CognitiveRunner, { CognitiveRunner as CognitiveRunnerHost } from '../pages/CognitiveRunner'
import { initialRunnerState, runnerReducer } from '../core/runner.state'
import type { RunnerState } from '../core/runner.types'
import { resolveCognitiveReadinessProfile } from '../core/readiness'
import { resolveRunner } from '../registry'
import type { CognitiveSession } from '../types'

const harness = vi.hoisted(() => ({ controller: {
  state: {} as RunnerState, start: vi.fn(), appendTrial: vi.fn(), complete: vi.fn(), reload: vi.fn(), restart: vi.fn(),
} }))
vi.mock('../core/useCognitiveSession', () => ({ useCognitiveSession: () => harness.controller }))
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

it('the combined current identities keep exact C/S/R seeds, execution, runners and startup declarations', () => {
  const missing: string[] = []
  for (const row of identities) {
    const label = `${row.task}/${row.engineVersion}/${row.scoringVersion}`
    const seed = cognitiveSeeds.find(s => s.testType === row.task && s.configVersion === row.configVersion)
    expect(seed, label).toMatchObject({ engineVersion: row.engineVersion, scoringVersion: row.scoringVersion, config: { report: { reportVersion: row.reportVersion } } })
    expect(executionEntries.some(e => e.testType === row.task && e.engineVersion === row.engineVersion && e.scoringVersion === row.scoringVersion), label).toBe(true)
    // A runner is keyed by C; one C can legitimately have multiple backend S versions.
    expect(resolveRunner(row.task, row.engineVersion), label).toMatchObject({ testType: row.task, engineVersion: row.engineVersion })
    if (!resolveCognitiveReadinessProfile(row.task, row.engineVersion)) missing.push(label)
  }
  expect(missing).toEqual([])
})

// Synthetic transport; real host, registry, deferred runner and task introduction.
it.each(['lineangle', 'sharegame', 'embeddedfigures', 'icarmatrix', 'sentencecheck', 'visualwm', 'auditorynback'])(
  '%s current report seed starts its task-specific practice directly from the shared host', async task => {
    const identity = identities.find(row => row.task === task)!
    const seed = cognitiveSeeds.find(row => row.testType === task && row.configVersion === identity.configVersion)!
    const readiness = resolveCognitiveReadinessProfile(task, seed.engineVersion)!
    expect(readiness.resumeDisposition).toBe('restart-required')
    expect(readiness.inputs).toEqual(task === 'sharegame' ? ['pointer', 'touch'] : ['keyboard', 'pointer', 'touch'])
    expect(readiness.globalKeyboardCapture).toBe(['lineangle', 'sentencecheck', 'visualwm', 'auditorynback'].includes(task))
    expect(resolveCognitiveReadinessProfile(task, 'unregistered-version')).toBeUndefined()
    harness.controller.state = runnerReducer(initialRunnerState, { type: 'SESSION_LOADED', trialIndex: 0,
      session: { sessionId: 'synthetic-union', assignmentId: 'synthetic-assignment', testType: task,
        engineVersion: seed.engineVersion, scoringVersion: seed.scoringVersion, configVersion: seed.configVersion,
        attemptNo: 1, deliveryMode: 'FINAL_ONLY', status: 'IN_PROGRESS', randomSeed: 'synthetic-union', config: seed.config,
      } as CognitiveSession,
    })
    const tree = () => <MemoryRouter initialEntries={['/student/cognitive/sessions/synthetic-union']}>
      <Routes><Route path="/student/cognitive/sessions/:sessionId" element={<CognitiveRunner />} /></Routes>
    </MemoryRouter>
    const view = render(tree())
    harness.controller.start.mockImplementation(() => {
      harness.controller.state = runnerReducer(harness.controller.state, { type: 'START_RUN' })
      view.rerender(tree())
    })
    const startPractice = await screen.findByRole('button', { name: '开始练习' })
    await waitFor(() => expect(startPractice).toBeEnabled())
    fireEvent.click(startPractice)
    await waitFor(() => expect(document.querySelector('[data-cognitive-task-state="running"]')).toBeTruthy())
    expect(screen.queryByRole('button', { name: '开始测评' })).toBeNull()
    expect(screen.queryByRole('button', { name: '开始练习' })).toBeNull()
    expect(harness.controller.state.status).toBe('RUNNING')
    expect(harness.controller.start).toHaveBeenCalledTimes(1)
    expect(harness.controller.appendTrial).not.toHaveBeenCalled()
    expect(harness.controller.complete).not.toHaveBeenCalled()
  },
)

const sharedEntryCases = [
  ['Training', 'training', 'nback', /1-back 练习 · 观察/],
  ['Training', 'training', 'memory', /练习 1 \/ 2/],
  ['Training', 'training', 'reaction', /练习 1 \/ 3/],
  ['Survey', 'survey', 'memory', /练习 1 \/ 2/],
  ['School', 'school', 'memory', /练习 1 \/ 2/],
  ['Teacher', 'teacher', 'memory', /练习 1 \/ 2/],
] as const

it.each(sharedEntryCases)(
  '%s %s entry shows one detailed introduction and starts %s practice with one click',
  async (_label, surface, task, practiceLabel) => {
    const seed = cognitiveSeeds.find(value => value.testType === task)
    expect(seed, `${task} seed`).toBeDefined()
    const sessionId = `single-start-${surface}-${task}`
    const session = {
      sessionId,
      assignmentId: `assignment-${sessionId}`,
      testType: task,
      engineVersion: seed!.engineVersion,
      scoringVersion: seed!.scoringVersion,
      configVersion: seed!.configVersion,
      attemptNo: 1,
      config: seed!.config,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      randomSeed: `seed-${sessionId}`,
    } as CognitiveSession
    harness.controller.state = runnerReducer(initialRunnerState, { type: 'SESSION_LOADED', session, trialIndex: 0 })

    const binding = { sessionId, api: {} as never, onCompleted: vi.fn(), onExit: vi.fn() }
    const entry = surface === 'training'
      ? <CognitiveRunner />
      : surface === 'school'
        ? <CognitiveRunnerHost campus={binding} />
        : <CognitiveRunnerHost embedded={binding} />
    const tree = () => (
      <MemoryRouter initialEntries={[`/student/cognitive/sessions/${sessionId}`]}>
        <Routes><Route path="/student/cognitive/sessions/:sessionId" element={entry} /></Routes>
      </MemoryRouter>
    )
    const view = render(tree())
    harness.controller.start.mockImplementation(() => {
      harness.controller.state = runnerReducer(harness.controller.state, { type: 'START_RUN' })
      view.rerender(tree())
    })

    const startPractice = await screen.findByRole('button', { name: '开始练习' })
    expect(screen.queryByRole('button', { name: '开始测评' })).toBeNull()
    expect(screen.getByRole('region', { name: `${resolveRunner(task, seed!.engineVersion)?.name}说明` })).toBeInTheDocument()
    fireEvent.click(startPractice)

    expect(await screen.findByText(practiceLabel)).toBeInTheDocument()
    expect(harness.controller.start).toHaveBeenCalledTimes(1)
    expect(harness.controller.state.status).toBe('RUNNING')
    expect(screen.queryByRole('button', { name: '开始测评' })).toBeNull()
    expect(harness.controller.appendTrial).not.toHaveBeenCalled()
    expect(harness.controller.complete).not.toHaveBeenCalled()
  },
)
