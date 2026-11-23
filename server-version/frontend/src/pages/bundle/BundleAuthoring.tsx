import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { apiErrorMessage } from '../../utils/apiErrorMessage'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'

const root = '/bundle-products/admin'
const statusLabels: Record<string, string> = { DRAFT: '草稿待发布', PUBLISHED: '已发布', HOLD: '暂停新投放', RETIRED: '已退役' }
async function request(path: string, body?: unknown): Promise<any> {
  const response = body === undefined ? await api.get<any>(root + path) : await api.post<any>(root + path, body)
  if (response.code !== 0) throw new Error(response.message || '操作失败')
  return response.data
}
export default function BundleAuthoring() {
  const { feedback, confirm, success } = useStaffFeedback()
  const [rows, setRows] = useState<any[]>([])
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [selected, setSelected] = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
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
      setSelected(record); setContent(JSON.stringify(record.content, null, 2))
      setPreview(await request('/preview', record.content))
    })
  }
  async function publishSelected() {
    if (!selected || !preview || selected.contentHash !== preview.contentHash || !['DRAFT', 'HOLD'].includes(selected.status)) return
    const restoring = selected.status === 'HOLD'
    if (!await confirm({ title: restoring ? '恢复固定包发布' : '发布固定包版本', body: `确认${restoring ? '恢复发布' : '发布'} ${selected.bundleKey} ${selected.bundleVersion}？结构、依赖与合成试跑已通过校验；版本内容哈希将锁定，后续如需修改须使用新版本号。版权与科学内容权威性由人工负责。`, confirmLabel: restoring ? '确认恢复发布' : '确认发布' })) return
    await action(async () => {
      const record = await request('/definitions/' + encodeURIComponent(selected.bundleKey) + '/' + encodeURIComponent(selected.bundleVersion) + '/approve', {
        contentHash: selected.contentHash, claims: preview.requiredClaims,
      })
      setSelected(record); await load(); success(restoring ? '版本已恢复发布' : '版本已发布', '可按产品与教师授权正常投放使用；历史冻结报告保持不可变。')
    })
  }
  return <ProductPage width="management"><PageHeader title="固定测评包制作与发布" description="制作不可变包版本，完成结构、依赖与合成试跑校验后即可直接发布。" />
    <p><Link to="/bundle-products">返回固定包投放与教师授权</Link></p>
    {feedback}{error && <p role="alert" className="my-4 text-red-700">{error}</p>}
    <section className="my-6 space-y-4 rounded border bg-white p-4 sm:p-6" aria-label="包定义制作">
      <h2 className="text-lg font-semibold">1. 制作或导入版本</h2>
      <p>导入受控声明式包文件，配置基本信息、精确槽位、背景信息和整体报告规则。修改已登记版本时请使用新版本号。</p>
      <label className="block">导入包文件（JSON，最多 1 MB）<input className="block w-full min-w-0 max-w-full" type="file" accept=".json,application/json" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]
        if (!file) return
        void action(async () => { if (file.size > 1024 * 1024) throw new Error('包文件超过 1 MB'); setContent(await file.text()); setPreview(null); setSelected(null) })
      }} /></label>
      <label className="block">包定义<textarea className="mt-2 min-h-64 w-full rounded border p-3 font-mono text-sm" value={content} disabled={busy} onChange={event => { setContent(event.target.value); setPreview(null) }} /></label>
      <div className="flex flex-wrap gap-3">
        <ProductButton disabled={busy || !content.trim()} onClick={() => void action(async () => setPreview(await request('/preview', JSON.parse(content))))}>校验与合成预览</ProductButton>
        <ProductButton variant="primary" disabled={busy || !preview || preview.blockers.length > 0} onClick={() => void action(async () => {
          const row = await request('/definitions', JSON.parse(content)); setSelected(row); await load(); success('草稿版本已保存', '核对合成试跑预览无误后，可直接点击发布。')
        })}>保存草稿版本</ProductButton>
      </div>
    </section>
    {preview && <section className="my-6 space-y-3 rounded border bg-white p-4 sm:p-6" aria-label="整体报告预览">
      <h2 className="text-lg font-semibold">2. 校验与整体报告预览</h2>
      <p>{preview.definition.name} · {preview.definition.bundleVersion} · 整体报告与单项依据</p>
      <ul>{preview.definition.slots.map((slot: any) => <li key={slot.slotKey}>{slot.slotKey} · {slot.instrumentKey} {slot.instrumentVersion}</li>)}</ul>
      {preview.blockers.length ? <ul role="alert">{preview.blockers.map((value: string) => <li key={value}>{value}</li>)}</ul> : <p>结构、依赖与合成试跑校验通过；可直接发布或继续微调草稿。</p>}
      <ul className="space-y-3">{preview.scenarios.map((scenario: any) => <li className="rounded bg-slate-50 p-3" key={scenario.name}>
        <strong>合成预览：{scenario.name}</strong>
        {scenario.profile ? <p>理论试验画像：{scenario.profile.state} · {scenario.profile.profileId || '不作单一分型'}</p> : scenario.conclusions?.length ? scenario.conclusions.map((conclusion: any) => <p key={conclusion.ruleId}>{conclusion.text}</p>) : <p>{scenario.message || '当前证据不支持整体结论；仍可按授权查看单项依据。'}</p>}
      </li>)}</ul>
      {preview.profile && <details><summary>理论模型与冻结参数（研究试验）</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{JSON.stringify(preview.profile, null, 2)}</pre></details>}
      <details><summary>报告块和适用范围</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm">{JSON.stringify({ report: preview.report, scientific: preview.scientific }, null, 2)}</pre></details>
      {selected?.status === 'PUBLISHED' && <p role="status">当前版本已发布（内容摘要：{selected.contentHash.slice(0, 12)}…），可正常授权与投放；如需更改定义请使用新版本号。</p>}
      {selected?.status === 'HOLD' && <p>此版本当前处于暂停状态。可确认校验结果后重新恢复发布；历史冻结报告保留。</p>}
      {selected && ['DRAFT', 'HOLD'].includes(selected.status) && <div className="space-y-2">
        <ProductButton variant="primary" disabled={busy || preview.blockers.length > 0 || selected.contentHash !== preview.contentHash} onClick={() => void publishSelected()}>{selected.status === 'HOLD' ? '恢复发布此版本' : '发布此版本'}</ProductButton>
      </div>}
    </section>}
    <section className="my-6 space-y-3" aria-label="登记的固定包版本"><h2 className="text-lg font-semibold">版本与发布记录</h2>
      {rows.map(row => <article key={row.id} className="rounded border bg-white p-4"><strong>{row.bundleKey} · {row.bundleVersion}</strong><p>{statusLabels[row.status] || row.status}</p><ProductButton disabled={busy} onClick={() => void open(row)}>查看与发布</ProductButton></article>)}
      {loading && <ProductStatus kind="pending" title="正在读取版本与审批记录">请稍候。</ProductStatus>}
      {listError && <ProductStatus kind="error" title="版本记录读取失败" actions={<ProductButton onClick={() => void load().catch(() => undefined)}>重试读取</ProductButton>}>{listError}</ProductStatus>}
      {!loading && !listError && !rows.length && <p>尚未登记固定包版本。导入包定义并完成校验后，可登记待审版本。</p>}
    </section>
  </ProductPage>
}
