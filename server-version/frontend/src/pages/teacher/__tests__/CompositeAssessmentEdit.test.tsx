import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockGet, mockCompositeApi } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockCompositeApi: {
    detail: vi.fn(),
    listTokens: vi.fn(),
    update: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
    reorderItems: vi.fn(),
    publish: vi.fn(),
    createToken: vi.fn(),
    disableToken: vi.fn(),
    exportData: vi.fn(),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: 'tpl-1' }) }
})

vi.mock('../../../modules/composite/api', () => ({
  compositeApi: mockCompositeApi,
}))

vi.mock('../../../api/client', () => ({
  default: { get: mockGet },
}))

vi.mock('../../../contexts/CapabilitiesContext', () => ({
  useCognitiveEnabled: () => true,
}))

import CompositeAssessmentEdit from '../CompositeAssessmentEdit'

describe('CompositeAssessmentEdit copyable toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ code: 0, data: { list: [] } })
    mockCompositeApi.listTokens.mockResolvedValue({ code: 0, data: { list: [] } })
    mockCompositeApi.update.mockResolvedValue({ code: 0, data: {} })
  })

  it('shows the admin copy switch only when canSetCopyable is true and hides public links on library courses', async () => {
    mockCompositeApi.detail.mockResolvedValue({
      code: 0,
      data: {
        id: 'tpl-1',
        name: '库模板',
        code: 'LIB1',
        status: 'PUBLISHED',
        copyable: false,
        canSetCopyable: true,
        course: { id: 'lib', title: '模板库', isLibrary: true },
        items: [],
        attemptCounts: { started: 0, completed: 0 },
      },
    })

    const user = userEvent.setup()
    render(<CompositeAssessmentEdit />)

    expect(await screen.findByText('允许教师复制')).toBeInTheDocument()
    expect(screen.getByText('库课程')).toBeInTheDocument()
    expect(screen.queryByText('公开匿名链接')).not.toBeInTheDocument()
    expect(screen.getByText(/不能生成公开链接/)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: '允许教师复制' }))
    await waitFor(() => {
      expect(mockCompositeApi.update).toHaveBeenCalledWith('tpl-1', { copyable: true })
    })
  })

  it('does not guess the copy switch from creator identity', async () => {
    mockCompositeApi.detail.mockResolvedValue({
      code: 0,
      data: {
        id: 'tpl-1',
        name: '教师测评',
        code: 'T1',
        status: 'PUBLISHED',
        copyable: false,
        canSetCopyable: false,
        course: { id: 'c1', title: '语文', isLibrary: false },
        items: [],
        attemptCounts: { started: 0, completed: 0 },
      },
    })

    render(<CompositeAssessmentEdit />)
    expect(await screen.findByText('教师测评')).toBeInTheDocument()
    expect(screen.queryByText('允许教师复制')).not.toBeInTheDocument()
    expect(screen.getByText('公开匿名链接')).toBeInTheDocument()
  })
})
