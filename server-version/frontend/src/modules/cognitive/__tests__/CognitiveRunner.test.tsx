import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CognitiveRunner from '../pages/CognitiveRunner'

const mockController = {
  state: {} as any,
  start: vi.fn(),
  appendTrial: vi.fn(),
  complete: vi.fn(),
  reload: vi.fn(),
}
vi.mock('../core/useCognitiveSession', () => ({
  useCognitiveSession: () => mockController,
}))

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/student/cognitive/sessions/:sessionId" element={<CognitiveRunner />} />
        <Route path="/student/cognitive/sessions/:sessionId/result" element={<div>RESULT_PAGE</div>} />
        <Route path="/student/cognitive" element={<div>HOME_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CognitiveRunner page', () => {
  it('renders loading state', () => {
    mockController.state = { status: 'LOADING', session: null }
    renderAt('/student/cognitive/sessions/s1')
    expect(screen.getByText('加载中...')).toBeTruthy()
  })

  it('renders READY with start button', () => {
    mockController.state = {
      status: 'READY',
      session: {
        sessionId: 's1',
        testType: 'fake',
        engineVersion: '1.0.0',
        attemptNo: 1,
        config: { trialCount: 3 },
      },
      taskContext: null,
      trialIndex: 0,
      error: null,
      result: null,
    }
    renderAt('/student/cognitive/sessions/s1')
    expect(screen.getByText('开始测评')).toBeTruthy()
  })

  it('renders UNSUPPORTED with friendly message and no start path', () => {
    mockController.state = { status: 'UNSUPPORTED', session: null, error: null, trialIndex: 0, result: null }
    renderAt('/student/cognitive/sessions/s1')
    expect(screen.getByText(/该测评类型或版本暂不支持/)).toBeTruthy()
    expect(screen.queryByText('开始测评')).toBeNull()
  })

  it('renders RECOVERY_REQUIRED with explicit blocked state', () => {
    mockController.state = {
      status: 'RECOVERY_REQUIRED',
      session: null,
      error: { code: 'RECOVERY_REQUIRED', message: '无法确认进度' },
      trialIndex: 0,
      result: null,
    }
    renderAt('/student/cognitive/sessions/s1')
    expect(screen.getByText('需要处理恢复状态')).toBeTruthy()
    expect(screen.getByText('无法确认进度')).toBeTruthy()
    expect(screen.queryByText('开始测评')).toBeNull()
  })

  it('renders ERROR with recovery status and retry button', () => {
    mockController.state = {
      status: 'ERROR',
      session: null,
      error: { code: '404', message: '测评不存在或不可访问' },
      trialIndex: 0,
      result: null,
    }
    renderAt('/student/cognitive/sessions/s1')
    expect(screen.getByText('恢复失败')).toBeTruthy()
    expect(screen.getByText('重试')).toBeTruthy()
  })
})
