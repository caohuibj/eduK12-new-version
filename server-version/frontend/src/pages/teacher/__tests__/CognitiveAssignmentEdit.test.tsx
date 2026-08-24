import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockCognitiveApi } = vi.hoisted(() => ({
  mockCognitiveApi: {
    getAssignment: vi.fn(),
    listPublicTokens: vi.fn(),
    updateAssignment: vi.fn(),
    publishAssignment: vi.fn(),
    archiveAssignment: vi.fn(),
    createPublicToken: vi.fn(),
    disablePublicToken: vi.fn(),
    exportData: vi.fn(),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: 'wrap-1' }) }
})

vi.mock('../../../modules/cognitive/api', () => ({
  cognitiveApi: mockCognitiveApi,
}))

import CognitiveAssignmentEdit from '../CognitiveAssignmentEdit'

describe('CognitiveAssignmentEdit wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCognitiveApi.updateAssignment.mockResolvedValue({ code: 0, data: {} })
  })

  it('shows the composite-only badge and keeps title/instruction editing while hiding public links and export', async () => {
    mockCognitiveApi.getAssignment.mockResolvedValue({
      code: 0,
      data: {
        id: 'wrap-1',
        title: '注意任务壳',
        instruction: '综合测评内作答',
        status: 'PUBLISHED',
        listedStandalone: false,
        config: { name: 'Reaction' },
      },
    })

    const user = userEvent.setup()
    render(<CognitiveAssignmentEdit />)

    expect(await screen.findByText('综合测评用')).toBeInTheDocument()
    expect(screen.queryByText('公开匿名链接')).not.toBeInTheDocument()
    expect(screen.queryByText('导出摘要')).not.toBeInTheDocument()
    expect(screen.queryByText('发布')).not.toBeInTheDocument()
    expect(mockCognitiveApi.listPublicTokens).not.toHaveBeenCalled()

    const title = screen.getByDisplayValue('注意任务壳')
    await user.clear(title)
    await user.type(title, '更新后的壳')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mockCognitiveApi.updateAssignment).toHaveBeenCalledWith('wrap-1', {
        title: '更新后的壳',
        instruction: '综合测评内作答',
      })
    })
  })

  it('renders a report-package wrapper as read-only after freeze', async () => {
    mockCognitiveApi.getAssignment.mockResolvedValue({
      code: 0,
      data: {
        id: 'wrap-1',
        title: '冻结槽位任务',
        instruction: '固定说明',
        status: 'PUBLISHED',
        listedStandalone: false,
        reportPackageLocked: true,
        config: { name: 'Reaction' },
      },
    })

    render(<CognitiveAssignmentEdit />)

    expect(await screen.findByText(/已被报告包引用并冻结/)).toBeInTheDocument()
    expect(screen.queryByDisplayValue('冻结槽位任务')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '归档' })).not.toBeInTheDocument()
  })
})
