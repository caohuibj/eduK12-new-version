import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionFetch } from '../../../api/client'
import SjtAuthoring from '../pages/SjtAuthoring'
import { newOnlineDocument } from '../OnlineAuthorEditor'

vi.mock('../../../api/client', () => ({ sessionFetch: vi.fn() }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'author-1', role: 'TEACHER' } }) }))
const doc = () => ({ ...newOnlineDocument(), instrumentKey: 'online-new' })
const draft = (policy: 'COURSE_GRANT_V1' | null = null) => ({ id: 'draft-1', ownerId: 'author-1', revision: 2, status: 'DRAFT', contentDigest: 'digest', authorizationPolicy: policy, template: doc(), release: null })
const json = (data: unknown) => ({ ok: true, json: async () => ({ code: 0, data }) }) as Response
beforeEach(() => vi.resetAllMocks())
describe('SJT author workbench course policy', () => {
  it('makes the new course policy visible and sends it explicitly when creating an online draft', async () => {
    vi.mocked(sessionFetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith('/online/drafts') && init?.method === 'POST') return json(draft('COURSE_GRANT_V1'))
      if (String(url).endsWith('/drafts/draft-1')) return json(draft('COURSE_GRANT_V1'))
      return String(url).includes('/releases?') ? json({ items: [], nextCursor: null }) : json([])
    })
    render(<SjtAuthoring/>)
    fireEvent.click(screen.getByRole('button', { name: '在线创建图文题包' }))
    expect(screen.getByLabelText('题包发布策略')).toHaveValue('COURSE_GRANT_V1')
    fireEvent.click(screen.getByRole('button', { name: '保存在线新草稿' }))
    await screen.findByText('在线题包已保存。人工验收通过后可提交独立审核。')
    const [, init] = vi.mocked(sessionFetch).mock.calls.find(([url]) => String(url).endsWith('/online/drafts'))!
    expect(JSON.parse(init!.body as string)).toMatchObject({ authorizationPolicy: 'COURSE_GRANT_V1', template: { templateVersion: 'sjt-online-v1', goldenCases: [] } })
    expect(screen.getByLabelText('题包发布策略')).toBeDisabled()
  })
  it('preserves legacy null until an explicit CAS policy save, and does not silently downgrade a controlled draft', async () => {
    let controlled = false
    vi.mocked(sessionFetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith('/policy') && init?.method === 'PUT') { controlled = true; return json(draft('COURSE_GRANT_V1')) }
      if (String(url).endsWith('/drafts')) return json([draft(controlled ? 'COURSE_GRANT_V1' : null)])
      if (String(url).endsWith('/drafts/draft-1')) return json(draft(controlled ? 'COURSE_GRANT_V1' : null))
      return String(url).includes('/releases?') ? json({ items: [], nextCursor: null }) : json([])
    })
    render(<SjtAuthoring/>)
    fireEvent.click(await screen.findByRole('button', { name: '打开题包 online-new 1.0.0' }))
    await waitFor(() => expect(screen.getByLabelText('题包发布策略')).toHaveValue('LEGACY'))
    fireEvent.change(screen.getByLabelText('题包发布策略'), { target: { value: 'COURSE_GRANT_V1' } })
    expect(screen.getByRole('button', { name: '保存在线修订' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存课程授权策略' }))
    await screen.findByText('指定课程授权策略已保存，需重新审核。')
    const [, init] = vi.mocked(sessionFetch).mock.calls.find(([url]) => String(url).endsWith('/policy'))!
    expect(JSON.parse(init!.body as string)).toEqual({ revision: 2, authorizationPolicy: 'COURSE_GRANT_V1' })
    expect(screen.getByLabelText('题包发布策略')).toBeDisabled()
  })
})
