import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { apiErrorMessage } from '../../utils/apiErrorMessage'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'

const root = '/bundle-products/admin'
const statusLabels: Record<string, string> = { DRAFT: '待独立审核', PUBLISHED: '已发布', HOLD: '暂停新投放', RETIRED: '已退役' }
async function request(path: string, body?: unknown): Promise<any> {
  const response = body === undefined ? await api.get<any>(root + path) : await api.post<any>(root + path, body)
  if (response.code !== 0) throw new Error(response.message || '操作失败')
  return response.data
}
export default function BundleAuthoring() {
  const { user } = useAuth()
  const { feedback, confirm, success } = useStaffFeedback()
  const [rows, setRows] = useState<any[]>([])
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [selected, setSelected] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [reviewed, setReviewed] = useState<string[]>([])
  const load = async () => {
    setLoading(true); setListError('')
    try { setRows(await request('/definitions')) }
    catch (cause) { setListError(apiErrorMessage(cause)); throw cause }
    finally { setLoading(false) }
  }
  useEffect(() => { void load().catch(() => undefined) }, [])
  async function action(run: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { await run() } catch (cause) { setError(apiErrorMessage(cause)) } finally { setBusy(false) }
  }
  async function open(row: any) {
    await action(async () => {
      const record = await request('/definitions/' + encodeURIComponent(row.bundleKey) + '/' + encodeURIComponent(row.bundleVersion))
      setSelected(record); setContent(JSON.stringify(record.content, null, 2)); setReviewed([])
      setPreview(await request('/preview', record.content))
    })
  }
  async function approve() {
    if (!selected || !preview || selected.contentHash !== preview.contentHash || reviewed.length !== 4) return
    if (!await confirm({ title: '审批并发布固定包版本', body: `确认已独立审核 ${selected.bundleKey} ${selected.bundleVersion} 的科学声明、材料权限、语言及报告。发布后版本内容不可改写，当前签名有效期为七天。`, confirmLabel: '审批发布' })) return
    await action(async () => {
      const record = await request('/definitions/' + encodeURIComponent(selected.bundleKey) + '/' + encodeURIComponent(selected.bundleVersion) + '/approve', {
        contentHash: selected.contentHash, scientific: true, rights: true, language: true, report: true, claims: preview.requiredClaims,
      })
      setSelected(record); await load(); success('版本已审批发布', '教师仍需精确版本授权；生产新建开关由受控发布流程管理。')
    })
  }
  return <ProductPage width="management"><PageHeader title="固定测评包制作与审批" description="制作不可变包版本，预览整体报告，交由另一位管理员独立审核。" />
    <p><Link to="/bundle-products">返回固定包投放与教师授权</Link></p>
    {feedback}{error && <p role="alert" className="my-4 text-red-700">{error}</p>}
    <section className="my-6 space-y-4 rounded border bg-white p-4 sm:p-6" aria-label="包定义制作">
      <h2 className="text-lg font-semibold">1. 制作或导入版本</h2>
      <p>导入受控声明式包文件，配置基本信息、精确槽位、背景信息和整体报告规则。修改已登记版本时请使用新版本号。</p>
      <label className="block">导入包文件（JSON，最多 1 MB）<input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]
        if (!file) return
        void action(async () => { if (file.size > 1024 * 1024) throw new Error('包文件超过 1 MB'); setContent(await file.text()); setPreview(null); setSelected(null); setReviewed([]) })
      }} /></label>
      <label className="block">包定义<textarea className="mt-2 min-h-64 w-full rounded border p-3 font-mono text-sm" value={content} disabled={busy} onChange={event => { setContent(event.target.value); setPreview(null); setReviewed([]) }} /></label>
      <div className="flex flex-wrap gap-3">
        <ProductButton disabled={busy || !content.trim()} onClick={() => void action(async () => setPreview(await request('/preview', JSON.parse(content))))}>校验与合成预览</ProductButton>
        <ProductButton variant="primary" disabled={busy || !preview || preview.blockers.length > 0} onClick={() => void action(async () => {
          const row = await request('/definitions', JSON.parse(content)); setSelected(row); await load(); success('版本已登记', '待另一位管理员独立审核。')
        })}>登记待审版本</ProductButton>
      </div>
    </section>
    {preview && <section className="my-6 space-y-3 rounded border bg-white p-4 sm:p-6" aria-label="整体报告预览">
      <h2 className="text-lg font-semibold">2. 校验与整体报告预览</h2>
      <p>{preview.definition.name} · {preview.definition.bundleVersion} · 整体报告与单项依据</p>
      <ul>{preview.definition.slots.map((slot: any) => <li key={slot.slotKey}>{slot.slotKey} · {slot.instrumentKey} {slot.instrumentVersion}</li>)}</ul>
      {preview.blockers.length ? <ul role="alert">{preview.blockers.map((value: string) => <li key={value}>{value}</li>)}</ul> : <p>结构、依赖与合成样本校验通过。科学声明和使用权限仍需独立审核。</p>}
      <ul className="space-y-3">{preview.scenarios.map((scenario: any) => <li className="rounded bg-slate-50 p-3" key={scenario.name}>
        <strong>合成预览：{scenario.name}</strong>
        {scenario.conclusions?.length ? scenario.conclusions.map((conclusion: any) => <p key={conclusion.ruleId}>{conclusion.text}</p>) : <p>{scenario.message || '当前证据不支持整体结论；仍可按授权查看单项依据。'}</p>}
      </li>)}</ul>
      <details><summary>报告块和适用范围</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{JSON.stringify({ report: preview.report, scientific: preview.scientific }, null, 2)}</pre></details>
      {selected?.status === 'DRAFT' && <fieldset disabled={busy || selected.installedBy === user?.id} className="space-y-2">
        <legend className="font-semibold">3. 独立审核</legend>
        {selected.installedBy === user?.id && <p>此版本由你登记，请交由另一位管理员审核。</p>}
        {['科学声明与适用范围', '材料使用权限', '语言与说明', '整体报告及单项依据'].map(label => <label key={label} className="block"><input type="checkbox" checked={reviewed.includes(label)} onChange={event => setReviewed(values => event.target.checked ? [...values, label] : values.filter(value => value !== label))} /> 已审核{label}</label>)}
        <ProductButton variant="primary" disabled={reviewed.length !== 4 || preview.blockers.length > 0 || selected.contentHash !== preview.contentHash} onClick={() => void approve()}>独立审批发布</ProductButton>
      </fieldset>}
    </section>}
    <section className="my-6 space-y-3" aria-label="登记的固定包版本"><h2 className="text-lg font-semibold">版本与审批记录</h2>
      {rows.map(row => <article key={row.id} className="rounded border bg-white p-4"><strong>{row.bundleKey} · {row.bundleVersion}</strong><p>{statusLabels[row.status] || row.status}</p><ProductButton disabled={busy} onClick={() => void open(row)}>查看定义与审批</ProductButton></article>)}
      {loading && <ProductStatus kind="pending" title="正在读取版本与审批记录">请稍候。</ProductStatus>}
      {listError && <ProductStatus kind="error" title="版本记录读取失败" actions={<ProductButton onClick={() => void load().catch(() => undefined)}>重试读取</ProductButton>}>{listError}</ProductStatus>}
      {!loading && !listError && !rows.length && <p>尚未登记固定包版本。导入包定义并完成校验后，可登记待审版本。</p>}
    </section>
  </ProductPage>
}
