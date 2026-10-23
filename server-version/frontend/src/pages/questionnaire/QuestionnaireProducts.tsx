import {TrainingMaterialPicker} from '../../modules/assessment-media/TrainingMaterialPicker'
import { FormTemplateWorkspace } from './FormTemplateWorkspace'
import {useFormPendingBuffers} from '../../modules/assessment-core/form/useFormBulkDraft'
import {referencedFormChoiceKeys} from '../../modules/assessment-core/form/choiceSafety'
import './form-template-editor.css'
import { CatalogFilters, CatalogPagination } from '../../training/TrainingCatalogControls'
import { useCatalogQuery } from '../../training/useCatalogQuery'
import { TrainingQuestionnaireList } from './TrainingQuestionnaireList'
import { assessmentContextHref } from '../../training/assessmentContextHref'
import { DeliveryOptionCard } from './DeliveryOptionCard'
import { FormChoiceEditor } from './FormChoiceEditor'
import { choiceError, emptyChoices, filledChoices, type ChoiceDraft } from './formChoices'
import { hasPendingTrainingToolRequest } from '../../training/pendingToolRequests'
import { StructuredFormConstraints } from '../../modules/assessment-core/form/StructuredFormConstraints'
import { BasicFormConstraints } from '../../modules/assessment-core/form/BasicFormConstraints'
import type { FormQuestion } from '../../modules/assessment-core/form/types'
import type { TrainingFeedbackPolicy } from '../../modules/composite/types'
import { isTrainingHost } from '../../training/context'
import '../../training/training-form-surface.css'
import { apiErrorMessage } from '../../utils/apiErrorMessage'
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import apiClient from '../../api/client'
import { resolveTrainingCoursePrefill } from '../../training/resolveCoursePrefill'
import { useCognitiveEnabled } from '../../contexts/CapabilitiesContext'
import { useAuth } from '../../contexts/AuthContext'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'
import LocalDateTimeInput, { localDateTimeValue, parseLocalDateTime } from '../../components/LocalDateTimeInput'
import './questionnaire-products.css'
import './questionnaire-training-editor.css'
import './questionnaire-content-editor.css'
import { ArrowLeft, ArrowRight, BookOpen, Brain, Check, ClipboardList, Layers, ListChecks, Route, Save, Clock3, HardDrive, ShieldCheck, Shuffle, Link as LinkIcon } from 'lucide-react'
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

const TrainingContentSelection = lazy(() => import('./TrainingContentSelection').then(module => ({ default: module.TrainingContentSelection })))
const TrainingReportStudio = lazy(() => import('./TrainingReportStudio').then(module => ({ default: module.TrainingReportStudio })))
const PublicDeliveryManager = lazy(() => import('../../components/PublicDeliveryManager').then(module => ({ default: module.PublicDeliveryManager })))
const FormTemplatePicker = lazy(() => import('./FormTemplatePicker').then(module => ({ default: module.FormTemplatePicker })))
const AssessmentToolPicker = lazy(() => import('../../components/AssessmentToolPicker'))
const TypedFormExportActions = lazy(() => import('../../modules/composite/TypedFormExportActions').then(module => ({ default: module.TypedFormExportActions })))

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
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const status = ['DRAFT', 'PUBLISHED'].includes(searchParams.get('status') || '') ? searchParams.get('status')! : ''
  const [templateSource, setTemplateSource] = useState<{id:string;name:string} | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const saving = useRef(false)
  const [data, setData] = useState<any>({ list: [], total: 0 })
  const catalog = useCatalogQuery()
  const page = catalog.selection.page
  const setPage = (value: number | ((p:number)=>number)) => catalog.apply({...catalog.selection, page: typeof value === 'function' ? value(page) : value})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [listRevision, setListRevision] = useState(0)
  const [copying,setCopying] = useState('')
  const copyPending = useRef(false)
  const navigate = useNavigate()
  const listParams = new URLSearchParams(catalog.params)
  if (status) listParams.set('status', status)
  const requestParams = listParams.toString()
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setData({ list: [], total: 0 })
    request('?' + requestParams)
      .then(value => { if (active) setData(value) })
      .catch((e) => { if (active) setError(message(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [requestParams, listRevision])
  const copy = async (id: string) => {
    if (copyPending.current) return
    copyPending.current=true;setCopying(id)
    try {
      const row = await request('/' + id + '/copy', {
        requestId: crypto.randomUUID(),
      })
      navigate(isTrainingHost() ? assessmentContextHref(base + '/' + row.id, location.pathname, location.search) : base + '/' + row.id)
    } catch (e) {
      setError(message(e))
    } finally { copyPending.current=false;setCopying('') }
  }
  const templatePanel = templateSource && <section className="my-4 rounded border p-4" aria-label="保存组合模板"><h2>从 {templateSource.name} 保存私有模板</h2><p>只复制内容定义，移除课程投放与公开链接，不携带作答或授权。</p><p>模板不保留学员反馈开放时间、草稿保留时长或课程级作答计时选项。复制为新草稿后，请为新课程重新选择这些投放设置，再发布；题目定义、计分规则和认知任务的刺激时序不变。</p><label>模板名称<input className="input" maxLength={200} value={templateName} onChange={e => setTemplateName(e.target.value)} disabled={savingTemplate}/></label><ProductButton disabled={savingTemplate || !templateName.trim()} onClick={async () => {
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
      }}>{savingTemplate ? '保存中…' : '保存为模板'}</ProductButton><ProductButton disabled={savingTemplate} onClick={() => setTemplateSource(null)}>取消</ProductButton></section>
  if (isTrainingHost()) return <TrainingQuestionnaireList data={data} page={page} loading={loading} error={error}
    copying={copying} status={status} onStatus={value=>setSearchParams(previous=>{const next=new URLSearchParams(previous);if(value)next.set('status',value);else next.delete('status');next.set('page','1');return next})}
    onPage={setPage} onCopy={copy} onTemplate={row=>{setTemplateSource(row);setTemplateName(row.name)}} savingTemplate={savingTemplate}
    templatePanel={<><CatalogFilters key={catalog.stateKey} selection={catalog.selection} onApply={catalog.apply} label="测评"/>{templatePanel}</>} filtered={Boolean(status||catalog.selection.search||catalog.selection.tags||catalog.selection.from||catalog.selection.to)} pagination={<CatalogPagination selection={catalog.selection} onApply={catalog.apply} total={data.total} loading={loading} label="测评"/>} actorId={user?.id || ''} onReload={()=>setListRevision(value=>value+1)}/>
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
      {templatePanel}
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
          disabled={page * catalog.selection.pageSize >= data.total}
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

type PendingCognitivePublication={actorId:string;id:string;revision:number;itemIds:string[];hadUnknownOutcome:boolean}
function readPendingCognitivePublication(key:string,actorId:string,id:string):PendingCognitivePublication|null{
  try{const value=JSON.parse(sessionStorage.getItem(key)||'null');return value&&value.actorId===actorId&&value.id===id&&Number.isSafeInteger(value.revision)&&value.revision>=0&&Array.isArray(value.itemIds)&&value.itemIds.length>0&&value.itemIds.every((item:unknown)=>typeof item==='string')?{...value,hadUnknownOutcome:value.hadUnknownOutcome!==false}:null}catch{return null}
}
export function QuestionnaireProductEdit({ formTemplate = false }: { formTemplate?: boolean } = {}) {
  const trainingDesign = isTrainingHost()
  const cognitiveEnabled = useCognitiveEnabled()
  const { user } = useAuth()
  const { feedback, confirm: confirmManagement } = useStaffFeedback()
  const { id = 'new' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedScaleId = formTemplate ? null : searchParams.get('scaleId')
  const preselectedCourseId = formTemplate ? null : searchParams.get('courseId')
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
  const [kind, setKind] = useState(formTemplate ? 'GENERAL' : 'COURSE')
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
  const [type, setType] = useState(formTemplate ? 'FORM' : 'SCALE')
  const [selected, setSelected] = useState('')
  useEffect(() => {
    if (!cognitiveEnabled && type === 'COGNITIVE') { setType('SCALE'); setSelected('') }
  }, [cognitiveEnabled, type])

  const [editingFormItem, setEditingFormItem] = useState<any>(null)
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
  const {hasPending:hasPendingChoices,onPendingChange:choicePendingChanged,clear:clearPendingChoices}=useFormPendingBuffers()
  const [formEditEpoch,setFormEditEpoch]=useState(0)
  const definitionSources=[...(detail?.items??[]),...(detail?.formSections??[]).flatMap((section:{items?:unknown[]})=>section.items??[])]
    .flatMap((item:{formDefinition?:FormQuestion<never>;form?:{formDefinition?:FormQuestion<never>}})=>item.formDefinition?[item.formDefinition]:item.form?.formDefinition?[item.form.formDefinition]:[])
  const protectedChoiceKeys=referencedFormChoiceKeys({...formConstraints,itemKey:editingFormItem?.formDefinition?.itemKey},definitionSources)

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
  const effectiveFormSection = editingFormItem ? editingFormItem.formSectionId : trainingDesign
    ? !startNewFormStage && !contextKey ? currentFormStage?.id ?? '' : ''
    : targetFormSection
  const conditionSources = (detail?.formSections?.find((section: any) => section.id === effectiveFormSection)?.items ?? [])
    .filter((item: any) => ['SINGLE', 'MULTIPLE'].includes(item.formDefinition?.type) && (!editingFormItem || (item.formSectionPosition ?? item.position) < (editingFormItem.formSectionPosition ?? editingFormItem.position)))
  const selectNewFormStage = (enabled: boolean) => {
    setStartNewFormStage(enabled)
    setFormConstraints(previous => ({ ...previous, displayIf: undefined }))
  }
  const [required, setRequired] = useState(true)
  const editFormItem = (item: any) => {
    if(hasPendingChoices)return
    setEditingFormItem(item); setType('FORM'); setFormLabel(item.formLabel); setFormType(item.formType)
    setRequired(item.required); setContext(item.contextKey || '')
    const constraints = {...(item.formDefinition || {})}; delete constraints.itemKey; setFormConstraints(constraints)
    setPolicyEnabled(Boolean(item.formPolicy)); setRequiredRefusal(item.formPolicy?.requiredRefusal || 'BLOCK_SUBMIT'); setHiddenRequired(item.formPolicy?.hiddenRequired || 'EXEMPT')
    setAdvancedFormOpen(Boolean(item.formPolicy)); setStartNewFormStage(false)
    const choices = item.formDefinition?.options?.map((option: any) => ({value:option.optionKey,label:option.label})) || item.formOptions || []
    setChoiceDrafts(choices.length ? choices.map((option: any) => ({...option,id:crypto.randomUUID()})) : emptyChoices('option'))
    const rows = item.formDefinition?.rows || []
    setMatrixDrafts(rows.length ? rows.map((row: any) => ({id:crypto.randomUUID(),value:row.rowKey,label:row.label})) : emptyChoices('row'))
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#form-template-question-label')?.focus())
  }
  const cancelFormEdit = () => { clearPendingChoices();setFormEditEpoch(value=>value+1);setEditingFormItem(null); setFormLabel(''); setFormConstraints({}); setContext(''); setPolicyEnabled(false); setRequired(true); setChoiceDrafts(emptyChoices('option')); setMatrixDrafts(emptyChoices('row')) }

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const selectionRisk = useRef({dirty:false,pending:false,busy:false})
  const [selectionState,setSelectionState]=useState(selectionRisk.current)
  const selectionBlocked=selectionState.dirty||selectionState.pending||selectionState.busy
  const selectionRiskChanged = React.useCallback((risk: {dirty:boolean;pending:boolean;busy:boolean}) => { selectionRisk.current=risk;setSelectionState(risk) }, [])
  const reportRisk = useRef({dirty:false,pending:false,busy:false})
  const [reportState,setReportState]=useState(reportRisk.current)
  const reportBlocked=reportState.dirty||reportState.pending||reportState.busy
  const externalToolPending=Boolean(trainingDesign&&!location.pathname.startsWith('/toolkit/compositions/')&&user?.id&&hasPendingTrainingToolRequest(user.id,id))
  const reportRiskChanged = React.useCallback((risk: {dirty:boolean;pending:boolean;busy:boolean}) => { reportRisk.current = risk;setReportState(risk) }, [])
  const [measurementNotice,setMeasurementNotice]=useState('')
  const measurementRecoveryKey='training-cognitive-publication:'+JSON.stringify([user?.id??'',id])
  const measurementScope=useRef({key:measurementRecoveryKey,epoch:0})
  if(measurementScope.current.key!==measurementRecoveryKey)measurementScope.current={key:measurementRecoveryKey,epoch:measurementScope.current.epoch+1}
  useEffect(()=>()=>{measurementScope.current.epoch++},[])
  const [measurementUnknown,setMeasurementUnknown]=useState<PendingCognitivePublication|null>(()=>readPendingCognitivePublication(measurementRecoveryKey,user?.id??'',id))
  useEffect(()=>{setMeasurementUnknown(readPendingCognitivePublication(measurementRecoveryKey,user?.id??'',id));setMeasurementNotice('')},[measurementRecoveryKey,user?.id,id])
  const pendingMeasurement=measurementUnknown?.actorId===user?.id&&measurementUnknown?.id===id?measurementUnknown:null
  const rememberMeasurement=(pending:PendingCognitivePublication|null)=>{
    if(pending)sessionStorage.setItem(measurementRecoveryKey,JSON.stringify(pending));else sessionStorage.removeItem(measurementRecoveryKey)
    setMeasurementUnknown(pending)
  }
  const actionInFlight = useRef(false)
  useEffect(()=>{actionInFlight.current=false;setBusy(false)},[measurementRecoveryKey])
  const [preflight, setPreflight] = useState<{ revision: number; ok: boolean; checks: Array<{ key: string; label: string; status: string; message: string; targetId?: string }> } | null>(null)
  const [nameError, setNameError] = useState('')
  const [expiryError, setExpiryError] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const hydrate = (row: any) => {
    const formItems = new Map<string, any>((row.formSections || []).flatMap((section:any) => (section.items || []).map((item:any) => [item.id, {...item,formSectionId:section.id}])))
    // Teacher item summaries nest Form fields; section definitions carry the
    // complete authoring payload and stable stage identity.
    setDetail({...row,items:(row.items || []).map((item:any) => item.type === 'FORM' ? {...item,...formItems.get(item.id)} : item)})
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
    const resourcesRequest = formTemplate ? Promise.resolve({scales:[],cognitive:[],situational:[],courses:[]}) : request('/resources')
    resourcesRequest.then(async row => {
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
    if (id !== 'new') void request('/' + id).then(row => {
      if (!active) return
      if (formTemplate && row.productKind !== 'FORM_TEMPLATE') throw new Error('请从工具列表将此内容存为独立表单，原问卷保持不变。')
      if (!formTemplate && row.productKind === 'FORM_TEMPLATE') { navigate('/toolkit/forms/' + id, { replace: true }); return }
      hydrate(row)
    }).catch(e => { if (active) setError(message(e)) })
    return () => { active = false }
  }, [id, preselectedScaleId, preselectedCourseId, user?.id, formTemplate, navigate])
  const action = async (fn: () => Promise<void>, measurementRecovery = false) => {
    if(externalToolPending){setError('请先在工具中核对未确认的参数／报告请求，再修改组合测评。');return}
    if(pendingMeasurement&&!measurementRecovery){setError('请先恢复或明确结束原认知发布请求，再修改组合测评。');return}
    const scopeEpoch=measurementScope.current.epoch
    if (selectionRisk.current.busy || (!measurementRecovery && (selectionRisk.current.dirty || selectionRisk.current.pending))) { setError('请先保存报告／参考选择或核对未确认请求，再修改组合测评。'); return }
    if (reportRisk.current.dirty || reportRisk.current.pending || reportRisk.current.busy) { setError('请先保存报告修改或核对未确认的报告请求，再修改组合测评。'); return }
    if (actionInFlight.current) return
    actionInFlight.current = true
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      if(measurementScope.current.epoch===scopeEpoch)setError(message(e))
    } finally {
      if(measurementScope.current.epoch===scopeEpoch){actionInFlight.current = false;setBusy(false)}
    }
  }
  const publishCognitiveMeasurement=(pending:PendingCognitivePublication)=>void action(async()=>{
    if(pending.actorId!==user?.id||pending.id!==id)throw new Error('认知发布请求所属账号或组合已变化')
    const scopeEpoch=measurementScope.current.epoch,originalKey=measurementRecoveryKey
    // Persist uncertainty before transmission, including crashes/reloads during the request.
    const inFlight={...pending,hadUnknownOutcome:true}
    rememberMeasurement(inFlight);setMeasurementNotice('')
    let row:any
    try{row=await request('/'+pending.id+'/measurement-instances/publish',{revision:pending.revision})}
    catch(error){
      const status=(error as {status?:number})?.status
      if(!pending.hadUnknownOutcome&&status!==undefined&&[400,403,409].includes(status)){
        const saved=readPendingCognitivePublication(originalKey,pending.actorId,pending.id)
        if(saved&&JSON.stringify(saved)===JSON.stringify(inFlight))sessionStorage.removeItem(originalKey)
        if(measurementScope.current.epoch===scopeEpoch&&measurementScope.current.key===originalKey)setMeasurementUnknown(null)
      }
      throw error
    }
    // A late receipt may clear only its own exact persisted request, never the new workspace.
    const saved=readPendingCognitivePublication(originalKey,pending.actorId,pending.id)
    if(saved&&JSON.stringify(saved)===JSON.stringify(inFlight))sessionStorage.removeItem(originalKey)
    if(measurementScope.current.epoch!==scopeEpoch||measurementScope.current.key!==originalKey)return
    hydrate(row);setPreflight(null);setMeasurementUnknown(null)
    setMeasurementNotice('当前认知配置版本已发布。组合测评仍为草稿，尚未启动投放。')
  },true)
  const refreshCognitivePublication=()=>void action(async()=>{
    const scopeEpoch=measurementScope.current.epoch,key=measurementRecoveryKey
    const row=await request('/'+id)
    if(measurementScope.current.epoch!==scopeEpoch||measurementScope.current.key!==key)return
    hydrate(row);setPreflight(null);setMeasurementNotice('已重新读取当前草稿。请核对认知配置及发布记录；原请求仍保持未确认。')
  },true)
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
      let disclosure = field?.closest('details')
      while (disclosure) { disclosure.open = true; disclosure = disclosure.parentElement?.closest('details') }
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
      focusEditorField(invalidName ? 'questionnaire-product-name' : 'questionnaire-product-expiry', invalidName ? 'questionnaire-basic' : trainingDesign && id !== 'new' && publicEnabled ? 'questionnaire-publish' : 'questionnaire-delivery')
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
        const row = await request(formTemplate ? '/form-templates' : '', formTemplate ? {name:name.trim(),description,instruction,requestId} : { ...metadata(), questionnaireType: kind, requestId })
        { const next=new URLSearchParams(location.search);if(preselectedScaleId)next.set('scaleId',preselectedScaleId);navigate((formTemplate?'/toolkit/forms':base)+'/'+row.id+(next.size?'?'+next.toString():'')+(trainingDesign?'#questionnaire-content':''),{replace:true}) }
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
      if(hasPendingChoices)throw new Error('请先应用或取消批量输入，再保存题目。')
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
          ...(typedFormType ? { formDefinition: { ...formConstraints, type: typedFormType, prompt: formLabel, required, options: [...structuredOptionTypes,'SINGLE','MULTIPLE'].includes(typedFormType) ? formOptions.map(option => ({ ...(editingFormItem?.formDefinition?.options?.find((old:any) => old.optionKey === option.value) || {}), optionKey: option.value, label: option.label })) : [], rows: ['MATRIX', 'MATRIX_MULTIPLE'].includes(typedFormType) ? formRows.map(row => ({ ...(editingFormItem?.formDefinition?.rows?.find((old:any) => old.rowKey === row.value) || {}), rowKey: row.value, label: row.label })) : [], ...(typedFormType === 'CONSTANT_SUM' ? { total: formConstraints.total ?? 100 } : {}), ...(typedFormType === 'TIME' ? { timeZone: formConstraints.timeZone ?? 'Asia/Shanghai' } : {}) } } : {}),
          ...(policyEnabled ? {formPolicy:{version:3,requiredRefusal,hiddenRequired}}:{}),
          contextKey: contextKey || null,
          formOptions: ['single_choice', 'multiple_choice'].includes(formType)
            ? formOptions.map(option => ({ ...(editingFormItem?.formOptions?.find((old:any) => old.value === option.value) || {}), ...option }))
            : null,
        })
      hydrate(
        await request('/' + id + (editingFormItem ? '/form-items/' + editingFormItem.id : '/items'), { revision: detail.revision, item, ...(!editingFormItem&&type==='FORM'&&effectiveFormSection?{formSectionId:effectiveFormSection}:{}) }, editingFormItem ? 'put' : 'post'),
      )
      setSelected('')
      if (editingFormItem) cancelFormEdit()
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
  const persistenceSettings = trainingDesign ? <div className="qt-option-grid">
    <DeliveryOptionCard icon={Save} title="中途保存与继续作答" description="适合内容较长、学员可能分多次完成的测评。" enabled={checkpointEnabled}>
      <fieldset disabled={kind !== 'COURSE' || !draft || busy} className="qt-option-controls">
        <legend className="sr-only">服务器草稿设置</legend>
        <label className="qt-toggle-line"><input type="checkbox" checked={checkpointEnabled} onChange={e => setCheckpointEnabled(e.target.checked)} />启用服务器草稿</label>
        <p className="qt-option-help">开启后，支持保存的作答进度可在保留时间内继续；关闭时不启用这项服务器保存策略。</p>
        {checkpointEnabled && <label className="qt-duration">服务器草稿保留小时数（1–48）<span><input aria-label="服务器草稿保留小时数" type="number" min={1} max={48} step={1} required value={checkpointHours} onChange={e => setCheckpointHours(Number(e.target.value))} /><small>小时</small></span></label>}
      </fieldset>
      <details className="qt-rule-details"><summary>保留范围与限制</summary><p>发布后策略固定。适用于本次新发布的登录学员和匿名作答；公开投放须绑定唯一 Training 课程。最多成功保存 100 次，清除不重置；保留时间不会延长课程或任务截止时间。</p></details>
    </DeliveryOptionCard>
    <DeliveryOptionCard icon={HardDrive} title="认知测验本机草稿清理" description="为认知任务的浏览器本机草稿设置到期清理时间。" enabled={localCognitiveEnabled}>
      <fieldset disabled={kind !== 'COURSE' || !draft || busy} className="qt-option-controls">
        <legend className="sr-only">认知本机草稿设置</legend>
        <label className="qt-toggle-line"><input type="checkbox" checked={localCognitiveEnabled} onChange={e => setLocalCognitiveEnabled(e.target.checked)} />启用认知任务本机草稿到期清理</label>
        <p className="qt-option-help">只控制认知任务的本机草稿清理，与上方服务器草稿分别设置。</p>
        {localCognitiveEnabled && <label className="qt-duration">认知本机草稿保留小时数（1–48）<span><input aria-label="认知本机草稿保留小时数" type="number" min={1} max={48} step={1} required value={localCognitiveHours} onChange={e => setLocalCognitiveHours(Number(e.target.value))} /><small>小时</small></span></label>}
      </fieldset>
      <details className="qt-rule-details"><summary>哪些草稿会受到保护？</summary><p>正在进行、已封存和等待确认提交的认知草稿会受到保护。发布后策略固定；公开投放须绑定唯一 Training 课程，保留时间不会延长课程或任务截止时间。</p></details>
    </DeliveryOptionCard>
    <DeliveryOptionCard icon={Clock3} title="量表作答时间记录" description="想了解学员实际在量表页面停留多久时使用。" enabled={timingEnabled}>
      <fieldset disabled={kind !== 'COURSE' || !draft || busy} className="qt-option-controls"><legend className="sr-only">量表时间采集设置</legend>
        <label className="qt-toggle-line"><input type="checkbox" checked={timingEnabled} onChange={e => setTimingEnabled(e.target.checked)} />记录量表的有效前台时间</label>
        <p className="qt-option-help">只统计量表页面在浏览器前台且未暂停的时间；不改变评分，也不统计后台或暂停时间。</p>
      </fieldset>
      <details className="qt-rule-details"><summary>适用范围与发布限制</summary><p>默认关闭。仅支持明确的 Training 课程投放；公开链接必须唯一绑定一个课程。时间仅作描述，发布后采集策略固定。</p></details>
    </DeliveryOptionCard>
  </div> : <>
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
            {trainingDesign && !trainingEligible && !detail?.trainingFeedbackPolicy && !feedbackChanged && <section className="qt-feedback-placeholder"><h3>03 · 学员何时看报告</h3><p>选择并保存 Training 课程后，可设置报告在测评完成后开放，或在指定时间开放。</p></section>}
            {(trainingEligible || detail?.trainingFeedbackPolicy || feedbackChanged) && <fieldset className="space-y-2 rounded border p-3 qt-feedback-settings" disabled={busy || !draft || !trainingEligible}>
              <legend>{trainingDesign ? '03 · 学员何时看报告' : '学员报告开放（发布后冻结）'}</legend>{trainingDesign && <p className="qt-section-help">通常沿用默认设置即可；需要统一讲解时，再指定开放时间。发布后此策略固定。</p>}
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
                <legend>{trainingDesign ? '01 · 谁来作答' : '投放课程（可多选）'}</legend>{trainingDesign && <p className="qt-section-help">选择参加本次测评的课程，可多选。</p>}
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
            {trainingDesign && detail ? <div className="qt-anonymous-entry"><div><LinkIcon size={18} aria-hidden="true"/><h3>匿名链接作答</h3><span>{publicEnabled ? '已启用' : '未启用'}</span></div><p>让参与者免登录进入测评。启用、截止时间与分享链接统一在匿名设置中管理。</p><a href="#questionnaire-publish" onClick={event=>{event.preventDefault();goToAnonymousSettings()}}>设置匿名链接 <ArrowRight size={14} aria-hidden="true"/></a></div> : (<label className={trainingDesign ? 'qt-public-choice' : 'block'}>
              <input
                type="checkbox"
                checked={publicEnabled}
                aria-label="允许通过公开链接作答"
                onChange={(e) => setPublic(e.target.checked)}
              />{' '}
              {trainingDesign ? <span>允许通过公开链接作答<small>参与者无需账号登录。发布测评后，再生成并复制匿名链接；请先设置截止时间。</small></span> : '允许通过公开链接作答'}
            </label>)}
            {!trainingDesign && persistenceSettings}
            {!trainingDesign && feedbackSettings}
            </div><div className="questionnaire-delivery-window">{trainingDesign && <div className="qt-delivery-section-heading"><h3>02 · 何时开放作答</h3><p>设定学员可以进入测评的时间范围。</p></div>}<div className="questionnaire-date-grid"><label className="block">
              开始时间
              {!draft && !opensAt ? <p className="questionnaire-window-summary">发布后立即开放</p> : <LocalDateTimeInput picker className="input w-full"
                id="questionnaire-product-opens"
                value={localDate(opensAt)}
                onChange={(e) => setOpens(e.target.value)}
              />}
            </label>
            <label className="block">
              截止时间
              {trainingDesign && detail && publicEnabled ? <div className="qt-anonymous-cutoff"><p>{expiresAt ? localDate(expiresAt).replace('T',' ') : '尚未设置'}</p><a href="#questionnaire-publish" onClick={event=>{event.preventDefault();goToAnonymousSettings()}}>{draft ? '前往匿名设置调整' : '查看匿名设置'}</a></div> : !draft && !expiresAt ? <p className="questionnaire-window-summary">不设截止时间</p> : <LocalDateTimeInput picker className="input w-full"
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
            {expiryError && !(trainingDesign && detail && publicEnabled) && (
              <p id="questionnaire-product-expiry-error" role="alert">
                {expiryError}
              </p>
            )}
    {draft && <div className="flex flex-wrap gap-3"><ProductButton onClick={()=>setOpens(new Date().toISOString())}>设为现在开放</ProductButton>{!(trainingDesign && detail && publicEnabled) && <ProductButton onClick={()=>{setExpiry(new Date(Date.now()+7*86400000).toISOString());setExpiryError('')}}>设为七天后截止</ProductButton>}</div>}
    </div>{trainingDesign && feedbackSettings}</div>
    {detail && draft && !trainingDesign && <div className="questionnaire-delivery-footer"><p role="status">{dirty ? '设置有未保存的修改' : '设置已保存'}</p><ProductButton variant={dirty ? 'primary' : 'secondary'} disabled={busy || !dirty} onClick={() => void save()}>保存投放设置</ProductButton><a href="#questionnaire-publish">前往正式发布 ↑</a></div>}
  </fieldset>
  const authoringLocked=!!pendingMeasurement||selectionBlocked||reportBlocked||externalToolPending
  const scientificTools=<>
      {detail && ((draft && cognitiveEnabled && detail.items?.some((item: any) => item.type === 'COGNITIVE')) || pendingMeasurement) && <section id="tool-measurement" className="my-4 rounded border p-4" aria-label="认知测量版本发布">
        <h2 className="font-semibold">固定当前认知配置</h2>
        <p>仅将当前草稿中允许调整的受控认知参数冻结为精确私有测量版本。不转换量表或静态情境判断，不发布组合投放，也不启动作答。</p>
        <ProductButton disabled={busy || dirty || reportBlocked || selectionBlocked || !!pendingMeasurement || !draft || !cognitiveEnabled} onClick={() => publishCognitiveMeasurement({actorId:user!.id,id,revision:detail.revision,hadUnknownOutcome:false,itemIds:detail.items.filter((item:any)=>item.type==='COGNITIVE').map((item:any)=>item.id)})}>发布当前认知配置版本</ProductButton>
        {measurementNotice && <p role="status">{measurementNotice}</p>}
        {pendingMeasurement && <div role="status"><p>修订 {pendingMeasurement.revision} 的发布结果尚未确认。重试始终使用原修订，不会自动改用当前修订或重复创建实例。重新读取不代表原请求已成功。</p>
          <ProductButton disabled={busy || dirty || reportBlocked || selectionState.busy} onClick={() => publishCognitiveMeasurement(pendingMeasurement)}>重试原修订请求</ProductButton>
          <ProductButton disabled={busy || dirty || reportBlocked || selectionState.busy} onClick={refreshCognitivePublication}>重新读取当前草稿</ProductButton>
          {detail.revision>pendingMeasurement.revision && <div><p>服务器当前修订已超过原修订，原请求已不能再提交。你可以结束此恢复；这不表示原发布成功，重新发布必须另行确认当前配置。</p><ProductButton disabled={busy || dirty || reportBlocked || selectionState.busy} onClick={()=>{rememberMeasurement(null);setMeasurementNotice('已结束失效修订的恢复，未确认原发布成功，也未重新发布。')}}>结束已失效修订恢复（不确认成功）</ProductButton></div>}
          {detail.revision>pendingMeasurement.revision && pendingMeasurement.itemIds.every(itemId=>detail.items?.some((item:any)=>item.id===itemId&&item.type==='COGNITIVE'&&typeof item.cognitiveAssignment?.measurementReleaseId==='string'&&item.cognitiveAssignment.measurementReleaseId)) && <div><p>当前修订已推进，原请求中的全部认知项均有测量版本指针。此状态不单独证明原请求成功；请明确核对后结束恢复。</p>
            <ProductButton disabled={busy || dirty || reportBlocked || selectionState.busy} onClick={()=>{rememberMeasurement(null);setMeasurementNotice('已按你的确认结束原请求恢复，未再次发布。')}}>已核对全部原认知项，结束恢复</ProductButton></div>}
        </div>}
      </section>}
{detail && user?.id && draft && detail.questionnaireType === 'COURSE' && (detail.questionnaireCourses || []).some((link: any) => catalog.courses.some((course: any) => course.id === link.courseId && course.courseType === 'TRAINING_COURSE' && !course.isLibrary)) && <Suspense fallback={<p role="status">正在加载工具…</p>}><TrainingContentSelection key={JSON.stringify([user.id,detail.id])} actorId={user.id} detail={detail} disabled={busy||dirty||reportBlocked||!!pendingMeasurement} recoveryDisabled={busy||dirty||reportState.busy} onSaved={hydrate} onRiskChange={selectionRiskChanged}/></Suspense>}
      {detail && user?.id && detail.questionnaireType === 'COURSE' && (detail.questionnaireCourses || []).some((link: any) => catalog.courses.some((course: any) => course.id === link.courseId && course.courseType === 'TRAINING_COURSE' && !course.isLibrary)) && <Suspense fallback={<p role="status">正在加载工具…</p>}><TrainingReportStudio disabled={busy || dirty || selectionBlocked || !!pendingMeasurement} onLeaveRiskChange={reportRiskChanged} actorId={user.id} compositeId={detail.id} courses={(detail.questionnaireCourses || []).flatMap((link: any) => { const course = catalog.courses.find((row: any) => row.id === link.courseId && row.courseType === 'TRAINING_COURSE' && !row.isLibrary); return course ? [{id:course.id,title:course.title}] : [] })}/></Suspense>}
  </>
  const formMaterials = formType!=='year_month'&&!contextKey&&<details><summary>题目素材 · 图片、视频、文档</summary><TrainingMaterialPicker label="题目展示素材" value={formConstraints.materials} disabled={busy||authoringLocked} onChange={materials=>{setFormConstraints(previous=>({...previous,materials}));if(materials.length)setPolicyEnabled(true)}}/></details>
  const formRules = <>

                      {formType!=='year_month'&&!contextKey ? <label className="block"><input type="checkbox" checked={policyEnabled} disabled={!!formConstraints.materials?.length} onChange={e=>{setPolicyEnabled(e.target.checked);if(!e.target.checked)setFormConstraints(previous=>({...previous,allowRefusal:undefined,displayIf:undefined,otherOptionKey:undefined,otherMaxLength:undefined,exclusiveOptionKeys:undefined}))}}/>{trainingDesign ? '启用条件显示、拒答等规则' : '启用新表单策略（V3）'}</label>:null}
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
  const backgroundField = <label className="block">
                        背景字段
                        <select
                          aria-label="背景字段" disabled={Boolean(editingFormItem)}
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
  const formTemplatePicker = trainingDesign && !formTemplate && draft && type === 'FORM' && <Suspense fallback={<p role="status">正在加载工具…</p>}><FormTemplatePicker excludeId={id} disabled={busy || dirty || authoringLocked} onImport={source => void action(async () => { hydrate(await request('/' + id + '/import-form', { revision: detail.revision, source })); setPreflight(null) })}/></Suspense>
  const addContentControls = <>
              {draft && (
                <fieldset
                  disabled={busy || dirty || authoringLocked}
                  className="space-y-3 border rounded p-4"
                >
                  <legend>{editingFormItem ? '编辑表单题目' : formTemplate ? '添加表单题目' : '添加内容'}</legend>{trainingDesign && !formTemplate && <>
                    <div className="qt-content-task-heading"><span>01</span><div><h3>选择内容类型</h3><p>选用已发布且有权限的工具，或编写表单题。</p></div></div>
                    <div className="qt-type-tabs" role="group" aria-label="内容类型">{([
                      ['SCALE','量表',BookOpen,'分别计分与反馈',catalog.scales.length],
                      ['COGNITIVE','认知测验',Brain,'选用已有任务，保留冻结配置',catalog.cognitive.length],
                      ['SITUATIONAL','情境判断',Route,'使用获授权的固定版本',catalog.situational.length],
                      ['FORM','自定义表单',ClipboardList,'收集背景信息或课程反馈',null],
                    ] as Array<[string,string,typeof BookOpen,string,number|null]>).map(([value,label,Icon,hint,count]) => <button type="button" key={value} aria-label={label} disabled={busy || dirty || authoringLocked || (value === 'COGNITIVE' && !cognitiveEnabled)} aria-pressed={type === value} onClick={() => { setType(value); setSelected('') }}><Icon size={21} aria-hidden="true"/><span><strong>{label}</strong><small>{value === 'COGNITIVE' && !cognitiveEnabled ? '当前环境未开启' : hint}</small></span>{count !== null && <span className="qt-type-count">{count}</span>}</button>)}</div>
                    {!cognitiveEnabled && <p className="qt-content-availability">认知测验暂不可用，当前无法添加。已有问卷内容会保留。</p>}
                    <div className="qt-content-task-heading"><span>02</span><div><h3>{type === 'FORM' ? '编写或选用表单' : `选择${labels[type]}`}</h3><p>{type === 'COGNITIVE' ? '仅选用已发布且当前账号可用的任务；此处不修改认知任务配置。' : type === 'FORM' ? '添加自定义题目，或将已有表单整份加入。' : '选择工具后，点击“添加到测评”保存到本问卷。'}</p></div></div>
                  </>}
                  {formTemplatePicker}
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
                    trainingDesign ? <><Suspense fallback={<p role="status">正在加载工具…</p>}><AssessmentToolPicker options={choices} value={selected} onChange={setSelected} label={labels[type]} disabled={busy || dirty || authoringLocked} /></Suspense>{!choices.length && <p className="qt-content-empty-catalog" role="status">{type === 'COGNITIVE' ? '暂无可加入的认知测验。需要当前账号可用、已发布的认知任务，其配置也须已发布。' : `暂无可加入的${labels[type]}。请确认工具已发布且当前账号有使用权限。`}</p>}</> : <label className="block">
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
                          id="form-template-question-label"
                          placeholder={formTemplate ? '例如：本次课程中，你最想进一步了解什么？' : undefined}
                          value={formLabel}
                          onChange={(e) => setFormLabel(e.target.value)}
                        />
                      </label>
                      <label className="block">
                        题型
                        <select
                          aria-label="题型"
                          disabled={hasPendingChoices}
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
                          <section hidden={Boolean(editingFormItem)} className="qt-form-stage" aria-label="答题阶段设置">
                            <h3>分段提交</h3>
                            <p>同一阶段内逐题作答，完成后统一提交。普通题目会自动接在当前连续的表单题后面。</p>
                            <p role="status">{contextKey ? '背景信息使用专用阶段，不与普通表单题混合。' : startNewFormStage ? '下一题将开始新的答题阶段，完成后单独提交。' : currentFormStage ? `当前阶段：${currentFormStage.title}（${currentFormStage.items.length} 题）。` : '当前没有可继续的表单阶段，下一题会自动新建。'}</p>
                            {startNewFormStage ? <ProductButton disabled={busy || dirty || !currentFormStage || Boolean(contextKey)} onClick={() => selectNewFormStage(false)}>继续当前阶段</ProductButton>
                              : <ProductButton disabled={busy || dirty || !currentFormStage || Boolean(contextKey)} onClick={() => selectNewFormStage(true)}>新增答题阶段</ProductButton>}
                            <p className="qt-form-hint">此选择在添加下一道题时生效，不会移动已有题目，也不会改变逐题显示方式。</p>
                          </section>
                          <p className="qt-form-hint">需要条件显示、拒答或互斥选项时，再为本题开启规则。普通题目无需开启。</p>
                          {formTemplate && backgroundField}
                          {formRules}
                        </div>
                      </details> : formRules}
                      {formMaterials}
                      {typedFormType && <BasicFormConstraints question={{ ...formConstraints, type: typedFormType }} onChange={patch => setFormConstraints(previous => ({ ...previous, ...patch }))} />}
                      {typedFormType && <StructuredFormConstraints question={{ ...formConstraints, type: typedFormType }} onChange={patch => setFormConstraints(previous => ({ ...previous, ...patch }))} />}
                      {['matrix', 'matrix_multiple'].includes(formType) && (trainingDesign
                        ? <FormChoiceEditor key={formType + '-rows-'+formEditEpoch+'-'+(editingFormItem?.id??'new')} onPendingChange={choicePendingChanged} title="矩阵行" prefix="row" choices={matrixDrafts} onChange={setMatrixDrafts} max={40} portableKeys />
                        : <label className="block">矩阵行（编码=标签，以逗号分隔）<input value={matrixRows} onChange={e => setMatrixRows(e.target.value)} /></label>)}
                      {(['single_choice', 'multiple_choice'].includes(formType) || structuredOptionTypes.includes(typedFormType)) && (trainingDesign
                        ? <FormChoiceEditor key={formType + '-' + contextKey+'-'+formEditEpoch+'-'+(editingFormItem?.id??'new')} onPendingChange={choicePendingChanged} protectedKeys={protectedChoiceKeys} title="选项" prefix="option" choices={choiceDrafts} onChange={changeChoices} max={30} portableKeys={Boolean(typedFormType)} />
                        : <label className="block">
                          选项（值=标签，以逗号分隔）
                          <input
                            value={options}
                            onChange={(e) => setOptions(e.target.value)}
                          />
                        </label>
                      )}
                      {!formTemplate && backgroundField}
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
                  <ProductButton variant={trainingDesign ? 'primary' : 'secondary'} disabled={trainingDesign && (busy || dirty || hasPendingChoices || (type === 'FORM' ? !formLabel.trim() : !selected))} onClick={() => void add()}>
                    {editingFormItem ? '保存题目修改' : formTemplate ? '添加题目' : '添加到测评'}
                  </ProductButton>{hasPendingChoices&&<p className="qt-form-hint" role="status">请先应用或取消所有批量输入，再保存题目。</p>}{editingFormItem && <ProductButton disabled={busy} onClick={cancelFormEdit}>取消编辑</ProductButton>}
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
                            disabled={busy || dirty || authoringLocked}
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
                          {formTemplate && draft && <ProductButton disabled={busy || dirty || authoringLocked} onClick={() => editFormItem({...item,formSectionId:v.id})}>编辑此题</ProductButton>}
                          {draft && (
                            <ProductButton
                              disabled={busy || dirty || authoringLocked || Boolean(editingFormItem) || hasPendingChoices}
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
                    {draft && v.type === 'FORM_SECTION' && !v.items.length && <ProductButton disabled={busy || dirty || authoringLocked} onClick={() => void action(async () => hydrate(await request('/' + id + '/form-sections/' + v.id + '/remove', { revision: detail.revision })))}>移除空区段</ProductButton>}
{v.type !== 'FORM_SECTION' && <p>该测评使用已授权定义。必答与来源由当前版本固定；移动或移除请使用左侧内容列表。</p>}</section>)}
  </>
  const basicSettings = <>
          <fieldset
            id="questionnaire-basic"
            disabled={busy || !draft}
            className="questionnaire-basic-grid my-4 rounded border p-4"
          >
            <label className="block">
              {formTemplate ? '表单名称' : '测评名称'}
              <input
                id="questionnaire-product-name"
                required
                maxLength={200}
                aria-invalid={Boolean(nameError)}
                aria-describedby={
                  nameError ? 'questionnaire-product-name-error' : undefined
                }
                className="input w-full"
                placeholder={formTemplate ? '例如：课前需求、课后反馈、学习记录' : '例如：第一期教师研修 · 课前测评'}
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
            {!formTemplate && draft && <ProductButton variant={id === 'new' || dirty ? 'primary' : 'secondary'} disabled={authoringLocked || busy || (id !== 'new' && !dirty)} onClick={() => void save()}>
              {id === 'new' ? '创建草稿' : '保存设置'}
            </ProductButton>}
          </fieldset>
  </>

  const contentSettings = detail && <>
    <h2 id="questionnaire-content" tabIndex={-1} className="font-semibold">内容与顺序 · {labels[detail.status]}</h2>
    <div className="questionnaire-editor-grid">{unitList}<div className="min-w-0 space-y-4" aria-label="单元配置">{unitConfiguration}{addContentControls}</div></div>
  </>

  const advancedSettings = detail && <>
              {(draft ? variantsEligible || trainingVariantDraft || detail.trainingVariantDraft || (trainingDesign && trainingEligible) : detail.trainingVariantFrozen) && <TrainingVariantEditor
                guided={trainingDesign}
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
                guided={trainingDesign}
                text={trainingFlowText} frozen={detail.trainingFlowFrozen ?? null} units={units}
                maxAttempts={maxAttempts} onMaxAttemptsChange={setMaxAttempts}
                draft={draft} eligible={flowEligible} busy={busy} dirty={flowDirty} error={trainingFlowError}
                onChange={text => { setTrainingFlowText(text); setTrainingFlowError('') }}
                onError={setTrainingFlowError} onSave={() => void save()}
              />}
  </>

  const publicDeliverySettings = detail?.publicEnabled && detail.status === 'PUBLISHED' && id && (
                <Suspense fallback={<p role="status">正在加载工具…</p>}><PublicDeliveryManager
                  key={id}
                  guided={trainingDesign}
                  family="COMPOSITE"
                  resourceId={id}
                  maximumExpiry={detail.expiresAt}
                  groupIpEligible={detail.productKind === 'QUESTIONNAIRE' && detail.questionnaireType === 'COURSE' &&
                    detail.questionnaireCourses?.length === 1 && catalog.courses.some((course: {id: string; courseType?: string; isLibrary?: boolean}) =>
                      course.id === detail.questionnaireCourses[0].courseId && course.courseType === 'TRAINING_COURSE' && !course.isLibrary)}
                /></Suspense>
              )

  const managementActions = detail && <>
              <div className="flex flex-wrap gap-4 my-5">
                <ProductButton
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const row = await request('/' + id + '/copy', {
                        requestId: crypto.randomUUID(),
                      })
                      navigate(trainingDesign ? assessmentContextHref(base + '/' + row.id, location.pathname, location.search) : base + '/' + row.id)
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
                {detail.items?.some((item:{form?:{formDefinition?:unknown}})=>item.form?.formDefinition!=null) && <Suspense fallback={<p role="status">正在加载工具…</p>}><TypedFormExportActions key={id} assessmentId={id} /></Suspense>}
                {detail.status === 'PUBLISHED' && (
                  <ProductButton variant="danger"
                    disabled={busy || dirty || authoringLocked}
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
                          navigate(trainingDesign ? assessmentContextHref('/questionnaires', location.pathname, location.search) : '/questionnaires')
                        })
                    }}
                  >
                    删除草稿
                  </ProductButton>
                )}
              </div>
              {!trainingDesign && publicDeliverySettings}
  </>

  const timingDisclosure = trainingDesign ? detail && <DeliveryOptionCard icon={ShieldCheck} title="教师查看与导出计时" description="单独决定有权限的教师能否在报告或导出文件中看到计时。" enabled={Boolean(detail.timingExportEnabled)} badge={detail.timingExportEnabled ? '已允许' : '未允许'}>
    <label className="qt-toggle-line"><input type="checkbox" disabled={busy || dirty || authoringLocked} checked={Boolean(detail.timingExportEnabled)} onChange={e => { const enabled = e.target.checked; void action(async () => { hydrate(await request('/' + id + '/timing-export-policy', { revision: detail.revision, enabled })) }) }} />允许教师查看及导出计时</label>
    <p className="qt-option-help">仅开启上方“时间记录”不会自动开放查看权限。学员反馈中不显示计时。</p>
    {dirty && <p className="qt-inline-notice">请先保存其他修改，再调整这项权限。</p>}
    <details className="qt-rule-details"><summary>权限如何生效？</summary><p>此项调整会立即保存，独立于原始回答权限。摘要报告也可导出计时；撤销后，旧计时产物不可再下载。默认关闭。</p></details>
  </DeliveryOptionCard> : <>
      {detail&&<section aria-label="计时披露权限"><label><input type="checkbox" disabled={busy||dirty||authoringLocked} checked={Boolean(detail.timingExportEnabled)} onChange={e=>{const enabled=e.target.checked;void action(async()=>{hydrate(await request('/'+id+'/timing-export-policy',{revision:detail.revision,enabled}))})}}/>允许有权限的教师报告与 CSV/ZIP 导出计时</label><p>默认关闭，独立于原始回答权限；摘要也可导出计时，撤销后旧计时产物不可下载。学员反馈不显示计时。</p></section>}
  </>

  const publishPanel = <>
      {detail && !draft && <section className="questionnaire-publish-panel" aria-label="发布状态"><div className="questionnaire-publish-summary"><div><h2>{labels[detail.status] || detail.status} · {detail.name}</h2><p>当前版本的内容与投放设置已锁定。如需调整，请复制为新草稿后重新编制。</p></div><Link className="hui-button hui-button--primary" to={'/composite-assessments/' + id + '/results'}>查看作答与结果</Link></div></section>}
      {detail && draft && <section id="questionnaire-publish" aria-label="正式发布" className="questionnaire-publish-panel">
        <div className="questionnaire-publish-summary"><div><h2>草稿 · 尚未发布</h2><p>{dirty ? '设置有未保存的修改，请先保存设置。' : '确认内容与投放设置后，可自检或正式发布。'}</p></div>
        <div className="flex flex-wrap gap-3">
                {dirty && !trainingDesign && <ProductButton variant="primary" disabled={busy} onClick={() => void save()}>保存全部设置</ProductButton>}
                {draft && <ProductButton variant="secondary" disabled={busy || dirty || authoringLocked} onClick={() => void action(async () => setPreflight(await request('/' + id + '/preflight', { revision: detail.revision })))}>发布前自检</ProductButton>}
                {draft && (
                  <ProductButton
                    disabled={busy || dirty || authoringLocked}
                    variant="primary"
                    onClick={() => void publish()}
                  >
                    发布组合测评
                  </ProductButton>
                )}
        </div></div>
              {trainingDesign && <details className="qt-rule-details"><summary>自检与正式发布有什么区别？</summary><p>自检只检查当前设置，不会发布测评或生成链接。正式发布会再次检查内容与权限，通过后固定测评内容和相关投放策略；匿名链接在发布后单独生成。</p></details>}
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
  const goToAnonymousSettings = () => {
    goToStep('questionnaire-publish')
    requestAnimationFrame(() => { const heading=document.getElementById('questionnaire-anonymous-settings'); heading?.focus(); heading?.scrollIntoView({block:'start',behavior:'smooth'}) })
  }
  const anonymousSettings = detail && <section className="qt-anonymous-settings" aria-label="匿名链接整体设置">
    <header><span className="qt-anonymous-icon"><LinkIcon size={21} aria-hidden="true"/></span><div><h3 id="questionnaire-anonymous-settings" tabIndex={-1}>匿名链接设置</h3><p>从是否启用到复制分享，在这里统一完成。</p></div><span className="qt-anonymous-badge">{publicEnabled ? '已启用' : '未启用'}</span></header>
    <label className="qt-public-choice"><input type="checkbox" checked={publicEnabled} disabled={busy||!draft} aria-label="允许通过公开链接作答" onChange={event=>setPublic(event.target.checked)}/><span>允许通过公开链接作答<small>参与者无需账号登录；个人反馈和教师报告仍按测评权限开放。</small></span></label>
    {publicEnabled && <div className="qt-anonymous-expiry"><label htmlFor={draft ? 'questionnaire-product-expiry' : undefined}>测评截止时间{draft ? '（必填）' : ''}</label>{draft ? <><LocalDateTimeInput picker id="questionnaire-product-expiry" aria-label="截止时间" aria-invalid={Boolean(expiryError)} aria-describedby={expiryError ? 'questionnaire-product-expiry-error' : 'qt-anonymous-expiry-help'} value={localDate(expiresAt)} disabled={busy} onChange={event=>{setExpiry(event.target.value);setExpiryError('')}}/><ProductButton disabled={busy} onClick={()=>{setExpiry(new Date(Date.now()+7*86400000).toISOString());setExpiryError('')}}>设为七天后截止</ProductButton></> : <strong>{expiresAt ? localDate(expiresAt).replace('T',' ') : '尚未设置'}</strong>}<p id="qt-anonymous-expiry-help">按设备时区 {Intl.DateTimeFormat().resolvedOptions().timeZone} 设置；稍后生成的链接有效期不能晚于此时间。{draft ? '该截止时间也适用于当前测评的其他投放。' : '此项已随测评发布固定。'}</p>{expiryError && <p id="questionnaire-product-expiry-error" role="alert">{expiryError}</p>}</div>}
    {draft && publicEnabled && <div className="qt-publish-link-guide"><div><h3>匿名分享，接下来只需三步</h3><ol><li><strong>1. 发布测评</strong><span>先保存并核对当前内容与投放设置。</span></li><li><strong>2. 生成匿名链接</strong><span>发布后设置链接有效期，其他功能按需展开。</span></li><li><strong>3. 复制并分享</strong><span>参与者无需账号登录，即可从链接进入。</span></li></ol><details className="qt-rule-details"><summary>发布后还能修改什么？</summary><p>测评内容与相关投放策略发布后固定；匿名链接在发布后单独生成、复制和停用，需要更改内容时请复制为新草稿。</p></details></div></div>}
    {!publicEnabled && <p className="qt-anonymous-off">{draft ? '不启用时，继续使用课程中的原有作答入口。需要免登录分享时，再打开此项。' : '当前测评未启用匿名链接。如需启用，请复制为新草稿后设置。'}</p>}
    {publicDeliverySettings}
  </section>
  const reportSummary = detail && !detail.trainingFeedbackPolicy && !feedbackChanged && !feedbackDefaultsOnBinding
    ? '沿用原有反馈方式' : feedbackMode === 'SCHEDULED' ? '预设时间开放' : '完成并生成后可见'
  const savedPreflight = Boolean(preflight?.ok && !dirty && preflight.revision === detail?.revision)
  const readyItems = [
    ['测评名称已填写', Boolean(name.trim())], ['至少添加一个内容单元', units.length > 0],
    ['已选择投放范围', kind === 'GENERAL' || courseIds.length > 0], ['完成发布前检查', savedPreflight],
  ] as const
  const workspaceMeasured = Boolean(detail?.items?.some((item:any)=>item.type!=='FORM'))
  const needsToolRecovery=Boolean(user?.id&&hasPendingTrainingToolRequest(user.id,id))
  const toolkitConfiguration = trainingDesign && location.pathname.startsWith('/toolkit/compositions/')
  if (toolkitConfiguration) return <div className="training-tool-config">
    <header><Link to="/toolkit">← 返回工具</Link><h1>{detail?.name || '组合测评'} · 配置与报告</h1><p>集中管理当前组合测评的认知参数、参考与报告。课程私有设置仍绑定原课程及测量版本。</p>
      <nav aria-label="工具配置"><a href={workspaceMeasured?'#tool-measurement':base+'/'+id}>内容与参数</a>{(workspaceMeasured||needsToolRecovery)&&<><a href="#tool-references">参考与阈值</a><a href="#tool-reports">报告模板</a></>}<Link to={base+'/'+id}>版本与投放设置 ↗</Link></nav>
    </header>{feedback}{error&&<p role="alert">{error}</p>}{!detail&&<p role="status">正在读取工具配置…</p>}
    {detail&&<section><h2>当前版本</h2><p>{labels[detail.status]} · 修订 {detail.revision} · {detail.items?.length||0} 个内容单元</p><p>发布报告不会改写历史分数。新配置仅在后续明确发布的投放中使用。</p></section>}
    {(workspaceMeasured||needsToolRecovery)&&scientificTools}
    {detail&&!draft&&<p>已发布版本的配置保持冻结；需要修订内容时，请从工具创建新版本草稿。</p>}
  </div>
  const toolConfigurationSummary = detail&&(workspaceMeasured||externalToolPending)&&<section className="qt-tool-summary" aria-label="工具配置与报告">
    <h3>工具配置与报告</h3><dl><div><dt>单独报告方案</dt><dd>{detail.trainingReportSelectionDraft?.units?.length?'已选择':'未选择'}</dd></div><div><dt>参考</dt><dd>{detail.trainingReferenceSelectionDraft?.units?.length?'已选择':'未选择'}</dd></div></dl>
    {externalToolPending&&<p role="status" className="qt-tool-pending">有一项参数／报告请求尚未确认，请在工具核对后继续修改。</p>}
    <Link to={'/toolkit/compositions/'+id}>在工具中管理参数、参考与报告 →</Link>
  </section>
  if (formTemplate) return <ProductPage width="management" className="hui-questionnaire-products training-form-management qt-editor qt-form-template-editor">
    <Link className="qt-breadcrumb" to="/toolkit?kind=form">← 返回工具 · 表单</Link>
    <PageHeader title={id === 'new' ? '编制表单' : '编辑表单'} description="把常用内容保存为独立表单，之后在组合问卷中整份选用。"
      actions={<><span className="qt-draft-status">{busy ? '正在保存…' : dirty ? '有未保存的修改' : detail ? `已保存 · 修订 ${detail.revision}` : '新建表单'}</span>{draft && <ProductButton variant="primary" disabled={authoringLocked || busy || (id !== 'new' && !dirty)} onClick={() => void save()}><Save size={16}/>{id === 'new' ? '创建草稿' : '保存表单信息'}</ProductButton>}</>}/>
    {feedback}{error && <p role="alert" className="qt-error">{error}</p>}
    {id !== 'new' && !detail ? <p role="status">正在读取表单…</p> : <FormTemplateWorkspace key={id} isNew={id === 'new'} name={name} dirty={dirty} draft={draft} busy={busy} locked={authoringLocked}
      sections={units} pendingChoiceEdit={hasPendingChoices} editingQuestionId={editingFormItem?.id} basicSettings={basicSettings} questionControls={addContentControls}
      onEdit={editFormItem} onMove={(index, direction) => void move(index, direction)}
      onRemove={itemId => void action(async () => hydrate(await request('/' + id + '/items/' + itemId + '/remove', { revision: detail.revision })))}
      onRemoveSection={sectionId => void action(async () => hydrate(await request('/' + id + '/form-sections/' + sectionId + '/remove', { revision: detail.revision })))}/>}
  </ProductPage>
  if (trainingDesign) return (
    <ProductPage width="management" className="hui-questionnaire-products training-form-management qt-editor">
      <Link className="qt-breadcrumb" to={assessmentContextHref('/questionnaires',location.pathname,location.search)}>组合测评 <span>/</span> {draft ? '编制草稿' : '查看测评'}</Link>
      <PageHeader title={id === 'new' ? '创建组合测评' : draft ? '编制组合测评' : '查看组合测评'}
        description="从内容编排到发布，按步骤完成一份课程测评。"
        actions={<><span className="qt-draft-status">{busy ? '正在处理…' : dirty ? '有未保存的修改' : labels[detail?.status] || '新建草稿'}</span>{draft && <ProductButton variant="primary" disabled={authoringLocked || busy || (id !== 'new' && !dirty)} onClick={() => void save()}><Save size={16} />{id === 'new' ? '创建草稿' : '保存全部设置'}</ProductButton>}</>} />
      {feedback}
      {pendingMeasurement&&<p role="status">请先恢复或明确结束原认知发布请求，再修改组合测评。</p>}
      <nav aria-label="编制步骤" className="qt-steps">
        {editorSteps.map(([key,label,hint], index) => <a key={key} href={'#'+key}
          aria-current={activeStep === key ? 'step' : undefined} aria-disabled={id === 'new' && (index === 1 || index === 3) ? true : undefined}
          onClick={event => { event.preventDefault(); if (id !== 'new' || index === 0 || index === 2) goToStep(key) }}>
          <span className="qt-step-number">{index < stepIndex ? <Check size={16} /> : `0${index+1}`}</span>
          <span><strong>{label}</strong><small>{id === 'new' && index === 1 ? '创建草稿后添加' : hint}</small></span>
        </a>)}
      </nav>
      {error && <div role="alert" className="qt-error">{error}<ProductButton onClick={() => void action(reload)}>刷新问卷</ProductButton></div>}
      {id !== 'new' && !detail ? <p role="status">正在加载问卷…</p> : <fieldset disabled={authoringLocked} aria-label="组合测评编辑" style={{border:0,padding:0,margin:0,minWidth:0}}>
        <div className="qt-workspace">
          <div className="qt-main">
            <section className="qt-panel" hidden={stepIndex !== 0} aria-label="基本信息步骤">
              <header className="qt-panel-heading"><small>STEP 01 / 04</small><h2>基本信息</h2><p>先让学员知道，这份测评是什么、如何参与。</p></header>
              <div className="qt-panel-body">{basicSettings}<p className="qt-note">各项测评独立反馈，报告为单项结果合集。当前支持网页作答。</p></div>
            </section>
            {detail && <section className="qt-panel qt-composition-content" hidden={stepIndex !== 1} aria-label="内容与顺序步骤">
              <header className="qt-panel-heading"><small>STEP 02 / 04</small><h2 id="questionnaire-content" tabIndex={-1}>编排问卷内容</h2><p>先选择工具并添加，再按学员的作答顺序排列。各测评单独出报告。</p><span className="qt-count">{units.length} 个内容单元</span></header>
              <div className="qt-panel-body">
                {dirty && <p role="status" className="qt-note">设置尚未保存，请先保存设置再调整内容或发布。</p>}
                {addContentControls}
                <div className="qt-section-title qt-content-order-heading"><div className="qt-content-task-heading"><span>03</span><div><h3>作答顺序</h3><p>添加后的内容会出现在这里。</p></div></div><span>使用上下箭头调整顺序</span></div>
                {units.length ? <div className="qt-unit-editor">{unitList}<div className="qt-unit-config" aria-label="单元配置">{unitConfiguration}</div></div> : <div className="qt-empty"><Layers size={28} /><h3>从第一个内容开始</h3><p>在上方选择类型和工具，点击“添加到测评”。添加成功后会显示在这里。</p></div>}
              </div>
            </section>}
            <section className="qt-panel" hidden={stepIndex !== 2} aria-label="投放设置步骤">
              <header className="qt-panel-heading"><small>STEP 03 / 04</small><h2>投放设置</h2><p>先选择课程与开放时间，再决定学员何时查看反馈。</p></header>
              <div className="qt-panel-body qt-delivery-body">
                <div className="qt-delivery-intro"><ListChecks size={20} aria-hidden="true" /><p><strong>先完成 3 项基础设置</strong><span>普通测评设置好课程、时间和报告即可，下方可选功能按需开启。</span></p></div>
                {deliverySettings}
                <div className="qt-optional-heading"><h3>按需添加功能</h3><p>以下功能默认关闭，不影响普通测评的编制与发布。</p></div>
                <details className="qt-advanced qt-delivery-disclosure" open={Boolean(checkpointEnabled || localCognitiveEnabled || timingEnabled || detail?.timingExportEnabled) || undefined}><summary><span className="qt-disclosure-title"><Save size={20} aria-hidden="true" /><span><strong>进度保存与作答时间</strong><small>允许稍后继续、清理认知本机草稿，或记录量表用时。</small></span></span><span className="qt-disclosure-badge">可选</span></summary><div className="qt-advanced-body">{persistenceSettings}{timingDisclosure}</div></details>
                {detail && <details className="qt-advanced qt-delivery-disclosure" open={Boolean(trainingVariantDraft || trainingFlowText || detail.trainingVariantFrozen || detail.trainingFlowFrozen || trainingFlowError) || undefined}><summary><span className="qt-disclosure-title"><Shuffle size={20} aria-hidden="true" /><span><strong>分组与条件路径</strong><small>让学员随机作答不同内容，或根据前题答案决定后续路径。</small></span></span><span className="qt-disclosure-badge">高级</span></summary><div className="qt-advanced-body"><p className="qt-strategy-guide">两种方式选其一：随机分组决定“这次抽到哪套内容”；条件路径决定“满足什么条件后，继续哪些内容”。</p>{advancedSettings}</div></details>}
              </div>
            </section>
            {detail && <section className="qt-panel" hidden={stepIndex !== 3} aria-label="检查与发布步骤">
              <header className="qt-panel-heading"><small>STEP 04 / 04</small><h2>检查与发布</h2><p>核对内容、课程与反馈设置，确认后再发布。</p></header>
              <div className="qt-panel-body"><dl className="qt-review-facts"><div><dt>测评名称</dt><dd>{name}</dd></div><div><dt>内容单元</dt><dd>{units.length} 个</dd></div><div><dt>投放范围</dt><dd>{kind === 'GENERAL' ? '通用公开问卷' : courseIds.map(courseId => catalog.courses.find((course:any) => course.id === courseId)?.title || '已绑定课程').join('、') || '尚未选择'}</dd></div><div><dt>学员报告</dt><dd>{reportSummary}{feedbackMode === 'SCHEDULED' && reportSummary === '预设时间开放' ? ` ${localDate(feedbackReleaseAt)}` : ''}</dd></div></dl>
                {!draft && publishPanel}
                {anonymousSettings}{draft && publishPanel}<details className="qt-advanced"><summary>草稿与结果管理</summary><div className="qt-advanced-body">{managementActions}</div></details>
              </div>
            </section>}
          </div>
          <aside className="qt-sidebar" aria-label="编制概览"><div className="qt-summary"><small>当前测评</small><h2>{name.trim() || '未命名测评'}</h2><p>{kind === 'COURSE' ? '课程问卷' : '通用公开问卷'} · 单项报告合集</p><dl><div><dt>内容单元</dt><dd>{units.length} 个</dd></div><div><dt>投放课程</dt><dd>{courseIds.map(courseId => catalog.courses.find((course:any) => course.id === courseId)?.title || '已绑定课程').join('、') || '尚未选择'}</dd></div><div><dt>开放时间</dt><dd>{opensAt ? localDate(opensAt).replace('T',' ') : '发布后立即开放'}</dd></div><div><dt>报告开放</dt><dd>{reportSummary}</dd></div></dl><div className="qt-ready-title"><h3>{draft ? '发布准备' : '当前状态'}</h3><span>{draft ? `${readyItems.filter(([,ready]) => ready).length} / 4` : labels[detail?.status]}</span></div>{draft && <><progress aria-label="发布准备完成度" value={readyItems.filter(([,ready]) => ready).length} max={4} /><ul>{readyItems.map(([label,ready]) => <li key={label} className={ready ? 'is-ready' : ''}><span>{ready ? <Check size={12} /> : '·'}</span>{label}</li>)}</ul></>}</div>{toolConfigurationSummary}<div className="qt-help"><ListChecks size={17} /><h3>{['先把测评介绍清楚','先确定内容，再安排投放','先设置必需项，再查看可选项','发布前再核对一次'][stepIndex]}</h3><p>{['名称便于课程成员识别，指导语会展示给学员。','可添加不同类型的单元，再按学员作答顺序排列。','课程、开放时间和报告反馈是主流程，高级策略按需启用。','正式发布会再次校验权限；发布后内容和相关策略冻结。'][stepIndex]}</p></div></aside>
        </div>
        <footer className="qt-footer"><ProductButton disabled={busy || stepIndex === 0} onClick={() => goToStep(id === 'new' ? 'questionnaire-basic' : editorSteps[stepIndex-1][0])}><ArrowLeft size={16} />上一步</ProductButton><span role="status">{busy ? '正在处理，请稍候…' : id === 'new' ? '先创建草稿，再添加测评内容。' : dirty ? '有未保存的修改，请先保存。' : '设置已同步'}</span><div>{draft && id !== 'new' && <ProductButton disabled={busy || !dirty} onClick={() => void save()}>保存全部修改</ProductButton>}{stepIndex < 3 && <ProductButton variant="primary" disabled={busy} onClick={() => id === 'new' ? void save() : goToStep(editorSteps[stepIndex+1][0])}>{id === 'new' ? '创建草稿，继续编排' : `下一步：${editorSteps[stepIndex+1][1]}`}<ArrowRight size={16} /></ProductButton>}</div></footer>
      </fieldset>}
    </ProductPage>
  )
  return (
    <ProductPage width="management" className={`hui-questionnaire-products${isTrainingHost() ? ' training-form-management' : ''}`}>
      <PageHeader
        title={id === 'new' ? '创建组合测评' : detail && !draft ? '查看组合测评' : '编制组合测评'}
        description="各项测评独立反馈，报告为单项结果合集。当前支持网页作答。"
      />
      <Link to={trainingDesign ? assessmentContextHref('/questionnaires',location.pathname,location.search) : '/questionnaires'}>返回组合测评列表</Link>
      {feedback}
      {scientificTools}
      {pendingMeasurement&&<p role="status">请先恢复或明确结束原认知发布请求，再修改组合测评。</p>}
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
        <fieldset disabled={authoringLocked} aria-label="组合测评编辑">
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
        </fieldset>
      )}
    </ProductPage>
  )
}
