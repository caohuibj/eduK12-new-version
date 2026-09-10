import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CognitiveRunner from '../pages/CognitiveRunner'

const mocks = vi.hoisted(() => ({
  controller: {
    state: {} as any,
    start: vi.fn(),
    appendTrial: vi.fn(),
    complete: vi.fn(),
    restart: vi.fn(),
    reload: vi.fn(),
  },
  videoState: {
    current: {} as any,
  },
  videoHook: vi.fn(),
  videoRender: vi.fn(),
  taskRender: vi.fn(),
}))

vi.mock('../core/useCognitiveSession', () => ({
  useCognitiveSession: () => mocks.controller,
}))
vi.mock('../core/useAdministrationProvenance', () => ({
  useAdministrationProvenance: () => ({ snapshot: () => null }),
}))
vi.mock('../../assessment-media/useAssessmentImageAssets', () => ({
  useAssessmentImageAssets: () => ({ status: 'ready', urls: {}, error: null, retry: vi.fn() }),
}))
vi.mock('../useCognitiveVideoSources', () => ({
  useCognitiveVideoSources: (entries: unknown[]) => {
    mocks.videoHook(entries)
    return mocks.videoState.current
  },
}))
vi.mock('../../assessment-media/AssessmentVideoPlayer', () => ({
  default: (props: any) => {
    mocks.videoRender(props)
    return (
      <div data-testid={`video-${props.presentation.title}`}>
        <button type="button" onClick={props.onReady}>ready {props.presentation.title}</button>
        <button type="button" onClick={() => void props.onRetry?.()}>retry {props.presentation.title}</button>
      </div>
    )
  },
}))
vi.mock('../registry', () => ({
  resolveRunner: () => ({
    RunnerComponent: (props: unknown) => {
      mocks.taskRender(props)
      return <div data-testid="task-runner" />
    },
    completionMode: 'manual',
  }),
}))

const video = (assetId: string, title: string) => ({
  schemaVersion: 1 as const,
  video: { assetId, contentHash: assetId[0]!.repeat(64), mimeType: 'video/webm' as const },
  title,
})

const PRESENTATION = {
  schemaVersion: 1 as const,
  videos: {
    instruction: [video('a-video', '说明视频')],
    example: [video('b-video', '示例视频')],
    stimulus: [video('c-video', '刺激视频')],
  },
}
const SOURCES = {
  'instruction:0': { videoUrl: '/media/instruction', captions: [], expiresAt: 1000 },
  'example:0': { videoUrl: '/media/example', captions: [], expiresAt: 1000 },
  'stimulus:0': { videoUrl: '/media/stimulus', captions: [], expiresAt: 1000 },
}
const session = {
  sessionId: 'session-media-7',
  assignmentId: 'assignment-media-7',
  testType: 'fake',
  attemptNo: 1,
  status: 'IN_PROGRESS' as const,
  configVersion: '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 3 },
  randomSeed: 'seed-media-7',
  presentation: PRESENTATION,
}

const runnerTree = () => (
  <MemoryRouter initialEntries={['/student/cognitive/sessions/session-media-7']}>
    <Routes>
      <Route path="/student/cognitive/sessions/:sessionId" element={<CognitiveRunner />} />
    </Routes>
  </MemoryRouter>
)
const renderRunner = () => render(runnerTree())

beforeEach(() => {
  vi.clearAllMocks()
  mocks.videoState.current = {
    status: 'ready',
    sources: SOURCES,
    error: null,
    retry: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
  }
})

describe('MEDIA-7 Cognitive video presentation gate', () => {
  it('prepares every frozen video slot but renders only instruction before START', () => {
    mocks.controller.state = {
      status: 'READY',
      session,
      taskContext: null,
      trialIndex: 0,
      error: null,
      result: null,
    }
    renderRunner()

    const entries = mocks.videoHook.mock.calls[mocks.videoHook.mock.calls.length - 1]?.[0] as Array<{ key: string }>
    expect(entries.map((entry) => entry.key)).toEqual(['instruction:0', 'example:0', 'stimulus:0'])
    expect(screen.getByTestId('video-说明视频')).toBeTruthy()
    expect(screen.queryByTestId('video-示例视频')).toBeNull()
    expect(screen.queryByTestId('video-刺激视频')).toBeNull()

    const start = screen.getByRole('button', { name: '开始测评' }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'ready 说明视频' }))
    expect(start.disabled).toBe(false)
    fireEvent.click(start)
    expect(mocks.controller.start).toHaveBeenCalledTimes(1)

    const playerProps = mocks.videoRender.mock.calls[0]?.[0] as { autoPlay?: boolean }
    expect(playerProps.autoPlay).toBe(false)
  })

  it('invalidates instruction readiness immediately when the exact capability URL changes', () => {
    mocks.controller.state = {
      status: 'READY', session, taskContext: null, trialIndex: 0, error: null, result: null,
    }
    const rendered = renderRunner()
    fireEvent.click(screen.getByRole('button', { name: 'ready 说明视频' }))
    expect((screen.getByRole('button', { name: '开始测评' }) as HTMLButtonElement).disabled).toBe(false)

    mocks.videoState.current = {
      ...mocks.videoState.current,
      sources: {
        ...SOURCES,
        'instruction:0': { ...SOURCES['instruction:0'], videoUrl: '/media/instruction-refreshed' },
      },
    }
    rendered.rerender(runnerTree())

    expect((screen.getByRole('button', { name: '开始测评' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'ready 说明视频' }))
    expect((screen.getByRole('button', { name: '开始测评' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('blocks START when capability issuance fails and exposes retry without a playback state machine', () => {
    const retry = vi.fn()
    mocks.videoState.current = { status: 'error', sources: {}, error: 'expired', retry, refresh: vi.fn() }
    mocks.controller.state = {
      status: 'READY', session, taskContext: null, trialIndex: 0, error: null, result: null,
    }
    renderRunner()

    expect(screen.getByText('视频内容加载失败，当前不能开始测评。')).toBeTruthy()
    expect((screen.getByRole('button', { name: '开始测评' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '重试视频内容' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('passes frozen video sources and targeted refresh to the task runner without rendering task videos generically', () => {
    mocks.controller.state = {
      status: 'RUNNING',
      session,
      taskContext: {
        sessionId: session.sessionId,
        testType: session.testType,
        engineVersion: session.engineVersion,
        scoringVersion: session.scoringVersion,
        configVersion: session.configVersion,
        attemptNo: session.attemptNo,
        config: session.config,
        randomSeed: session.randomSeed,
        presentation: PRESENTATION,
      },
      trialIndex: 0,
      error: null,
      result: null,
    }
    renderRunner()

    expect(screen.getByTestId('task-runner')).toBeTruthy()
    expect(mocks.videoRender).not.toHaveBeenCalled()
    const props = mocks.taskRender.mock.calls[0]?.[0] as {
      videoSources?: Record<string, unknown>
      refreshVideoSource?: (key: string) => Promise<void>
      taskContext: { presentation?: unknown }
    }
    expect(props.taskContext.presentation).toEqual(PRESENTATION)
    expect(props.videoSources).toEqual(SOURCES)
    expect(props.refreshVideoSource).toBe(mocks.videoState.current.refresh)
  })
})
