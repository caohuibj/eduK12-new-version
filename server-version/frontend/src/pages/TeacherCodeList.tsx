import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, Copy, Key, Plus, RefreshCw, Trash2 } from 'lucide-react'
import apiClient from '../api/client'
import { PageHeader } from '../components/product-ui/PageHeader'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'
import { ProductPage } from '../components/product-ui/ProductPage'
import type { TeacherCode } from '../types'

const TeacherCodeList: React.FC<{training?:boolean}> = ({training=false}) => {
  const codeName=training?'培训师注册码':'教师码'
  const { feedback, confirm, info } = useStaffFeedback({dialogClassName:training?'training-accounts-dialog':undefined})
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const ask = (message: string) => confirm({ title: '确认操作', body: message, confirmLabel: '确认' })
  const [codes, setCodes] = useState<TeacherCode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false)
  const [formOpen, setFormOpen] = useState(false)
  const [codeTerm, setCodeTerm] = useState("none")
  const [codeDeadline, setCodeDeadline] = useState("")
  const [accountTerm, setAccountTerm] = useState("year")
  const [accountDays, setAccountDays] = useState("365")
  const [now, setNow] = useState(Date.now())
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    void fetchCodes()
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const fetchCodes = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get('/teacher-codes')
      if (response.code === 0) {
        setCodes(response.data.list)
      } else {
        setError(response.message || '获取教师码列表失败')
      }
    } catch (fetchError) {
      console.error('获取教师码列表失败:', fetchError)
      setError((fetchError as { message?: string }).message || '获取教师码列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (creatingRef.current) return
    const payload: {maxUses: number; expiresAt?: string; accountValidityDays?: number} = {maxUses: 1}
    if (training) {
      if (codeTerm !== 'none') {
        const deadline = codeTerm === 'custom' ? new Date(codeDeadline) : new Date(Date.now() + Number(codeTerm) * 86400000)
        if (!Number.isFinite(deadline.getTime()) || deadline.getTime() <= Date.now()) {
          setError('请选择晚于当前时间的注册码截止时间。')
          return
        }
        payload.expiresAt = deadline.toISOString()
      }
      if (accountTerm !== 'year') {
        const days = Number(accountTerm === 'custom' ? accountDays : accountTerm)
        if (!Number.isInteger(days) || days < 1 || days > 3650) {
          setError('账号有效天数需为 1–3650 的整数。')
          return
        }
        payload.accountValidityDays = days
      }
    }
    creatingRef.current = true
    try {
      setCreating(true)
      setError(null)
      const response = await apiClient.post('/teacher-codes', payload)
      if (response.code === 0) {
        await fetchCodes()
        setFormOpen(false)
      } else {
        setError(response.message || '生成教师码失败')
      }
    } catch (operationError: any) {
      setError(operationError.message || '生成失败')
    } finally {
      creatingRef.current = false
      setCreating(false)
    }
  }

  const handleDelete = async (teacherCode: TeacherCode) => {
    if (!await ask(`确定要删除${codeName} ${teacherCode.code} 吗？`)) return

    try {
      setDeletingId(teacherCode.id)
      setError(null)
      const response = await apiClient.delete(`/teacher-codes/${teacherCode.id}`)
      if (response.code === 0) {
        setCodes(current => current.filter(item => item.id !== teacherCode.id))
      } else {
        setError(response.message || '删除教师码失败')
      }
    } catch (operationError: any) {
      setError(operationError.message || '删除教师码失败')
    } finally {
      setDeletingId(null)
    }
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      showMessage('已复制到剪贴板')
    } catch {
      setError('复制教师码失败，请手动复制。')
    }
  }

  const formatDate = (value: string) => new Date(value).toLocaleString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false})
  const codeState = (code: TeacherCode) => code.usedCount >= code.maxUses ? '已用完' : code.expiresAt && new Date(code.expiresAt).getTime() <= now ? '已过期' : !code.isActive ? '已失效' : '可使用'
  const accountTermLabel = (code: TeacherCode) => code.accountValidityDays == null ? '注册后 1 年' : `注册后 ${code.accountValidityDays} 天`

  if (training) return (
    <section className="training-code-management" aria-label="培训师注册码">
      {feedback}
      <div className="training-code-toolbar">
        <p>共 {codes.length} 个注册码 <span>· 新码限注册 1 个账号</span></p>
        <div>
          <button type="button" className="training-accounts-secondary" aria-label="刷新注册码" disabled={loading || creating} onClick={() => void fetchCodes()}><RefreshCw size={15}/></button>
          <button type="button" className="training-code-primary" aria-expanded={formOpen} aria-controls="training-code-create" onClick={() => {setFormOpen(!formOpen); setError(null)}}><Plus size={15}/>生成注册码</button>
        </div>
      </div>
      {formOpen && <form id="training-code-create" className="training-code-form" onSubmit={event => {event.preventDefault(); void handleCreate()}}>
        <div className="training-code-form-fields">
          <div>
            <label htmlFor="training-code-term">注册码有效期</label>
            <select id="training-code-term" value={codeTerm} onChange={event => setCodeTerm(event.target.value)}>
              <option value="none">不限时间</option><option value="7">7 天</option><option value="30">30 天</option><option value="90">90 天</option><option value="custom">指定截止时间</option>
            </select>
            {codeTerm === 'custom' && <label className="training-code-custom">注册码截止时间<input type="datetime-local" required value={codeDeadline} onChange={event => setCodeDeadline(event.target.value)}/></label>}
            <p>决定最晚何时可以用此码注册；使用后即失效。</p>
          </div>
          <div>
            <label htmlFor="training-account-term">注册后账号有效期</label>
            <select id="training-account-term" value={accountTerm} onChange={event => setAccountTerm(event.target.value)}>
              <option value="year">1 年（默认）</option><option value="30">30 天</option><option value="90">90 天</option><option value="180">180 天</option><option value="custom">自定义天数</option>
            </select>
            {accountTerm === 'custom' && <label className="training-code-custom">账号有效天数<input type="number" min="1" max="3650" step="1" required value={accountDays} onChange={event => setAccountDays(event.target.value)}/></label>}
            <p>从注册成功起算，包含待审核时间；到期后无法登录。</p>
          </div>
        </div>
        <div className="training-code-form-footer"><span>仅适用于本次生成的注册码，已有账号和注册码不变。</span><button type="button" disabled={creating} className="training-accounts-secondary" onClick={() => setFormOpen(false)}>取消</button><button type="submit" disabled={creating} className="training-code-primary">{creating ? '生成中…' : '确认生成'}</button></div>
      </form>}
      {error && <div className="training-code-error" role="alert">{error}</div>}
      {loading ? <p className="training-code-empty" role="status">正在加载注册码…</p> : codes.length === 0 ? <p className="training-code-empty">暂无注册码，点击右上方按钮生成。</p> : <div className="training-code-grid">{codes.map(code => {
        const status = codeState(code)
        return <article className="training-code-card" key={code.id} aria-label={`培训师注册码 ${code.code}`}>
          <div className="training-code-card-heading"><code>{code.code}</code><span className={`training-code-status${status === '可使用' ? ' is-usable' : ''}`}>{status}</span><button type="button" className="training-code-icon" aria-label={`复制培训师注册码 ${code.code}`} title="复制注册码" onClick={() => void copyCode(code.code)}><Copy size={16}/></button></div>
          <dl className="training-code-terms"><div><dt>注册截止</dt><dd>{code.expiresAt ? formatDate(code.expiresAt) : '不限时间'}</dd></div><div><dt>账号期限</dt><dd>{accountTermLabel(code)}</dd></div></dl>
          <details className="training-code-details"><summary>详情与管理<ChevronDown size={14}/><span>已用 {code.usedCount}/{code.maxUses}</span></summary><dl><div><dt>创建者</dt><dd>{code.creator?.nickname || code.creator?.username || '—'}</dd></div><div><dt>创建时间</dt><dd>{formatDate(code.createdAt)}</dd></div><div><dt>使用次数</dt><dd>{code.usedCount} / {code.maxUses}</dd></div></dl><button type="button" className="training-code-delete" aria-label={`删除培训师注册码 ${code.code}`} disabled={deletingId === code.id} onClick={() => void handleDelete(code)}><Trash2 size={14}/>删除注册码</button></details>
        </article>
      })}</div>}
    </section>
  )

  return (
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <PageHeader
        title={training?'培训师注册码':'教师码管理'} headingLevel={training?2:1}
        description={training?'生成培训师注册码，并撤销不再需要的注册码。':'生成一次性教师注册码，并撤销不再需要的注册码。'}
        actions={(
          <button type="button" onClick={() => void handleCreate()} disabled={creating} className="hui-button hui-button--primary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {creating ? '生成中...' : training?'生成培训师注册码':'生成教师码'}
          </button>
        )}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="hui-button hui-button--secondary" onClick={() => void fetchCodes()}>重新加载</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center" role="status" aria-live="polite">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-action" />
          <span className="sr-only">正在加载{codeName}</span>
        </div>
      ) : codes.length === 0 ? (
        <div className="py-12 text-center">
          <Key className="mx-auto mb-4 h-16 w-16 text-gray-300" aria-hidden="true" />
          <p className="text-gray-500">暂无{codeName}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {codes.map(code => {
            const valid = code.isActive && code.usedCount < code.maxUses && (!code.expiresAt || new Date(code.expiresAt).getTime() > now)
            return (
              <article key={code.id} className="staff-panel staff-panel--padded transition-shadow hover:shadow-lg" aria-label={`${codeName} ${code.code}`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Key className="h-5 w-5 flex-none text-action" aria-hidden="true" />
                    <span className="truncate font-mono text-lg font-bold tracking-wider">{code.code}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyCode(code.code)}
                    className="rounded p-2 text-gray-400 hover:bg-blue-50 hover:text-action"
                    aria-label={`复制${codeName} ${code.code}`}
                    title={`复制${codeName}`}
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <dl className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between gap-4">
                    <dt>使用次数:</dt>
                    <dd>{code.usedCount} / {code.maxUses}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>创建者:</dt>
                    <dd className="text-right">{code.creator?.nickname || code.creator?.username}</dd>
                  </div>
                  {code.expiresAt && (
                    <div className="flex justify-between gap-4">
                      <dt>过期时间:</dt>
                      <dd>{new Date(code.expiresAt).toLocaleDateString('zh-CN')}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <span className={`rounded px-2 py-1 text-xs ${valid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {valid ? '有效' : '已失效'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(code)}
                    disabled={deletingId === code.id}
                    className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    aria-label={`删除${codeName} ${code.code}`}
                    title={`删除${codeName}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </ProductPage>
  )
}

export default TeacherCodeList