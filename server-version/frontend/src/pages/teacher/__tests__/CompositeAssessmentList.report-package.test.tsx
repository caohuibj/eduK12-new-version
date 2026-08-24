import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockNavigate, mockGet, mockApi, authState } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGet: vi.fn(),
  mockApi: {
    list: vi.fn(),
    listLibrary: vi.fn(),
    listAnalysisProtocols: vi.fn(),
    listReportPackages: vi.fn(),
    create: vi.fn(),
  },
  authState: { user: { id: 'teacher-1', role: 'TEACHER' } },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../../../modules/composite/api', () => ({ compositeApi: mockApi }))
vi.mock('../../../api/client', () => ({ default: { get: mockGet } }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: authState.user }) }))

import CompositeAssessmentList from '../CompositeAssessmentList'

describe('CompositeAssessmentList report package mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.list.mockResolvedValue({ code: 0, data: { list: [] } })
    mockApi.listLibrary.mockResolvedValue({ code: 0, data: { list: [] } })
    mockApi.listAnalysisProtocols.mockResolvedValue({ code: 0, data: { list: [] } })
    mockApi.listReportPackages.mockResolvedValue({
      code: 0,
      data: {
        list: [{
          key: 'attention_stability_v1', version: '1.0.0', status: 'PUBLISHED', name: '注意与稳定性',
          description: '固定报告包', profiles: ['standard', 'research'],
          estimatedMinutes: { standard: [10, 15], research: [20, 30] },
          reportDefinitionVersion: 'report-package-v1', analysisProtocolKey: 'attention_stability_v1',
          analysisProtocolVersion: '1.0.0', audience: ['participant', 'teacher'], granted: true,
          slots: [{ key: 'cpt', label: '持续注意', position: 0, required: true, type: 'COGNITIVE', testType: 'cpt' }],
        }],
      },
    })
    mockApi.create.mockResolvedValue({ code: 0, data: { id: 'pkg-draft' } })
    mockGet.mockResolvedValue({ code: 0, data: { list: [{ id: 'course-1', title: '语文', courseCode: 'YU', isLibrary: false, creatorId: 'teacher-1' }] } })
  })

  it('creates a fixed package selection instead of a bare analysis protocol', async () => {
    const user = userEvent.setup()
    render(<CompositeAssessmentList />)
    await user.click(await screen.findByRole('button', { name: '新建综合测评' }))
    await user.type(screen.getByPlaceholderText('编码'), 'PKG')
    await user.type(screen.getByPlaceholderText('名称'), '固定包测评')
    await user.selectOptions(screen.getByLabelText('已授权报告包'), 'attention_stability_v1/1.0.0')
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mockApi.create).toHaveBeenCalledWith(expect.objectContaining({
      reportPackage: { key: 'attention_stability_v1', version: '1.0.0', profile: 'standard' },
    })))
    expect(mockApi.create.mock.calls[0][0]).not.toHaveProperty('analysisProtocol')
  })
})
