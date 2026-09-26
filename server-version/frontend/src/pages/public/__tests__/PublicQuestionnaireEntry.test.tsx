import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicQuestionnaire from '../PublicQuestionnaire'
import { saveQuestionnaireResumeToken } from '../../../utils/questionnaireResume'
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),factory:vi.fn()}))
vi.mock('../../../api/publicCapabilityClient',()=>({createPublicCapabilityClient:api.factory}))
vi.mock('../../../utils/powService',()=>({completePOW:vi.fn()}))
beforeEach(()=>{window.sessionStorage.clear();vi.clearAllMocks();api.factory.mockReturnValue(api)})
const renderEntry=()=>render(<MemoryRouter initialEntries={['/public/questionnaire/link']}><Routes>
  <Route path="/public/questionnaire/:token" element={<PublicQuestionnaire />} />
  <Route path="/public/questionnaire/:token/result" element={<p>本人报告</p>} />
  <Route path="/public/questionnaire/:token/assessment" element={<p>继续本人作答</p>} />
</Routes></MemoryRouter>)
it.each([['COMPLETED','本人报告'],['IN_PROGRESS','继续本人作答']])('recovers %s without consulting the exhausted entry quota',async(status,label)=>{
  saveQuestionnaireResumeToken('link','session','credential')
  api.get.mockResolvedValueOnce({data:{questionnaireAssessment:{status}}})
  renderEntry()
  expect(await screen.findByText(label)).toBeInTheDocument()
  expect(api.factory).toHaveBeenCalledWith('credential')
  expect(api.get).toHaveBeenCalledTimes(1)
  expect(api.get).toHaveBeenCalledWith('/assessments/session')
  expect(api.post).not.toHaveBeenCalled()
})
it('does not create a fresh attempt or reveal a report for a rejected capability',async()=>{
  saveQuestionnaireResumeToken('link','session','forged')
  api.get.mockRejectedValueOnce(new Error('恢复凭证无效'))
  renderEntry()
  expect(await screen.findByText('恢复凭证无效')).toBeInTheDocument()
  expect(screen.queryByText('本人报告')).not.toBeInTheDocument()
  expect(api.post).not.toHaveBeenCalled()
})
