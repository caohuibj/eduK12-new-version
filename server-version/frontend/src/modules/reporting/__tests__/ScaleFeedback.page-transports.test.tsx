import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import QuestionnaireResult from '../../../pages/student/QuestionnaireResult'
import PublicQuestionnaireResult from '../../../pages/public/PublicQuestionnaireResult'
import CompositeReportPage from '../../composite/CompositeReportPage'

const mocks = vi.hoisted(() => ({ get: vi.fn(), fetch: vi.fn(), sessionFetch: vi.fn(), publicGet: vi.fn(), publicClient: vi.fn(), report: vi.fn(), teacherReport: vi.fn(), status: vi.fn(), snapshots: vi.fn(), user: { value: null as null | { role: string } } }))
vi.mock('../../../api/client', () => ({ default: { get: mocks.get }, sessionFetch: mocks.sessionFetch }))
vi.mock('../../../api/publicCapabilityClient', () => ({ createPublicCapabilityClient: mocks.publicClient }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user.value }) }))
vi.mock('../../composite/api', () => ({ compositeApi: { report: mocks.report, teacherReport: mocks.teacherReport, reportStatus: mocks.status, teacherReportStatus: mocks.status, snapshots: mocks.snapshots }, publicCompositeApi: () => ({ report: mocks.report, reportStatus: mocks.status }) }))
const unit = { type: 'SCALE', kind: 'scale', itemId: 'unit', assessmentId: 'nested-scale-assessment', scaleName: '量表', scores: [], caveats: [], disclaimer: '', completedAt: null, totalTime: null, rawScoreFeedback: [{ scoreKey: 'total', rangeKey: 'r', text: '冻结区间反馈', images: [{ asset: { assetId: 'asset', contentHash: 'a'.repeat(64), mimeType: 'image/png' }, altText: '冻结反馈图', order: 0 }] }] }
const collection = { questionnaireName: '问卷', backgroundValues: [], unitReports: [unit], totalDimensions: 1, totalTime: 0, completedAt: null }
const composite = { ...collection, id: 'attempt', assessmentId: 'questionnaire', name: '组合问卷', productKind: 'QUESTIONNAIRE', reportMode: 'COLLECTION_ONLY' }
function mount(path: string, route: string, component: React.ReactElement) { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={component} /></Routes></MemoryRouter>) }
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); mocks.user.value = null
  vi.stubGlobal('Image', class { src = ''; decode = () => Promise.resolve() })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:authorized-feedback') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  const bytes = async () => ({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) })
  mocks.sessionFetch.mockImplementation(bytes); mocks.fetch.mockImplementation(bytes); vi.stubGlobal('fetch', mocks.fetch)
  mocks.get.mockResolvedValue({ code: 0, data: collection }); mocks.publicGet.mockResolvedValue({ code: 0, data: collection }); mocks.publicClient.mockReturnValue({ get: mocks.publicGet })
  mocks.report.mockResolvedValue({ code: 0, data: composite }); mocks.teacherReport.mockResolvedValue({ code: 0, data: composite })
  mocks.status.mockResolvedValue({ code: 0, data: { reportStatus: { state: 'READY' } } }); mocks.snapshots.mockResolvedValue({ code: 0, data: { list: [] } })
})
afterEach(() => vi.unstubAllGlobals())
describe('actual report page feedback image transport wiring (DOM, not browser visual acceptance)', () => {
  it('uses the own questionnaire report route rather than nested standalone assessment authority', async () => {
    mount('/student/questionnaires/assessment/report', '/student/questionnaires/:assessmentId/report', <QuestionnaireResult />)
    expect(await screen.findByAltText('冻结反馈图')).toHaveAttribute('src', 'blob:authorized-feedback')
    expect(mocks.sessionFetch).toHaveBeenCalledExactlyOnceWith('/api/questionnaires/assessments/assessment/report/assets/asset')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('keeps anonymous questionnaire resume proof out of URL and omits session cookies', async () => {
    sessionStorage.setItem('questionnaire_resume_entry', JSON.stringify({ sessionId: 'session', resumeToken: 'test-resume-proof' }))
    mount('/public/questionnaire/entry/result?sessionId=session', '/public/questionnaire/:token/result', <PublicQuestionnaireResult />)
    await screen.findByAltText('冻结反馈图')
    expect(mocks.publicClient).toHaveBeenCalledWith('test-resume-proof')
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('/api/public/assessments/session/report/assets/asset', { credentials: 'omit', headers: { Authorization: 'Bearer test-resume-proof' } })
    expect(mocks.sessionFetch).not.toHaveBeenCalled()
  })
  it('uses public composite report authority with the same recovery header', async () => {
    sessionStorage.setItem('composite:recovery:attempt:attempt', 'test-recovery-proof')
    mount('/public/composite/attempts/attempt/report', '/public/composite/attempts/:attemptId/report', <CompositeReportPage />)
    await screen.findByAltText('冻结反馈图')
    expect(mocks.sessionFetch).toHaveBeenCalledExactlyOnceWith('/api/public/composite-assessments/attempts/attempt/report/assets/asset', { headers: { 'X-Recovery-Token': 'test-recovery-proof' } })
  })
  it('preserves staff composite and frozen snapshot selection for report images', async () => {
    mocks.user.value = { role: 'TEACHER' }
    mount('/composite-assessments/questionnaire/attempts/attempt/report?snapshotId=frozen-snapshot', '/composite-assessments/:id/attempts/:attemptId/report', <CompositeReportPage />)
    await screen.findByAltText('冻结反馈图')
    expect(mocks.teacherReport).toHaveBeenCalledWith('questionnaire', 'attempt', 'frozen-snapshot')
    expect(mocks.sessionFetch).toHaveBeenCalledExactlyOnceWith('/api/composite-assessments/questionnaire/attempts/attempt/report/assets/asset?snapshotId=frozen-snapshot', {})
  })
})
