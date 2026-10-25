import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
const { logged, anonymous, publicFactory, body } = vi.hoisted(() => ({
  logged: { getAttempt: vi.fn(), submitFinalScale: vi.fn() },
  anonymous: { getAttempt: vi.fn(), submitFinalScale: vi.fn() },
  publicFactory: vi.fn(),
  body: { submissionId: 'submission-0000001', attemptEpoch: 1, definitionHash: 'hash', answers: [] },
}))
vi.mock('../api', () => ({ compositeApi: logged, publicCompositeApi: publicFactory }))
vi.mock('../../../components/FinalCompositeAssessment', () => ({ default: (props: any) => <button onClick={async () => {
  const response = await props.submitScale(props.state.id, 'item', body)
  if (response.code === 0) await props.onReload()
}}>提交并读取当前单元</button> }))
vi.mock('../../../components/participation/PersonalParticipationLink', () => ({ PersonalParticipationLink: () => null }))
import CompositeAssessmentPage from '../CompositeAssessmentPage'
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear()
  publicFactory.mockReturnValue(anonymous)
  const state = { id: 'attempt', name: 'Synthetic', status: 'IN_PROGRESS', deliveryMode: 'FINAL_ONLY', productKind: 'COMPOSITE',
    progress: 0, currentItem: { id: 'item', type: 'SCALE', answers: [] } }
  for (const api of [logged, anonymous]) {
    api.getAttempt.mockResolvedValue({ code: 0, data: state })
    api.submitFinalScale.mockResolvedValue({ code: 0, data: { submissionId: body.submissionId, replayed: false, completed: true } })
  }
})
describe('actual Composite page receipt opt-in callback', () => {
  it.each([false, true])('submits sealed body with explicit receipt mode and reloads for public=%s', async publicMode => {
    const prefix = publicMode ? '/public' : '/student', api = publicMode ? anonymous : logged
    if (publicMode) sessionStorage.setItem('composite:recovery:attempt:attempt', 'synthetic-proof')
    render(<MemoryRouter initialEntries={[`${prefix}/composite/attempts/attempt`]}><Routes>
      <Route path={`${prefix}/composite/attempts/:attemptId`} element={<CompositeAssessmentPage />} />
    </Routes></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '提交并读取当前单元' }))
    await waitFor(() => expect(api.submitFinalScale).toHaveBeenCalledExactlyOnceWith('attempt', 'item', body, { response: 'receipt' }))
    await waitFor(() => expect(api.getAttempt).toHaveBeenCalledTimes(2))
    expect(api.getAttempt).toHaveBeenLastCalledWith('attempt', 'current-unit')
    if (publicMode) expect(publicFactory).toHaveBeenCalledWith('synthetic-proof')
  })
})
