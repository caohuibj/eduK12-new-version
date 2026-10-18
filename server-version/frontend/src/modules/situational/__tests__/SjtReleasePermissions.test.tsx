import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionFetch } from '../../../api/client'
import { SjtReleasePermissions, type SjtControlledRelease, type SjtCourseGrant } from '../SjtReleasePermissions'

vi.mock('../../../api/client', () => ({ sessionFetch: vi.fn() }))
const grant = (permission: SjtCourseGrant['permission'] = 'ADAPT'): SjtCourseGrant => ({ id: 'grant-1', version: 3, granteeTeacherId: 'teacher-1', courseId: 'course-1', permission, status: 'ACTIVE', validFrom: '2020-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' })
const release = (grants = [grant()]): SjtControlledRelease => ({ id: 'release-1', instrumentKey: 'source', instrumentVersion: '2.0.0', definitionHash: 'a'.repeat(64), contentDigest: 'b'.repeat(64), authorizationPolicy: 'COURSE_GRANT_V1', status: 'PUBLISHED', grants })
const json = (data: unknown, ok = true) => ({ ok, json: async () => ({ code: ok ? 0 : 1, data, message: ok ? 'ok' : '精确版本授权已变化' }) }) as Response
beforeEach(() => vi.resetAllMocks())
async function choose() {
  await screen.findByRole('option', { name: 'source · 2.0.0 · 已发布' })
  fireEvent.change(screen.getByLabelText('选择受控发布版本'), { target: { value: 'release-1' } })
}
describe('explicit release course grants', () => {
  it('creates a grant with exact server release identity, one course and an explicit expiry', async () => {
    vi.mocked(sessionFetch).mockImplementation(async (_url, init) => init?.method === 'POST' ? json(grant('DISTRIBUTE')) : json([release([])]))
    render(<SjtReleasePermissions admin userId="admin" onAdapt={vi.fn()}/>)
    await choose()
    fireEvent.change(screen.getByLabelText('培训师用户 ID'), { target: { value: 'teacher-1' } })
    fireEvent.change(screen.getByLabelText('课程 ID'), { target: { value: 'course-1' } })
    fireEvent.change(screen.getByLabelText('生效时间（本地时区）'), { target: { value: '2020-01-01T00:00' } })
    fireEvent.change(screen.getByLabelText('到期时间（本地时区）'), { target: { value: '2099-01-01T00:00' } })
    fireEvent.change(screen.getByLabelText('授权说明'), { target: { value: '批准本课程分发' } })
    fireEvent.click(screen.getByRole('button', { name: '保存课程授权' }))
    await screen.findByText('课程授权已保存。')
    const [, init] = vi.mocked(sessionFetch).mock.calls.find(([url]) => String(url).endsWith('/release-1/grants'))!
    expect(JSON.parse(init!.body as string)).toEqual({ instrumentKey: 'source', instrumentVersion: '2.0.0', definitionHash: 'a'.repeat(64), contentDigest: 'b'.repeat(64), granteeTeacherId: 'teacher-1', courseId: 'course-1', purpose: 'TRAINING_COURSE', permission: 'DISTRIBUTE', validFrom: new Date('2020-01-01T00:00').toISOString(), expiresAt: new Date('2099-01-01T00:00').toISOString(), note: '批准本课程分发' })
  })
  it('adapts only the selected own valid ADAPT grant into a new draft', async () => {
    const onAdapt = vi.fn().mockResolvedValue(undefined)
    vi.mocked(sessionFetch).mockImplementation(async (_url, init) => init?.method === 'POST' ? json({ id: 'adapted-draft' }) : json([release()]))
    render(<SjtReleasePermissions admin={false} userId="teacher-1" onAdapt={onAdapt}/>)
    await choose()
    fireEvent.change(screen.getByLabelText('使用改编授权'), { target: { value: 'grant-1' } })
    fireEvent.change(screen.getByLabelText('新题包标识'), { target: { value: 'new-course-sjt' } })
    fireEvent.click(screen.getByRole('button', { name: '创建改编草稿' }))
    await waitFor(() => expect(onAdapt).toHaveBeenCalledWith('adapted-draft'))
    const [, init] = vi.mocked(sessionFetch).mock.calls.find(([url]) => String(url).endsWith('/release-1/adapt'))!
    expect(JSON.parse(init!.body as string)).toEqual({ instrumentKey: 'source', instrumentVersion: '2.0.0', definitionHash: 'a'.repeat(64), contentDigest: 'b'.repeat(64), courseId: 'course-1', grantId: 'grant-1', grantVersion: 3, newInstrumentKey: 'new-course-sjt', newInstrumentVersion: '1.0.0' })
    expect(screen.queryByText('授予指定课程权限')).not.toBeInTheDocument()
  })
  it.each(['DISTRIBUTE', 'REVOKED', 'EXPIRED', 'OTHER_TEACHER'] as const)('does not offer adaptation for %s', async variant => {
    const g = grant()
    if (variant === 'DISTRIBUTE') g.permission = 'DISTRIBUTE'
    if (variant === 'REVOKED') g.status = 'REVOKED'
    if (variant === 'EXPIRED') g.expiresAt = '2021-01-01T00:00:00.000Z'
    if (variant === 'OTHER_TEACHER') g.granteeTeacherId = 'teacher-2'
    vi.mocked(sessionFetch).mockResolvedValue(json([release([g])]))
    render(<SjtReleasePermissions admin={false} userId="teacher-1" onAdapt={vi.fn()}/>)
    await choose()
    expect(screen.queryByRole('button', { name: '创建改编草稿' })).not.toBeInTheDocument()
  })
  it('revokes with the current grant version and shows conflicts without claiming success', async () => {
    vi.mocked(sessionFetch).mockImplementation(async (_url, init) => init?.method === 'POST' ? json(null, false) : json([release()]))
    render(<SjtReleasePermissions admin userId="admin" onAdapt={vi.fn()}/>)
    await choose()
    fireEvent.change(screen.getByLabelText('撤销说明'), { target: { value: '课程授权结束' } })
    fireEvent.click(screen.getByRole('button', { name: '撤销此授权' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('精确版本授权已变化')
    const [, init] = vi.mocked(sessionFetch).mock.calls.find(([url]) => String(url).endsWith('/grant-1/revoke'))!
    expect(JSON.parse(init!.body as string)).toEqual({ version: 3, note: '课程授权结束' })
    expect(screen.queryByText(/授权已撤销/)).not.toBeInTheDocument()
  })
})
