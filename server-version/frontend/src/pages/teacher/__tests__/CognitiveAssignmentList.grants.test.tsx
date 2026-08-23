import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockGet, authState } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  authState: { user: { id: 'admin-1', role: 'ADMIN' as 'TEACHER' | 'ADMIN' } },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('../../../api/client', () => ({
  default: { get: mockGet, post: vi.fn(), patch: vi.fn() },
}))

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

vi.mock('../../../modules/cognitive/api', () => ({
  cognitiveApi: {
    listTeacherAssignments: () => Promise.resolve({ code: 0, data: { list: [] } }),
    listConfigs: () => Promise.resolve({
      code: 0,
      data: {
        list: [{ id: 'cfg-1', name: '反应时', testType: 'reaction', configVersion: '1.0.0', accessPolicy: 'OPEN' }],
      },
    }),
    createAssignment: vi.fn(),
    updateConfigAccessPolicy: vi.fn(),
  },
}))

import CognitiveAssignmentList from '../CognitiveAssignmentList'

describe('CognitiveAssignmentList config grants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.user = { id: 'admin-1', role: 'ADMIN' }
    mockGet.mockResolvedValue({
      code: 0,
      data: { list: [{ id: 'c1', title: '语文', courseCode: 'YU', isLibrary: false, creatorId: 'admin-1' }] },
    })
  })

  it('shows OPEN/GRANT and grant-to-teacher next to the selected config, not on assignment rows', async () => {
    const user = userEvent.setup()
    render(<CognitiveAssignmentList />)
    await user.click(await screen.findByRole('button', { name: /新建认知任务/ }))
    const configSelect = screen.getAllByRole('combobox')[1]
    await user.selectOptions(configSelect, 'cfg-1')
    expect(screen.getByText('OPEN 全员可用')).toBeInTheDocument()
    expect(screen.getByText('GRANT 需授权')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '授权给教师' })).toBeInTheDocument()
    expect(screen.queryByText('综合测评用')).not.toBeInTheDocument()
  })
})
