import { PublicDeliveryManager } from '../../components/PublicDeliveryManager'
import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { ProductPage, PageHeader } from '../../components/product-ui'
import { parseDelimitedOptions, contextOptionsForKey, serializeDelimitedOptions } from '../../modules/assessment-context/options'

const base = '/questionnaire-products'
async function request(path: string, body?: unknown, method = 'post'): Promise<any> {
  const response = body === undefined ? await apiClient.get<any>(base + path)
    : method === 'put' ? await apiClient.put<any>(base + path, body) : await apiClient.post<any>(base + path, body)
  if (response.code !== 0) throw new Error(response.message || '操作失败')
  return response.data
}
const message = (e: unknown) => e instanceof Error ? e.message : '操作失败'
const labels: Record<string, string> = { SCALE: '量表', COGNITIVE: '认知测验', SITUATIONAL: '情境判断', FORM: '表单', DRAFT: '草稿', PUBLISHED: '已发布', ARCHIVED: '已停用', DEPRECATED: '已停用' }

export function QuestionnaireProductList() {
  const [data, setData] = useState<any>({ list: [], total: 0 })
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  useEffect(() => { setLoading(true); request('?page=' + page).then(setData).catch(e => setError(message(e))).finally(() => setLoading(false)) }, [page])
  const copy = async (id: string) => {
    try { const row = await request('/' + id + '/copy', { requestId: crypto.randomUUID() }); navigate(base + '/' + row.id) }
    catch (e) { setError(message(e)) }
  }
  return <ProductPage width="management">
    <PageHeader title="问卷管理" description="编排量表、认知测验、情境判断和表单，分别展示各项结果。" actions={<Link className="btn-primary" to={base + '/new'}>创建问卷</Link>} />
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">正在加载问卷…</p> : <div className="space-y-3">
      {data.list.map((row: any) => <article className="rounded border p-4" key={row.kind + row.id}>
        <h2 className="font-semibold">{row.name}</h2><p>{labels[row.status] || row.status} · {row.kind === 'LEGACY' ? '原有问卷' : '四类问卷'}</p>
        <div className="flex gap-4 mt-2"><Link to={row.editHref}>查看与编制</Link><button onClick={() => void copy(row.id)}>复制为新版问卷</button></div>
      </article>)}
      {!data.list.length && <p>暂无问卷</p>}
    </div>}
    <nav aria-label="问卷分页" className="flex gap-4 mt-4"><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</button><span>第 {page} 页，共 {data.total} 份</span><button disabled={page * 25 >= data.total} onClick={() => setPage(p => p + 1)}>下一页</button></nav>
    <p className="mt-4"><Link to="/questionnaires/legacy">原有问卷管理与导出</Link></p>
  </ProductPage>
}

export function QuestionnaireProductEdit() {
  const { id = 'new' } = useParams()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<any>(null)
  const [catalog, setCatalog] = useState<any>({ scales: [], cognitive: [], situational: [], courses: [] })
  const [name, setName] = useState('')
  const [instruction, setInstruction] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState('COURSE')
  const [courseIds, setCourseIds] = useState<string[]>([])
  const [publicEnabled, setPublic] = useState(false)
  const [expiresAt, setExpiry] = useState('')
  const [opensAt, setOpens] = useState('')
  const [type, setType] = useState('SCALE')
  const [selected, setSelected] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formType, setFormType] = useState('text_input')
  const [options, setOptions] = useState('')
  const [contextKey, setContext] = useState('')
  const [required, setRequired] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [requestId] = useState(() => crypto.randomUUID())
  const hydrate = (row: any) => {
    setDetail(row); setName(row.name); setInstruction(row.instruction || ''); setDescription(row.description || '')
    setKind(row.questionnaireType); setCourseIds((row.questionnaireCourses || []).map((v: any) => v.courseId))
    setPublic(row.publicEnabled); setExpiry(row.expiresAt || ''); setOpens(row.opensAt || '')
  }
  const reload = async () => {
    if (id === 'new') return
    hydrate(await request('/' + id))

  }
  useEffect(() => { setDetail(null); setError(''); request('/resources').then(setCatalog).catch(e => setError(message(e))); void reload().catch(e => setError(message(e))) }, [id])
  const action = async (fn: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  const metadata = () => ({
    name, instruction, description, courseIds: kind === 'GENERAL' ? [] : courseIds, publicEnabled,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null, opensAt: opensAt ? new Date(opensAt).toISOString() : null,
  })
  const save = () => action(async () => {
    if (id === 'new') {
      const row = await request('', { ...metadata(), questionnaireType: kind, requestId })
      navigate(base + '/' + row.id, { replace: true })
    } else hydrate(await request('/' + id, { ...metadata(), revision: detail.revision }, 'put'))
  })
  const add = () => action(async () => {
    const item: any = { type, required: type === 'FORM' ? required : true }
    if (type === 'SCALE') item.scaleId = selected
    if (type === 'COGNITIVE') item.cognitiveAssignmentId = selected
    if (type === 'SITUATIONAL') {
      const row = catalog.situational.find((v: any) => v.id === selected)
      if (!row) throw new Error('请选择情境判断测评')
      item.situationalInstrumentKey = row.instrumentKey; item.situationalInstrumentVersion = row.instrumentVersion
    }
    if (type === 'FORM') Object.assign(item, { formLabel, formType, contextKey: contextKey || null,
      formOptions: ['single_choice', 'multiple_choice'].includes(formType) ? parseDelimitedOptions(options) : null })
    hydrate(await request('/' + id + '/items', { revision: detail.revision, item }))
    setSelected(''); setFormLabel('')
  })
  const units = detail ? [
    ...detail.items.filter((v: any) => v.type !== 'FORM').map((v: any) => ({ ...v, label: v.scale?.name || v.cognitiveAssignment?.title || v.situational?.key || labels[v.type] })),
    ...detail.formSections.map((v: any) => ({ ...v, type: 'FORM_SECTION', label: v.title })),
  ].sort((a, b) => a.position - b.position) : []
  const move = (index: number, direction: number) => action(async () => {
    const reordered = units.map(v => ({ id: v.id, type: v.type }))
    const target = index + direction
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    hydrate(await request('/' + id + '/reorder', { revision: detail.revision, units: reordered }))
  })
  const publish = () => action(async () => { hydrate(await request('/' + id + '/publish', { revision: detail.revision })) })
  const exportAll = () => action(async () => {
    let after: string | null = null
    let part = 1
    do {
      const payload = await request('/' + id + '/reports' + (after ? '?after=' + encodeURIComponent(after) : ''))
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a'); a.href = url; a.download = 'questionnaire-' + id + '-' + part++ + '.json'
      a.click(); URL.revokeObjectURL(url)
      after = payload.next
    } while (after)
  })
  const dirty = Boolean(detail && (name !== detail.name || instruction !== (detail.instruction || '') ||
    description !== (detail.description || '') || publicEnabled !== detail.publicEnabled ||
    (opensAt ? new Date(opensAt).toISOString() : null) !== (detail.opensAt || null) ||
    (expiresAt ? new Date(expiresAt).toISOString() : null) !== (detail.expiresAt || null) ||
    JSON.stringify([...courseIds].sort()) !== JSON.stringify((detail.questionnaireCourses || []).map((v: any) => v.courseId).sort())))
  const draft = id === 'new' || detail?.status === 'DRAFT'
  const choices = type === 'SCALE' ? catalog.scales : type === 'COGNITIVE' ? catalog.cognitive : catalog.situational
  const localDate = (v: string) => {
    if (!v) return ''
    const d = new Date(v); if (isNaN(d.getTime())) return v
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  return <ProductPage width="management">
    <PageHeader title={id === 'new' ? '创建问卷' : '编制问卷'} description="各测评独立反馈。当前支持网页作答；小程序暂不提供新版问卷入口。" />
    <Link to="/questionnaires">返回问卷列表</Link>
    {error && <div role="alert" className="my-3 rounded border border-red-400 p-3">{error}<button className="ml-3" onClick={() => void action(reload)}>刷新问卷</button></div>}
    {id !== 'new' && !detail ? <p role="status">正在加载问卷…</p> : <>
      <fieldset disabled={busy || !draft} className="space-y-3 my-4 rounded border p-4">
        <label className="block">问卷名称<input className="input w-full" value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block">描述<textarea className="input w-full" value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label className="block">指导语<textarea className="input w-full" value={instruction} onChange={e => setInstruction(e.target.value)} /></label>
        {id === 'new' && <label className="block">问卷类型<select aria-label="问卷类型" className="input ml-2 max-w-full" value={kind} onChange={e => { setKind(e.target.value); if (e.target.value === 'GENERAL') setPublic(true) }}><option value="COURSE">课程问卷</option><option value="GENERAL">通用公开问卷</option></select></label>}
        {kind === 'COURSE' && <fieldset><legend>投放课程（可多选）</legend>{catalog.courses.map((v: any) => <label className="block" key={v.id}><input type="checkbox" checked={courseIds.includes(v.id)} onChange={e => setCourseIds(ids => e.target.checked ? [...ids, v.id] : ids.filter(x => x !== v.id))} /> {v.title}</label>)}</fieldset>}
        <label className="block"><input type="checkbox" checked={publicEnabled} onChange={e => setPublic(e.target.checked)} /> 允许通过公开链接作答</label>
        <label className="block">开始时间<input type="datetime-local" value={localDate(opensAt)} onChange={e => setOpens(e.target.value)} /></label>
        <label className="block">截止时间<input type="datetime-local" value={localDate(expiresAt)} onChange={e => setExpiry(e.target.value)} /></label>
        <button className="btn-primary" onClick={() => void save()}>{id === 'new' ? '创建草稿' : '保存设置'}</button>
      </fieldset>
      {detail && <>
        {dirty && <p role="status">设置尚未保存，请先保存设置再调整内容或发布。</p>}
        <h2 className="font-semibold">内容与顺序 · {labels[detail.status]}</h2>
        <ol className="space-y-3 my-4">{units.map((v, index) => <li key={v.id} className="border rounded p-3">
          <strong>{index + 1}. {v.label}</strong> <span>{labels[v.type] || '表单区段'}</span>
          {draft && <div className="flex gap-3"><button disabled={busy || dirty || index === 0} onClick={() => void move(index, -1)}>上移</button><button disabled={busy || dirty || index === units.length - 1} onClick={() => void move(index, 1)}>下移</button>
            {v.type !== 'FORM_SECTION' && <button disabled={busy || dirty} onClick={() => void action(async () => hydrate(await request('/' + id + '/items/' + v.id + '/remove', { revision: detail.revision })))}>移除</button>}</div>}
          {v.type === 'FORM_SECTION' && v.items.map((item: any) => <div key={item.id}>{item.formLabel || item.label}
            {draft && <button disabled={busy || dirty} className="ml-3" onClick={() => void action(async () => hydrate(await request('/' + id + '/items/' + item.id + '/remove', { revision: detail.revision })))}>移除此题</button>}</div>)}
        </li>)}</ol>
        {draft && <fieldset disabled={busy || dirty} className="space-y-3 border rounded p-4">
          <legend>添加内容</legend>
          <label>测评类型<select aria-label="测评类型" className="input ml-2 max-w-full" value={type} onChange={e => { setType(e.target.value); setSelected('') }}>{['SCALE','COGNITIVE','SITUATIONAL','FORM'].map(t => <option key={t} value={t}>{labels[t]}</option>)}</select></label>
          {type !== 'FORM' ? <label className="block">选择测评<select aria-label="选择测评" className="input ml-2 max-w-full" value={selected} onChange={e => setSelected(e.target.value)}><option value="">请选择已发布测评</option>{choices.map((v: any) => <option key={v.id} value={v.id}>{v.name}{v.profile ? ' · ' + v.profile : ''}</option>)}</select></label> : <>
            <label className="block">题目文字<input value={formLabel} onChange={e => setFormLabel(e.target.value)} /></label>
            <label className="block">题型<select aria-label="题型" className="input ml-2 max-w-full" value={formType} onChange={e => setFormType(e.target.value)}>{['text_input','fill_blank','single_choice','multiple_choice','year_month'].map(t => <option key={t} value={t}>{({ text_input:'文本',fill_blank:'填空',single_choice:'单选',multiple_choice:'多选',year_month:'年月' } as any)[t]}</option>)}</select></label>
            {['single_choice','multiple_choice'].includes(formType) && <label className="block">选项（值=标签，以逗号分隔）<input value={options} onChange={e => setOptions(e.target.value)} /></label>}
            <label className="block">背景字段<select aria-label="背景字段" className="input ml-2 max-w-full" value={contextKey} onChange={e => { setContext(e.target.value); setRequired(true); if (e.target.value) { setFormType(e.target.value === 'birthYearMonth' ? 'year_month' : 'single_choice'); setOptions(serializeDelimitedOptions(contextOptionsForKey(e.target.value))) } }}><option value="">普通表单题</option>{['birthYearMonth','sexAtBirth','gradeLevel','primaryLanguage','countryOrRegion'].map(k => <option key={k} value={k}>{({birthYearMonth:'出生年月',sexAtBirth:'出生性别',gradeLevel:'年级',primaryLanguage:'主要语言',countryOrRegion:'国家或地区'} as any)[k]}</option>)}</select></label>
            {contextKey && <label className="block"><input type="checkbox" checked={required} onChange={e => setRequired(e.target.checked)} /> 必填</label>}
          </>}
          <button className="btn-primary" onClick={() => void add()}>添加到问卷</button>
        </fieldset>}
        <div className="flex flex-wrap gap-4 my-5">
          {draft && <button disabled={busy || dirty} className="btn-primary" onClick={() => void publish()}>发布问卷</button>}
          <button disabled={busy} onClick={() => void action(async () => { const row = await request('/' + id + '/copy', { requestId: crypto.randomUUID() }); navigate(base + '/' + row.id) })}>复制为新草稿</button>
          <Link to={'/composite-assessments/' + id + '/results'}>查看作答与结果</Link><button disabled={busy} onClick={() => void exportAll()}>导出独立报告（JSON）</button>
          {detail.status === 'PUBLISHED' && <button disabled={busy || dirty} onClick={() => void action(async () => hydrate(await request('/' + id + '/archive', { revision: detail.revision })))}>停止新作答</button>}
          {draft && <button disabled={busy} onClick={() => { if (confirm('删除当前草稿？')) void action(async () => { await request('/' + id + '/remove', { revision: detail.revision }); navigate('/questionnaires') }) }}>删除草稿</button>}
        </div>
        {detail.publicEnabled && detail.status === 'PUBLISHED' && id && <PublicDeliveryManager key={id} family="COMPOSITE" resourceId={id} maximumExpiry={detail.expiresAt} />}
      </>}
    </>}
  </ProductPage>
}
