import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'

const { mockPublicApi, mockCompositeApi } = vi.hoisted(() => ({
  mockPublicApi: {
    info: vi.fn(),
    start: vi.fn(),
    getAttempt: vi.fn(),
    restart: vi.fn(),
  },
  mockCompositeApi: { start: vi.fn(), listAvailable: vi.fn() },
}))

vi.mock('../api', () => ({
  compositeApi: mockCompositeApi,
  publicCompositeApi: () => mockPublicApi,
}))

vi.mock('../../cognitive/core/recovery-credential', () => ({
  saveCognitiveRecoveryCredential: vi.fn(),
}))

import CompositeAssessmentPage from '../CompositeAssessmentPage'

const renderPublicPage = () =>
  render(
    <MemoryRouter initialEntries={['/public/composite/token-1']}>
      <Routes>
        <Route
          path="/public/composite/:token"
          element={<CompositeAssessmentPage />}
        />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  window.history.pushState({}, '', '/public/composite/token-1')
  window.sessionStorage.clear()
  mockPublicApi.info.mockResolvedValue({
    code: 0,
    data: {
      id: 'composite-1',
      name: '匿名综合测评',
      description: '说明',
      instruction: '请完成以下模块',
      expiresAt: '2030-01-01T00:00:00.000Z',
      maxUses: 0,
      usedCount: 0,
      items: [],
    },
  })
})

describe('CompositeAssessmentPage public entry', () => {
  it('shows the server window while a round query hint grants no credential or automatic start', async () => {
    mockPublicApi.info.mockResolvedValue({ code: 0, data: { name: '集体作答', roundId: 'server-round', groupIpWindow: {
      opensAt: '2026-10-19T00:00:00Z', closesAt: '2026-10-19T01:00:00Z',
    } } })
    render(<MemoryRouter initialEntries={['/public/composite/token-1?round=untrusted-hint']}><Routes>
      <Route path="/public/composite/:token" element={<CompositeAssessmentPage />} />
    </Routes></MemoryRouter>)
    expect(await screen.findByText(/同 IP 集体作答窗口：/)).toHaveTextContent('最长 48 小时')
    expect(screen.getByText(/同 IP 集体作答窗口：/)).toHaveTextContent('已有恢复凭证仍按原作答规则恢复')
    expect(screen.getByPlaceholderText('粘贴保存时获得的恢复凭证（可选）')).toHaveValue('')
    expect(mockPublicApi.info).toHaveBeenCalledWith('token-1')
    expect(mockPublicApi.start).not.toHaveBeenCalled()
  })
  it('clears the previous entry and credential when switching to a closed link in the same page', async () => {
    mockPublicApi.info.mockImplementation((token: string) => Promise.resolve(token === 'token-1'
      ? { code: 0, data: { name: '原开放入口', studyEntryPath: '/public/studies/waves/old/token-1' } }
      : { code: -1, message: '综合测评未开放公开参与', data: null }))
    render(<MemoryRouter initialEntries={['/public/composite/token-1']}>
      <Link to="/public/composite/closed">切换到已停用入口</Link>
      <Routes><Route path="/public/composite/:token" element={<CompositeAssessmentPage />} /></Routes>
    </MemoryRouter>)
    const user = userEvent.setup()
    await screen.findByRole('link', { name: '选择单次访客或保存研究内身份码' })
    await user.type(screen.getByPlaceholderText('粘贴保存时获得的恢复凭证（可选）'), 'previous-credential')
    await user.click(screen.getByRole('link', { name: '切换到已停用入口' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('未开放公开参与')
    expect(screen.getByRole('button', { name: '开始匿名测评' })).toBeDisabled()
    expect(screen.getByPlaceholderText('粘贴保存时获得的恢复凭证（可选）')).toHaveValue('')
    expect(screen.queryByRole('link', { name: '选择单次访客或保存研究内身份码' })).not.toBeInTheDocument()
    expect(mockPublicApi.start).not.toHaveBeenCalled()
  })
  it('disables a closed entry while allowing an explicit credential recovery', async () => {
    mockPublicApi.info.mockResolvedValue({ code: -1, message: '综合测评未开放公开参与', data: null })
    mockPublicApi.start.mockRejectedValue({ message: '凭证不属于此链接' })
    renderPublicPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('未开放公开参与')
    expect(screen.getByRole('button', { name: '开始匿名测评' })).toBeDisabled()
    expect(mockPublicApi.start).not.toHaveBeenCalled()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('粘贴保存时获得的恢复凭证（可选）'), 'saved-recovery')
    await user.click(screen.getByRole('button', { name: '继续作答' }))
    await waitFor(() => expect(mockPublicApi.start).toHaveBeenCalledWith('token-1', 'saved-recovery'))
  })
  it('makes study identity selection discoverable from a bound ordinary link', async () => {
    mockPublicApi.info.mockResolvedValue({ code: 0, data: { name: '波次测评', studyEntryPath: '/public/studies/waves/wave/token-1' } })
    renderPublicPage()
    expect(await screen.findByRole('link', { name: '选择单次访客或保存研究内身份码' })).toHaveAttribute('href', '/public/studies/waves/wave/token-1')
    expect(mockPublicApi.start).not.toHaveBeenCalled()
  })
  it('only loads public info until the participant explicitly starts', async () => {
    const user = userEvent.setup()
    mockPublicApi.start.mockResolvedValue({
      code: 0,
      data: {
        recoveryToken: 'recovery-1',
        attempt: {
          id: 'attempt-1',
          assessmentId: 'composite-1',
          name: '匿名综合测评',
          instruction: '请完成以下模块',
          status: 'IN_PROGRESS',
          progress: 0,
          completedItems: 0,
          totalItems: 0,
          currentIndex: 0,
          startedAt: '2030-01-01T00:00:00.000Z',
          lastSavedAt: '2030-01-01T00:00:00.000Z',
          completedAt: null,
          anonymousCode: 'ANON-1',
          items: [],
          currentItem: null,
        },
      },
    })

    renderPublicPage()

    expect(
      await screen.findByRole('button', { name: /开始匿名测评/ }),
    ).toBeInTheDocument()
    expect(mockPublicApi.info).toHaveBeenCalledWith('token-1')
    expect(mockPublicApi.start).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /开始匿名测评/ }))
    await waitFor(() => expect(mockPublicApi.start).toHaveBeenCalledTimes(1))
    expect(mockPublicApi.start).toHaveBeenCalledWith('token-1', undefined)
  })
})

it('offers the already completed report when authenticated participation attempts are exhausted', async () => {
  window.history.pushState({}, '', '/student/composite/c1')
  mockCompositeApi.start.mockRejectedValue(new Error('已达到综合测评最大次数'))
  mockCompositeApi.listAvailable.mockResolvedValue({
    code: 0,
    data: {
      list: [{ id: 'c1', latestCompletedAttempt: { id: 'completed-1' } }],
    },
  })
  render(
    <MemoryRouter initialEntries={['/student/composite/c1']}>
      <Routes>
        <Route
          path="/student/composite/:assessmentId"
          element={<CompositeAssessmentPage />}
        />
        <Route
          path="/student/composite/attempts/:attemptId/report"
          element={<p>已有报告</p>}
        />
      </Routes>
    </MemoryRouter>,
  )
  expect(
    await screen.findByText('本次测评的参与次数已用尽'),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '返回任务列表' })).toHaveAttribute(
    'href',
    '/student',
  )
  await userEvent.click(screen.getByRole('button', { name: '查看已有结果' }))
  expect(await screen.findByText('已有报告')).toBeInTheDocument()
})

it('does not offer the previous assessment report after switching assessment routes', async () => {
  window.history.pushState({}, '', '/student/composite/c1')
  mockCompositeApi.start.mockRejectedValue(new Error('已达到综合测评最大次数'))
  mockCompositeApi.listAvailable.mockResolvedValue({
    code: 0,
    data: {
      list: [
        { id: 'c1', latestCompletedAttempt: { id: 'completed-1' } },
        { id: 'c2' },
      ],
    },
  })
  render(
    <MemoryRouter initialEntries={['/student/composite/c1']}>
      <Link to="/student/composite/c2">切换测评</Link>
      <Routes>
        <Route
          path="/student/composite/:assessmentId"
          element={<CompositeAssessmentPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('button', { name: '查看已有结果' })
  fireEvent.click(screen.getByText('切换测评'))
  await waitFor(() =>
    expect(mockCompositeApi.listAvailable).toHaveBeenCalledTimes(2),
  )
  expect(screen.queryByRole('button', { name: '查看已有结果' })).toBeNull()
})
it('does not redirect to a completed attempt after the participant leaves the page', async () => {
  window.history.pushState({}, '', '/student/composite/c1')
  let finish!: (value: unknown) => void
  mockCompositeApi.start.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  render(
    <MemoryRouter initialEntries={['/student/composite/c1']}>
      <Link to="/elsewhere">离开测评</Link>
      <Routes>
        <Route
          path="/student/composite/:assessmentId"
          element={<CompositeAssessmentPage />}
        />
        <Route path="/elsewhere" element={<p>其他页面</p>} />
        <Route
          path="/student/composite/attempts/:id/report"
          element={<p>旧测评报告</p>}
        />
      </Routes>
    </MemoryRouter>,
  )
  await waitFor(() => expect(mockCompositeApi.start).toHaveBeenCalledWith('c1'))
  fireEvent.click(screen.getByText('离开测评'))
  await act(async () =>
    finish({ code: 0, data: { attempt: { id: 'old', status: 'COMPLETED' } } }),
  )
  expect(screen.getByText('其他页面')).toBeInTheDocument()
})

it('routes a completed unsatisfied attempt to its report without restarting or reopening it', async () => {
  window.history.pushState({}, '', '/student/composite/q')
  mockCompositeApi.start.mockResolvedValue({ code: 0, data: { attempt: { id: 'submitted', productKind: 'QUESTIONNAIRE', status: 'COMPLETED', taskSatisfied: false, deliveryMode: 'FINAL_ONLY' } } })
  render(<MemoryRouter initialEntries={['/student/composite/q']}><Routes>
    <Route path="/student/composite/:assessmentId" element={<CompositeAssessmentPage />} />
    <Route path="/student/composite/attempts/:attemptId/report" element={<p>已交卷报告入口</p>} />
  </Routes></MemoryRouter>)
  expect(await screen.findByText('已交卷报告入口')).toBeInTheDocument()
  expect(mockCompositeApi.start).toHaveBeenCalledTimes(1)
  expect(mockPublicApi.start).not.toHaveBeenCalled()
})

describe('C19 server-computed terminal paths', () => {
  it('keeps terminal materials and NOT_SATISFIED visible before explicit report navigation', async () => {
    mockPublicApi.start.mockResolvedValue({ code: 0, data: { recoveryToken: 'recovery-flow', attempt: {
      id: 'flow-attempt', assessmentId: 'composite-1', name: '条件课程', instruction: null,
      status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', productKind: 'QUESTIONNAIRE',
      taskSatisfaction: 'NOT_SATISFIED', taskSatisfied: false, allUnitsSubmitted: true,
      progress: 100, completedItems: 1, totalItems: 1, currentIndex: 1,
      startedAt: '2026-10-18T00:00:00Z', lastSavedAt: '2026-10-18T00:00:00Z', completedAt: '2026-10-18T00:01:00Z', anonymousCode: 'ANON', items: [], currentItem: null,
      trainingFlow: { termination: 'SCREEN_OUT', currentInstrumentKey: null, pathHash: 'server-path', materials: [{ blockKey: 'conclusion', kind: 'MATERIAL', title: '结束材料', body: '本次流程说明' }] },
    } } })
    render(<MemoryRouter initialEntries={['/public/composite/token-1']}><Routes>
      <Route path="/public/composite/:token" element={<CompositeAssessmentPage />} />
      <Route path="/public/composite/attempts/:id/report" element={<p>个人报告页面</p>} />
    </Routes></MemoryRouter>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '开始匿名测评' }))
    expect(await screen.findByRole('heading', { name: '结束材料' })).toBeInTheDocument()
    expect(screen.queryByText('个人报告页面')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '继续' }))
    expect(screen.getByRole('heading', { name: '交卷已结束' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('任务未达成')
    await user.click(screen.getByRole('button', { name: '查看本次结果' }))
    expect(await screen.findByText('个人报告页面')).toBeInTheDocument()
  })
})

describe('C20 anonymous restart credential rotation', () => {
  const oldAttempt = { id: 'old-attempt', status: 'IN_PROGRESS', deliveryMode: 'LEGACY', items: [], currentItem: null }
  beforeEach(() => {
    window.history.pushState({}, '', '/public/composite/attempts/old-attempt')
    sessionStorage.setItem('composite:recovery:attempt:old-attempt', 'old-secret')
    sessionStorage.setItem('composite:recovery:token:entry', 'old-secret')
    sessionStorage.setItem('composite:recovery:token:unrelated', 'other-secret')
    mockPublicApi.getAttempt.mockImplementation(async (id: string) => ({ code: 0, data: { ...oldAttempt, id } }))
  })
  it('stores the rotated credential and replaces only its associated cached keys after success', async () => {
    mockPublicApi.restart.mockResolvedValue({ code: 0, data: { attempt: { id: 'new-attempt' }, recoveryToken: 'new-secret' } })
    // A named attempt param is required by the existing recovery route.
    render(<MemoryRouter initialEntries={['/public/composite/attempts/old-attempt']}><Routes>
      <Route path="/public/composite/attempts/:attemptId" element={<CompositeAssessmentPage />} />
    </Routes></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '重启并继续作答' }))
    await waitFor(() => expect(sessionStorage.getItem('composite:recovery:attempt:new-attempt')).toBe('new-secret'))
    expect(mockPublicApi.getAttempt).toHaveBeenCalledWith('old-attempt', 'current-unit')
    expect(mockPublicApi.restart).toHaveBeenCalledWith('old-attempt')
    expect(sessionStorage.getItem('composite:recovery:attempt:old-attempt')).toBeNull()
    expect(sessionStorage.getItem('composite:recovery:token:entry')).toBe('new-secret')
    expect(sessionStorage.getItem('composite:recovery:token:unrelated')).toBe('other-secret')
    expect(sessionStorage.getItem('composite:recovery:token:')).toBeNull()
  })
  it('keeps old cached credentials intact if restart fails', async () => {
    mockPublicApi.restart.mockRejectedValue(new Error('重启失败'))
    render(<MemoryRouter initialEntries={['/public/composite/attempts/old-attempt']}><Routes>
      <Route path="/public/composite/attempts/:attemptId" element={<CompositeAssessmentPage />} />
    </Routes></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: '重启并继续作答' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('重启失败')
    expect(sessionStorage.getItem('composite:recovery:attempt:old-attempt')).toBe('old-secret')
    expect(sessionStorage.getItem('composite:recovery:token:entry')).toBe('old-secret')
  })
})

it('recovers the exact single attempt from its scoped fragment without starting or linking another identity',async()=>{
 const key='a'.repeat(43)
 mockPublicApi.getAttempt.mockResolvedValue({code:-1,message:'Synthetic authority response'})
 render(<MemoryRouter initialEntries={[`/public/composite/attempts/attempt-one#resume=training-attempt&key=${key}`]}><Routes>
  <Route path="/public/composite/attempts/:attemptId" element={<CompositeAssessmentPage/>}/>
 </Routes></MemoryRouter>)
 await waitFor(()=>expect(mockPublicApi.getAttempt).toHaveBeenCalledWith('attempt-one','current-unit'))
 expect(sessionStorage.getItem('composite:recovery:attempt:attempt-one')).toBe(key)
 expect(mockPublicApi.start).not.toHaveBeenCalled()
})
it('does not accept a study or Survey fragment as a single attempt credential',async()=>{
 render(<MemoryRouter initialEntries={[`/public/composite/attempts/attempt-one#resume=training-study&key=${'a'.repeat(43)}`]}><Routes>
  <Route path="/public/composite/attempts/:attemptId" element={<CompositeAssessmentPage/>}/>
 </Routes></MemoryRouter>)
 expect(await screen.findByRole('alert')).toHaveTextContent('请输入恢复凭证后继续匿名测评。请保留原恢复凭据，未能读取不代表原答案已丢失。')
 expect(mockPublicApi.getAttempt).not.toHaveBeenCalled()
 expect(mockPublicApi.start).not.toHaveBeenCalled()
})

it('announces anonymous entry loading without automatically starting another attempt',async()=>{
 let finish!:(value:unknown)=>void
 mockPublicApi.info.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}))
 renderPublicPage()
 expect(screen.getByRole('status')).toHaveTextContent('正在核对本次作答与恢复凭据')
 expect(screen.getByRole('region',{name:'正在恢复匿名测评'})).toHaveTextContent('不会自动创建另一份作答')
 expect(mockPublicApi.start).not.toHaveBeenCalled()
 await act(async()=>{finish({code:0,data:{name:'匿名测试',items:[]}})})
 expect(await screen.findByRole('button',{name:'开始匿名测评'})).toBeEnabled()
})
it('masks the anonymous recovery input and retains it after an uncertain entry failure',async()=>{
 let reject!:(reason:unknown)=>void
 mockPublicApi.start.mockReturnValueOnce(new Promise((_resolve,rejectPromise)=>{reject=rejectPromise}))
 renderPublicPage();const field=await screen.findByLabelText('已有恢复凭证？')
 expect(field).toHaveAttribute('type','password');expect(field).toHaveAttribute('autocomplete','off')
 fireEvent.change(field,{target:{value:'original-recovery-proof'}})
 fireEvent.click(screen.getByRole('button',{name:'继续作答'}))
 expect(screen.getByRole('status')).toHaveTextContent('正在确认本次进入请求')
 expect(field).toBeDisabled()
 await act(async()=>{reject(new Error('temporary network failure'))})
 expect(await screen.findByRole('alert')).toHaveTextContent('请保留原恢复凭据')
 expect(field).toHaveValue('original-recovery-proof')
 expect(mockPublicApi.start).toHaveBeenCalledWith('token-1','original-recovery-proof')
 expect(mockPublicApi.start).toHaveBeenCalledTimes(1)
})
it('keeps the anonymous save panel as the sole recovery presentation instead of a duplicate raw secret',async()=>{
 const credential='r'.repeat(43),id='11111111-1111-4111-8111-111111111111'
 mockPublicApi.start.mockResolvedValueOnce({code:0,data:{recoveryToken:credential,attempt:{
  id,assessmentId:'assessment',name:'匿名测评',status:'IN_PROGRESS',progress:0,completedItems:0,totalItems:0,currentIndex:0,items:[],currentItem:null,anonymousCode:'ANON-DISPLAY',
 }}})
 renderPublicPage();fireEvent.click(await screen.findByRole('button',{name:'开始匿名测评'}))
 expect(await screen.findByText('保存本次匿名作答的恢复链接')).toBeInTheDocument()
 expect((screen.getByLabelText('专属链接地址') as HTMLTextAreaElement).value).toContain(credential)
 expect(screen.queryByText(credential,{exact:true})).not.toBeInTheDocument()
 expect(screen.getByText(/未提交草稿仍受本机保存规则限制/)).toHaveTextContent('ANON-DISPLAY')
 expect(mockPublicApi.start).toHaveBeenCalledTimes(1)
})
