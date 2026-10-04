import { useCallback, useRef, useState } from 'react'
import { organizationInvitationsApi } from '../../api/organizationInvitations'
import type { OrganizationPersona } from '../../api/organizations'
import { ProductButton, ProductStatus } from '../../components/product-ui'
import {
  useSessionResource,
  resourceError,
} from '../../hooks/useSessionResource'
const labels = {
  TEACHER: '教师',
  STUDENT: '学生',
  COUNSELOR: '咨询人员',
  CLIENT: '咨询对象',
}
export default function OrganizationInvitationsPanel({
  organizationId,
}: {
  organizationId: string
}) {
  const [page, setPage] = useState(1),
    load = useCallback(
      (signal: AbortSignal) =>
        organizationInvitationsApi.list(organizationId, page, signal),
      [organizationId, page],
    ),
    { data, error, loading, reload } = useSessionResource(
      `organization-invites:${organizationId}:${page}`,
      load,
    )
  const [persona, setPersona] = useState<OrganizationPersona | ''>(''),
    [invite, setInvite] = useState<{
      inviteCode: string
      expiresAt: string
    } | null>(null),
    [failure, setFailure] = useState(''),
    [busy, setBusy] = useState(false),
    lock = useRef(false)
  const act = async (action: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setFailure('')
    try {
      await action()
      reload()
    } catch (e) {
      setFailure(resourceError(e, '操作未确认，请核对邀请列表'))
      setInvite(null)
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <section className="space-y-4" aria-label="成员邀请">
      <h2 className="text-xl font-semibold">邀请成员加入</h2>
      <p>
        邀请只授予普通成员及所选工作身份。组织管理员、报告导出和家长报告披露能力需另行配置。
      </p>
      {failure && (
        <ProductStatus kind="error" title="邀请操作未完成">
          {failure}
        </ProductStatus>
      )}
      <label className="block">
        加入后的工作身份
        <select
          className="input mt-1"
          value={persona}
          disabled={busy}
          onChange={(e) => {
            setPersona(e.target.value as OrganizationPersona | '')
            setInvite(null)
          }}
        >
          <option value="">暂不授予工作身份</option>
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <ProductButton
        disabled={busy}
        onClick={() =>
          void act(async () =>
            setInvite(
              await organizationInvitationsApi.create(
                organizationId,
                persona || null,
              ),
            ),
          )
        }
      >
        生成成员邀请码
      </ProductButton>
      {invite && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <p>
            邀请码：<code className="break-all">{invite.inviteCode}</code>
          </p>
          <p>
            有效至 {new Date(invite.expiresAt).toLocaleString()}，只能使用一次。
          </p>
          <p>请成员登录后进入“组织空间 → 使用邀请码加入”。</p>
          <ProductButton
            onClick={() =>
              void navigator.clipboard
                .writeText(invite.inviteCode)
                .catch(() => setFailure('复制失败，请选中邀请码手动复制'))
            }
          >
            复制成员邀请码
          </ProductButton>
        </div>
      )}
      {loading ? (
        <p>正在读取邀请记录…</p>
      ) : error ? (
        <ProductStatus
          kind="error"
          title="邀请记录加载失败"
          actions={<ProductButton onClick={reload}>重试</ProductButton>}
        >
          {error}
        </ProductStatus>
      ) : (
        <>
          {data?.list.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap gap-3 items-center"
            >
              <span>
                {row.persona ? labels[row.persona] : '普通成员'} ·{' '}
                {row.status === 'CONSUMED'
                  ? '已使用'
                  : row.status === 'REVOKED'
                    ? '已撤销'
                    : new Date(row.expiresAt) <= new Date()
                      ? '已过期'
                      : '待使用'}{' '}
                · {new Date(row.expiresAt).toLocaleString()}
              </span>
              {row.status === 'ACTIVE' && (
                <ProductButton
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        '撤销后，此邀请码将无法使用。已加入的成员不会被移除。',
                      )
                    )
                      void act(() =>
                        organizationInvitationsApi.revoke(
                          organizationId,
                          row.id,
                        ),
                      )
                  }}
                >
                  撤销邀请
                </ProductButton>
              )}
            </div>
          ))}
          <div className="flex gap-3">
            <ProductButton
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </ProductButton>
            <span>第 {page} 页</span>
            <ProductButton
              disabled={!data?.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </ProductButton>
          </div>
        </>
      )}
    </section>
  )
}
