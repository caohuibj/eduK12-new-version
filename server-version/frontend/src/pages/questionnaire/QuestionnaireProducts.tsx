import { apiErrorMessage } from '../../utils/apiErrorMessage'
import { PublicDeliveryManager } from '../../components/PublicDeliveryManager'
import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { resolveTrainingCoursePrefill } from '../../training/resolveCoursePrefill'
import { useAuth } from '../../contexts/AuthContext'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'
import LocalDateTimeInput, { localDateTimeValue, parseLocalDateTime } from '../../components/LocalDateTimeInput'
import './questionnaire-products.css'
import {
  ProductPage,
  PageHeader,
  ProductButton,
} from '../../components/product-ui'
import {
  parseDelimitedOptions,
  contextOptionsForKey,
  serializeDelimitedOptions,
} from '../../modules/assessment-context/options'

const base = '/questionnaire-products'
async function request(
  path: string,
  body?: unknown,
  method = 'post',
): Promise<any> {
  const response =
    body === undefined
      ? await apiClient.get<any>(base + path)
      : method === 'put'
        ? await apiClient.put<any>(base + path, body)
        : await apiClient.post<any>(base + path, body)
  if (response.code !== 0) throw new Error(response.message || '操作失败')
  return response.data
}
const message = apiErrorMessage
const labels: Record<string, string> = {
  SCALE: '量表',
  COGNITIVE: '认知测验',
  SITUATIONAL: '情境判断',
  FORM: '表单',
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已停用',
  DEPRECATED: '已停用',
}

export function QuestionnaireProductList() {
  const { user } = useAuth()
  const [templateSource, setTemplateSource] = useState<{id:string;name:string} | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const saving = useRef(false)
  const [data, setData] = useState<any>({ list: [], total: 0 })
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  useEffect(() => {
    setLoading(true)
    request('?page=' + page)
      .then(setData)
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false))
  }, [page])
  const copy = async (id: string) => {
    try {
      const row = await request('/' + id + '/copy', {
        requestId: crypto.randomUUID(),
      })
      navigate(base + '/' + row.id)
    } catch (e) {
      setError(message(e))
    }
  }
  return (
    <ProductPage width="management" className="hui-questionnaire-products">
      <PageHeader
        title="组合测评"
        description="自由编排量表、认知任务、情境判断和表单，提供单项报告合集。历史问卷与综合测评在此统一管理。"
        actions={
          <Link className="hui-button hui-button--primary" to={base + '/new'}>
            创建组合测评
          </Link>
        }
      />
      {error && <p role="alert">{error}</p>}
      <nav className="my-4 flex flex-wrap gap-4"><Link to="/assessment-templates">从模板创建</Link><Link to="/assessment-workbench">结果与质量概览</Link><Link to="/assessment-management">筛选归档与操作记录</Link></nav>
      {templateSource && <section className="my-4 rounded border p-4" aria-label="保存组合模板"><h2>从 {templateSource.name} 保存私有模板</h2><p>只复制内容定义，移除课程投放与公开链接，不携带作答或授权。</p><label>模板名称<input className="input" maxLength={200} value={templateName} onChange={e => setTemplateName(e.target.value)} disabled={savingTemplate}/></label><ProductButton disabled={savingTemplate || !templateName.trim()} onClick={async () => {
        if (saving.current) return
        saving.current = true; setSavingTemplate(true); setError('')
        const key = `save-composition-template:${user?.id}:${templateSource.id}:${templateName.trim()}`
        try {
          let requestId = sessionStorage.getItem(key)
          if (!requestId) { requestId = crypto.randomUUID(); sessionStorage.setItem(key, requestId) }
          await request('/templates', { sourceId: templateSource.id, name: templateName.trim(), requestId })
          sessionStorage.removeItem(key); navigate('/assessment-templates')
        }
        catch (e) { setError(message(e)) }
        finally { saving.current = false; setSavingTemplate(false) }
      }}>{savingTemplate ? '保存中…' : '保存为模板'}</ProductButton><ProductButton disabled={savingTemplate} onClick={() => setTemplateSource(null)}>取消</ProductButton></section>}
      {loading ? (
        <p role="status">正在加载组合测评…</p>
      ) : (
        <div className="space-y-3">
          {data.list.map((row: any) => (
            <article className="rounded border p-4" key={row.kind + row.id}>
              <h2 className="font-semibold">{row.name}</h2>
              <p>
                {labels[row.status] || row.status} ·{' '}
                {row.kind === 'LEGACY' ? '历史问卷' : row.kind === 'LEGACY_COMPOSITE' ? '历史组合测评' : '组合测评'} · 单项报告合集
              </p>
              <div className="flex gap-4 mt-2">
                <Link to={row.editHref}>查看与编制</Link>
                <ProductButton onClick={() => void copy(row.id)}>
                  复制为新草稿
                </ProductButton>
                <ProductButton disabled={savingTemplate} onClick={() => { setTemplateSource(row); setTemplateName(row.name) }}>保存为组合模板</ProductButton>
              </div>
            </article>
          ))}
          {!data.list.length && <p>暂无组合测评。创建草稿后选择已有测评内容。</p>}
        </div>
      )}
      <nav aria-label="组合测评分页" className="flex gap-4 mt-4">
        <ProductButton
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          上一页
        </ProductButton>
        <span>
          第 {page} 页，共 {data.total} 份
        </span>
        <ProductButton
          disabled={page * 25 >= data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </ProductButton>
      </nav>
      <p className="mt-4">
        <Link to="/questionnaires/legacy">原有问卷管理与导出</Link>
        {' · '}<Link to="/composite-assessments">历史综合测评管理</Link>
        {' · '}<Link to="/bundle-products">固定测评包：管理员审批版本与整体报告</Link>
      </p>
    </ProductPage>
  )
}

export function QuestionnaireProductEdit() {
  const { user } = useAuth()
  const { feedback, confirm: confirmManagement } = useStaffFeedback()
  const { id = 'new' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedScaleId = searchParams.get('scaleId')
  const preselectedCourseId = searchParams.get('courseId')
  const [detail, setDetail] = useState<any>(null)
  const [catalog, setCatalog] = useState<any>({
    scales: [],
    cognitive: [],
    situational: [],
    courses: [],
  })
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
  const [editingUnit, setEditingUnit] = useState('')
  const [activeStep, setActiveStep] = useState('questionnaire-basic')
  const [formType, setFormType] = useState('text_input')
  const [options, setOptions] = useState('')
  const [contextKey, setContext] = useState('')
  const [required, setRequired] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preflight, setPreflight] = useState<{ revision: number; ok: boolean; checks: Array<{ key: string; label: string; status: string; message: string; targetId?: string }> } | null>(null)
  const [nameError, setNameError] = useState('')
  const [expiryError, setExpiryError] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const hydrate = (row: any) => {
    setDetail(row)
    setName(row.name)
    setInstruction(row.instruction || '')
    setDescription(row.description || '')
    setKind(row.questionnaireType)
    setCourseIds((row.questionnaireCourses || []).map((v: any) => v.courseId))
    setPublic(row.publicEnabled)
    setExpiry(row.expiresAt || '')
    setOpens(row.opensAt || '')
  }
  const reload = async () => {
    if (id === 'new') return
    hydrate(await request('/' + id))
  }
  useEffect(() => {
    let active = true
    setDetail(null)
    setError('')
    request('/resources')
      .then(async row => {
        if (!active) return
        const courses: Array<{ id: string; title: string }> = row.courses || []
        const supplemental = id === 'new'
          ? await resolveTrainingCoursePrefill({
            courseId: preselectedCourseId,
            userId: user?.id,
            knownIds: courses.map(course => course.id),
          }) : null
        if (!active) return
        const resolvedCourses = supplemental ? [...courses, supplemental] : courses
        setCatalog({ ...row, courses: resolvedCourses })
        if (preselectedScaleId && row.scales.some((scale: any) => scale.id === preselectedScaleId)) {
          setType('SCALE')
          setSelected(preselectedScaleId)
        }
        // One verified creator-owned course may be appended when omitted by
        // the first catalog page; no URL parameter becomes an authority.
        if (id === 'new' && preselectedCourseId && resolvedCourses.some(course => course.id === preselectedCourseId)) {
          setCourseIds(current => current.length ? current : [preselectedCourseId])
        }
      })
      .catch((e) => { if (active) setError(message(e)) })
    if (id !== 'new') void request('/' + id).then(row => { if (active) hydrate(row) }).catch(e => { if (active) setError(message(e)) })
    return () => { active = false }
  }, [id, preselectedScaleId, preselectedCourseId, user?.id])
  const action = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  const metadata = () => ({
    name: name.trim(),
    instruction,
    description,
    courseIds: kind === 'GENERAL' ? [] : courseIds,
    publicEnabled,
    expiresAt: expiresAt ? parseLocalDateTime(expiresAt)?.toISOString() : null,
    opensAt: opensAt ? parseLocalDateTime(opensAt)?.toISOString() : null,
  })
  const save = () => {
    const invalidName = !name.trim()
      ? '请填写测评名称'
      : name.trim().length > 200
        ? '测评名称不能超过200字'
        : ''
    const invalidExpiry =
      publicEnabled && !expiresAt ? '公开问卷需要设置截止时间' : expiresAt && !parseLocalDateTime(expiresAt) ? '截止时间无效，请按年-月-日 时:分填写' : ''
    setNameError(invalidName)
    setExpiryError(invalidExpiry)
    if (opensAt && !parseLocalDateTime(opensAt)) { setError('开始时间无效，请按年-月-日 时:分填写'); document.getElementById('questionnaire-product-opens')?.focus(); return }
    if (invalidName || invalidExpiry) {
      document
        .getElementById(
          invalidName
            ? 'questionnaire-product-name'
            : 'questionnaire-product-expiry',
        )
        ?.focus()
      return
    }
    return action(async () => {
      if (id === 'new') {
        const row = await request('', {
          ...metadata(),
          questionnaireType: kind,
          requestId,
        })
        navigate(base + '/' + row.id + (preselectedScaleId ? '?scaleId=' + encodeURIComponent(preselectedScaleId) : ''), { replace: true })
      } else
        hydrate(
          await request(
            '/' + id,
            { ...metadata(), revision: detail.revision },
            'put',
          ),
        )
    })
  }
  const add = () =>
    action(async () => {
      const item: any = { type, required: type === 'FORM' ? required : true }
      if (type === 'SCALE') item.scaleId = selected
      if (type === 'COGNITIVE') item.cognitiveAssignmentId = selected
      if (type === 'SITUATIONAL') {
        const row = catalog.situational.find((v: any) => v.id === selected)
        if (!row) throw new Error('请选择情境判断测评')
        item.situationalInstrumentKey = row.instrumentKey
        item.situationalInstrumentVersion = row.instrumentVersion
      }
      if (type === 'FORM')
        Object.assign(item, {
          formLabel,
          formType,
          contextKey: contextKey || null,
          formOptions: ['single_choice', 'multiple_choice'].includes(formType)
            ? parseDelimitedOptions(options)
            : null,
        })
      hydrate(
        await request('/' + id + '/items', { revision: detail.revision, item }),
      )
      setSelected('')
      setFormLabel('')
    })
  const units = detail
    ? [
        ...detail.items
          .filter((v: any) => v.type !== 'FORM')
          .map((v: any) => ({
            ...v,
            label:
              v.scale?.name ||
              v.cognitiveAssignment?.title ||
              v.situational?.key ||
              labels[v.type],
          })),
        ...detail.formSections.map((v: any) => ({
          ...v,
          type: 'FORM_SECTION',
          label: v.title,
        })),
      ].sort((a, b) => a.position - b.position)
    : []
  const move = (index: number, direction: number) =>
    action(async () => {
      const reordered = units.map((v) => ({ id: v.id, type: v.type }))
      const target = index + direction
      if (units[index]?.contextSection && direction < 0) {
        const [context] = reordered.splice(index, 1)
        reordered.unshift(context)
      } else {
      ;[reordered[index], reordered[target]] = [
        reordered[target],
        reordered[index],
      ]
      }
      hydrate(
        await request('/' + id + '/reorder', {
          revision: detail.revision,
          units: reordered,
        }),
      )
    })
  const publish = () =>
    action(async () => {
      hydrate(
        await request('/' + id + '/publish', { revision: detail.revision }),
      )
    })
  const exportAll = () =>
    action(async () => {
      let after: string | null = null
      let part = 1
      do {
        const payload = await request(
          '/' +
            id +
            '/reports' +
            (after ? '?after=' + encodeURIComponent(after) : ''),
        )
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(payload, null, 2)], {
            type: 'application/json',
          }),
        )
        const a = document.createElement('a')
        a.href = url
        a.download = 'questionnaire-' + id + '-' + part++ + '.json'
        a.click()
        URL.revokeObjectURL(url)
        after = payload.next
      } while (after)
    })
  const dirty = Boolean(
    detail &&
      (name !== detail.name ||
        instruction !== (detail.instruction || '') ||
        description !== (detail.description || '') ||
        publicEnabled !== detail.publicEnabled ||
        (opensAt ? parseLocalDateTime(opensAt)?.toISOString() || opensAt : null) !==
          (detail.opensAt || null) ||
        (expiresAt ? parseLocalDateTime(expiresAt)?.toISOString() || expiresAt : null) !==
          (detail.expiresAt || null) ||
        JSON.stringify([...courseIds].sort()) !==
          JSON.stringify(
            (detail.questionnaireCourses || [])
              .map((v: any) => v.courseId)
              .sort(),
          )),
  )
  const draft = id === 'new' || detail?.status === 'DRAFT'
  const choices =
    type === 'SCALE'
      ? catalog.scales
      : type === 'COGNITIVE'
        ? catalog.cognitive
        : catalog.situational
  const localDate = (v: string) => {
    return localDateTimeValue(v)
  }
  const deliverySettings = <fieldset id="questionnaire-delivery" disabled={busy || !draft} className="space-y-3 my-4 rounded border p-4"><legend>3. 投放与发布</legend>
            {id === 'new' && (
              <label className="block">
                投放方式
                <select
                  aria-label="投放方式"
                  className="input ml-2 max-w-full"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value)
                    if (e.target.value === 'GENERAL') setPublic(true)
                  }}
                >
                  <option value="COURSE">课程问卷</option>
                  <option value="GENERAL">通用公开问卷</option>
                </select>
              </label>
            )}
            {kind === 'COURSE' && (
              <fieldset>
                <legend>投放课程（可多选）</legend>
                <p>草稿可暂不选择课程，发布前需选择至少一个投放课程。</p>
                {catalog.courses.map((v: any) => (
                  <label className="block" key={v.id}>
                    <input
                      type="checkbox"
                      checked={courseIds.includes(v.id)}
                      onChange={(e) =>
                        setCourseIds((ids) =>
                          e.target.checked
                            ? [...ids, v.id]
                            : ids.filter((x) => x !== v.id),
                        )
                      }
                    />{' '}
                    {v.title}
                  </label>
                ))}
              </fieldset>
            )}
            <label className="block">
              <input
                type="checkbox"
                checked={publicEnabled}
                onChange={(e) => setPublic(e.target.checked)}
              />{' '}
              允许通过公开链接作答
            </label>
            <label className="block">
              开始时间
              <LocalDateTimeInput
                id="questionnaire-product-opens"
                value={localDate(opensAt)}
                onChange={(e) => setOpens(e.target.value)}
              />
            </label>
            <p className="text-sm text-gray-600">时间按当前浏览器时区（{Intl.DateTimeFormat().resolvedOptions().timeZone}）输入，保存时换算为 UTC。</p>
            <label className="block">
              截止时间
              <LocalDateTimeInput
                id="questionnaire-product-expiry"
                aria-invalid={Boolean(expiryError)}
                aria-describedby={
                  expiryError ? 'questionnaire-product-expiry-error' : undefined
                }
                value={localDate(expiresAt)}
                onChange={(e) => {
                  setExpiry(e.target.value)
                  setExpiryError('')
                }}
              />
            </label>
            {expiryError && (
              <p id="questionnaire-product-expiry-error" role="alert">
                {expiryError}
              </p>
            )}
    <div className="flex flex-wrap gap-3"><ProductButton onClick={()=>setOpens(new Date().toISOString())}>设为现在开放</ProductButton><ProductButton onClick={()=>{setExpiry(new Date(Date.now()+7*86400000).toISOString());setExpiryError('')}}>设为七天后截止</ProductButton></div>
  </fieldset>
  return (
    <ProductPage width="management" className="hui-questionnaire-products">
      <PageHeader
        title={id === 'new' ? '创建组合测评' : '编制组合测评'}
        description="各项测评独立反馈，报告为单项结果合集。当前支持网页作答。"
      />
      <Link to="/questionnaires">返回组合测评列表</Link>
      {feedback}
      <nav aria-label="编制步骤" className="questionnaire-step-nav my-4">
        {[['questionnaire-basic','基本信息'],['questionnaire-content','内容与顺序'],['questionnaire-delivery','投放与发布']].map(([step,label],index) =>
          <a key={step} href={'#'+step} aria-current={activeStep === step ? 'step' : undefined} onClick={() => setActiveStep(step)}><span className="questionnaire-step-number">{index+1}.</span><span>{label}</span></a>
        )}
      </nav>
      {error && (
        <div role="alert" className="my-3 rounded border border-red-400 p-3">
          {error}
          <ProductButton className="ml-3" onClick={() => void action(reload)}>
            刷新问卷
          </ProductButton>
        </div>
      )}
      {id !== 'new' && !detail ? (
        <p role="status">正在加载问卷…</p>
      ) : (
        <>
          <fieldset
            id="questionnaire-basic"
            disabled={busy || !draft}
            className="space-y-3 my-4 rounded border p-4"
          >
            <label className="block">
              测评名称
              <input
                id="questionnaire-product-name"
                required
                maxLength={200}
                aria-invalid={Boolean(nameError)}
                aria-describedby={
                  nameError ? 'questionnaire-product-name-error' : undefined
                }
                className="input w-full"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameError('')
                }}
              />
            </label>
            {nameError && (
              <p id="questionnaire-product-name-error" role="alert">
                {nameError}
              </p>
            )}
            <label className="block">
              描述
              <textarea
                className="input w-full"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="block">
              指导语
              <textarea
                className="input w-full"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
            </label>
            <ProductButton variant={id === 'new' || dirty ? 'primary' : 'secondary'} onClick={() => void save()}>
              {id === 'new' ? '创建草稿' : '保存设置'}
            </ProductButton>
          </fieldset>
          {id === 'new' && deliverySettings}
          {detail && (
            <>
              {dirty && (
                <p role="status">
                  设置尚未保存，请先保存设置再调整内容或发布。
                </p>
              )}
              <h2 id="questionnaire-content" tabIndex={-1} className="font-semibold">
                内容与顺序 · {labels[detail.status]}
              </h2>
              <div className="questionnaire-editor-grid"><ol className="space-y-3 my-4" aria-label="内容单元">
                {units.map((v, index) => (
                  <li id={'questionnaire-unit-'+v.id} key={v.id} className="border rounded p-3">
                    <ProductButton className="questionnaire-unit-trigger" aria-label={`配置第 ${index+1} 项：${index+1}. ${v.label}`} aria-pressed={(units.some(unit=>unit.id===editingUnit)?editingUnit:units[0]?.id)===v.id} onClick={()=>setEditingUnit(v.id)}>{index+1}. {v.label}</ProductButton>
                    <span>{labels[v.type] || '表单区段'}</span>
                    {draft && (
                      <div className="flex gap-3">
                        <ProductButton
                          disabled={busy || dirty || index === 0 || Boolean(units[index - 1]?.contextSection)}
                          onClick={() => void move(index, -1)}
                        >
                          {v.contextSection ? '置顶' : '上移'}
                        </ProductButton>
                        <ProductButton
                          disabled={busy || dirty || index === units.length - 1 || v.contextSection || Boolean(units[index + 1]?.contextSection)}
                          onClick={() => void move(index, 1)}
                        >
                          下移
                        </ProductButton>
                        {v.type !== 'FORM_SECTION' && (
                          <ProductButton
                            disabled={busy || dirty}
                            onClick={() =>
                              void action(async () =>
                                hydrate(
                                  await request(
                                    '/' + id + '/items/' + v.id + '/remove',
                                    { revision: detail.revision },
                                  ),
                                ),
                              )
                            }
                          >
                            移除
                          </ProductButton>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol><div className="min-w-0 space-y-4" aria-label="单元配置">
              {units.filter(v=>v.id===(units.some(unit=>unit.id===editingUnit)?editingUnit:units[0]?.id)).map(v=><section key={v.id} className="rounded border p-4"><h3 className="font-semibold">{v.label} · 配置</h3>                    {v.type === 'FORM_SECTION' &&
                      v.items.map((item: any) => (
                        <div key={item.id}>
                          <span>{item.formLabel || item.label}</span>
                          {draft && (
                            <ProductButton
                              disabled={busy || dirty}
                              className="ml-3"
                              onClick={() =>
                                void action(async () =>
                                  hydrate(
                                    await request(
                                      '/' +
                                        id +
                                        '/items/' +
                                        item.id +
                                        '/remove',
                                      { revision: detail.revision },
                                    ),
                                  ),
                                )
                              }
                            >
                              移除此题
                            </ProductButton>
                          )}
                        </div>
                      ))}
                    {draft && v.type === 'FORM_SECTION' && !v.items.length && <ProductButton disabled={busy || dirty} onClick={() => void action(async () => hydrate(await request('/' + id + '/form-sections/' + v.id + '/remove', { revision: detail.revision })))}>移除空区段</ProductButton>}
{v.type !== 'FORM_SECTION' && <p>该测评使用已授权定义。必答与来源由当前版本固定；移动或移除请使用左侧内容列表。</p>}</section>)}
              {draft && (
                <fieldset
                  disabled={busy || dirty}
                  className="space-y-3 border rounded p-4"
                >
                  <legend>添加内容</legend>
                  <label>
                    测评类型
                    <select
                      aria-label="测评类型"
                      className="input ml-2 max-w-full"
                      value={type}
                      onChange={(e) => {
                        setType(e.target.value)
                        setSelected('')
                      }}
                    >
                      {['SCALE', 'COGNITIVE', 'SITUATIONAL', 'FORM'].map(
                        (t) => (
                          <option key={t} value={t}>
                            {labels[t]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  {type !== 'FORM' ? (
                    <label className="block">
                      选择测评
                      <select
                        aria-label="选择测评"
                        className="input ml-2 max-w-full"
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        <option value="">请选择已发布测评</option>
                        {choices.map((v: any) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                            {v.profile ? ' · ' + v.profile : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <>
                      <label className="block">
                        题目文字
                        <input
                          value={formLabel}
                          onChange={(e) => setFormLabel(e.target.value)}
                        />
                      </label>
                      <label className="block">
                        题型
                        <select
                          aria-label="题型"
                          className="input ml-2 max-w-full"
                          value={formType}
                          onChange={(e) => setFormType(e.target.value)}
                        >
                          {[
                            'text_input',
                            'fill_blank',
                            'single_choice',
                            'multiple_choice',
                            'year_month',
                          ].map((t) => (
                            <option key={t} value={t}>
                              {
                                (
                                  {
                                    text_input: '文本',
                                    fill_blank: '填空',
                                    single_choice: '单选',
                                    multiple_choice: '多选',
                                    year_month: '年月',
                                  } as any
                                )[t]
                              }
                            </option>
                          ))}
                        </select>
                      </label>
                      {['single_choice', 'multiple_choice'].includes(
                        formType,
                      ) && (
                        <label className="block">
                          选项（值=标签，以逗号分隔）
                          <input
                            value={options}
                            onChange={(e) => setOptions(e.target.value)}
                          />
                        </label>
                      )}
                      <label className="block">
                        背景字段
                        <select
                          aria-label="背景字段"
                          className="input ml-2 max-w-full"
                          value={contextKey}
                          onChange={(e) => {
                            setContext(e.target.value)
                            setRequired(true)
                            if (e.target.value) {
                              setFormType(
                                e.target.value === 'birthYearMonth'
                                  ? 'year_month'
                                  : 'single_choice',
                              )
                              setOptions(
                                serializeDelimitedOptions(
                                  contextOptionsForKey(e.target.value),
                                ),
                              )
                            }
                          }}
                        >
                          <option value="">普通表单题</option>
                          {[
                            'birthYearMonth',
                            'sexAtBirth',
                            'gradeLevel',
                            'primaryLanguage',
                            'countryOrRegion',
                          ].map((k) => (
                            <option key={k} value={k}>
                              {
                                (
                                  {
                                    birthYearMonth: '出生年月',
                                    sexAtBirth: '出生性别',
                                    gradeLevel: '年级',
                                    primaryLanguage: '主要语言',
                                    countryOrRegion: '国家或地区',
                                  } as any
                                )[k]
                              }
                            </option>
                          ))}
                        </select>
                      </label>
                      {contextKey && (
                        <label className="block">
                          <input
                            type="checkbox"
                            checked={required}
                            onChange={(e) => setRequired(e.target.checked)}
                          />{' '}
                          必填
                        </label>
                      )}
                    </>
                  )}
                  <ProductButton onClick={() => void add()}>
                    添加到测评
                  </ProductButton>
                </fieldset>
              )}
              </div></div>
              {deliverySettings}
              <div className="flex flex-wrap gap-4 my-5">
                {draft && <ProductButton variant={!dirty && !(preflight?.ok && preflight.revision === detail.revision) ? 'primary' : 'secondary'} disabled={busy || dirty} onClick={() => void action(async () => setPreflight(await request('/' + id + '/preflight', { revision: detail.revision })))}>发布前自检</ProductButton>}
                {draft && (
                  <ProductButton
                    disabled={busy || dirty}
                    variant={preflight?.ok && preflight.revision === detail.revision ? 'primary' : 'secondary'}
                    onClick={() => void publish()}
                  >
                    发布组合测评
                  </ProductButton>
                )}
                <ProductButton
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const row = await request('/' + id + '/copy', {
                        requestId: crypto.randomUUID(),
                      })
                      navigate(base + '/' + row.id)
                    })
                  }
                >
                  复制为新草稿
                </ProductButton>
                <Link to={'/composite-assessments/' + id + '/results'}>
                  查看作答与结果
                </Link>
                <ProductButton disabled={busy} onClick={() => void exportAll()}>
                  导出独立报告（JSON）
                </ProductButton>
                {detail.status === 'PUBLISHED' && (
                  <ProductButton variant="danger"
                    disabled={busy || dirty}
                    onClick={() =>
                      void action(async () =>
                        hydrate(
                          await request('/' + id + '/archive', {
                            revision: detail.revision,
                          }),
                        ),
                      )
                    }
                  >
                    停止新作答
                  </ProductButton>
                )}
                {draft && (
                  <ProductButton variant="danger"
                    disabled={busy}
                    onClick={async () => {
                      if (await confirmManagement({ title: '删除组合草稿', body: '仅删除尚未发布的定义；存在引用时服务器会拦截。', confirmLabel: '删除草稿', danger: true }))
                        void action(async () => {
                          await request('/' + id + '/remove', {
                            revision: detail.revision,
                          })
                          navigate('/questionnaires')
                        })
                    }}
                  >
                    删除草稿
                  </ProductButton>
                )}
              </div>
              {preflight && preflight.revision === detail.revision && <section aria-label="发布自检结果" className="my-4 rounded border p-4">
                <h2 className="font-semibold">{preflight.ok ? '当前草稿自检通过' : '发布前请处理以下问题'}</h2>
                <ul className="mt-2 space-y-2">{preflight.checks.map(check => <li key={check.key}><strong>{check.label}：{check.status === 'passed' ? '通过' : '需要处理'}</strong><p>{check.message}</p>{check.targetId&&<ProductButton onClick={()=>{setEditingUnit(check.targetId!);document.getElementById('questionnaire-unit-'+check.targetId)?.scrollIntoView({block:'center'})}}>配置对应单元</ProductButton>}{check.status!=='passed'&&<a href={check.key==='delivery'?'#questionnaire-delivery':'#questionnaire-content'}>定位并修复{check.key==='delivery'?'投放设置':'内容单元'}</a>}</li>)}</ul>
                <p className="mt-2 text-sm text-slate-600">正式发布时会再次检查当前草稿与权限。</p>
              </section>}
              {detail.publicEnabled && detail.status === 'PUBLISHED' && id && (
                <PublicDeliveryManager
                  key={id}
                  family="COMPOSITE"
                  resourceId={id}
                  maximumExpiry={detail.expiresAt}
                />
              )}
            </>
          )}
        </>
      )}
    </ProductPage>
  )
}
