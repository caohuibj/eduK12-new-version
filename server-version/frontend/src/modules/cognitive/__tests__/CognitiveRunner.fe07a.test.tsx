import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CognitiveRunner from '../pages/CognitiveRunner'

const mocks = vi.hoisted(() => ({
  imageStatus: 'ready' as 'ready' | 'error',
  controller: {
    state: {} as any,
    start: vi.fn(),
    appendTrial: vi.fn(),
    complete: vi.fn(),
    restart: vi.fn(),
    reload: vi.fn(),
  },
}))

vi.mock('../core/useCognitiveSession', () => ({
  useCognitiveSession: () => mocks.controller,
}))
vi.mock('../core/useAdministrationProvenance', () => ({
  useAdministrationProvenance: () => ({ snapshot: () => null }),
}))
vi.mock('../../assessment-media/useAssessmentImageAssets', () => ({
  useAssessmentImageAssets: () => mocks.imageStatus === 'error'
    ? { status: 'error', urls: {}, error: 'image failed', retry: vi.fn() }
    : { status: 'ready', urls: {}, error: null, retry: vi.fn() },
}))
vi.mock('../useCognitiveVideoSources', () => ({
  useCognitiveVideoSources: () => ({ status: 'ready', sources: {}, error: null, retry: vi.fn(), refresh: vi.fn() }),
}))

const app = () => (
  <MemoryRouter initialEntries={['/student/cognitive/sessions/s1']}>
    <Routes>
      <Route path="/student/cognitive/sessions/:sessionId" element={<CognitiveRunner />} />
    </Routes>
  </MemoryRouter>
)

const baseState = () => ({
  status: 'RUNNING',
  session: {
    sessionId: 's1',
    assignmentId: 'a1',
    testType: 'fake',
    attemptNo: 1,
    deliveryMode: 'FINAL_ONLY',
    status: 'IN_PROGRESS',
    configVersion: '1.0.0',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { trialCount: 2, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
    randomSeed: 'seed',
  },
  taskContext: {
    sessionId: 's1',
    testType: 'fake',
    attemptNo: 1,
    configVersion: '1.0.0',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { trialCount: 2, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
    randomSeed: 'seed',
  },
  trialIndex: 0,
  error: null,
  result: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.imageStatus = 'ready'
  mocks.controller.state = baseState()
})

describe('FE-07A Cognitive shell integration', () => {
  it('keeps the active task mounted when shell save status changes', () => {
    const view = render(app())
    const before = screen.getByRole('button', { name: 'trial 0' })

    mocks.controller.state = { ...baseState(), status: 'SUBMITTING_TRIAL' }
    view.rerender(app())

    const after = screen.getByRole('button', { name: 'trial 0' })
    expect(after).toBe(before)
    expect(screen.getByText('正在保存到本机')).toBeTruthy()
  })

  it('does not mount a task or create a trial when required media is unavailable', () => {
    mocks.imageStatus = 'error'
    mocks.controller.state = {
      ...baseState(),
      session: {
        ...baseState().session,
        presentation: {
          schemaVersion: 1,
          instruction: [{
            asset: { assetId: 'img-1', contentHash: 'a'.repeat(64), mimeType: 'image/png' },
            altText: 'instruction',
          }],
        },
      },
    }

    render(app())

    expect(screen.queryByRole('button', { name: 'trial 0' })).toBeNull()
    expect(screen.getByText('视觉内容未就绪，测量不会继续。')).toBeTruthy()
    expect(mocks.controller.appendTrial).not.toHaveBeenCalled()
  })
})
