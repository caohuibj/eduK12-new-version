import { useCallback, useRef, useState } from 'react'
import {
  organizationApi,
  type OrganizationCapability,
  type OrganizationPersona,
  type OrganizationRole,
} from '../../api/organizations'
import { parentAccountsApi } from '../../api/parentAccounts'
import {
  useSessionResource,
  resourceError,
} from '../../hooks/useSessionResource'
import { ProductButton, ProductStatus } from '../../components/product-ui'
const roles: Record<OrganizationRole, string> = {
  MEMBER: '普通成员',
  ORG_ADMIN: '组织管理员',
}
const personas: Record<OrganizationPersona, string> = {
  TEACHER: '教师',
  STUDENT: '学生',
  COUNSELOR: '咨询人员',
  CLIENT: '咨询对象',
}
const capabilities: Record<OrganizationCapability, string> = {
  PSYCHOLOGY_STAFF: '专业报告访问',
  REPORT_EXPORT: '汇总报告导出',
  REPORT_MEMBER_EXPORT: '成员报告导出',
  PARENT_REPORT_DISCLOSURE: '家长报告披露',
}
function PlatformPicker({ onSelect }: { onSelect: (id: string) => void }) {
  const [value, setValue] = useState(''),
    [query, setQuery] = useState(''),
    load = useCallback(
      (signal: AbortSignal) =>
        query
          ? parentAccountsApi.searchUsers(query, signal)
          : Promise.resolve({ list: [], total: 0 }),
      [query],
    ),
    { data, error, loading, reload } = useSessionResource(
      `platform-users:${query}`,
      load,
    )
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(value.trim())
        }}
      >
        <label className="flex-1">
          查找平台账号
          <input
            className="input mt-1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={100}
            placeholder="用户名、姓名或用户 ID"
          />
        </label>
        <ProductButton type="submit" disabled={!value.trim()}>
          查找账号
        </ProductButton>
      </form>
      {error && (
        <ProductStatus
          kind="error"
          title="账号查询失败"
          actions={<ProductButton onClick={reload}>重试</ProductButton>}
        >
          {error}
        </ProductStatus>
      )}
      {loading && query && <p>正在查询账号…</p>}
      {data?.list.map((user) => (
        <div key={user.id} className="flex flex-wrap gap-3 items-center">
          <span>
            {user.nickname || user.username} · {user.username}
          </span>
          <ProductButton onClick={() => onSelect(user.id)}>
            选择 {user.nickname || user.username}
          </ProductButton>
        </div>
      ))}
      {query && data?.total === 0 && <p>未找到匹配账号。</p>}
      {data && data.total > data.list.length && (
        <p>结果较多，请输入更完整的用户名或 ID。</p>
      )}
    </div>
  )
}
function AccessHistory({
  organizationId,
  membershipId,
  onChanged,
}: {
  organizationId: string
  membershipId: string
  onChanged: () => Promise<void>
}) {
  const load = useCallback(
      (signal: AbortSignal) => {
        void signal
        return organizationApi.membershipAccessHistory(
          organizationId,
          membershipId,
        )
      },
      [organizationId, membershipId],
    ),
    { data, error, loading, reload } = useSessionResource(
      `member-access:${organizationId}:${membershipId}`,
      load,
    ),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    lock = useRef(false)
  const run = async (action: () => Promise<unknown>) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setFailure('')
    try {
      await action()
      reload()
      await onChanged()
    } catch (e) {
      setFailure(resourceError(e))
      reload()
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const current =
    data &&
    new Date(data.membership.validFrom) <= new Date() &&
    (!data.membership.validUntil ||
      new Date(data.membership.validUntil) > new Date())
  return (
    <section
      className="rounded-xl border border-blue-200 bg-white p-4 space-y-4"
      aria-label="成员授权详情"
    >
      <h3 className="font-semibold">成员授权与历史</h3>
      {failure && (
        <ProductStatus kind="error" title="授权操作未完成">
          {failure}
        </ProductStatus>
      )}
      {loading ? (
        <p>正在加载授权历史…</p>
      ) : error ? (
        <ProductStatus
          kind="error"
          title="授权历史加载失败"
          actions={<ProductButton onClick={reload}>重试</ProductButton>}
        >
          {error}
        </ProductStatus>
      ) : (
        data && (
          <>
            {!current && <p>此成员关系已结束，授权历史为只读。</p>}
            <div className="space-y-2">
              <h4 className="font-medium">组织工作身份</h4>
              {(Object.keys(personas) as OrganizationPersona[]).map(
                (persona) => {
                  const granted = data.personas.some(
                    (g) => g.persona === persona && !g.revokedAt,
                  )
                  return (
                    <ProductButton
                      key={persona}
                      disabled={busy || !current}
                      variant={granted ? 'danger' : 'secondary'}
                      onClick={() => {
                        if (
                          window.confirm(
                            `${granted ? '撤销' : '授予'}此成员的${personas[persona]}身份？`,
                          )
                        )
                          void run(() =>
                            granted
                              ? organizationApi.revokePersona(
                                  organizationId,
                                  membershipId,
                                  persona,
                                )
                              : organizationApi.grantPersona(
                                  organizationId,
                                  membershipId,
                                  persona,
                                ),
                          )
                      }}
                    >
                      {granted ? '撤销' : '授予'}
                      {personas[persona]}
                    </ProductButton>
                  )
                },
              )}
            </div>
            <div className="space-y-2">
              <h4 className="font-medium">单独授予的能力</h4>
              <p className="text-sm text-slate-600">
                家长报告披露还需具体来源读取权限、学生同意和逐份授权。导出能力不会随普通成员身份自动授予。
              </p>
              {(Object.keys(capabilities) as OrganizationCapability[]).map(
                (capability) => {
                  const granted = data.capabilities.some(
                    (g) => g.capability === capability && !g.revokedAt,
                  )
                  return (
                    <ProductButton
                      key={capability}
                      disabled={busy || !current}
                      variant={granted ? 'danger' : 'secondary'}
                      onClick={() => {
                        if (
                          window.confirm(
                            `${granted ? '撤销' : '授予'}此成员的${capabilities[capability]}能力？`,
                          )
                        )
                          void run(() =>
                            granted
                              ? organizationApi.revokeCapability(
                                  organizationId,
                                  membershipId,
                                  capability,
                                )
                              : organizationApi.grantCapability(
                                  organizationId,
                                  membershipId,
                                  capability,
                                ),
                          )
                      }}
                    >
                      {granted ? '撤销' : '授予'}
                      {capabilities[capability]}
                    </ProductButton>
                  )
                },
              )}
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              {[
                ...data.personas.map((g) => ({
                  ...g,
                  label: personas[g.persona],
                })),
                ...data.capabilities.map((g) => ({
                  ...g,
                  label: capabilities[g.capability],
                })),
              ].map((g) => (
                <li key={g.id}>
                  {g.label} · {new Date(g.grantedAt).toLocaleString()} →{' '}
                  {g.revokedAt
                    ? new Date(g.revokedAt).toLocaleString()
                    : '当前有效'}
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </section>
  )
}
export default function OrganizationMembersPanel({
  organizationId,
  platformAdmin,
  onChanged,
}: {
  organizationId: string
  platformAdmin: boolean
  onChanged: () => Promise<void>
}) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [keyword, setKeyword] = useState(''),
    [state, setState] = useState<'ALL' | 'CURRENT' | 'ENDED'>('CURRENT'),
    [role, setRole] = useState<'ALL' | 'MEMBER' | 'ORG_ADMIN'>('ALL'),
    [userId, setUserId] = useState(''),
    [newRole, setNewRole] = useState<OrganizationRole>('MEMBER'),
    [persona, setPersona] = useState<OrganizationPersona | ''>(''),
    [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [notice, setNotice] = useState(''),
    lock = useRef(false)
  const load = useCallback(
      async (signal: AbortSignal) => {
        void signal
        return organizationApi.listMemberships(organizationId, page, 20, {
          keyword,
          state,
          orgRole: role,
        })
      },
      [organizationId, page, keyword, state, role],
    ),
    { data, error, loading, reload } = useSessionResource(
      `members:${organizationId}:${page}:${keyword}:${state}:${role}`,
      load,
    )
  const run = async (action: () => Promise<unknown>, message: string) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setFailure('')
    setNotice('')
    try {
      await action()
      setNotice(message)
      reload()
      await onChanged()
    } catch (e) {
      setFailure(resourceError(e, '操作未确认，请刷新成员列表核对'))
      reload()
    } finally {
      setBusy(false)
      lock.current = false
    }
  }
  const changed = useCallback(async () => {
    reload()
    await onChanged()
  }, [reload, onChanged])
  return (
    <section aria-label="成员关系" className="space-y-4">
      <h2 className="text-xl font-semibold">成员关系</h2>
      <p className="text-slate-600">
        成员关系、工作身份和能力分别配置。结束关系保留历史，重新加入创建新的成员关系。
      </p>
      {failure && (
        <ProductStatus kind="error" title="成员操作未完成">
          {failure}
        </ProductStatus>
      )}
      {notice && (
        <ProductStatus kind="success" title="操作完成">
          {notice}
        </ProductStatus>
      )}
      {platformAdmin && <PlatformPicker onSelect={setUserId} />}
      <form
        className="rounded-xl border border-slate-200 bg-white p-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (
            !window.confirm(
              `将账号 ${userId.trim()} 添加为${roles[newRole]}${persona ? `，并授予${personas[persona]}工作身份` : ''}？`,
            )
          )
            return
          void run(async () => {
            await organizationApi.createMembership(
              organizationId,
              userId.trim(),
              newRole,
              persona || undefined,
            )
            setUserId('')
          }, '成员关系与所选工作身份已建立')
        }}
      >
        <label>
          用户 ID
          <input
            className="input mt-1"
            value={userId}
            disabled={busy}
            onChange={(e) => setUserId(e.target.value)}
            required
          />
        </label>
        {!platformAdmin && (
          <p className="text-sm text-slate-600">
            已有账号可填写精确用户 ID；组织外人员也可使用下方成员邀请。
          </p>
        )}
        <label>
          组织角色
          <select
            className="input mt-1"
            disabled={busy}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as OrganizationRole)}
          >
            {Object.entries(roles).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          工作身份
          <select
            className="input mt-1"
            disabled={busy}
            value={persona}
            onChange={(e) =>
              setPersona(e.target.value as OrganizationPersona | '')
            }
          >
            <option value="">暂不授予工作身份</option>
            {Object.entries(personas).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <ProductButton
          type="submit"
          variant="primary"
          disabled={busy || !userId.trim()}
        >
          新增成员
        </ProductButton>
      </form>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setKeyword(search.trim())
          setPage(1)
        }}
      >
        <label className="flex-1">
          搜索组织成员
          <input
            className="input mt-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
          />
        </label>
        <ProductButton type="submit">搜索成员</ProductButton>
        <label>
          成员状态
          <select
            className="input mt-1"
            value={state}
            onChange={(e) => {
              setState(e.target.value as typeof state)
              setPage(1)
              setSelected('')
            }}
          >
            <option value="CURRENT">当前成员</option>
            <option value="ENDED">历史关系</option>
            <option value="ALL">全部关系</option>
          </select>
        </label>
        <label>
          角色筛选
          <select
            className="input mt-1"
            value={role}
            onChange={(e) => {
              setRole(e.target.value as typeof role)
              setPage(1)
              setSelected('')
            }}
          >
            <option value="ALL">全部角色</option>
            <option value="MEMBER">普通成员</option>
            <option value="ORG_ADMIN">组织管理员</option>
          </select>
        </label>
      </form>
      {loading ? (
        <p role="status">正在加载成员列表…</p>
      ) : error ? (
        <ProductStatus
          kind="error"
          title="成员列表加载失败"
          actions={<ProductButton onClick={reload}>重试</ProductButton>}
        >
          {error}
        </ProductStatus>
      ) : (
        <>
          <p>共 {data?.total ?? 0} 条关系</p>
          {data?.list.map((m) => {
            const current =
              m.isCurrent ??
              (!m.validUntil || new Date(m.validUntil) > new Date())
            return (
              <div
                key={m.id}
                className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              >
                <h3 className="font-semibold">
                  {m.displayName || m.username || m.userId} · {roles[m.orgRole]}
                </h3>
                <p className="break-all">用户 ID：{m.userId}</p>
                <p>
                  {current ? '当前有效' : '历史关系'} ·{' '}
                  {new Date(m.validFrom).toLocaleString()} →{' '}
                  {m.validUntil
                    ? new Date(m.validUntil).toLocaleString()
                    : '持续有效'}
                  {m.accountUsable === false ? ' · 账号尚不可用' : ''}
                </p>
                <div className="flex flex-wrap gap-3">
                  <ProductButton onClick={() => setSelected(m.id)}>
                    授权历史
                  </ProductButton>
                  <ProductButton
                    disabled={busy || !current}
                    onClick={() => {
                      const next =
                        m.orgRole === 'ORG_ADMIN' ? 'MEMBER' : 'ORG_ADMIN'
                      if (
                        window.confirm(
                          `将此成员调整为${roles[next]}？组织必须保留一位可用管理员。`,
                        )
                      )
                        void run(
                          () =>
                            organizationApi.setMembershipRole(
                              organizationId,
                              m.id,
                              next,
                            ),
                          '组织角色已更新',
                        )
                    }}
                  >
                    {m.orgRole === 'ORG_ADMIN'
                      ? '调整为普通成员'
                      : '设为组织管理员'}
                  </ProductButton>
                  <ProductButton
                    variant="danger"
                    disabled={busy || !current}
                    onClick={() => {
                      if (
                        window.confirm(
                          '结束成员关系将停止当前组织业务权限及依赖该资格的报告读取。历史记录会保留。',
                        )
                      )
                        void run(
                          () =>
                            organizationApi.endMembership(
                              organizationId,
                              m.id,
                              '组织管理员通过成员管理界面结束关系',
                            ),
                          '成员关系已结束',
                        )
                    }}
                  >
                    结束关系
                  </ProductButton>
                </div>
              </div>
            )
          })}
          {!data?.list.length && <p>暂无匹配的成员关系。</p>}
          <div className="flex gap-3">
            <ProductButton
              disabled={page === 1}
              onClick={() => {
                setPage((p) => p - 1)
                setSelected('')
              }}
            >
              上一页
            </ProductButton>
            <span>第 {page} 页</span>
            <ProductButton
              disabled={!data || page * data.pageSize >= data.total}
              onClick={() => {
                setPage((p) => p + 1)
                setSelected('')
              }}
            >
              下一页
            </ProductButton>
          </div>
          {selected && (
            <AccessHistory
              key={selected}
              organizationId={organizationId}
              membershipId={selected}
              onChanged={changed}
            />
          )}
        </>
      )}
    </section>
  )
}
