import { FormChoiceEditor } from './FormChoiceEditor'
import { choiceError, emptyChoices, filledChoices, type ChoiceDraft } from './formChoices'
import { TypedFormExportActions } from '../../modules/composite/TypedFormExportActions'
import { StructuredFormConstraints } from '../../modules/assessment-core/form/StructuredFormConstraints'
import { BasicFormConstraints } from '../../modules/assessment-core/form/BasicFormConstraints'
import type { FormQuestion } from '../../modules/assessment-core/form/types'
import type { TrainingFeedbackPolicy } from '../../modules/composite/types'
import { isTrainingHost } from '../../training/context'
import '../../training/training-form-surface.css'
import { apiErrorMessage } from '../../utils/apiErrorMessage'
import { PublicDeliveryManager } from '../../components/PublicDeliveryManager'
import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import apiClient from '../../api/client'
import { resolveTrainingCoursePrefill } from '../../training/resolveCoursePrefill'
import { useCognitiveEnabled } from '../../contexts/CapabilitiesContext'
import { useAuth } from '../../contexts/AuthContext'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'
import LocalDateTimeInput, { localDateTimeValue, parseLocalDateTime } from '../../components/LocalDateTimeInput'
import './questionnaire-products.css'
import './questionnaire-training-editor.css'
import { ArrowLeft, ArrowRight, BookOpen, Brain, Check, ClipboardList, Layers, ListChecks, Route, Save } from 'lucide-react'
import { TrainingVariantEditor } from './TrainingVariantEditor'
import { TrainingFlowEditor, trainingFlowEditorId } from './TrainingFlowEditor'
import { formatTrainingFlow, isMaterialFlowText, trainingFlowRequest, parseTrainingFlow, type TrainingFlowConfig } from './trainingFlow'
import { validateTrainingVariants, type TrainingVariantConfig } from './trainingVariants'
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

const typedFormTypes: Record<string, FormQuestion<never>['type']> = {
  number: 'NUMBER', long_text: 'LONG_TEXT', date: 'DATE', time: 'TIME', likert: 'LIKERT',
  matrix: 'MATRIX', matrix_multiple: 'MATRIX_MULTIPLE', rank_order: 'RANK_ORDER', slider: 'SLIDER', constant_sum: 'CONSTANT_SUM',
}
const structuredOptionTypes = ['LIKERT', 'MATRIX', 'MATRIX_MULTIPLE', 'RANK_ORDER', 'CONSTANT_SUM']
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
    <ProductPage width="management" className={`hui-questionnaire-products${isTrainingHost() ? ' training-form-management' : ''}`}>
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
      {templateSource && <section className="my-4 rounded border p-4" aria-label="保存组合模板"><h2>从 {templateSource.name} 保存私有模板</h2><p>只复制内容定义，移除课程投放与公开链接，不携带作答或授权。</p><p>模板不保留学员反馈开放时间、草稿保留时长或课程级作答计时选项。复制为新草稿后，请为新课程重新选择这些投放设置，再发布；题目定义、计分规则和认知任务的刺激时序不变。</p><label>模板名称<input className="input" maxLength={200} value={templateName} onChange={e => setTemplateName(e.target.value)} disabled={savingTemplate}/></label><ProductButton disabled={savingTemplate || !templateName.trim()} onClick={async () => {
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
                {row.kind === 'COLLECTION' && row.status === 'DRAFT' && <Link className="hui-button hui-button--primary" to={row.editHref + '#questionnaire-publish'}>前往发布</Link>}
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
  const trainingDesign = isTrainingHost()
  const cognitiveEnabled = useCognitiveEnabled()
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
  const [feedbackMode, setFeedbackMode] = useState<TrainingFeedbackPolicy['mode']>('IMMEDIATE')
  const [feedbackReleaseAt, setFeedbackReleaseAt] = useState('')
  const [feedbackChanged, setFeedbackChanged] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [timingEnabled,setTimingEnabled]=useState(false)
  const [checkpointEnabled,setCheckpointEnabled]=useState(false)
  const [checkpointHours,setCheckpointHours]=useState(24)
  const [localCognitiveEnabled,setLocalCognitiveEnabled]=useState(false)
  const [localCognitiveHours,setLocalCognitiveHours]=useState(24)
  const [trainingVariantDraft, setTrainingVariantDraft] = useState<TrainingVariantConfig | null>(null)
  const [trainingFlowText, setTrainingFlowText] = useState('')
  const [trainingFlowError, setTrainingFlowError] = useState('')
  const [maxAttempts, setMaxAttempts] = useState(1)
  const [expiresAt, setExpiry] = useState('')
  const [opensAt, setOpens] = useState('')
  const [type, setType] = useState('SCALE')
  const [selected, setSelected] = useState('')
  useEffect(() => {
    if (!cognitiveEnabled && type === 'COGNITIVE') { setType('SCALE'); setSelected('') }
  }, [cognitiveEnabled, type])

  const [formLabel, setFormLabel] = useState('')
  const [editingUnit, setEditingUnit] = useState('')
  const location = useLocation()
  const hasDetail = Boolean(detail)
  const [activeStep, setActiveStep] = useState('questionnaire-basic')
  useEffect(() => {
    const requestedStep = location.hash.slice(1)
    const step = trainingDesign && id === 'new' && !['questionnaire-basic','questionnaire-delivery'].includes(requestedStep) ? 'questionnaire-basic' : requestedStep
    setActiveStep(['questionnaire-basic', 'questionnaire-content', 'questionnaire-delivery', 'questionnaire-publish'].includes(step) ? step : 'questionnaire-basic')
    if (!trainingDesign && (hasDetail || id === 'new') && step) {
      const frame = requestAnimationFrame(() => document.getElementById(step)?.scrollIntoView({ block: 'start' }))
      return () => cancelAnimationFrame(frame)
    }
  }, [location.hash, hasDetail, id, trainingDesign])
  const [formType, setFormType] = useState('text_input')
  const [formConstraints, setFormConstraints] = useState<Partial<FormQuestion<never>>>({})
  const [policyEnabled,setPolicyEnabled] = useState(false)
  const [targetFormSection,setTargetFormSection] = useState('')
  const [startNewFormStage, setStartNewFormStage] = useState(false)
  const [advancedFormOpen, setAdvancedFormOpen] = useState(false)
  useEffect(() => { setStartNewFormStage(false) }, [id])
  const [requiredRefusal,setRequiredRefusal] = useState<'BLOCK_SUBMIT'|'ALLOW_SUBMIT'>('BLOCK_SUBMIT')
  const [hiddenRequired,setHiddenRequired] = useState<'EXEMPT'|'NOT_SATISFIED'>('EXEMPT')
  const typedFormType = typedFormTypes[formType] ?? (policyEnabled ? ({single_choice:'SINGLE',multiple_choice:'MULTIPLE',text_input:'SHORT_TEXT',fill_blank:'SHORT_TEXT'} as const)[formType as 'single_choice'] : undefined)

  const [matrixRows, setMatrixRows] = useState('')
  const [options, setOptions] = useState('')
  const [choiceDrafts, setChoiceDrafts] = useState(() => emptyChoices('option'))
  const [matrixDrafts, setMatrixDrafts] = useState(() => emptyChoices('row'))
  const formOptions = trainingDesign ? filledChoices(choiceDrafts) : parseDelimitedOptions(options)
  const formRows = trainingDesign ? filledChoices(matrixDrafts) : parseDelimitedOptions(matrixRows)
  const changeChoices = (next: ChoiceDraft[]) => {
    setChoiceDrafts(next)
    const keys = new Set(filledChoices(next).map(choice => choice.value))
    setFormConstraints(previous => ({ ...previous,
      ...(!keys.has(previous.otherOptionKey ?? '') ? { otherOptionKey: undefined, otherMaxLength: undefined } : {}),
      ...(previous.exclusiveOptionKeys ? { exclusiveOptionKeys: previous.exclusiveOptionKeys.filter(key => keys.has(key)) } : {}),
    }))
  }
  const [contextKey, setContext] = useState('')
  // Only the last ordinary, contiguous Form section may receive new questions.
  // Background sections and an intervening instrument are explicit boundaries.
  const orderedFormItems = [...(detail?.items ?? [])].sort((a: any, b: any) => a.position - b.position)
  const lastFormItem = orderedFormItems[orderedFormItems.length - 1]
  const lastUnitPosition = Math.max(-1,
    ...(detail?.items ?? []).filter((item: any) => item.type !== 'FORM').map((item: any) => item.position),
    ...(detail?.formSections ?? []).map((section: any) => section.position),
  )
  const currentFormStage = (detail?.formSections ?? []).find((section: any) => {
    if (section.contextSection || !section.items?.length || section.position !== lastUnitPosition
      || section.id !== lastFormItem?.formSectionId || section.items.some((item: any) => item.contextKey)) return false
    const first = orderedFormItems.findIndex((item: any) => item.formSectionId === section.id)
    return first >= 0 && orderedFormItems.slice(first).every((item: any) => item.type === 'FORM' && item.formSectionId === section.id)
  })
  const effectiveFormSection = trainingDesign
    ? !startNewFormStage && !contextKey ? currentFormStage?.id ?? '' : ''
    : targetFormSection
  const conditionSources = (detail?.formSections?.find((section: any) => section.id === effectiveFormSection)?.items ?? [])
    .filter((item: any) => ['SINGLE', 'MULTIPLE'].includes(item.formDefinition?.type))
  const selectNewFormStage = (enabled: boolean) => {
    setStartNewFormStage(enabled)
    setFormConstraints(previous => ({ ...previous, displayIf: undefined }))
  }
  const [required, setRequired] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const actionInFlight = useRef(false)
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
    setFeedbackMode(row.trainingFeedbackPolicy?.mode ?? 'IMMEDIATE')
    setFeedbackReleaseAt(row.trainingFeedbackPolicy?.releaseAt ?? '')
    setFeedbackChanged(false)
    setFeedbackError('')
    setTimingEnabled(Boolean(row.trainingTimingPolicy))
    setCheckpointEnabled(row.trainingPersistencePolicy?.checkpoint?.enabled===true)
    setCheckpointHours(row.trainingPersistencePolicy?.checkpoint?.ttlHours??24)
    setLocalCognitiveEnabled(row.trainingPersistencePolicy?.localCognitive?.enabled===true)
    setLocalCognitiveHours(row.trainingPersistencePolicy?.localCognitive?.ttlHours??24)
    setTrainingVariantDraft(row.trainingVariantDraft ?? null)
    setTrainingFlowText(formatTrainingFlow(row.trainingFlowDraft ?? null))
    setTrainingFlowError('')
    setMaxAttempts(row.maxAttempts ?? 1)
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
    if (actionInFlight.current) return
    actionInFlight.current = true
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(message(e))
    } finally {
      actionInFlight.current = false
      setBusy(false)
    }
  }
  const persistencePolicy = () => ({schemaVersion:1,checkpoint:checkpointEnabled?{enabled:true,ttlHours:checkpointHours}:null,localCognitive:localCognitiveEnabled?{enabled:true,ttlHours:localCognitiveHours}:null})
  const feedbackPolicy = (): TrainingFeedbackPolicy => feedbackMode === 'SCHEDULED'
    ? { schemaVersion: 1, mode: 'SCHEDULED', releaseAt: parseLocalDateTime(feedbackReleaseAt)?.toISOString() ?? feedbackReleaseAt }
    : { schemaVersion: 1, mode: 'IMMEDIATE' }
  const metadata = () => ({
    name: name.trim(),
    instruction,
    description,
    courseIds: kind === 'GENERAL' ? [] : courseIds,
    publicEnabled,
    ...(feedbackScopeCleared ? { trainingFeedbackPolicy: null }
      : (id === 'new' && trainingEligible) || feedbackDefaultsOnBinding || feedbackDirty ? { trainingFeedbackPolicy: feedbackPolicy() } : {}),
    ...(checkpointEnabled||localCognitiveEnabled||detail?.trainingPersistencePolicy?{trainingPersistencePolicy:persistencePolicy()}:{}),
    ...(timingEnabled||detail?.trainingTimingPolicy?{trainingTimingEnabled:timingEnabled}:{}),
    expiresAt: expiresAt ? parseLocalDateTime(expiresAt)?.toISOString() : null,
    opensAt: opensAt ? parseLocalDateTime(opensAt)?.toISOString() : null,
  })
  const focusEditorField = (fieldId: string, stepKey: string) => {
    if (!trainingDesign) { document.getElementById(fieldId)?.focus(); return }
    setActiveStep(stepKey)
    navigate(`${location.pathname}${location.search}#${stepKey}`, { replace: true })
    requestAnimationFrame(() => {
      const field = document.getElementById(fieldId)
      const disclosure = field?.closest('details')
      if (disclosure) disclosure.open = true
      field?.focus()
    })
  }
  const save = () => {
    if ((checkpointEnabled && (!Number.isInteger(checkpointHours)||checkpointHours<1||checkpointHours>48)) || (localCognitiveEnabled && (!Number.isInteger(localCognitiveHours)||localCognitiveHours<1||localCognitiveHours>48))) { setError('草稿保留时间必须为 1–48 的整数小时。'); if (trainingDesign) { setActiveStep('questionnaire-delivery'); navigate(`${location.pathname}${location.search}#questionnaire-delivery`, { replace: true }) } return }
    if (feedbackDirty && !trainingEligible && !feedbackScopeCleared) {
      setError('学员报告开放设置仅支持真实 Training 课程投放；公开链接须唯一绑定一个课程。')
      return
    }
    if (trainingEligible && feedbackMode === 'SCHEDULED' && (id === 'new' || feedbackDirty) && !parseLocalDateTime(feedbackReleaseAt)) {
      setFeedbackError('请选择有效的报告开放时间。')
      focusEditorField('questionnaire-feedback-release', 'questionnaire-delivery')
      return
    }

    const invalidName = !name.trim()
      ? '请填写测评名称'
      : name.trim().length > 200
        ? '测评名称不能超过200字'
        : ''
    const invalidExpiry =
      publicEnabled && !expiresAt ? '公开问卷需要设置截止时间' : expiresAt && !parseLocalDateTime(expiresAt) ? '截止时间无效，请按年-月-日 时:分填写' : opensAt && expiresAt && parseLocalDateTime(opensAt) && parseLocalDateTime(expiresAt) && parseLocalDateTime(opensAt)! > parseLocalDateTime(expiresAt)! ? '截止时间不能早于开始时间' : ''
    setNameError(invalidName)
    setExpiryError(invalidExpiry)
    if (opensAt && !parseLocalDateTime(opensAt)) { setError('开始时间无效，请按年-月-日 时:分填写'); focusEditorField('questionnaire-product-opens', 'questionnaire-delivery'); return }
    if (invalidName || invalidExpiry) {
      focusEditorField(invalidName ? 'questionnaire-product-name' : 'questionnaire-product-expiry', invalidName ? 'questionnaire-basic' : 'questionnaire-delivery')
      return
    }
    if (variantsDirty && trainingVariantDraft) {
      const variantError = !variantsEligible
        ? '随机分组仅支持真实 Training 课程投放；公开链接须唯一绑定一个课程。'
        : validateTrainingVariants(trainingVariantDraft, maxAttempts, units)
      if (variantError) { setError(variantError); if (trainingDesign) { setActiveStep('questionnaire-delivery'); navigate(`${location.pathname}${location.search}#questionnaire-delivery`, { replace: true }) } return }
    }
    let flowConfig: TrainingFlowConfig | null = null
    if (flowDirty) {
      try {
        flowConfig = parseTrainingFlow(trainingFlowText, units)
        trainingFlowRequest(detail?.revision ?? 0, flowConfig, maxAttempts)
        if (flowConfig && !flowEligible) throw new Error('条件流程仅支持真实 Training 课程投放，且不能与随机分组或其他投放策略组合。')
        setTrainingFlowError('')
      } catch (cause) {
        setTrainingFlowError(message(cause))
        focusEditorField(trainingFlowEditorId, 'questionnaire-delivery')
        return
      }
    }
    return action(async () => {
      if (id === 'new') {
        const row = await request('', {
          ...metadata(),
          questionnaireType: kind,
          requestId,
        })
        navigate(base + '/' + row.id + (preselectedScaleId ? '?scaleId=' + encodeURIComponent(preselectedScaleId) : '') + (trainingDesign ? '#questionnaire-content' : ''), { replace: true })
      } else {
        let row = detail
        // Disable first so delivery can leave Training without an active config.
        // Keep each successful revision if a later save fails; local edits remain.
        if (variantsDirty && !trainingVariantDraft) {
          row = await request('/' + id + '/training-variants', { revision: row.revision, config: null })
          setDetail(row)
        }
        if (flowDirty && !flowConfig) {
          row = await request('/' + id + '/training-flow', { revision: row.revision, config: null })
          setDetail(row)
        }
        if (metadataDirty) {
          row = await request('/' + id, { ...metadata(), revision: row.revision }, 'put')
          setDetail(row)
        }
        if (variantsDirty && trainingVariantDraft) {
          row = await request('/' + id + '/training-variants', { revision: row.revision, config: trainingVariantDraft, maxAttempts })
        }
        if (flowDirty && flowConfig) {
          try {
            row = await request('/' + id + '/training-flow', trainingFlowRequest(row.revision, flowConfig, maxAttempts))
          } catch (cause) {
            setTrainingFlowError(message(cause))
            requestAnimationFrame(() => focusEditorField(trainingFlowEditorId, 'questionnaire-delivery'))
            throw cause
          }
        }
        hydrate(row)
      }
    })
  }
  const add = () =>
    action(async () => {
      if (trainingDesign && type === 'FORM') {
        const hasChoices = ['single_choice', 'multiple_choice'].includes(formType) || structuredOptionTypes.includes(typedFormType)
        if (hasChoices) {
          const problem = choiceError(choiceDrafts, 30, Boolean(typedFormType))
          if (problem) throw new Error(problem)
          if (!formOptions.length) throw new Error('请至少填写一个选项。')
        }
        if (['matrix', 'matrix_multiple'].includes(formType)) {
          const problem = choiceError(matrixDrafts, 40, true)
          if (problem) throw new Error(problem)
          if (!formRows.length) throw new Error('请至少填写一行矩阵内容。')
        }
      }
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
          ...(typedFormType ? { formDefinition: { ...formConstraints, type: typedFormType, prompt: formLabel, required, options: [...structuredOptionTypes,'SINGLE','MULTIPLE'].includes(typedFormType) ? formOptions.map(option => ({ optionKey: option.value, label: option.label })) : [], rows: ['MATRIX', 'MATRIX_MULTIPLE'].includes(typedFormType) ? formRows.map(row => ({ rowKey: row.value, label: row.label })) : [], ...(typedFormType === 'CONSTANT_SUM' ? { total: formConstraints.total ?? 100 } : {}), ...(typedFormType === 'TIME' ? { timeZone: formConstraints.timeZone ?? 'Asia/Shanghai' } : {}) } } : {}),
          ...(policyEnabled ? {formPolicy:{version:3,requiredRefusal,hiddenRequired}}:{}),
          contextKey: contextKey || null,
          formOptions: ['single_choice', 'multiple_choice'].includes(formType)
            ? formOptions
            : null,
        })
      hydrate(
        await request('/' + id + '/items', { revision: detail.revision, item, ...(type==='FORM'&&effectiveFormSection?{formSectionId:effectiveFormSection}:{}) }),
      )
      setSelected('')
      setFormLabel('')
      if (trainingDesign) {
        setStartNewFormStage(false)
        setFormConstraints(previous => ({ ...previous, displayIf: undefined }))
      }
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
  const publish = async () => {
    if (trainingDesign && !await confirmManagement({ title: '确认发布组合测评', body: '发布后内容、投放范围和相关策略将冻结。确认后系统会再次检查当前草稿与权限。', confirmLabel: '确认发布' })) return
    return action(async () => {
      hydrate(
        await request('/' + id + '/publish', { revision: detail.revision }),
      )
    })
  }
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
  const trainingEligible = kind === 'COURSE' && !detail?.reportPackage && !detail?.analysisProtocol &&
    (!detail?.productKind || detail.productKind === 'QUESTIONNAIRE') && courseIds.length > 0 && courseIds.length <= 100 &&
    courseIds.every(courseId => catalog.courses.some((course: { id: string; courseType?: string; isLibrary?: boolean }) => course.id === courseId && course.courseType === 'TRAINING_COURSE' && !course.isLibrary)) &&
    (!publicEnabled || courseIds.length === 1)
  const feedbackDirty = feedbackChanged && JSON.stringify(feedbackPolicy()) !== JSON.stringify(detail?.trainingFeedbackPolicy ?? null)
  const feedbackDefaultsOnBinding = Boolean(detail && !detail.trainingFeedbackPolicy && !feedbackChanged && !detail.questionnaireCourses?.length && trainingEligible)
  const deliveryScopeChanged = detail && (publicEnabled !== detail.publicEnabled || kind !== detail.questionnaireType ||
    JSON.stringify([...courseIds].sort()) !== JSON.stringify((detail.questionnaireCourses || []).map((course: { courseId: string }) => course.courseId).sort()))
  const feedbackScopeCleared = Boolean((detail?.trainingFeedbackPolicy || feedbackChanged) && (id === 'new' || deliveryScopeChanged) && !trainingEligible)
  const metadataDirty = Boolean(
    detail &&
      (name !== detail.name ||
        instruction !== (detail.instruction || '') ||
        description !== (detail.description || '') ||
        publicEnabled !== detail.publicEnabled ||
        feedbackDirty || feedbackScopeCleared ||
        timingEnabled!==Boolean(detail.trainingTimingPolicy)||
        checkpointEnabled!==Boolean(detail.trainingPersistencePolicy?.checkpoint?.enabled)||
        localCognitiveEnabled!==Boolean(detail.trainingPersistencePolicy?.localCognitive?.enabled)||
        (checkpointEnabled&&checkpointHours!==detail.trainingPersistencePolicy?.checkpoint?.ttlHours)||
        (localCognitiveEnabled&&localCognitiveHours!==detail.trainingPersistencePolicy?.localCognitive?.ttlHours)||
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
  const variantsDirty = Boolean(detail && (
    JSON.stringify(trainingVariantDraft) !== JSON.stringify(detail.trainingVariantDraft ?? null) ||
    (trainingVariantDraft && maxAttempts !== (detail.maxAttempts ?? 1))
  ))
  const flowDirty = Boolean(detail && (trainingFlowText !== formatTrainingFlow(detail.trainingFlowDraft ?? null) || (isMaterialFlowText(trainingFlowText) && maxAttempts !== (detail.maxAttempts ?? 1))))
  const dirty = metadataDirty || variantsDirty || flowDirty
  const variantsEligible = trainingEligible && !trainingFlowText.trim() && !detail?.trainingFlowFrozen
  const flowEligible = trainingEligible && !trainingVariantDraft && !detail?.trainingVariantFrozen &&
    !detail?.anonymousStudy && !detail?.anonymousStudyId && !detail?.assignmentRef &&
    !detail?.deliveryPolicy && !detail?.selectionPolicy && !detail?.routingPolicy && !detail?.randomizationPolicy
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
  const persistenceSettings = <>
            <fieldset disabled={kind!=='COURSE'||!draft||busy} className="space-y-2 rounded border p-3">
              <legend>可选草稿保留策略（发布后冻结）</legend>
              <label className="block"><input type="checkbox" checked={checkpointEnabled} onChange={e=>setCheckpointEnabled(e.target.checked)}/> 启用服务器草稿</label>
              {checkpointEnabled?<label className="block">服务器草稿保留小时数（1–48）<input aria-label="服务器草稿保留小时数" type="number" min={1} max={48} step={1} required className="input" value={checkpointHours} onChange={e=>setCheckpointHours(Number(e.target.value))}/></label>:null}
              <label className="block"><input type="checkbox" checked={localCognitiveEnabled} onChange={e=>setLocalCognitiveEnabled(e.target.checked)}/> 启用认知任务本机草稿到期清理</label>
              {localCognitiveEnabled?<label className="block">认知本机草稿保留小时数（1–48）<input aria-label="认知本机草稿保留小时数" type="number" min={1} max={48} step={1} required className="input" value={localCognitiveHours} onChange={e=>setLocalCognitiveHours(Number(e.target.value))}/></label>:null}
              <p className="text-sm">两项默认关闭，分别设置。适用于本次新发布的登录学员和匿名作答；公开投放须绑定唯一 Training 课程。服务器最多成功保存 100 次，清除不重置；保留时间不延长课程或任务截止时间。认知本机清理保护正在进行、已封存和待确认提交。</p>
            </fieldset>
            <label className="block"><input type="checkbox" checked={timingEnabled} disabled={kind!=='COURSE'||!draft} onChange={e=>setTimingEnabled(e.target.checked)}/> 可选：记录 Scale 浏览器有效前台时间</label>
            <p className="text-sm">默认关闭，仅支持明确 Training 课程投放；公开链接必须唯一绑定一个课程。时间仅作描述，不改变评分，后台及暂停时间不计入。发布后采集策略冻结。</p>
  </>
  const feedbackSettings = <>
            {(trainingEligible || detail?.trainingFeedbackPolicy || feedbackChanged) && <fieldset className="space-y-2 rounded border p-3 qt-feedback-settings" disabled={busy || !draft || !trainingEligible}>
              <legend>学员报告开放（发布后冻结）</legend>
              <label className="block"><input type="radio" name="training-feedback-mode" value="IMMEDIATE" checked={feedbackMode === 'IMMEDIATE'} onChange={() => { setFeedbackMode('IMMEDIATE'); setFeedbackChanged(true); setFeedbackError('') }} /> 整份测评完成且报告生成后即可查看（默认）</label>
              <label className="block"><input type="radio" name="training-feedback-mode" value="SCHEDULED" checked={feedbackMode === 'SCHEDULED'} onChange={() => { setFeedbackMode('SCHEDULED'); setFeedbackChanged(true); setFeedbackError('') }} /> 预设时间开放</label>
              {feedbackMode === 'SCHEDULED' && <label className="block">报告开放时间<LocalDateTimeInput picker id="questionnaire-feedback-release" className="input w-full" value={feedbackReleaseAt}
                aria-invalid={Boolean(feedbackError)} aria-describedby={feedbackError ? 'questionnaire-feedback-release-error' : 'questionnaire-feedback-timezone'}
                onChange={event => { setFeedbackReleaseAt(event.target.value); setFeedbackChanged(true); setFeedbackError('') }} /></label>}
              {feedbackMode === 'SCHEDULED' && <p id="questionnaire-feedback-timezone" className="text-sm">按设备时区（{Intl.DateTimeFormat().resolvedOptions().timeZone}）设置；到时仍须完成整份测评并生成报告。</p>}
              {feedbackError && <p id="questionnaire-feedback-release-error" role="alert">{feedbackError}</p>}
              <p className="text-sm">仅在统一讲解或保护测评过程时选择预设时间。教师原有的报告查看、分析和导出不受此设置影响。</p>
              {detail && !detail.trainingFeedbackPolicy && !feedbackChanged && !feedbackDefaultsOnBinding && <p className="text-sm">历史未配置记录沿用原有反馈方式；其他设置的保存不会改变它。</p>}
              {feedbackScopeCleared && <p role="status">当前投放已不符合 Training 课程范围，保存时将清除学员报告开放设置。</p>}
            </fieldset>}
  </>
  const deliverySettings = <fieldset id="questionnaire-delivery" disabled={busy || !draft} className="space-y-3 my-4 rounded border p-4 questionnaire-delivery-panel"><legend>3. 投放设置</legend><div className="questionnaire-delivery-grid"><div className="questionnaire-delivery-audience">
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
                <p>{draft ? '草稿可暂不选择课程，发布前需选择至少一个投放课程。' : '当前版本的课程投放范围。'}</p>
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
            {!trainingDesign && persistenceSettings}
            {!trainingDesign && feedbackSettings}
            </div><div className="questionnaire-delivery-window"><div className="questionnaire-date-grid"><label className="block">
              开始时间
              {!draft && !opensAt ? <p className="questionnaire-window-summary">发布后立即开放</p> : <LocalDateTimeInput picker className="input w-full"
                id="questionnaire-product-opens"
                value={localDate(opensAt)}
                onChange={(e) => setOpens(e.target.value)}
              />}
            </label>
            <label className="block">
              截止时间
              {!draft && !expiresAt ? <p className="questionnaire-window-summary">不设截止时间</p> : <LocalDateTimeInput picker className="input w-full"
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
              />}
            </label>
            </div>
            <p className="text-sm text-gray-600">按设备时区（{Intl.DateTimeFormat().resolvedOptions().timeZone}）设置。开始时间留空即发布后开放；公开链接需设置截止时间。</p>
            {expiryError && (
              <p id="questionnaire-product-expiry-error" role="alert">
                {expiryError}
              </p>
            )}
    {draft && <div className="flex flex-wrap gap-3"><ProductButton onClick={()=>setOpens(new Date().toISOString())}>设为现在开放</ProductButton><ProductButton onClick={()=>{setExpiry(new Date(Date.now()+7*86400000).toISOString());setExpiryError('')}}>设为七天后截止</ProductButton></div>}
    </div>{trainingDesign && feedbackSettings}</div>
    {detail && draft && !trainingDesign && <div className="questionnaire-delivery-footer"><p role="status">{dirty ? '设置有未保存的修改' : '设置已保存'}</p><ProductButton variant={dirty ? 'primary' : 'secondary'} disabled={busy || !dirty} onClick={() => void save()}>保存投放设置</ProductButton><a href="#questionnaire-publish">前往正式发布 ↑</a></div>}
  </fieldset>
  const formRules = <>
                      {formType!=='year_month'&&!contextKey ? <label className="block"><input type="checkbox" checked={policyEnabled} onChange={e=>{setPolicyEnabled(e.target.checked);if(!e.target.checked)setFormConstraints(previous=>({...previous,allowRefusal:undefined,displayIf:undefined,otherOptionKey:undefined,otherMaxLength:undefined,exclusiveOptionKeys:undefined}))}}/>{trainingDesign ? '启用条件显示、拒答等规则' : '启用新表单策略（V3）'}</label>:null}
                      {policyEnabled && <fieldset className="space-y-3 rounded border p-3"><legend>{trainingDesign ? '本题规则' : '本次新发布的表单策略'}</legend>
                        <label className="block"><input type="checkbox" checked={formConstraints.allowRefusal===true} onChange={e=>setFormConstraints(previous=>({...previous,allowRefusal:e.target.checked}))}/>允许明确拒答</label>
                        <label className="block">必答拒答<select aria-label="必答拒答" value={requiredRefusal} onChange={e=>setRequiredRefusal(e.target.value as typeof requiredRefusal)}><option value="BLOCK_SUBMIT">拒答后不能交卷</option><option value="ALLOW_SUBMIT">允许交卷但不达成任务</option></select></label>
                        <label className="block">隐藏必答题<select aria-label="隐藏必答题" value={hiddenRequired} onChange={e=>setHiddenRequired(e.target.value as typeof hiddenRequired)}><option value="EXEMPT">本次不适用，不要求作答</option><option value="NOT_SATISFIED">本次任务未达成</option></select></label>
                        <label className="block">显示条件<select aria-label="显示条件" value={formConstraints.displayIf?.itemKey??''} onChange={e=>{const source=conditionSources.find((s:any)=>s.formDefinition.itemKey===e.target.value)?.formDefinition;setFormConstraints(previous=>({...previous,displayIf:source?{itemKey:source.itemKey,operator:source.type==='MULTIPLE'?'INCLUDES':'EQUALS',optionKey:source.options[0]?.optionKey??''}:undefined}))}}><option value="">始终显示</option>{conditionSources.map((source:any)=><option key={source.id} value={source.formDefinition.itemKey}>{source.formLabel}</option>)}</select></label>
                        {trainingDesign && !conditionSources.length && <p className="qt-form-hint">当前阶段还没有可引用的前题。请先在本阶段添加启用高级规则的单选或多选题，再添加条件题。</p>}
                        {formConstraints.displayIf ? <label className="block">前题选项<select aria-label="前题选项" value={formConstraints.displayIf.optionKey} onChange={e=>setFormConstraints(previous=>({...previous,displayIf:{...previous.displayIf!,optionKey:e.target.value}}))}>{(conditionSources.find((source:any)=>source.formDefinition.itemKey===formConstraints.displayIf?.itemKey)?.formDefinition.options??[]).map((option:any)=><option key={option.optionKey} value={option.optionKey}>{option.label}</option>)}</select></label>:null}
                        {['single_choice','multiple_choice'].includes(formType)?<><label className="block">其他填写选项<select aria-label="其他填写选项" value={formConstraints.otherOptionKey??''} onChange={e=>setFormConstraints(previous=>({...previous,otherOptionKey:e.target.value||undefined,...(!e.target.value?{otherMaxLength:undefined}:{})}))}><option value="">不启用</option>{formOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{formConstraints.otherOptionKey?<label className="block">其他文本上限<input type="number" min="1" max="2000" value={formConstraints.otherMaxLength??300} onChange={e=>setFormConstraints(previous=>({...previous,otherMaxLength:Number(e.target.value)}))}/></label>:null}</>:null}
                        {formType==='multiple_choice'?<fieldset><legend>互斥选项</legend>{formOptions.map(option=><label key={option.value} className="block"><input type="checkbox" checked={formConstraints.exclusiveOptionKeys?.includes(option.value)??false} onChange={e=>setFormConstraints(previous=>({...previous,exclusiveOptionKeys:e.target.checked?[...(previous.exclusiveOptionKeys??[]),option.value]:(previous.exclusiveOptionKeys??[]).filter(key=>key!==option.value)}))}/>{option.label}</label>)}</fieldset>:null}
                        {['text_input','fill_blank','long_text'].includes(formType)?<label className="block">文本格式<select aria-label="文本格式" value={formConstraints.textValidation??''} onChange={e=>setFormConstraints(previous=>({...previous,textValidation:(e.target.value||undefined) as FormQuestion<never>['textValidation']}))}><option value="">不限</option><option value="EMAIL">电子邮箱</option><option value="DIGITS">仅数字</option><option value="ALPHANUMERIC">英文字母及数字</option></select></label>:null}
                        <p className="text-sm">{trainingDesign ? '条件显示只能引用同一答题阶段中前面的单选或多选题；开始新阶段后，不能引用上一阶段的题。' : '条件只引用同区段的前置单选、多选题。'}隐藏答案会清除；拒答独立记录，不计有效回答。已发布版本不可修改。</p>
                      </fieldset>}
  </>
  const addContentControls = <>
              {draft && (
                <fieldset
                  disabled={busy || dirty}
                  className="space-y-3 border rounded p-4"
                >
                  <legend>添加内容</legend>{trainingDesign && <div className="qt-type-tabs" role="group" aria-label="内容类型">{([
      ['SCALE','量表',BookOpen], ...(cognitiveEnabled ? [['COGNITIVE','认知测验',Brain] as const] : []),
      ['SITUATIONAL','情境判断',Route], ['FORM','自定义表单',ClipboardList],
    ] as Array<[string,string,typeof BookOpen]>).map(([value,label,Icon]) => <button type="button" key={String(value)} disabled={busy || dirty} aria-pressed={type === value} onClick={() => { setType(String(value)); setSelected('') }}><Icon size={18} />{String(label)}</button>)}</div>}
                  <label hidden={trainingDesign}>
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
                      {['SCALE', ...(cognitiveEnabled ? ['COGNITIVE'] : []), 'SITUATIONAL', 'FORM'].map(
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
                          onChange={(e) => { setFormType(e.target.value); if(e.target.value==='year_month')setPolicyEnabled(false); setFormConstraints(e.target.value === 'slider' ? { min: 0, max: 100 } : {}); setOptions(''); setMatrixRows(''); setChoiceDrafts(emptyChoices('option')); setMatrixDrafts(emptyChoices('row')); if (typedFormTypes[e.target.value]) setContext('') }}
                        >
                          {[
                            'text_input',
                            'fill_blank',
                            'single_choice',
                            'multiple_choice',
                            'year_month',
                            'number', 'long_text', 'date', 'time', 'likert', 'matrix', 'matrix_multiple', 'rank_order', 'slider', 'constant_sum',
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
                                    number: '数值', long_text: '长文本', date: '日期', time: '时间', likert: 'Likert', matrix: '矩阵单选', matrix_multiple: '矩阵多选', rank_order: '排序', slider: '滑块', constant_sum: '恒定总和',
                                  } as any
                                )[t]
                              }
                            </option>
                          ))}
                        </select>
                      </label>
                      {!trainingDesign && <label className="block">加入表单区段<select aria-label="加入表单区段" value={targetFormSection} onChange={e=>{setTargetFormSection(e.target.value);setFormConstraints(previous=>({...previous,displayIf:undefined}))}}><option value="">创建新区段</option>{(detail?.formSections??[]).filter((s:any)=>!s.contextSection).map((s:any)=><option key={s.id} value={s.id} disabled={Math.max(...(s.items??[]).map((i:any)=>i.position))!==Math.max(...(detail?.items??[]).map((i:any)=>i.position))}>{s.title}（{s.items?.length??0}题；仅尾部连续段可追加）</option>)}</select></label>}
                      {trainingDesign ? <details className="qt-advanced qt-form-advanced" open={advancedFormOpen} onToggle={event => setAdvancedFormOpen(event.currentTarget.open)}>
                        <summary>高级答题规则<span>可选</span></summary>
                        <div className="qt-advanced-body">
                          <section className="qt-form-stage" aria-label="答题阶段设置">
                            <h3>分段提交</h3>
                            <p>同一阶段内逐题作答，完成后统一提交。普通题目会自动接在当前连续的表单题后面。</p>
                            <p role="status">{contextKey ? '背景信息使用专用阶段，不与普通表单题混合。' : startNewFormStage ? '下一题将开始新的答题阶段，完成后单独提交。' : currentFormStage ? `当前阶段：${currentFormStage.title}（${currentFormStage.items.length} 题）。` : '当前没有可继续的表单阶段，下一题会自动新建。'}</p>
                            {startNewFormStage ? <ProductButton disabled={busy || dirty || !currentFormStage || Boolean(contextKey)} onClick={() => selectNewFormStage(false)}>继续当前阶段</ProductButton>
                              : <ProductButton disabled={busy || dirty || !currentFormStage || Boolean(contextKey)} onClick={() => selectNewFormStage(true)}>新增答题阶段</ProductButton>}
                            <p className="qt-form-hint">此选择在添加下一道题时生效，不会移动已有题目，也不会改变逐题显示方式。</p>
                          </section>
                          <p className="qt-form-hint">需要条件显示、拒答或互斥选项时，再为本题开启规则。普通题目无需开启。</p>
                          {formRules}
                        </div>
                      </details> : formRules}
                      {typedFormType && <BasicFormConstraints question={{ ...formConstraints, type: typedFormType }} onChange={patch => setFormConstraints(previous => ({ ...previous, ...patch }))} />}
                      {typedFormType && <StructuredFormConstraints question={{ ...formConstraints, type: typedFormType }} onChange={patch => setFormConstraints(previous => ({ ...previous, ...patch }))} />}
                      {['matrix', 'matrix_multiple'].includes(formType) && (trainingDesign
                        ? <FormChoiceEditor key={formType + '-rows'} title="矩阵行" prefix="row" choices={matrixDrafts} onChange={setMatrixDrafts} max={40} portableKeys />
                        : <label className="block">矩阵行（编码=标签，以逗号分隔）<input value={matrixRows} onChange={e => setMatrixRows(e.target.value)} /></label>)}
                      {(['single_choice', 'multiple_choice'].includes(formType) || structuredOptionTypes.includes(typedFormType)) && (trainingDesign
                        ? <FormChoiceEditor key={formType + '-' + contextKey} title="选项" prefix="option" choices={choiceDrafts} onChange={changeChoices} max={30} portableKeys={Boolean(typedFormType)} />
                        : <label className="block">
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
                              setPolicyEnabled(false)
                              setTargetFormSection('')
                              setStartNewFormStage(false)
                              setFormType(
                                e.target.value === 'birthYearMonth'
                                  ? 'year_month'
                                  : 'single_choice',
                              )
                              setChoiceDrafts(contextOptionsForKey(e.target.value).map(choice => ({ ...choice, id: crypto.randomUUID() })))
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
                      {type === 'FORM' && (
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
                  <ProductButton variant={trainingDesign ? 'primary' : 'secondary'} disabled={trainingDesign && (busy || dirty || (type === 'FORM' ? !formLabel.trim() : !selected))} onClick={() => void add()}>
                    添加到测评
                  </ProductButton>
                </fieldset>
              )}
  </>
  const unitList = <>
<ol className="space-y-3 my-4" aria-label="内容单元">
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
              </ol>  </>
  const unitConfiguration = <>
{units.filter(v=>v.id===(units.some(unit=>unit.id===editingUnit)?editingUnit:units[0]?.id)).map(v=><section key={v.id} className="rounded border p-4"><h3 className="font-semibold">{v.label} · 配置</h3>                    {v.type === 'FORM_SECTION' &&
                      v.items.map((item: any) => (
                        <div key={item.id}>
                          <span>{item.formLabel || item.label} · {item.required === false ? '选填' : '必填'}</span>
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
  </>
  const basicSettings = <>
          <fieldset
            id="questionnaire-basic"
            disabled={busy || !draft}
            className="questionnaire-basic-grid my-4 rounded border p-4"
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
                placeholder="例如：第一期教师研修 · 课前测评"
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
            {draft && <ProductButton variant={id === 'new' || dirty ? 'primary' : 'secondary'} disabled={busy || (id !== 'new' && !dirty)} onClick={() => void save()}>
              {id === 'new' ? '创建草稿' : '保存设置'}
            </ProductButton>}
          </fieldset>
  </>

  const contentSettings = detail && <>
    <h2 id="questionnaire-content" tabIndex={-1} className="font-semibold">内容与顺序 · {labels[detail.status]}</h2>
    <div className="questionnaire-editor-grid">{unitList}<div className="min-w-0 space-y-4" aria-label="单元配置">{unitConfiguration}{addContentControls}</div></div>
  </>

  const advancedSettings = detail && <>
              {(draft ? variantsEligible || trainingVariantDraft || detail.trainingVariantDraft : detail.trainingVariantFrozen) && <TrainingVariantEditor
                config={trainingVariantDraft}
                frozen={detail.trainingVariantFrozen ?? null}
                maxAttempts={maxAttempts}
                units={units}
                draft={draft}
                eligible={variantsEligible}
                busy={busy}
                dirty={variantsDirty}
                onChange={setTrainingVariantDraft}
                onMaxAttemptsChange={setMaxAttempts}
                onSave={() => void save()}
              />}
              {(draft ? trainingEligible || trainingFlowText || detail.trainingFlowDraft : detail.trainingFlowFrozen) && <TrainingFlowEditor
                text={trainingFlowText} frozen={detail.trainingFlowFrozen ?? null} units={units}
                maxAttempts={maxAttempts} onMaxAttemptsChange={setMaxAttempts}
                draft={draft} eligible={flowEligible} busy={busy} dirty={flowDirty} error={trainingFlowError}
                onChange={text => { setTrainingFlowText(text); setTrainingFlowError('') }}
                onError={setTrainingFlowError} onSave={() => void save()}
              />}
  </>

  const managementActions = detail && <>
              <div className="flex flex-wrap gap-4 my-5">
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
                {detail.items?.some((item:{form?:{formDefinition?:unknown}})=>item.form?.formDefinition!=null) && <TypedFormExportActions key={id} assessmentId={id} />}
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
              {detail.publicEnabled && detail.status === 'PUBLISHED' && id && (
                <PublicDeliveryManager
                  key={id}
                  family="COMPOSITE"
                  resourceId={id}
                  maximumExpiry={detail.expiresAt}
                  groupIpEligible={detail.productKind === 'QUESTIONNAIRE' && detail.questionnaireType === 'COURSE' &&
                    detail.questionnaireCourses?.length === 1 && catalog.courses.some((course: {id: string; courseType?: string; isLibrary?: boolean}) =>
                      course.id === detail.questionnaireCourses[0].courseId && course.courseType === 'TRAINING_COURSE' && !course.isLibrary)}
                />
              )}
  </>

  const timingDisclosure = <>
      {detail&&<section aria-label="计时披露权限"><label><input type="checkbox" disabled={busy||dirty} checked={Boolean(detail.timingExportEnabled)} onChange={e=>{const enabled=e.target.checked;void action(async()=>{hydrate(await request('/'+id+'/timing-export-policy',{revision:detail.revision,enabled}))})}}/>允许有权限的教师报告与 CSV/ZIP 导出计时</label><p>默认关闭，独立于原始回答权限；摘要也可导出计时，撤销后旧计时产物不可下载。学员反馈不显示计时。</p></section>}
  </>

  const publishPanel = <>
      {detail && !draft && <section className="questionnaire-publish-panel" aria-label="发布状态"><div className="questionnaire-publish-summary"><div><h2>{labels[detail.status] || detail.status} · {detail.name}</h2><p>当前版本的内容与投放设置已锁定。如需调整，请复制为新草稿后重新编制。</p></div><Link className="hui-button hui-button--primary" to={'/composite-assessments/' + id + '/results'}>查看作答与结果</Link></div></section>}
      {detail && draft && <section id="questionnaire-publish" aria-label="正式发布" className="questionnaire-publish-panel">
        <div className="questionnaire-publish-summary"><div><h2>草稿 · 尚未发布</h2><p>{dirty ? '设置有未保存的修改，请先保存设置。' : '确认内容与投放设置后，可自检或正式发布。'}</p></div>
        <div className="flex flex-wrap gap-3">
                {dirty && !trainingDesign && <ProductButton variant="primary" disabled={busy} onClick={() => void save()}>保存全部设置</ProductButton>}
                {draft && <ProductButton variant="secondary" disabled={busy || dirty} onClick={() => void action(async () => setPreflight(await request('/' + id + '/preflight', { revision: detail.revision })))}>发布前自检</ProductButton>}
                {draft && (
                  <ProductButton
                    disabled={busy || dirty}
                    variant="primary"
                    onClick={() => void publish()}
                  >
                    发布组合测评
                  </ProductButton>
                )}
        </div></div>
              {preflight && !dirty && preflight.revision === detail.revision && <section aria-label="发布自检结果" className="questionnaire-preflight-results my-4 rounded border p-4">
                <h2 className="font-semibold">{preflight.ok ? '当前草稿自检通过' : '发布前请处理以下问题'}</h2>
                <ul className="mt-2 space-y-2">{preflight.checks.map(check => <li key={check.key}><strong>{check.label}：{check.status === 'passed' ? '通过' : '需要处理'}</strong>{check.message !== '通过' && <p>{check.message}</p>}{check.targetId&&<ProductButton onClick={()=>{setEditingUnit(check.targetId!);if (trainingDesign) goToStep('questionnaire-content');requestAnimationFrame(() => document.getElementById('questionnaire-unit-'+check.targetId)?.scrollIntoView({block:'center'}))}}>配置对应单元</ProductButton>}{check.status!=='passed'&&<a href={check.key==='delivery'?'#questionnaire-delivery':'#questionnaire-content'}>定位并修复{check.key==='delivery'?'投放设置':'内容单元'}</a>}</li>)}</ul>
                <p className="mt-2 text-sm text-slate-600">正式发布时会再次检查当前草稿与权限。</p>
              </section>}
      </section>}
  </>
  const editorSteps = [
    ['questionnaire-basic','基本信息','名称与作答说明'],
    ['questionnaire-content','内容与顺序','添加并编排测评'],
    ['questionnaire-delivery','投放设置','课程、时间与反馈'],
    ['questionnaire-publish','检查与发布','核对后再正式发布'],
  ]
  const stepIndex = Math.max(0, editorSteps.findIndex(([key]) => key === activeStep))
  const goToStep = (key: string) => {
    setActiveStep(key)
    navigate(`${location.pathname}${location.search}#${key}`, { replace: true })
    requestAnimationFrame(() => document.querySelector('.qt-steps')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }
  const reportSummary = detail && !detail.trainingFeedbackPolicy && !feedbackChanged && !feedbackDefaultsOnBinding
    ? '沿用原有反馈方式' : feedbackMode === 'SCHEDULED' ? '预设时间开放' : '完成并生成后可见'
  const savedPreflight = Boolean(preflight?.ok && !dirty && preflight.revision === detail?.revision)
  const readyItems = [
    ['测评名称已填写', Boolean(name.trim())], ['至少添加一个内容单元', units.length > 0],
    ['已选择投放范围', kind === 'GENERAL' || courseIds.length > 0], ['完成发布前检查', savedPreflight],
  ] as const
  if (trainingDesign) return (
    <ProductPage width="management" className="hui-questionnaire-products training-form-management qt-editor">
      <Link className="qt-breadcrumb" to="/questionnaires">组合测评 <span>/</span> {draft ? '编制草稿' : '查看测评'}</Link>
      <PageHeader title={id === 'new' ? '创建组合测评' : draft ? '编制组合测评' : '查看组合测评'}
        description="从内容编排到发布，按步骤完成一份课程测评。"
        actions={<><span className="qt-draft-status">{busy ? '正在处理…' : dirty ? '有未保存的修改' : labels[detail?.status] || '新建草稿'}</span>{draft && <ProductButton variant="primary" disabled={busy || (id !== 'new' && !dirty)} onClick={() => void save()}><Save size={16} />{id === 'new' ? '创建草稿' : '保存全部设置'}</ProductButton>}</>} />
      {feedback}
      <nav aria-label="编制步骤" className="qt-steps">
        {editorSteps.map(([key,label,hint], index) => <a key={key} href={'#'+key}
          aria-current={activeStep === key ? 'step' : undefined} aria-disabled={id === 'new' && (index === 1 || index === 3) ? true : undefined}
          onClick={event => { event.preventDefault(); if (id !== 'new' || index === 0 || index === 2) goToStep(key) }}>
          <span className="qt-step-number">{index < stepIndex ? <Check size={16} /> : `0${index+1}`}</span>
          <span><strong>{label}</strong><small>{id === 'new' && index === 1 ? '创建草稿后添加' : hint}</small></span>
        </a>)}
      </nav>
      {error && <div role="alert" className="qt-error">{error}<ProductButton onClick={() => void action(reload)}>刷新问卷</ProductButton></div>}
      {id !== 'new' && !detail ? <p role="status">正在加载问卷…</p> : <>
        <div className="qt-workspace">
          <div className="qt-main">
            <section className="qt-panel" hidden={stepIndex !== 0} aria-label="基本信息步骤">
              <header className="qt-panel-heading"><small>STEP 01 / 04</small><h2>基本信息</h2><p>先让学员知道，这份测评是什么、如何参与。</p></header>
              <div className="qt-panel-body">{basicSettings}<p className="qt-note">各项测评独立反馈，报告为单项结果合集。当前支持网页作答。</p></div>
            </section>
            {detail && <section className="qt-panel" hidden={stepIndex !== 1} aria-label="内容与顺序步骤">
              <header className="qt-panel-heading"><small>STEP 02 / 04</small><h2 id="questionnaire-content" tabIndex={-1}>内容与顺序</h2><p>选择需要的测评内容，按学员实际作答顺序编排。</p><span className="qt-count">{units.length} 个内容单元</span></header>
              <div className="qt-panel-body">
                {dirty && <p role="status" className="qt-note">设置尚未保存，请先保存设置再调整内容或发布。</p>}
                {addContentControls}
                <div className="qt-section-title"><h3>作答顺序</h3><span>使用上下箭头调整顺序</span></div>
                {units.length ? <div className="qt-unit-editor">{unitList}<div className="qt-unit-config" aria-label="单元配置">{unitConfiguration}</div></div> : <div className="qt-empty"><Layers size={28} /><h3>这份测评还没有内容</h3><p>先选择上方已发布资源并添加，再调整作答顺序。</p></div>}
              </div>
            </section>}
            <section className="qt-panel" hidden={stepIndex !== 2} aria-label="投放设置步骤">
              <header className="qt-panel-heading"><small>STEP 03 / 04</small><h2>投放设置</h2><p>先选择课程与开放时间，再决定学员何时查看反馈。</p></header>
              <div className="qt-panel-body">{deliverySettings}
                <details className="qt-advanced" open={Boolean(checkpointEnabled || localCognitiveEnabled || timingEnabled || detail?.timingExportEnabled) || undefined}><summary>草稿保留与计时记录 <span>可选</span></summary><div className="qt-advanced-body"><fieldset className="qt-policy-controls" disabled={busy || !draft}>{persistenceSettings}</fieldset>{timingDisclosure}</div></details>
                {detail && <details className="qt-advanced" open={Boolean(trainingVariantDraft || trainingFlowText || detail.trainingVariantFrozen || detail.trainingFlowFrozen || trainingFlowError) || undefined}><summary>随机分组与条件流程 <span>高级</span></summary><div className="qt-advanced-body">{advancedSettings}</div></details>}
              </div>
            </section>
            {detail && <section className="qt-panel" hidden={stepIndex !== 3} aria-label="检查与发布步骤">
              <header className="qt-panel-heading"><small>STEP 04 / 04</small><h2>检查与发布</h2><p>核对内容、课程与反馈设置，确认后再发布。</p></header>
              <div className="qt-panel-body"><dl className="qt-review-facts"><div><dt>测评名称</dt><dd>{name}</dd></div><div><dt>内容单元</dt><dd>{units.length} 个</dd></div><div><dt>投放范围</dt><dd>{kind === 'GENERAL' ? '通用公开问卷' : courseIds.map(courseId => catalog.courses.find((course:any) => course.id === courseId)?.title || '已绑定课程').join('、') || '尚未选择'}</dd></div><div><dt>学员报告</dt><dd>{reportSummary}{feedbackMode === 'SCHEDULED' && reportSummary === '预设时间开放' ? ` ${localDate(feedbackReleaseAt)}` : ''}</dd></div></dl>
                {publishPanel}<details className="qt-advanced"><summary>草稿与结果管理</summary><div className="qt-advanced-body">{managementActions}</div></details>
              </div>
            </section>}
          </div>
          <aside className="qt-sidebar" aria-label="编制概览"><div className="qt-summary"><small>当前测评</small><h2>{name.trim() || '未命名测评'}</h2><p>{kind === 'COURSE' ? '课程问卷' : '通用公开问卷'} · 单项报告合集</p><dl><div><dt>内容单元</dt><dd>{units.length} 个</dd></div><div><dt>投放课程</dt><dd>{courseIds.map(courseId => catalog.courses.find((course:any) => course.id === courseId)?.title || '已绑定课程').join('、') || '尚未选择'}</dd></div><div><dt>开放时间</dt><dd>{opensAt ? localDate(opensAt).replace('T',' ') : '发布后立即开放'}</dd></div><div><dt>报告开放</dt><dd>{reportSummary}</dd></div></dl><div className="qt-ready-title"><h3>{draft ? '发布准备' : '当前状态'}</h3><span>{draft ? `${readyItems.filter(([,ready]) => ready).length} / 4` : labels[detail?.status]}</span></div>{draft && <><progress aria-label="发布准备完成度" value={readyItems.filter(([,ready]) => ready).length} max={4} /><ul>{readyItems.map(([label,ready]) => <li key={label} className={ready ? 'is-ready' : ''}><span>{ready ? <Check size={12} /> : '·'}</span>{label}</li>)}</ul></>}</div><div className="qt-help"><ListChecks size={17} /><h3>{['先把测评介绍清楚','先确定内容，再安排投放','先设置必需项，再查看可选项','发布前再核对一次'][stepIndex]}</h3><p>{['名称便于课程成员识别，指导语会展示给学员。','可添加不同类型的单元，再按学员作答顺序排列。','课程、开放时间和报告反馈是主流程，高级策略按需启用。','正式发布会再次校验权限；发布后内容和相关策略冻结。'][stepIndex]}</p></div></aside>
        </div>
        <footer className="qt-footer"><ProductButton disabled={busy || stepIndex === 0} onClick={() => goToStep(id === 'new' ? 'questionnaire-basic' : editorSteps[stepIndex-1][0])}><ArrowLeft size={16} />上一步</ProductButton><span role="status">{busy ? '正在处理，请稍候…' : id === 'new' ? '先创建草稿，再添加测评内容。' : dirty ? '有未保存的修改，请先保存。' : '设置已同步'}</span><div>{draft && id !== 'new' && <ProductButton disabled={busy || !dirty} onClick={() => void save()}>保存全部修改</ProductButton>}{stepIndex < 3 && <ProductButton variant="primary" disabled={busy} onClick={() => id === 'new' ? void save() : goToStep(editorSteps[stepIndex+1][0])}>{id === 'new' ? '创建草稿，继续编排' : `下一步：${editorSteps[stepIndex+1][1]}`}<ArrowRight size={16} /></ProductButton>}</div></footer>
      </>}
    </ProductPage>
  )
  return (
    <ProductPage width="management" className={`hui-questionnaire-products${isTrainingHost() ? ' training-form-management' : ''}`}>
      <PageHeader
        title={id === 'new' ? '创建组合测评' : detail && !draft ? '查看组合测评' : '编制组合测评'}
        description="各项测评独立反馈，报告为单项结果合集。当前支持网页作答。"
      />
      <Link to="/questionnaires">返回组合测评列表</Link>
      {feedback}
      {timingDisclosure}
      {id === 'new' && <p className="questionnaire-publish-hint" role="status">先创建草稿，再添加测评内容、设置投放范围，最后正式发布。</p>}
      {publishPanel}
      <nav aria-label="编制步骤" className="questionnaire-step-nav my-4">
        {[['questionnaire-basic','基本信息'],['questionnaire-content','内容与顺序'],['questionnaire-delivery','投放设置']].map(([step,label],index) =>
          id === 'new' && step === 'questionnaire-content' ? <span key={step} className="questionnaire-step-pending" aria-disabled="true"><span className="questionnaire-step-number">{index+1}.</span><span>内容（创建后设置）</span></span> : <a key={step} href={'#'+step} aria-current={activeStep === step ? 'step' : undefined} onClick={() => setActiveStep(step)}><span className="questionnaire-step-number">{index+1}.</span><span>{label}</span></a>
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
      {basicSettings}
          {id === 'new' && deliverySettings}
          {detail && (
            <>
              {dirty && (
                <p role="status">
                  设置尚未保存，请先保存设置再调整内容或发布。
                </p>
              )}
      {contentSettings}
              {deliverySettings}
      {advancedSettings}
      {managementActions}
            </>
          )}
        </>
      )}
    </ProductPage>
  )
}
