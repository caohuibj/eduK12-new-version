import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import identities from '../../../../../../docs/cognitive/reports-47-20261101/identities.json'
import { cognitiveSeeds } from '../../../../../backend/src/modules/cognitive/generated/seeds'
import { cognitiveExecutionEntries as executionEntries } from '../../../../../backend/src/modules/cognitive/generated/execution'
import CognitiveRunner from '../pages/CognitiveRunner'
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
it.each(['lineangle', 'sharegame', 'embeddedfigures', 'icarmatrix'])(
  '%s current report seed enters its actual introduction through the host', async task => {
    const identity = identities.find(row => row.task === task)!
    const seed = cognitiveSeeds.find(row => row.testType === task && row.configVersion === identity.configVersion)!
    const readiness = resolveCognitiveReadinessProfile(task, seed.engineVersion)!
    expect(readiness.resumeDisposition).toBe('restart-required')
    expect(readiness.inputs).toEqual(task === 'sharegame' ? ['pointer', 'touch'] : ['keyboard', 'pointer', 'touch'])
    expect(readiness.globalKeyboardCapture).toBe(task === 'lineangle')
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
