import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { mockPatch, mockPost } = vi.hoisted(() => ({
  mockPatch: vi.fn(),
  mockPost: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
  default: { patch: mockPatch, post: mockPost },
}))

import ScaleAssessment from '../ScaleAssessment'

const scale = {
  id: 'scale-1',
  name: '示例量表',
  instruction: null,
  estimatedTime: 5,
  definition: {
    schemaVersion: 2 as const,
    respondentType: 'participant_self_report',
    display: { randomizeItems: false },
    items: [
      {
        itemCode: 'item-1',
        content: '第一题内容',
        type: 'single',
        required: true,
        sortOrder: 0,
        responseSetKey: 'set-1',
        randomizeOptions: false,
        options: [
          { value: 'never', label: '选项 A' },
          { value: 'often', label: '选项 B' },
        ],
      },
      {
        itemCode: 'item-2',
        content: '第二题内容',
        type: 'single',
        required: true,
        sortOrder: 1,
        responseSetKey: 'set-2',
        randomizeOptions: false,
        options: [
          { value: 'never', label: '选项 C' },
          { value: 'often', label: '选项 D' },
        ],
      },
    ],
  },
}

const assessment = {
  id: 'assessment-1',
  status: 'IN_PROGRESS',
  progress: 0,
  answers: [],
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/student/scales/scale-1']}>
    <Routes>
      <Route path="/student/scales/:scaleId" element={<ScaleAssessment />} />
      <Route path="/student/scales/result/:assessmentId" element={<div>RESULT_PAGE</div>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
  mockPost.mockImplementation((path: string) => (
    path === '/scales/scale-1/assessments'
      ? Promise.resolve({ code: 0, data: { assessment, scale } })
      : Promise.resolve({ code: 0 })
  ))
  mockPatch.mockResolvedValue({ code: 0 })
})

describe('ScaleAssessment answer navigation', () => {
  it('submits the current answer and advances only after the save succeeds', async () => {
    let resolvePatch!: (value: { code: number }) => void
    mockPatch.mockReturnValueOnce(new Promise((resolve) => {
      resolvePatch = resolve
    }))
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('第一题内容')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '选项 A' }))

    expect(mockPatch).toHaveBeenCalledWith(
      '/scales/assessments/assessment-1/answers',
      expect.objectContaining({
        itemCode: 'item-1',
        responseValue: 'never',
        responseTimeMs: expect.any(Number),
      }),
    )
    expect(screen.getByText('第一题内容')).toBeInTheDocument()
    expect(screen.queryByText('第二题内容')).not.toBeInTheDocument()

    resolvePatch({ code: 0 })
    expect(await screen.findByText('第二题内容')).toBeInTheDocument()
  })

  it('stays on the current question when saving fails', async () => {
    mockPatch.mockResolvedValueOnce({ code: 500, message: '保存失败' })
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('第一题内容')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '选项 A' }))

    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: '选项 A' })).toBeEnabled())
    expect(screen.getByText('第一题内容')).toBeInTheDocument()
    expect(screen.queryByText('第二题内容')).not.toBeInTheDocument()
  })

  it('blocks duplicate answer saves while the current answer is pending', async () => {
    let resolvePatch!: (value: { code: number }) => void
    mockPatch.mockReturnValueOnce(new Promise((resolve) => {
      resolvePatch = resolve
    }))
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('第一题内容')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '选项 A' }))
    await user.click(screen.getByRole('button', { name: '选项 B' }))

    expect(mockPatch).toHaveBeenCalledTimes(1)
    resolvePatch({ code: 0 })
    expect(await screen.findByText('第二题内容')).toBeInTheDocument()
  })

  it('keeps the last question visible and only completes after an explicit click', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('第一题内容')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '选项 A' }))
    expect(await screen.findByText('第二题内容')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '选项 C' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '选项 C' })).toHaveClass('border-primary'))
    expect(screen.getByText('第二题内容')).toBeInTheDocument()
    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(mockPost).toHaveBeenCalledWith('/scales/scale-1/assessments')

    await user.click(screen.getByRole('button', { name: '完成测评' }))
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2))
    expect(mockPost).toHaveBeenLastCalledWith('/scales/assessments/assessment-1/complete')
    expect(await screen.findByText('RESULT_PAGE')).toBeInTheDocument()
  })
})
