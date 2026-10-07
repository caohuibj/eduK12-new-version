import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockGet, mockCompositeApi } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockCompositeApi: {
    detail: vi.fn(),
    listAnalysisProtocols: vi.fn(),
    setAnalysisProtocol: vi.fn(),
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

vi.mock('../../../contexts/AuthContext',()=>({useAuth:()=>({user:{id:'publisher'}})}))

import CompositeAssessmentEdit from '../CompositeAssessmentEdit'

describe('CompositeAssessmentEdit copyable toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ code: 0, data: { list: [] } })
    mockCompositeApi.listTokens.mockResolvedValue({ code: 0, data: { list: [] } })
    mockCompositeApi.listAnalysisProtocols.mockResolvedValue({
      code: 0,
      data: { domainDefinitionVersion: '1.0.0', evidenceMappingVersion: '1.0.0', domains: [], list: [] },
    })
    mockCompositeApi.setAnalysisProtocol.mockResolvedValue({ code: 0, data: {} })
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

  it('keeps an authorized composite and export usable when the optional situational catalog is forbidden', async () => {
    mockGet.mockImplementation((path: string) => path === '/situational/instruments'
      ? Promise.reject({ status: 403, message: '需要特定权限' })
      : Promise.resolve({ code: 0, data: { list: [] } }))
    mockCompositeApi.detail.mockResolvedValue({
      code: 0,
      data: {
        id: 'tpl-1', name: '可导出的教师测评', code: 'T1', status: 'DRAFT',
        items: [], attemptCounts: { started: 0, completed: 0 },
      },
    })
    mockCompositeApi.exportData.mockRejectedValue({ status: 503, message: '稍后重试' })
    const user = userEvent.setup()
    render(<CompositeAssessmentEdit />)
    expect(await screen.findByText('可导出的教师测评')).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledWith('/situational/instruments', { timeout: 3000 })
    expect(screen.queryByText('情境测评题包暂不可用，已加载的综合测评仍可管理和导出。')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '导出摘要' }))
    await waitFor(() => expect(mockCompositeApi.exportData).toHaveBeenCalledWith(
      'tpl-1', { detail: 'summary', format: 'csv' }, expect.any(String),
    ))
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

  it('shows every public token and disables only the selected token', async () => {
    mockCompositeApi.detail.mockResolvedValue({
      code: 0,
      data: {
        id: 'tpl-1',
        name: '教师测评',
        code: 'T1',
        status: 'PUBLISHED',
        publicEnabled: true,
        copyable: false,
        canSetCopyable: false,
        course: { id: 'c1', title: '语文', isLibrary: false },
        items: [],
        attemptCounts: { started: 0, completed: 0 },
      },
    })
    mockCompositeApi.listTokens.mockResolvedValue({
      code: 0,
      data: {
        list: [
          { id: 'token-a', token: 'token-a-value', expiresAt: '2030-01-01T00:00:00.000Z', maxUses: 2, usedCount: 1, isActive: true, createdAt: '2029-01-01T00:00:00.000Z' },
          { id: 'token-b', token: 'token-b-value', expiresAt: '2030-02-01T00:00:00.000Z', maxUses: 0, usedCount: 0, isActive: true, createdAt: '2029-01-02T00:00:00.000Z' },
        ],
      },
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    render(<CompositeAssessmentEdit />)

    expect(await screen.findByText(/token-a-value/)).toBeInTheDocument()
    expect(screen.getByText(/token-b-value/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '复制链接' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '停用此链接' })).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: '停用此链接' })[1])
    expect(mockCompositeApi.disableToken).toHaveBeenCalledWith('tpl-1', 'token-b')
    confirmSpy.mockRestore()
  })

  it('locks fixed protocol items and can explicitly switch a draft to collection-only', async () => {
    mockCompositeApi.detail.mockResolvedValue({
      code: 0,
      data: {
        id: 'tpl-1',
        name: '固定注意测评',
        code: 'ATTN',
        status: 'DRAFT',
        copyable: false,
        canSetCopyable: false,
        course: { id: 'c1', title: '语文', isLibrary: false },
        analysisProtocol: { key: 'attention_v1', version: '1.0.0', profile: 'standard', frozen: false },
        items: [{
          id: 'item-1',
          type: 'COGNITIVE',
          position: 0,
          cognitiveAssignment: { title: '持续注意' },
        }],
        attemptCounts: { started: 0, completed: 0 },
      },
    })
    mockCompositeApi.listAnalysisProtocols.mockResolvedValue({
      code: 0,
      data: {
        domainDefinitionVersion: '1.0.0', evidenceMappingVersion: '1.0.0', domains: [],
        list: [{
          key: 'attention_v1', version: '1.0.0', status: 'PUBLISHED', name: '注意与稳定性',
          description: '固定注意任务', recommendedForCreate: true,
          profiles: ['standard', 'research'], estimatedMinutes: { standard: [10, 15], research: [20, 30] },
          outputDomains: ['sustained_attention'],
          cognitiveSlots: [{ key: 'cpt', label: '持续注意', position: 0, testType: 'cpt' }],
        }],
      },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const user = userEvent.setup()
    render(<CompositeAssessmentEdit />)
    expect(await screen.findByText(/固定协议：注意与稳定性/)).toBeInTheDocument()
    expect(screen.getByText(/任务、必答属性和顺序不可单独修改/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '移除' })).not.toBeInTheDocument()
    expect(screen.queryByText('添加模块')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('编辑报告模式'), '')
    await user.click(screen.getByRole('button', { name: '保存报告模式' }))
    await waitFor(() => {
      expect(mockCompositeApi.setAnalysisProtocol).toHaveBeenCalledWith('tpl-1', null)
    })
  })
})
