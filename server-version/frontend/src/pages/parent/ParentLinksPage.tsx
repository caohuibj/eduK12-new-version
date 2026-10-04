import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { parentsApi } from '../../api/parents'
import { useAuth } from '../../contexts/AuthContext'
import {
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import ParentFeature from './ParentFeature'
import { parentError, useParentResource } from './useParentResource'
const labels = { PENDING: '待学生确认', ACTIVE: '已关联', REVOKED: '已解除' }
function Content() {
  const { user } = useAuth(),
    student = user?.role === 'STUDENT'
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [links, consent, sources] = await Promise.all([
        parentsApi.links(signal),
        parentsApi.consentText(signal),
        student
          ? parentsApi.invitationSources(signal)
          : Promise.resolve({ list: [], truncated: false }),
      ])
      return { links, consent, sources }
    },
    [student],
  )
  const { data, error, loading, reload } = useParentResource(
    'parent-links',
    load,
  )
  const [source, setSource] = useState(''),
    [claim, setClaim] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [failure, setFailure] = useState(''),
    [invite, setInvite] = useState<{
      inviteCode: string
      expiresAt: string
    } | null>(null)
  const lock = useRef(false),
    owner = useRef(user?.id)
  const epoch = useRef(0)
  useEffect(() => {
    const clear = () => {
      epoch.current++
      setInvite(null)
      setClaim('')
    }
    window.addEventListener('focus', clear)
    return () => {
      clear()
      window.removeEventListener('focus', clear)
    }
  }, [])
  owner.current = user?.id
  const act = async (action: () => Promise<unknown>, notice: string) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setFailure('')
    setMessage('')
    const identity = owner.current,
      at = epoch.current
    try {
      await action()
      if (owner.current === identity && epoch.current === at) {
        setMessage(notice)
        reload()
      }
    } catch (err) {
      if (owner.current === identity && epoch.current === at) {
        setFailure(parentError(err, '操作未确认，请刷新列表后重试'))
        setInvite(null)
      }
    } finally {
      lock.current = false
      if (owner.current === identity) setBusy(false)
    }
  }
  if (loading)
    return (
      <ProductStatus kind="pending" title="正在加载关联">
        请稍候。
      </ProductStatus>
    )
  if (error || !data)
    return (
      <ProductStatus
        kind="error"
        title="关联加载失败"
        actions={<ProductButton onClick={reload}>重试</ProductButton>}
      >
        {error}
      </ProductStatus>
    )
  return (
    <div className="space-y-6">
      <p className="text-slate-600">
        关联需要学生确认。每份孩子报告还需学生同意，并由报告负责人授权。
      </p>
      {failure && (
        <ProductStatus
          kind="error"
          title="操作未完成"
          actions={<ProductButton onClick={reload}>刷新列表</ProductButton>}
        >
          {failure}
        </ProductStatus>
      )}
      {message && (
        <ProductStatus kind="success" title="操作完成">
          {message}
        </ProductStatus>
      )}
      {data.links.canInvite && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="font-semibold">邀请家长</h2>
          {data.sources.list.length ? (
            <>
              <label className="block">
                邀请来源
                <select
                  className="input mt-1"
                  value={source}
                  disabled={busy}
                  onChange={(e) => {
                    setSource(e.target.value)
                    setInvite(null)
                  }}
                >
                  <option value="">选择组织或课程</option>
                  {data.sources.list.map((row) => (
                    <option
                      key={`${row.kind}:${row.id}`}
                      value={`${row.kind}:${row.id}`}
                    >
                      {row.title}（
                      {row.kind === 'ORGANIZATION' ? '组织' : '课程'}）
                    </option>
                  ))}
                </select>
              </label>
              <ProductButton
                disabled={busy || !source}
                onClick={() =>
                  void act(async () => {
                    const [kind, id] = source.split(':')
                    const identity = owner.current,
                      at = epoch.current
                    const result = await parentsApi.invite(
                      kind === 'ORGANIZATION'
                        ? { organizationId: id }
                        : { courseId: id },
                    )
                    if (owner.current === identity && epoch.current === at)
                      setInvite(result)
                  }, '邀请码已生成，请交给需要关联的家长')
                }
              >
                生成家长邀请码
              </ProductButton>
            </>
          ) : (
            <p>暂无可用来源，请联系学校确认您的组织学生身份或课程资格。</p>
          )}
          {data.sources.truncated && (
            <p>来源较多，请联系学校核对所需组织或课程。</p>
          )}
          {invite && (
            <div role="status" className="space-y-2">
              <p>
                邀请码：<code className="break-all">{invite.inviteCode}</code>
              </p>
              <p>
                有效至 {new Date(invite.expiresAt).toLocaleString()}
                ，只能使用一次。
              </p>
              <ProductButton
                onClick={() =>
                  void navigator.clipboard
                    .writeText(invite.inviteCode)
                    .then(() => setMessage('邀请码已复制'))
                    .catch(() => setFailure('复制失败，请选中邀请码手动复制'))
                }
              >
                复制邀请码
              </ProductButton>
            </div>
          )}
        </section>
      )}
      {data.links.canClaim && (
        <form
          className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void act(async () => {
              await parentsApi.claim(claim.trim())
              setClaim('')
            }, '申请已提交，等待学生确认')
          }}
        >
          <label className="block">
            孩子提供的邀请码
            <input
              className="input mt-1"
              autoComplete="off"
              value={claim}
              disabled={busy}
              onChange={(e) => setClaim(e.target.value)}
              minLength={24}
              maxLength={24}
              required
            />
          </label>
          <ProductButton
            type="submit"
            variant="primary"
            disabled={busy || claim.trim().length !== 24}
          >
            提交关联申请
          </ProductButton>
        </form>
      )}
      {!data.links.list.length && (
        <ProductStatus kind="info" title="暂无关联">
          {student ? '您可以生成邀请码邀请家长。' : '请向孩子索取邀请码。'}
        </ProductStatus>
      )}
      {data.links.list.map((row) => (
        <section
          key={row.id}
          className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
        >
          <h2 className="font-semibold">
            {row.title} · {labels[row.status]}
          </h2>
          {row.canApprove && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void act(
                  () => parentsApi.approve(row.id, data.consent.version),
                  '已确认家长关联',
                )
              }}
            >
              <p className="mb-3">{data.consent.text}</p>
              <label className="flex gap-2 mb-3">
                <input type="checkbox" required disabled={busy} />
                我已核对家长账号并同意以上说明
              </label>
              <ProductButton type="submit" disabled={busy} variant="primary">
                确认关联
              </ProductButton>
            </form>
          )}
          <div className="flex flex-wrap gap-3">
            {row.canConsentReports && (
              <Link
                className="hui-button hui-button--secondary"
                to={`/student/parent-links/${encodeURIComponent(row.id)}/reports`}
              >
                管理报告授权
              </Link>
            )}
            {row.canRevoke && (
              <ProductButton
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      '解除关联后，此家长将无法继续读取已授权的孩子报告。重新关联需要重新确认和授权。',
                    )
                  )
                    void act(() => parentsApi.unlink(row.id), '关联已解除')
                }}
              >
                解除关联
              </ProductButton>
            )}
          </div>
        </section>
      ))}
      {data.links.truncated && <p>关联较多，请联系学校核对更多历史记录。</p>}
    </div>
  )
}
export default function ParentLinksPage() {
  const { user } = useAuth()
  return (
    <ProductPage width="reading">
      <PageHeader
        title="家长关联"
        description="管理学生与家长的关联申请。"
        actions={
          <Link to={user?.role === 'STUDENT' ? '/student' : '/parent'}>
            返回首页
          </Link>
        }
      />
      <ParentFeature>
        <Content key={user?.id} />
      </ParentFeature>
    </ProductPage>
  )
}
