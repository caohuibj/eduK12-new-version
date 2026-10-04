import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { parentAccountsApi } from '../../api/parentAccounts'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import {
  PageHeader,
  ProductButton,
  ProductPage,
  ProductStatus,
} from '../../components/product-ui'
import { parentError, useParentResource } from './useParentResource'
function Content() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [keyword, setKeyword] = useState('')
  const load = useCallback(
      (signal: AbortSignal) => parentAccountsApi.list(page, keyword, signal),
      [page, keyword],
    ),
    { data, error, loading, reload } = useParentResource(
      `parent-accounts:${page}:${keyword}`,
      load,
    )
  const [username, setUsername] = useState(''),
    [nickname, setNickname] = useState(''),
    [password, setPassword] = useState(''),
    [showPassword, setShowPassword] = useState(false),
    [resetId, setResetId] = useState<string | null>(null),
    [notice, setNotice] = useState(''),
    [failure, setFailure] = useState(''),
    [busy, setBusy] = useState(false)
  const lock = useRef(false),
    command = useRef(crypto.randomUUID())
  const change = () => {
    command.current = crypto.randomUUID()
    setFailure('')
    setNotice('')
  }
  const run = async (action: () => Promise<unknown>, message: string) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setFailure('')
    setNotice('')
    try {
      await action()
      setNotice(message)
      setPassword('')
      setResetId(null)
      command.current = crypto.randomUUID()
      reload()
    } catch (e) {
      setFailure(parentError(e, '操作未确认，请先核对账号列表'))
      reload()
    } finally {
      setBusy(false)
      lock.current = false
    }
  }
  const generate = () => {
    change()
    const bytes = crypto.getRandomValues(new Uint8Array(20)),
      chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
    setPassword(
      'A2' + Array.from(bytes, (b) => chars[b % chars.length]).join(''),
    )
  }
  return (
    <div className="space-y-6">
      {notice && (
        <ProductStatus kind="success" title="操作完成">
          {notice}
        </ProductStatus>
      )}
      {failure && (
        <ProductStatus
          kind="error"
          title="操作未确认"
          actions={<ProductButton onClick={reload}>核对列表</ProductButton>}
        >
          {failure}
        </ProductStatus>
      )}
      <form
        className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          const key = command.current
          void run(
            async () => {
              if (resetId) await parentAccountsApi.reset(resetId, password, key)
              else {
                await parentAccountsApi.create({
                  username: username.trim(),
                  nickname: nickname.trim(),
                  password,
                  commandKey: key,
                })
                setUsername('')
                setNickname('')
              }
            },
            resetId
              ? '密码已重置，首次登录需修改密码'
              : '家长账号已建立，首次登录需修改密码',
          )
        }}
      >
        <fieldset disabled={busy} className="space-y-3">
          <h2 className="font-semibold">
            {resetId ? '设置新的初始密码' : '建立家长账号'}
          </h2>
          {!resetId && (
            <>
              <label className="block">
                用户名
                <input
                  className="input mt-1"
                  value={username}
                  onChange={(e) => {
                    change()
                    setUsername(e.target.value)
                  }}
                  pattern="[A-Za-z0-9_-]{4,32}"
                  autoComplete="off"
                  required
                />
              </label>
              <label className="block">
                家长显示名
                <input
                  className="input mt-1"
                  value={nickname}
                  onChange={(e) => {
                    change()
                    setNickname(e.target.value)
                  }}
                  maxLength={100}
                  required
                />
              </label>
            </>
          )}
          <label className="block">
            初始密码
            <input
              className="input mt-1"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                change()
                setPassword(e.target.value)
              }}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <p className="text-sm text-slate-600">
            至少8位，包含字母和数字。请在提交前复制并妥善保存初始密码，创建成功后交付给对应家长；提交成功后页面会清除密码。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              显示初始密码
            </label>
            <ProductButton disabled={busy} onClick={generate}>
              生成初始密码
            </ProductButton>
            <ProductButton
              disabled={!password || busy}
              onClick={() =>
                void navigator.clipboard
                  .writeText(password)
                  .then(() => setNotice('初始密码已复制，请交付给对应家长'))
                  .catch(() =>
                    setFailure('复制失败，请使用显示初始密码后手动复制'),
                  )
              }
            >
              复制初始密码
            </ProductButton>
          </div>
          <div className="flex gap-3">
            <ProductButton type="submit" disabled={busy} variant="primary">
              {busy ? '正在处理…' : resetId ? '确认重置密码' : '建立家长账号'}
            </ProductButton>
            {resetId && (
              <ProductButton
                disabled={busy}
                onClick={() => {
                  setResetId(null)
                  setPassword('')
                  change()
                }}
              >
                取消重置
              </ProductButton>
            )}
          </div>
        </fieldset>
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
          搜索家长
          <input
            className="input mt-1"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
          />
        </label>
        <ProductButton type="submit">搜索</ProductButton>
      </form>
      {loading ? (
        <ProductStatus kind="pending" title="正在加载家长账号">
          请稍候。
        </ProductStatus>
      ) : error ? (
        <ProductStatus
          kind="error"
          title="账号列表加载失败"
          actions={<ProductButton onClick={reload}>重试</ProductButton>}
        >
          {error}
        </ProductStatus>
      ) : (
        <>
          <p>共 {data?.total ?? 0} 个家长账号</p>
          {!data?.list.length && (
            <ProductStatus kind="info" title="暂无匹配账号">
              可以建立家长账号或调整搜索条件。
            </ProductStatus>
          )}
          {data?.list.map((user) => (
            <section
              key={user.id}
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
            >
              <h2 className="font-semibold">
                {user.nickname || user.username} · {user.username}
              </h2>
              <p>
                用户 ID：<code className="break-all">{user.id}</code>
              </p>
              <p>
                状态：
                {user.isFrozen
                  ? '已冻结'
                  : user.isActive === false
                    ? '已停用'
                    : user.mustChangePassword
                      ? '待首次改密'
                      : '正常'}
              </p>
              <div className="flex flex-wrap gap-3">
                <ProductButton
                  disabled={busy}
                  onClick={() => {
                    setResetId(user.id)
                    setPassword('')
                    change()
                  }}
                >
                  重置 {user.nickname || user.username} 的密码
                </ProductButton>
                <ProductButton
                  disabled={busy}
                  variant={user.isActive === false ? 'secondary' : 'danger'}
                  onClick={() => {
                    if (
                      window.confirm(
                        user.isActive === false
                          ? '启用此家长账号？'
                          : '停用此家长账号将使其当前会话和孩子报告访问失效。',
                      )
                    )
                      void run(
                        () =>
                          parentAccountsApi.active(
                            user.id,
                            user.isActive === false,
                          ),
                        '账号状态已更新',
                      )
                  }}
                >
                  {user.isActive === false ? '启用账号' : '停用账号'}
                </ProductButton>
              </div>
            </section>
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
              disabled={!data || page * data.pageSize >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </ProductButton>
          </div>
        </>
      )}
    </div>
  )
}
export default function ParentAccountsPage() {
  const { user } = useAuth(),
    { platformRole } = useOrganization(),
    allowed = (platformRole ?? user?.platformRole) === 'SYSTEM_ADMIN'
  return (
    <ProductPage width="management">
      <PageHeader
        title="家长账号管理"
        description="由平台管理员建立和维护家长账号。"
        actions={<Link to="/parent-tool-policies">工具披露设置</Link>}
      />
      {allowed ? (
        <Content key={user?.id} />
      ) : (
        <ProductStatus kind="warning" title="需要平台管理员权限">
          账号名或旧版管理员身份不会自动授予平台账号管理权限。
        </ProductStatus>
      )}
    </ProductPage>
  )
}
