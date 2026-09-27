import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { api, saveCredential, intents } = vi.hoisted(() => ({
  api: { info: vi.fn(), start: vi.fn() },
  saveCredential: vi.fn(),
  intents: { readCognitiveStartIntent: vi.fn(), getOrCreateCognitiveStartIntent: vi.fn(), rotateCognitiveStartIntent: vi.fn() },
}))
vi.mock('../api', () => ({ publicCognitiveAssignmentApi: api }))
vi.mock('../core/recovery-credential', () => ({ saveCognitiveRecoveryCredential: saveCredential }))
vi.mock('../core/start-intent', () => intents)
import PublicCognitiveAssignment from '../pages/PublicCognitiveAssignment'

const intent = 'A'.repeat(43)
const credential = 'recovery-token-1234567890'
const renderAt = () => render(<MemoryRouter initialEntries={['/public/cognitive/assignments/public-token']}>
  <Routes>
    <Route path="/public/cognitive/assignments/:token" element={<PublicCognitiveAssignment />} />
    <Route path="/public/cognitive/sessions/:sessionId" element={<div>RUNNER_PAGE</div>} />
  </Routes>
</MemoryRouter>)

beforeEach(() => {
  vi.resetAllMocks()
  window.sessionStorage.clear()
  window.localStorage.clear()
  intents.readCognitiveStartIntent.mockResolvedValue('')
  intents.getOrCreateCognitiveStartIntent.mockResolvedValue(intent)
  intents.rotateCognitiveStartIntent.mockResolvedValue('B'.repeat(43))
  api.info.mockResolvedValue({ code: 0, data: { title: 'Test assignment', instruction: null, testType: 'nback' } })
  api.start.mockResolvedValue({ code: 0, data: { session: { sessionId: 'session-1' }, recoveryToken: credential, anonymousCode: 'ANON-1234ABCD' } })
})

describe('PublicCognitiveAssignment recovery flow', () => {
  it('keeps an existing recovery credential usable when the public link is exhausted', async () => {
    window.sessionStorage.setItem('cognitive:recovery:access:public-token', credential)
    api.info.mockResolvedValue({ code: 1, message: 'Public link reached its maximum uses' })
    api.start.mockResolvedValue({ code: 0, data: { session: { sessionId: 'session-1' }, recoveryToken: null, anonymousCode: 'ANON-1234ABCD' } })
    renderAt()
    const button = await screen.findByRole('button', { name: '继续测评' })
    expect(button).toBeEnabled()
    expect(screen.getByText(/已有恢复凭证仍可继续/)).toBeVisible()
    await userEvent.click(button)
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('public-token', { recoveryToken: credential }))
    expect(saveCredential).toHaveBeenCalledWith('session-1', credential)
    expect(intents.getOrCreateCognitiveStartIntent).not.toHaveBeenCalled()
  })

  it('replays the persisted intent after response loss even when the link is exhausted', async () => {
    intents.readCognitiveStartIntent.mockResolvedValue(intent)
    api.info.mockResolvedValue({ code: 1, message: 'Public link reached its maximum uses' })
    renderAt()
    const button = await screen.findByRole('button', { name: '开始匿名测评' })
    expect(button).toBeEnabled()
    expect(screen.getByRole('heading', { level: 1, name: '继续匿名认知测评' })).toBeVisible()
    await userEvent.click(button)
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('public-token', { startIntent: intent }))
    expect(saveCredential).toHaveBeenCalledWith('session-1', credential)
    expect(intents.rotateCognitiveStartIntent).not.toHaveBeenCalled()
  })

  it('does not submit before the local intent transaction commits', async () => {
    let commit!: (value: string) => void
    intents.getOrCreateCognitiveStartIntent.mockReturnValue(new Promise<string>((resolve) => { commit = resolve }))
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: '开始匿名测评' }))
    expect(api.start).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '开始匿名测评' })).toBeDisabled()
    commit(intent)
    await waitFor(() => expect(api.start).toHaveBeenCalledTimes(1))
  })

  it('fails closed before any new START when durable storage fails', async () => {
    intents.getOrCreateCognitiveStartIntent.mockRejectedValue(new Error('Storage unavailable'))
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: '开始匿名测评' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable')
    expect(api.start).not.toHaveBeenCalled()
  })

  it('keeps the same intent on network retry rather than silently creating another participant', async () => {
    api.start.mockRejectedValueOnce(new Error('Response lost'))
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: '开始匿名测评' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Response lost')
    await userEvent.click(screen.getByRole('button', { name: '开始匿名测评' }))
    await screen.findByText('RUNNER_PAGE')
    expect(api.start).toHaveBeenNthCalledWith(1, 'public-token', { startIntent: intent })
    expect(api.start).toHaveBeenNthCalledWith(2, 'public-token', { startIntent: intent })
    expect(intents.rotateCognitiveStartIntent).not.toHaveBeenCalled()
  })

  it('rotates only through the explicit new-participant action and does not consume quota yet', async () => {
    intents.readCognitiveStartIntent.mockResolvedValue(intent)
    window.sessionStorage.setItem('cognitive:recovery:access:public-token', credential)
    renderAt()
    await userEvent.click(await screen.findByRole('button', { name: '为另一位参与者开始新作答' }))
    await waitFor(() => expect(intents.rotateCognitiveStartIntent).toHaveBeenCalledWith('public-token', intent))
    expect(api.start).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('cognitive:recovery:access:public-token')).toBeNull()
    expect(screen.getByRole('button', { name: '开始匿名测评' })).toBeEnabled()
  })
})
