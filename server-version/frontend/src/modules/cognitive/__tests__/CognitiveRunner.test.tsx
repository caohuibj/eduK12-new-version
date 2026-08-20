import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CognitiveRunner from '../pages/CognitiveRunner'

// mock runner hook：组件测试聚焦各状态的渲染与安全文案
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
    mockController.state = { status: 'LOADING' }
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

  it('renders UNSUPPORTED with friendly message (no retry submit)', () => {
    mockController.state = { status: 'UNSUPPORTED', session: null, error: null, trialIndex: 0, result: null }
    renderAt('/student/cognitive/sessions/s1')
    expect(screen.getByText('该测评类型或版本暂不支持')).toBeTruthy()
    expect(screen.queryByText('作答')).toBeNull()
  })

  it('renders RECOVERY_REQUIRED with explicit warning (never silently rerun)', () => {
    mockController.state = {
      status: 'RECOVERY_REQUIRED',
      session: null,
      error: { code: 'RECOVERY_REQUIRED', message: '无法确认进度' },
      trialIndex: 0,
      result: null,
    }
    renderAt('/student/cognitive/sessions/s1')
    expect(screen.getByText('无法恢复测评进度')).toBeTruthy()
    expect(screen.getByText(/请勿刷新或重复提交/)).toBeTruthy()
    // 无任何"作答/开始"按钮（不静默重跑）
    expect(screen.queryByText('作答')).toBeNull()
    expect(screen.queryByText('开始测评')).toBeNull()
  })

  it('renders ERROR with retry button', () => {
    mockController.state = {
      status: 'ERROR',
      session: null,
      error: { code: '404', message: '测评不存在或不可访问' },
      trialIndex: 0,
      result: null,
    }
    renderAt('/student/cognitive/sessions/s1')
    expect(screen.getByText('加载失败')).toBeTruthy()
    expect(screen.getByText('重试')).toBeTruthy()
  })
})
