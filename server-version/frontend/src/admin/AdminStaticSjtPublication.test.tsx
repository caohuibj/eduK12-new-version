import {beforeEach, it, expect, vi} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import AdminContentPermissions from './AdminContentPermissions'
const mocks = vi.hoisted(() => ({get: vi.fn(), post: vi.fn()}))
vi.mock('../api/client', () => ({default: mocks}))
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const mapping = {instrumentKey: 'installed-sjt', instrumentVersion: '1.2.0', mappingId: id(2), contentDigest: 'source-digest', measurementReleaseId: null}
const published = {mappingId: id(2), measurementReleaseId: id(3), contentHash: 'measurement-hash', status: 'PUBLISHED'}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), {target: {value}})
function openSjt(){const summary=screen.getByText('已安装 SJT 发布准备');if(!summary.closest('details')?.open)fireEvent.click(summary)}
const click = (name: string) => {openSjt();fireEvent.click(screen.getByRole('button', {name}))}
function source() { openSjt(); change('来源 instrumentKey', 'installed-sjt'); change('来源 instrumentVersion', '1.2.0') }
async function prepare() { source(); click('准备精确 SJT 来源'); await screen.findByRole('button', {name: '确认发布 SJT 测量版本'}) }
function deployment() {
  change('SJT 发布授权 UUID', id(4)); change('部署语言 locale', 'zh-CN'); change('科学适用地域 territory', 'CN')
}
beforeEach(() => {
  vi.restoreAllMocks(); sessionStorage.clear(); mocks.get.mockReset(); mocks.post.mockReset()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  mocks.post.mockImplementation(async (url, body) => ({data: url.endsWith('/prepare') ? mapping : url.endsWith('/publish') ? published : {grantId: body.requestId, version: 1}}))
})
it('prepares an exact source, requires a separate explicit grant, and publishes only the exact deployment locale and territory', async () => {
  render(<AdminContentPermissions actorId={id(9)}/>); expect(mocks.post).not.toHaveBeenCalled(); expect(mocks.get).not.toHaveBeenCalled()
  await prepare()
  expect(mocks.post).toHaveBeenCalledWith('/admin/permissions/static-sjt/prepare', {instrumentKey: 'installed-sjt', instrumentVersion: '1.2.0'})
  expect(mocks.post).toHaveBeenCalledTimes(1); click('将此来源填入根授权表单')
  expect(screen.getByLabelText('目标系统管理员 UUID')).toHaveValue(id(9)); expect(screen.getByLabelText('精确资源 UUID（逗号或换行分隔）')).toHaveValue(id(2))
  expect(screen.queryByLabelText('reference.review')).not.toBeInTheDocument(); expect(screen.queryByLabelText('课程 UUID')).not.toBeInTheDocument()
  expect(mocks.post).toHaveBeenCalledTimes(1)
  change('生效时间（本地时间）', '2098-10-20T06:00'); change('到期时间（本地时间）', '2098-10-21T06:00'); change('内容授权原因', 'Exact installed source publication')
  click('确认签发内容授权'); await screen.findByRole('button', {name: '使用刚签发的 SJT 授权'})
  const grant = mocks.post.mock.calls[1][1]
  expect(grant.grant).toMatchObject({subjectId: id(9), scope: {product: 'TRAINING', scopeKind: 'PLATFORM', scopeId: 'situational-registry', resourceKind: 'measurement', resourceKeys: [id(2)]}, capabilities: ['measurement.publish'], delegableCapabilities: []})
  deployment(); click('使用刚签发的 SJT 授权'); click('确认发布 SJT 测量版本'); await screen.findByText(/发布已确认：测量 release/)
  expect(mocks.post.mock.calls[2]).toEqual(['/admin/permissions/static-sjt/publish', {mappingId: id(2), grantId: grant.requestId, deployment: {locale: 'zh-CN', territory: 'CN'}}])
  expect(screen.queryByRole('button', {name: '确认发布 SJT 测量版本'})).not.toBeInTheDocument(); expect(window.confirm).toHaveBeenCalledTimes(3)
})
it('cancellation or missing deployment choice does not publish', async () => {
  render(<AdminContentPermissions actorId={id(9)}/>); await prepare(); deployment(); change('部署语言 locale', ''); click('确认发布 SJT 测量版本')
  expect(mocks.post).toHaveBeenCalledTimes(1); change('部署语言 locale', 'zh-CN'); vi.mocked(window.confirm).mockReturnValue(false); click('确认发布 SJT 测量版本'); expect(mocks.post).toHaveBeenCalledTimes(1)
})
it('retains an unknown prepare body across remount, later denial, and actor switches', async () => {
  mocks.post.mockRejectedValueOnce(new Error('response lost')).mockRejectedValueOnce({status: 403, message: 'Forbidden'})
  const view = render(<AdminContentPermissions actorId={id(9)}/>); source(); click('准备精确 SJT 来源'); await screen.findByText(/来源已保留/)
  expect(screen.getByLabelText('来源 instrumentVersion')).toBeDisabled()
  view.rerender(<AdminContentPermissions actorId={id(8)}/>); expect(screen.getByLabelText('来源 instrumentKey')).toHaveValue(''); expect(screen.queryByRole('button', {name: '重试同一来源准备请求'})).not.toBeInTheDocument()
  view.rerender(<AdminContentPermissions actorId={id(9)}/>); expect(screen.getByLabelText('来源 instrumentVersion')).toHaveValue('1.2.0')
  click('重试同一来源准备请求'); await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2)); await screen.findByText(/来源已保留/)
  expect(screen.getByLabelText('来源 instrumentKey')).toBeDisabled(); expect(mocks.post.mock.calls[1]).toEqual(mocks.post.mock.calls[0])
  click('重试同一来源准备请求'); await screen.findByRole('button', {name: '确认发布 SJT 测量版本'}); expect(mocks.post.mock.calls[2]).toEqual(mocks.post.mock.calls[0])
})
it('locks and restores unknown publication through a later denial and key step-up', async () => {
  const view = render(<AdminContentPermissions actorId={id(9)}/>); await prepare(); deployment()
  mocks.post.mockRejectedValueOnce(new Error('response lost')); click('确认发布 SJT 测量版本'); await screen.findByText(/发布结果尚未确认/)
  const request = mocks.post.mock.calls[1]
  expect(screen.getByLabelText('科学适用地域 territory')).toBeDisabled(); expect(screen.queryByRole('button', {name: '准备另一精确来源'})).not.toBeInTheDocument()
  view.unmount(); render(<AdminContentPermissions actorId={id(9)}/>); expect(screen.getByLabelText('SJT 发布授权 UUID')).toHaveValue(id(4)); expect(screen.getByLabelText('科学适用地域 territory')).toHaveValue('CN')
  mocks.post.mockRejectedValueOnce({status: 403, message: '内容授权范围或当前身份无效'}); click('重试同一 SJT 发布请求'); await screen.findByText(/发布结果尚未确认/)
  expect(screen.getByLabelText('部署语言 locale')).toBeDisabled(); expect(mocks.post.mock.calls[2]).toEqual(request)
  mocks.post.mockRejectedValueOnce({status: 403, message: '需要最近的安全密钥验证'}); click('重试同一 SJT 发布请求'); await screen.findByText(/需要最近的安全密钥验证/); expect(mocks.post.mock.calls[3]).toEqual(request)
  click('重试同一 SJT 发布请求'); await screen.findByText(/发布已确认：测量 release/); expect(mocks.post.mock.calls[4]).toEqual(request)
  expect(JSON.parse(sessionStorage.getItem('admin-static-sjt:' + id(9))!).state.publish).toBeNull()
})
it('retains step-up requests but unlocks after a first definite deployment rejection without unknown history', async () => {
  render(<AdminContentPermissions actorId={id(9)}/>); await prepare(); deployment()
  mocks.post.mockRejectedValueOnce({status: 403, message: '需要最近的安全密钥验证'}); click('确认发布 SJT 测量版本'); await screen.findByText(/发布结果尚未确认/)
  mocks.post.mockRejectedValueOnce({status: 409, message: 'CONTENT_STATIC_SJT_DEPLOYMENT_MISMATCH'}); click('重试同一 SJT 发布请求'); await screen.findByText(/本次发布明确未执行/)
  expect(screen.getByLabelText('科学适用地域 territory')).not.toBeDisabled(); expect(mocks.post.mock.calls[2]).toEqual(mocks.post.mock.calls[1])
})
it('never confirms an inconsistent mapping or malformed publication response', async () => {
  render(<AdminContentPermissions actorId={id(9)}/>); source(); mocks.post.mockResolvedValueOnce({data: {...mapping, instrumentVersion: 'different'}})
  click('准备精确 SJT 来源'); await screen.findByText(/来源响应与精确请求不一致/); expect(screen.queryByRole('button', {name: '确认发布 SJT 测量版本'})).not.toBeInTheDocument()
  click('重试同一来源准备请求'); await screen.findByRole('button', {name: '确认发布 SJT 测量版本'}); deployment(); mocks.post.mockResolvedValueOnce({data: {...published, mappingId: id(7)}})
  click('确认发布 SJT 测量版本'); await screen.findByText(/发布响应与映射不一致/); expect(screen.queryByText(/发布已确认：测量 release/)).not.toBeInTheDocument(); expect(screen.getByLabelText('SJT 发布授权 UUID')).toBeDisabled()
})
it('warns on storage failures and protects unresolved publication from unload', async () => {
  render(<AdminContentPermissions actorId={id(9)}/>); await prepare(); deployment(); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  mocks.post.mockRejectedValueOnce(new Error('lost')); click('确认发布 SJT 测量版本'); await screen.findByText(/浏览器无法保存 SJT 待核对请求/)
  const event = new Event('beforeunload', {cancelable: true}); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); expect(screen.getByRole('button', {name: '重试同一 SJT 发布请求'})).toBeInTheDocument()
})
it('blocks mutations if saved state cannot safely restore', () => {
  sessionStorage.setItem('admin-static-sjt:' + id(9), '{broken'); render(<AdminContentPermissions actorId={id(9)}/>)
  openSjt();expect(screen.getByRole('button', {name: '准备精确 SJT 来源'})).toBeDisabled(); expect(screen.getByText(/无法恢复当前管理员的 SJT 请求/)).toBeInTheDocument(); expect(mocks.post).not.toHaveBeenCalled()
})
it('does not treat an existing source release as confirmation of a new deployment', async () => {
  mocks.post.mockResolvedValueOnce({data: {...mapping, measurementReleaseId: id(3)}})
  render(<AdminContentPermissions actorId={id(9)}/>); await prepare()
  expect(screen.getByText(/这不代表本次部署已核验/)).toBeInTheDocument()
  expect(screen.queryByText(/发布已确认：测量 release/)).not.toBeInTheDocument()
  click('确认发布 SJT 测量版本'); expect(mocks.post).toHaveBeenCalledTimes(1)
})
it('prevents duplicate clicks while a preparation request is in flight', async () => {
  let complete!: (value: unknown) => void
  mocks.post.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  render(<AdminContentPermissions actorId={id(9)}/>); source()
  const button = screen.getByRole('button', {name: '准备精确 SJT 来源'})
  fireEvent.click(button); fireEvent.click(button)
  expect(mocks.post).toHaveBeenCalledTimes(1)
  complete({data: mapping}); await screen.findByRole('button', {name: '确认发布 SJT 测量版本'})
})
it('does not rewrite or replay an uncertain legacy license-bearing request', () => {
  const legacy = {actorId: id(9), state: {source: {instrumentKey: 'installed-sjt', instrumentVersion: '1.2.0'}, mapping,
    preparePending: false, prepareUnknown: false, publishUnknown: true, result: null,
    publish: {mappingId: id(2), grantId: id(4), deployment: {locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL', grantee: 'legacy'}}}}
  const original = JSON.stringify(legacy)
  sessionStorage.setItem('admin-static-sjt:' + id(9), original)
  render(<AdminContentPermissions actorId={id(9)}/>); openSjt()
  expect(screen.getByRole('button', {name: '准备精确 SJT 来源'})).toBeDisabled()
  expect(screen.getByText(/无法恢复当前管理员的 SJT 请求/)).toBeInTheDocument()
  expect(sessionStorage.getItem('admin-static-sjt:' + id(9))).toBe(original)
  expect(mocks.post).not.toHaveBeenCalled()
})
