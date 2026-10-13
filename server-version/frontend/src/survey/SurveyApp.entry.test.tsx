import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SurveyApp from './SurveyApp'

vi.mock('./SurveyBuilder', () => ({ SurveyBuilder: () => null }))
vi.mock('./SurveyWaveStudio', () => ({ SurveyWaveStudio: () => null }))
vi.mock('./SurveyAnalyticsWorkspace', () => ({ SurveyAnalyticsWorkspace: () => null }))

const response = (data: unknown, ok = true, message = '请先登录') =>
  Promise.resolve({ ok, json: async () => ({ code: ok ? 0 : 401, message, data }) } as Response)

describe('Survey public entry and existing authentication transitions', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
    vi.stubGlobal('fetch', vi.fn(() => response(null, false)))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders the exact public copy immediately even while session lookup is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    render(<SurveyApp />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('风过有迹，细微可察。')
    expect(screen.getByText('从问题出发，').parentElement?.textContent).toBe('从问题出发，在数据中寻找理解的线索。')
    expect(screen.getByRole('link', { name: '研究者登录' })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('密码')).not.toBeInTheDocument()
  })

  it('offers authenticated users the existing workspace without loading project data on the public page', async () => {
    const fetcher = vi.fn(() => response({ id: 'researcher', username: 'existing-researcher' }))
    vi.stubGlobal('fetch', fetcher)
    render(<SurveyApp />)
    expect(await screen.findByRole('link', { name: '进入研究工作台' })).toHaveAttribute('href', '/workspace')
    expect(fetcher.mock.calls).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: '我的研究' })).not.toBeInTheDocument()
  })

  it('keeps direct workspace access behind the existing session lookup', async () => {
    window.history.replaceState(null, '', '/workspace')
    render(<SurveyApp />)
    expect(await screen.findByRole('heading', { name: 'Researcher 登录' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '我的研究' })).not.toBeInTheDocument()
  })

  it.each(['/features/research-projects', '/features/research-tools', '/features/research-participation', '/features/research-data'])(
    'serves the public introduction at %s without redirecting to researcher login', async entry => {
      window.history.replaceState(null, '', entry)
      render(<SurveyApp />)
      expect(screen.getByRole('main')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '返回平台介绍' })).toHaveAttribute('href', '/#survey-features')
      expect(screen.queryByRole('heading', { name: 'Researcher 登录' })).not.toBeInTheDocument()
    },
  )

  it('requires the existing MFA step before entering the workspace from login', async () => {
    window.history.replaceState(null, '', '/login')
    let verified = false
    const fetcher = vi.fn((path: string) => {
      if (path.endsWith('/csrf')) return response({ csrfToken: 'test-csrf' })
      if (path.endsWith('/login')) return response({ enrolled: true })
      if (path.endsWith('/mfa/verify')) { verified = true; return response({}) }
      if (path.includes('/projects?')) return response({ list: [] })
      if (path.endsWith('/capabilities')) return response({ analytics: false, publication: false })
      return verified ? response({ id: 'researcher', username: 'invited' }) : response(null, false)
    })
    vi.stubGlobal('fetch', fetcher)
    render(<SurveyApp />)
    await screen.findByRole('heading', { name: 'Researcher 登录' })
    fireEvent.change(screen.getByLabelText('研究者登录名'), { target: { value: 'invited' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'test-password' } })
    fireEvent.click(screen.getByRole('button', { name: '进入双因素验证' }))
    await screen.findByRole('heading', { name: '双因素验证' })
    expect(screen.queryByRole('heading', { name: '我的研究' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('动态验证码／恢复码'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }))
    expect(await screen.findByRole('heading', { name: '我的研究' })).toBeInTheDocument()
  })

  it.each([['/claim', '激活研究者身份', '/auth/claim'], ['/reset-password', '恢复 Survey 密码', '/auth/reset-password']])(
    'preserves %s activation and MFA after its token is removed from the URL', async (entry, heading, endpoint) => {
      window.history.replaceState(null, '', entry + '#token=one-time-test-token')
      let verified = false
      const fetcher = vi.fn((path: string) => {
        if (path.endsWith('/csrf')) return response({ csrfToken: 'test-csrf' })
        if (path.endsWith(endpoint)) return response({ enrolled: true })
        if (path.endsWith('/mfa/verify')) { verified = true; return response({}) }
        if (path.includes('/projects?')) return response({ list: [] })
        if (path.endsWith('/capabilities')) return response({ analytics: false, publication: false })
        return verified ? response({ id: 'researcher', username: 'invited' }) : response(null, false)
      })
      vi.stubGlobal('fetch', fetcher)
      render(<SurveyApp />)
      await screen.findByRole('heading', { name: heading })
      expect(screen.getByLabelText('一次性邀请凭证')).toHaveValue('one-time-test-token')
      if (entry === '/claim') fireEvent.change(screen.getByLabelText('研究者登录名'), { target: { value: 'invited' } })
      fireEvent.change(screen.getByLabelText('新密码（至少 8 位，字母与数字组合）'), { target: { value: 'test-password' } })
      fireEvent.click(screen.getByRole('button', { name: '确认并绑定验证器' }))
      await screen.findByRole('heading', { name: '双因素验证' })
      await waitFor(() => expect(window.location.hash).toBe(''))
      expect(window.location.pathname).toBe('/')
      fireEvent.change(screen.getByLabelText('动态验证码／恢复码'), { target: { value: '123456' } })
      fireEvent.click(screen.getByRole('button', { name: '验证并登录' }))
      expect(await screen.findByRole('heading', { name: '我的研究' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: '研究者登录' })).not.toBeInTheDocument()
    },
  )
})
