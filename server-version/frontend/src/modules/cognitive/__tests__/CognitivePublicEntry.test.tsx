import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CognitiveRunner from '../pages/CognitiveRunner'
import CognitiveResult from '../pages/CognitiveResult'

const mocks = vi.hoisted(() => ({ hook: vi.fn(), publicFactory: vi.fn(), authGet: vi.fn(), publicGet: vi.fn() }))
vi.mock('../api', () => ({ cognitiveApi: { getSession: mocks.authGet }, publicCognitiveApi: mocks.publicFactory }))
vi.mock('../core/useCognitiveSession', () => ({ useCognitiveSession: mocks.hook }))
beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks()
  mocks.hook.mockReturnValue({ state: { status: 'LOADING' } })
  mocks.publicGet.mockResolvedValue({ code: 1, message: '测试结果不可用' })
  mocks.publicFactory.mockReturnValue({ getSession: mocks.publicGet })
})
function renderAt(path: string, result = false, missing = false) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path={missing ? '/missing' : '/:access/cognitive/sessions/:sessionId' + (result ? '/result' : '')} element={result ? <CognitiveResult /> : <CognitiveRunner />} /></Routes></MemoryRouter>)
}
describe('public Cognitive entry authority', () => {
  it('does not mount domain hooks or request APIs until a missing credential is supplied', async () => {
    renderAt('/public/cognitive/sessions/s1')
    expect(screen.getByText('需要恢复凭证')).toBeInTheDocument()
    expect(mocks.hook).not.toHaveBeenCalled()
    expect(mocks.publicFactory).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('恢复凭证'), 'saved-credential')
    await userEvent.click(screen.getByRole('button', { name: '恢复测评' }))
    expect(mocks.publicFactory).toHaveBeenCalledWith('saved-credential')
    expect(mocks.hook).toHaveBeenCalledWith('s1', expect.objectContaining({ getSession: mocks.publicGet }))
  })
  it('selects the public result API without public=1 and never falls back to authenticated reads', async () => {
    sessionStorage.setItem('cognitive:recovery:s1', 'credential')
    renderAt('/public/cognitive/sessions/s1/result', true)
    await waitFor(() => expect(mocks.publicGet).toHaveBeenCalledWith('s1'))
    expect(mocks.authGet).not.toHaveBeenCalled()
  })
  it('does not let a query parameter turn a protected namespace into public access', () => {
    renderAt('/student/cognitive/sessions/s1?public=1')
    expect(mocks.publicFactory).not.toHaveBeenCalled()
    expect(mocks.hook).toHaveBeenCalledWith('s1', expect.objectContaining({ getSession: mocks.authGet }))
  })
  it('shows a recoverable missing-locator error instead of mounting a loading controller', () => {
    renderAt('/missing', false, true)
    expect(screen.getByText('测评链接不完整')).toBeInTheDocument()
    expect(mocks.hook).not.toHaveBeenCalled()
  })
})
