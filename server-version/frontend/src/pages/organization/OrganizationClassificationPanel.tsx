import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { organizationApi, type ClassificationProjection, type OrganizationMembership } from '../../api/organizations'
import { ProductButton, ProductStatus } from '../../components/product-ui'

const fieldClass = 'min-w-0 w-full min-h-11 rounded-lg border border-slate-300 px-3'
const time = (value: string | null) => value ? new Date(value).toLocaleString() : '当前'

export default function OrganizationClassificationPanel({ organizationId, memberships }: { organizationId: string; memberships: OrganizationMembership[] }) {
  const [data, setData] = useState<ClassificationProjection | null>(null)
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof organizationApi.audit>>['list']>([])
  const [auditPage, setAuditPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const currentMembers = memberships.filter(member => member.validUntil === null)
  const load = useCallback(async () => {
    try {
      const [classification, events] = await Promise.all([organizationApi.classification(organizationId), organizationApi.audit(organizationId, auditPage)])
      setData(classification)
      setAudit(events.list)
      setError(null)
    } catch (err) {
      setData(null)
      setAudit([])
      setError(err instanceof Error ? err.message : '无法读取分类与关系')
    }
  }, [organizationId, auditPage])
  useEffect(() => { void load() }, [load])
  const command = async (input: Record<string, string>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try { await organizationApi.classificationCommand(organizationId, input); await load() }
    catch (err) { setError(err instanceof Error ? err.message : '操作失败') }
    finally { setBusy(false) }
  }
  const submit = (operation: string) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fields = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>
    void command({ ...fields, operation })
  }
  const memberOptions = currentMembers.map(member => <option key={member.id} value={member.id}>{member.userId} · {member.id}</option>)
  return <section className="space-y-4" aria-label="分类、专业关系与审计">
    <h2 className="text-xl font-semibold">分类、专业关系与审计</h2>
    {error && <ProductStatus kind="error" title="分类与关系操作失败">{error}</ProductStatus>}
    <ProductButton disabled={busy} onClick={() => void load()}>刷新分类与关系</ProductButton>
    {data && <>
      <div className="grid gap-4 lg:grid-cols-2">
        <form className="grid gap-3 rounded-lg border p-4" onSubmit={submit('CREATE_DIMENSION')}>
          <h3 className="font-semibold">新增分类维度</h3>
          <label className="grid min-w-0 gap-1">维度标识<input name="key" required className={fieldClass} /></label>
          <label className="grid min-w-0 gap-1">维度名称<input name="name" required className={fieldClass} /></label>
          <label className="grid min-w-0 gap-1">标签数量<select aria-label="标签数量" name="cardinality" className={fieldClass}><option value="SINGLE">单选</option><option value="MULTI">多选</option></select></label>
          <ProductButton type="submit" disabled={busy}>创建维度</ProductButton>
        </form>
        <form className="grid gap-3 rounded-lg border p-4" onSubmit={submit('CREATE_LABEL')}>
          <h3 className="font-semibold">新增标签</h3>
          <label className="grid min-w-0 gap-1">分类维度<select aria-label="分类维度" name="dimensionId" required className={fieldClass}><option value="">请选择</option>{data.dimensions.map(item => <option key={item.id} value={item.id}>{item.name} · {item.cardinality}</option>)}</select></label>
          <label className="grid min-w-0 gap-1">标签名称<input name="name" required className={fieldClass} /></label>
          <ProductButton type="submit" disabled={busy}>创建标签</ProductButton>
        </form>
        <form className="grid gap-3 rounded-lg border p-4" onSubmit={submit('ASSIGN_LABEL')}>
          <h3 className="font-semibold">分配标签</h3>
          <label className="grid min-w-0 gap-1">标签成员<select aria-label="标签成员" name="membershipId" required className={fieldClass}><option value="">请选择</option>{memberOptions}</select></label>
          <label className="grid min-w-0 gap-1">标签<select aria-label="标签" name="labelId" required className={fieldClass}><option value="">请选择</option>{data.labels.map(item => <option key={item.id} value={item.id}>{data.dimensions.find(d => d.id === item.dimensionId)?.name} / {item.name}</option>)}</select></label>
          <p className="text-sm">单选维度冲突时会被拒绝。请先结束旧分配，历史不会被覆盖。</p>
          <ProductButton type="submit" disabled={busy}>分配标签</ProductButton>
        </form>
        <form className="grid gap-3 rounded-lg border p-4" onSubmit={submit('CREATE_RELATIONSHIP')}>
          <h3 className="font-semibold">建立咨询关系</h3>
          <label className="grid min-w-0 gap-1">咨询师成员<select aria-label="咨询师成员" name="counselorMembershipId" required className={fieldClass}><option value="">请选择</option>{memberOptions}</select></label>
          <label className="grid min-w-0 gap-1">来访者成员<select aria-label="来访者成员" name="clientMembershipId" required className={fieldClass}><option value="">请选择</option>{memberOptions}</select></label>
          <p className="text-sm">服务器检查双方当前 COUNSELOR / CLIENT 身份及组织归属。</p>
          <ProductButton type="submit" disabled={busy}>建立咨询关系</ProductButton>
        </form>
      </div>
      <h3 className="font-semibold">标签分配历史</h3>
      <ul className="space-y-2">{data.assignments.map(item => <li key={item.id} className="flex flex-wrap gap-3 rounded border p-3"><span>{item.membershipId} · {data.labels.find(label => label.id === item.labelId)?.name ?? item.labelId} · {time(item.validFrom)} → {time(item.validUntil)}</span>{!item.validUntil && <ProductButton disabled={busy} onClick={() => void command({ operation: 'END_LABEL', assignmentId: item.id })}>结束标签分配</ProductButton>}</li>)}</ul>
      <h3 className="font-semibold">咨询关系历史</h3>
      <ul className="space-y-2">{data.relationships.map(item => <li key={item.id} className="flex flex-wrap gap-3 rounded border p-3"><span>{item.counselorMembershipId} → {item.clientMembershipId} · {time(item.validFrom)} → {time(item.validUntil)}</span>{!item.validUntil && <ProductButton disabled={busy} onClick={() => void command({ operation: 'END_RELATIONSHIP', relationshipId: item.id })}>结束咨询关系</ProductButton>}</li>)}</ul>
      <p className="text-sm text-slate-600">各显示最近 {data.historyLimit} 条关系历史。</p>
    </>}
    <h3 className="font-semibold">组织治理审计</h3>
    <ul className="space-y-2">{audit.map(item => <li key={item.id} className="break-all rounded border p-3">{time(item.createdAt)} · {item.action} · 操作者 {item.actorUserId} · {item.targetType} {item.targetId}</li>)}</ul>
    <div className="flex gap-3"><ProductButton disabled={auditPage === 1} onClick={() => setAuditPage(page => page - 1)}>上一页审计</ProductButton><span>第 {auditPage} 页</span><ProductButton disabled={audit.length < 50} onClick={() => setAuditPage(page => page + 1)}>下一页审计</ProductButton></div>
  </section>
}
