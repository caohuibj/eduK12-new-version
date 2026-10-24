import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CognitiveRunner from '../pages/CognitiveRunner'
import { TrainingLearnerNavigationBoundary } from '../../../training/TrainingLearnerNavigationBoundary'
vi.mock('../../../training/context', () => ({ isTrainingHost: () => true }))

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
  it.each(['UNSUPPORTED', 'COMPLETED'])('keeps the authoritative Training parent on %s without creating another attempt', status => {
    const serverSession = { ...baseState().session, trainingPersistence: { attemptId: 'parent-real', courseId: 'course-real' } }
    mocks.controller.state = { ...baseState(), session: serverSession }
    const trainingApp = () => <MemoryRouter initialEntries={['/student/cognitive/sessions/s1?returnTo=%2Fstudent%2Fcomposite%2Fattempts%2Fwrong']}>
      <TrainingLearnerNavigationBoundary role="STUDENT"><Routes>
        <Route path="/student/cognitive/sessions/:sessionId" element={<CognitiveRunner />} />
        <Route path="/student/composite/attempts/parent-real" element={<p>整份测评</p>} />
        <Route path="/student/composite/attempts/wrong" element={<p>错误父级</p>} />
      </Routes></TrainingLearnerNavigationBoundary>
    </MemoryRouter>
    const view = render(trainingApp())
    mocks.controller.state = { ...mocks.controller.state, status }
    view.rerender(trainingApp())
    if (status === 'UNSUPPORTED') fireEvent.click(screen.getByRole('button', { name: '继续整份测评' }))
    expect(screen.getByText('整份测评')).toBeInTheDocument()
    expect(screen.queryByText('错误父级')).toBeNull()
    expect(mocks.controller.complete).not.toHaveBeenCalled()
    expect(mocks.controller.restart).not.toHaveBeenCalled()
    expect(mocks.controller.start).not.toHaveBeenCalled()
  })
  it('keeps the active task mounted when shell save status changes', async () => {
    const view = render(app())
    const before = await screen.findByRole('button', { name: 'trial 0' })

    mocks.controller.state = { ...baseState(), status: 'SUBMITTING_TRIAL' }
    view.rerender(app())

    const after = screen.getByRole('button', { name: 'trial 0' })
    expect(after).toBe(before)
    expect(screen.getByText('正在保存到本机')).toBeTruthy()
  })

  it('does not mount a task or create a trial when required media is unavailable', async () => {
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
    expect(await screen.findByText('视觉内容未就绪，测量不会继续。')).toBeTruthy()
    expect(mocks.controller.appendTrial).not.toHaveBeenCalled()
  })
})
