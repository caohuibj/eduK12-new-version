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
  imageState: {
    current: {
      status: 'ready' as 'ready' | 'loading' | 'error',
      urls: {} as Record<string, string>,
      error: null as string | null,
      retry: vi.fn(),
    },
  },
  imageHook: vi.fn(),
  taskRender: vi.fn(),
}))

vi.mock('../core/useCognitiveSession', () => ({
  useCognitiveSession: () => mocks.controller,
}))

vi.mock('../core/useAdministrationProvenance', () => ({
  useAdministrationProvenance: () => ({ snapshot: () => null }),
}))

vi.mock('../../assessment-media/useAssessmentImageAssets', () => ({
  useAssessmentImageAssets: (items: unknown[]) => {
    mocks.imageHook(items)
    return mocks.imageState.current
  },
}))

vi.mock('../registry', () => ({
  resolveRunner: () => ({
    RunnerComponent: (props: unknown) => {
      mocks.taskRender(props)
      return null
    },
    completionMode: 'manual',
  }),
}))

const PRESENTATION = {
  schemaVersion: 1 as const,
  instruction: [{
    asset: {
      assetId: 'instruction-image',
      contentHash: 'a'.repeat(64),
      mimeType: 'image/png' as const,
    },
    altText: '认知测评说明图',
    caption: '先阅读说明',
  }],
  example: [{
    asset: {
      assetId: 'example-image',
      contentHash: 'b'.repeat(64),
      mimeType: 'image/jpeg' as const,
    },
    altText: '认知测评示例图',
  }],
  stimulus: [{
    asset: {
      assetId: 'stimulus-image',
      contentHash: 'c'.repeat(64),
      mimeType: 'image/webp' as const,
    },
    altText: '认知测评刺激图',
  }],
}

const session = {
  sessionId: 'session-media-3',
  assignmentId: 'assignment-media-3',
  testType: 'fake',
  attemptNo: 1,
  status: 'IN_PROGRESS' as const,
  configVersion: '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 3 },
  randomSeed: 'seed-media-3',
  presentation: PRESENTATION,
}

const renderRunner = () => render(
  <MemoryRouter initialEntries={['/student/cognitive/sessions/session-media-3']}>
    <Routes>
      <Route path="/student/cognitive/sessions/:sessionId" element={<CognitiveRunner />} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.imageState.current = {
    status: 'ready',
    urls: {
      'instruction-image': 'blob:instruction',
      'example-image': 'blob:example',
      'stimulus-image': 'blob:stimulus',
    },
    error: null,
    retry: vi.fn(),
  }
})

describe('MEDIA-3 Cognitive image presentation gate', () => {
  it('preloads every frozen slot before start while keeping example/stimulus undisclosed', () => {
    mocks.controller.state = {
      status: 'READY',
      session,
      taskContext: null,
      trialIndex: 0,
      error: null,
      result: null,
    }

    renderRunner()

    const calls = mocks.imageHook.mock.calls
    const loadedItems = calls[calls.length - 1]?.[0] as Array<{ asset: { assetId: string } }>
    expect(loadedItems.map((item) => item.asset.assetId)).toEqual([
      'instruction-image',
      'example-image',
      'stimulus-image',
    ])
    expect(screen.getByAltText('认知测评说明图')).toBeTruthy()
    expect(screen.queryByAltText('认知测评示例图')).toBeNull()
    expect(screen.queryByAltText('认知测评刺激图')).toBeNull()

    const start = screen.getByRole('button', { name: '开始测评' }) as HTMLButtonElement
    expect(start.disabled).toBe(false)
    fireEvent.click(start)
    expect(mocks.controller.start).toHaveBeenCalledTimes(1)
  })

  it('blocks START_RUN while any frozen image is loading', () => {
    mocks.imageState.current = {
      status: 'loading',
      urls: {},
      error: null,
      retry: vi.fn(),
    }
    mocks.controller.state = {
      status: 'READY',
      session,
      taskContext: null,
      trialIndex: 0,
      error: null,
      result: null,
    }

    renderRunner()

    expect(screen.getByRole('status').textContent).toContain('正在准备本次任务的冻结媒体。')
    const start = screen.getByRole('button', { name: '开始测评' }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    fireEvent.click(start)
    expect(mocks.controller.start).not.toHaveBeenCalled()
  })

  it('fails closed on image error and exposes only retry', () => {
    const retry = vi.fn()
    mocks.imageState.current = {
      status: 'error',
      urls: {},
      error: 'load failed',
      retry,
    }
    mocks.controller.state = {
      status: 'READY',
      session,
      taskContext: null,
      trialIndex: 0,
      error: null,
      result: null,
    }

    renderRunner()

    expect(screen.getByRole('alert').textContent).toContain('视觉内容加载失败，当前不能开始测评。')
    expect((screen.getByRole('button', { name: '开始测评' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '重试视觉内容' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('passes frozen presentation and preloaded URLs to the task runner without loading in-task', () => {
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

    expect(mocks.taskRender).toHaveBeenCalledTimes(1)
    const props = mocks.taskRender.mock.calls[0]?.[0] as {
      taskContext: { presentation?: unknown }
      imageAssetUrls?: Record<string, string>
    }
    expect(props.taskContext.presentation).toEqual(PRESENTATION)
    expect(props.imageAssetUrls).toEqual({
      'instruction-image': 'blob:instruction',
      'example-image': 'blob:example',
      'stimulus-image': 'blob:stimulus',
    })
  })
})
