import { applyScaleOptionLabels, parseScaleItemPaste, resizeScaleOptions, scaleOptionPresets } from './scaleAuthoringInput'
import { type RawScoreFeedback, type RawScoreFeedbackRule, validateRawScoreFeedback } from '../modules/scale/rawScoreFeedback'
import { TrainingRawScoreFeedbackEditor } from './TrainingRawScoreFeedbackEditor'
import ScaleCsvImport from './ScaleCsvImport'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowLeft, CheckCircle, Copy, Eye, Plus, Save, Trash2 } from 'lucide-react'
import apiClient from '../api/client'
import { PageHeader, ProductPage, ProductStatus } from '../components/product-ui'
import { isTrainingHost } from '../training/context'
import { trainingCourseContext } from '../training/courseNavigation'
import './ScaleEdit.css'

type ResponseValue = string | number
const responseValueToken = (value: ResponseValue): string => JSON.stringify(value)
type Direction = 'higher_is_better' | 'higher_is_worse' | 'higher_is_more' | 'lower_is_better' | 'bipolar' | 'descriptive'
type Aggregation = 'sum' | 'mean'

interface ResponseOption {
  value: ResponseValue
  label: string
  score: number
}

interface ScaleDefinition {
  schemaVersion: 2
  respondentType: string
  source: { title?: string; citation?: string; url?: string; publicationYear?: number }
  license: { status: 'self_authored' | 'authorized' | 'verified' | 'unknown'; redistribution: 'allowed' | 'restricted' | 'unknown'; note?: string }
  display: { randomizeItems: boolean }
  responseSets: Array<{ key: string; options: ResponseOption[] }>
  items: Array<{ itemCode: string; content: string; type: string; required: boolean; sortOrder: number; responseSetKey: string; randomizeOptions: boolean; purpose?: 'CONTENT' | 'ATTENTION_CHECK' | 'SOCIAL_DESIRABILITY'; attentionTarget?: ResponseValue }>
  scoring: {
    scoringVersion: string
    itemRules: Array<{ itemCode: string; transform: { type: 'identity' | 'reverse' } }>
    defaultMissingPolicy: { type: 'complete_required' }
    scores: Array<{
      key: string
      type: 'total' | 'dimension'
      label: string
      description?: string
      direction: Direction
      canonical: boolean
      displayPrecision: number
      source: { type: 'items'; items: Array<{ itemCode: string; weight: number }>; aggregation: Aggregation }
    }>
  }
  report: {
    rawScoreFeedback?: RawScoreFeedback
    reportVersion: string
    primaryScoreKeys: string[]
    scoreOrder: string[]
    interpretations: Array<{ scoreKey: string; headline: string; source: { type: 'score_only' }; summary: string; bands: []; guidance: [] }>
    limitations: string[]
    disclaimer: string
  }
  referencePolicy: { type: 'none' }
}

interface ScaleMeta {
  id: string
  code: string
  name: string
  description: string | null
  status: string
  visibility: 'HIDDEN' | 'COURSE' | 'PUBLIC'
  instrumentClass: 'STANDARD' | 'CUSTOM_DESCRIPTIVE'
  instrumentVersion: string
  estimatedTime: number | null
  instruction: string | null
  tags?: string[]
  copyEligibility?: { allowed: boolean; reason?: string }
  copySource?: {
    schemaVersion: 1
    parentId: string
    parentCode: string
    parentVersion: string
    parentDefinitionHash: string
    parentScoringHash: string
    parentCreatorId: string
    parentSourceHash: string
    parentLicenseHash: string
  } | null
}

const basicValues = (scale: ScaleMeta) => ({
  name: scale.name, description: scale.description || '', visibility: scale.visibility,
  estimatedTime: scale.estimatedTime ?? null, instruction: scale.instruction || '', tags: scale.tags || [],
})

const emptyDefinition = (): ScaleDefinition => ({
  schemaVersion: 2,
  respondentType: 'participant_self_report',
  source: { title: '教师自建内容' },
  license: { status: 'self_authored', redistribution: 'allowed' },
  display: { randomizeItems: false },
  responseSets: [{ key: 'default', options: [
    { value: 'option_1', label: '选项 1', score: 1 },
    { value: 'option_2', label: '选项 2', score: 2 },
    { value: 'option_3', label: '选项 3', score: 3 },
    { value: 'option_4', label: '选项 4', score: 4 },
    { value: 'option_5', label: '选项 5', score: 5 },
  ] }],
  items: [],
  scoring: { scoringVersion: '2.0.0', itemRules: [], defaultMissingPolicy: { type: 'complete_required' }, scores: [] },
  report: { reportVersion: 'scale-report-v2', primaryScoreKeys: [], scoreOrder: [], interpretations: [], limitations: ['这是自定义描述性量表结果，不提供人口常模或诊断结论。'], disclaimer: '量表结果仅反映本次作答，不构成医学诊断或人口常模。' },
  referencePolicy: { type: 'none' },
})

const emptyScale = (): ScaleMeta => ({
  id: '', code: '', name: '', description: '', status: 'DRAFT', visibility: 'HIDDEN', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '2.0.0', estimatedTime: 15, instruction: '', tags: [],
})

const normalizeDefinition = (raw: any): ScaleDefinition => {
  const base = emptyDefinition()
  if (!raw || raw.schemaVersion !== 2) return base
  return {
    ...base,
    ...raw,
    source: { ...base.source, ...(raw.source || {}) },
    license: { ...base.license, ...(raw.license || {}) },
    display: { ...base.display, ...(raw.display || {}) },
    responseSets: Array.isArray(raw.responseSets) && raw.responseSets.length > 0 ? raw.responseSets : base.responseSets,
    items: raw.items || [],
    scoring: {
      ...base.scoring,
      ...(raw.scoring || {}),
      itemRules: raw.scoring?.itemRules || [],
      scores: raw.scoring?.scores || [],
      defaultMissingPolicy: { type: 'complete_required' },
    },
    report: { ...base.report, ...(raw.report || {}) },
    referencePolicy: { type: 'none' },
  }
}

const scoreSourceFor = (definition: ScaleDefinition, scoreKey: string) => {
  const score = definition.scoring.scores.find((candidate) => candidate.key === scoreKey)
  return score?.source.type === 'items' ? score.source.items : []
}

const updateReportContract = (definition: ScaleDefinition): ScaleDefinition => {
  const keys = definition.scoring.scores.map((score) => score.key)
  const interpretations = definition.scoring.scores.map((score) => {
    const existing = definition.report.interpretations.find((candidate) => candidate.scoreKey === score.key)
    return existing || { scoreKey: score.key, headline: score.label, source: { type: 'score_only' as const }, summary: `${score.label}为描述性结果，请结合题目内容和实际情境理解。`, bands: [] as [], guidance: [] as [] }
  })
  return {
    ...definition,
    report: {
      ...definition.report,
      primaryScoreKeys: definition.scoring.scores.filter((score) => score.canonical).map((score) => score.key),
      scoreOrder: keys,
      interpretations,
      ...(definition.report.rawScoreFeedback ? { rawScoreFeedback: { ...definition.report.rawScoreFeedback, rules: definition.report.rawScoreFeedback.rules.filter(rule => keys.includes(rule.scoreKey)) } } : {}),
    } as ScaleDefinition['report'],
  }
}

const ScaleEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  // A route change owns a fresh editor. Pending work from the previous scale
  // must never update this one or navigate after a delayed create completes.
  return <ScaleEditor key={id || ''} id={id} />
}

const ScaleEditor: React.FC<{ id?: string }> = ({ id }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const training = isTrainingHost()
  const courseContext = training ? trainingCourseContext(location.pathname, location.search) : null
  const returnPath = courseContext ? courseContext.returnTo || `/courses/${encodeURIComponent(courseContext.courseId)}/detail?section=assessments` : training ? '/toolkit' : '/scales'
  const returnLabel = courseContext ? '返回当前课程' : training ? '返回工具' : '返回量表列表'
  const isNew = id === 'new'
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [copying, setCopying] = useState(false)
  const [importing, setImporting] = useState(false)
  const [mediaUploadCount, setMediaUploadCount] = useState(0)
  const onUploadBusy = useCallback((busy: boolean) => setMediaUploadCount(count => Math.max(0, count + (busy ? 1 : -1))), [])
  const [scale, setScale] = useState<ScaleMeta>(emptyScale)
  const [definition, setDefinition] = useState<ScaleDefinition>(emptyDefinition)
  const [savedBasic, setSavedBasic] = useState(() => JSON.stringify(basicValues(emptyScale())))
  const [savedDefinition, setSavedDefinition] = useState(() => JSON.stringify(emptyDefinition()))
  const [activeTab, setActiveTab] = useState<'basic' | 'responses' | 'items' | 'scores' | 'report'>('basic')
  const [issues, setIssues] = useState<Array<{ path: string; message: string; severity?: string }>>([])
  const [preview, setPreview] = useState<any>(null)

  const [itemPaste, setItemPaste] = useState('')
  const [optionPaste, setOptionPaste] = useState('')
  const [authoringNotice, setAuthoringNotice] = useState('')
  const [authoringError, setAuthoringError] = useState('')
  const [accessBlocked, setAccessBlocked] = useState(false)
  const [hasConflict, setHasConflict] = useState(false)
  const mountedRef = useRef(true)
  const readSequenceRef = useRef(0)
  const operationRef = useRef(0)
  const savingRef = useRef(false)
  const updatedAtRef = useRef<string | undefined>(undefined)
  const standard = scale.instrumentClass === 'STANDARD'
  const readOnly = accessBlocked || standard || (!isNew && (scale.id !== id || scale.status !== 'DRAFT'))
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  const controlsDisabled = readOnly || saving || copying || importing
  const basicDirty = JSON.stringify(basicValues(scale)) !== savedBasic
  const definitionDirty = JSON.stringify(definition) !== savedDefinition
  const canCopy = !loading && !accessBlocked && scale.id === id && scale.status === 'PUBLISHED' && !standard && scale.copyEligibility?.allowed === true
  const responseSet = definition.responseSets[0]
  const sortedItems = useMemo(() => [...definition.items].sort((a, b) => a.sortOrder - b.sortOrder), [definition.items])

  const contentItems = sortedItems.filter(item => !item.purpose || item.purpose === 'CONTENT')

  const applyMetadata = useCallback((value: any, preserveDraftEdits = false) => {
    const frozen = (value.instrumentClass || 'CUSTOM_DESCRIPTIVE') !== 'CUSTOM_DESCRIPTIVE' || value.status !== 'DRAFT'
    readOnlyRef.current = frozen
    updatedAtRef.current = value.updatedAt
    const next: ScaleMeta = {
      id: value.id, code: value.code, name: value.name, description: value.description, status: value.status, visibility: value.visibility,
      instrumentClass: value.instrumentClass || 'CUSTOM_DESCRIPTIVE', instrumentVersion: value.instrumentVersion || '2.0.0', estimatedTime: value.estimatedTime, instruction: value.instruction, tags: value.tags || [],
      copyEligibility: value.copyEligibility, copySource: value.copySource || null,
    }
    setSavedBasic(JSON.stringify(basicValues(next)))
    setScale(current => preserveDraftEdits ? { ...next, ...basicValues(current) } : next)
    return frozen
  }, [])

  useEffect(() => {
    mountedRef.current = true
    let active = true
    const sequence = ++readSequenceRef.current
    if (!isNew && id) {
      void (async () => {
        try {
          const response = await apiClient.get<any>(`/scales/${id}`)
          if (!active || sequence !== readSequenceRef.current) return
          if (response.code !== 0 || response.data?.id !== id) throw new Error(response.message || '量表加载失败')
          applyMetadata(response.data)
          const stored = normalizeDefinition(response.data.definition)
          setDefinition(stored)
          setSavedDefinition(JSON.stringify(stored))
        } catch (error) {
          if (active && sequence === readSequenceRef.current) setIssues([{ path: 'load', message: (error as { message?: string }).message || '量表加载失败', severity: 'error' }])
        } finally {
          if (active && sequence === readSequenceRef.current) setLoading(false)
        }
      })()
    }
    return () => {
      active = false
      mountedRef.current = false
      readSequenceRef.current += 1
      operationRef.current += 1
    }
  }, [id, isNew, applyMetadata])

  const isCurrentOperation = (operation: number) => mountedRef.current && operationRef.current === operation
  const beginWrite = () => {
    if (!mountedRef.current || loading || readOnlyRef.current || savingRef.current || importing || mediaUploadCount > 0) return null
    savingRef.current = true
    setSaving(true)
    return ++operationRef.current
  }
  const finishWrite = (operation: number) => {
    if (!isCurrentOperation(operation)) return
    savingRef.current = false
    setSaving(false)
  }
  const assertResponse = (response: { code: string | number; message?: string }, fallback: string) => {
    if (response.code !== 0) throw Object.assign(new Error(response.message || fallback), { code: response.code })
  }
  const readCurrentScale = async (operation: number) => {
    const sequence = ++readSequenceRef.current
    const response = await apiClient.get<any>(`/scales/${id}`)
    if (!isCurrentOperation(operation) || sequence !== readSequenceRef.current) return null
    assertResponse(response, '量表状态刷新失败')
    if (response.data?.id !== id) throw new Error('量表状态刷新失败')
    return response.data
  }
  const reportWriteError = async (error: unknown, path: string, operation: number) => {
    if (!isCurrentOperation(operation)) return
    const failure = error as { status?: number; code?: string | number; message?: string }
    let message = failure.message || '保存失败'
    const status = Number(failure.status || failure.code)
    if (status === 403 || status === 409) {
      // Recheck authority/state after the server rejects a stale editor. A failed
      // refresh stays blocked; a readable DRAFT does not undo an explicit 403.
      readOnlyRef.current = true
      setAccessBlocked(true)
      setHasConflict(true)
      try {
        const current = await readCurrentScale(operation)
        if (!current) return
        const frozen = applyMetadata(current, true)
        readOnlyRef.current = status === 403 || frozen
        setAccessBlocked(status === 403)
      } catch {
        if (!isCurrentOperation(operation)) return
        message += '；未能刷新状态，已暂停编辑，请重新打开量表。'
      }
    }
    if (status === 409) message += '；未自动重试。请核对当前状态与保留的编辑后再保存。'
    if (isCurrentOperation(operation)) setIssues([{ path, message, severity: 'error' }])
  }

  const writeVersion = () => updatedAtRef.current ? { expectedUpdatedAt: updatedAtRef.current } : {}
  const persistBasic = async (operation: number) => {
    if (!scale.name) throw new Error('量表名称不能为空')
    const response = await apiClient.put<any>(`/scales/${id}`, { ...basicValues(scale), estimatedTime: scale.estimatedTime ?? undefined, ...writeVersion() })
    if (!isCurrentOperation(operation)) return false
    assertResponse(response, '基本信息保存失败')
    if (response.data?.id !== id) throw new Error('未能确认基本信息保存结果，请重新打开量表核对')
    applyMetadata(response.data)
    setHasConflict(false)
    return !readOnlyRef.current
  }

  const saveBasic = async () => {
    const operation = beginWrite()
    if (operation === null) return
    try {
      if (!scale.code || !scale.name) throw new Error('量表编码和名称不能为空')
      const payload = { name: scale.name, description: scale.description || undefined, visibility: scale.visibility, estimatedTime: scale.estimatedTime || undefined, instruction: scale.instruction || undefined, tags: scale.tags || [] }
      if (isNew) {
        const response = await apiClient.post<any>('/scales', { code: scale.code, ...payload })
        if (!isCurrentOperation(operation)) return
        assertResponse(response, '创建失败')
        if (!response.data?.id) throw new Error('创建失败')
        navigate(`/scales/${response.data.id}`)
        return
      }
      if (await persistBasic(operation)) setIssues([{ path: '基本信息', message: '基本信息已保存。', severity: 'success' }])
    } catch (error) {
      await reportWriteError(error, 'basic', operation)
    } finally { finishWrite(operation) }
  }

  const persistDefinition = async (operation: number): Promise<boolean> => {
    const next = updateReportContract(definition)
    const invalidAttention = next.items.find(item => item.purpose === 'ATTENTION_CHECK' && !next.responseSets.find(set => set.key === item.responseSetKey)?.options.some(option => option.value === item.attentionTarget))
    if (invalidAttention) throw new Error(`${invalidAttention.itemCode} 的注意力目标选项已失效，请重新选择`)
    const feedbackIssues = validateRawScoreFeedback(next.report.rawScoreFeedback, next.scoring.scores.map(score => score.key))
    if (feedbackIssues.length) throw new Error(feedbackIssues.join('；'))
    const response = await apiClient.put<any>(`/scales/${id}/definition`, { definition: next, ...writeVersion() })
    if (!isCurrentOperation(operation)) return false
    assertResponse(response, 'definition 保存失败')
    const writtenVersion = response.data?.updatedAt
    if (writtenVersion) updatedAtRef.current = writtenVersion
    const confirmed = await readCurrentScale(operation)
    if (!confirmed) return false
    if (!confirmed.definition) throw new Error('未能确认保存结果，请重试；当前编辑内容已保留')
    if (writtenVersion && confirmed.updatedAt !== writtenVersion) {
      throw Object.assign(new Error('保存后量表又发生了修改，发布已暂停'), { status: 409 })
    }
    const frozen = applyMetadata(confirmed, true)
    const stored = normalizeDefinition(confirmed.definition)
    if (frozen) {
      setHasConflict(true)
      setIssues([{ path: 'definition', message: '量表状态已变更，当前定义只读。本页编辑已保留，请重新打开量表核对已发布内容。', severity: 'error' }])
      return false
    }
    const selectedItems = (value: ScaleDefinition) => value.scoring.scores.map(score => ({
      key: score.key, aggregation: score.source.aggregation,
      items: score.source.items.map(item => ({ itemCode: item.itemCode, weight: item.weight })),
    }))
    if (JSON.stringify(selectedItems(stored)) !== JSON.stringify(selectedItems(next))) throw new Error('保存后的计分题目与当前选择不一致，请重试；当前编辑内容已保留')
    const qualityItems = (value: ScaleDefinition) => value.items.filter(item => item.purpose && item.purpose !== 'CONTENT').map(item => ({ itemCode: item.itemCode, purpose: item.purpose, attentionTarget: item.attentionTarget, responseSetKey: item.responseSetKey }))
    const feedbackContract = (value: ScaleDefinition) => {
      const images = (entries: import('../modules/scale/rawScoreFeedback').RawScoreFeedbackImage[] | undefined) => entries?.map(image => ({ asset: { assetId: image.asset.assetId, contentHash: image.asset.contentHash, mimeType: image.asset.mimeType }, altText: image.altText, caption: image.caption, order: image.order }))
      return value.report.rawScoreFeedback?.rules.map(rule => ({ scoreKey: rule.scoreKey, ranges: rule.ranges.map(range => ({ key: range.key, min: range.min, max: range.max, includeMax: range.includeMax, text: range.text.trim(), images: images(range.images) })), fallback: rule.fallback ? { text: rule.fallback.text.trim(), images: images(rule.fallback.images) } : undefined })) ?? []
    }
    if (JSON.stringify(qualityItems(stored)) !== JSON.stringify(qualityItems(next)) || JSON.stringify(feedbackContract(stored)) !== JSON.stringify(feedbackContract(next))) throw new Error('保存后的题型或反馈配置与当前编辑不一致，未确认保存；当前编辑内容已保留')
    if ((stored.license.note ?? '') !== (next.license.note ?? '')) throw new Error('保存后的授权声明与当前编辑不一致，未确认保存；当前编辑内容已保留')
    setDefinition(stored)
    setSavedDefinition(JSON.stringify(stored))
    setHasConflict(false)
    setIssues([{ path: '计分与题目', message: '已保存，并重新读取确认计分题目。', severity: 'success' }])
    return true
  }

  const saveDraft = async () => {
    const operation = beginWrite()
    if (operation === null) return
    try {
      if (basicDirty && !await persistBasic(operation)) return
      if (!isCurrentOperation(operation) || readOnlyRef.current) return
      if (await persistDefinition(operation)) setIssues([{ path: '草稿', message: '基本信息、题目与定义已保存。', severity: 'success' }])
    } catch (error) { await reportWriteError(error, '草稿', operation) }
    finally { finishWrite(operation) }
  }

  const copyAsDraft = async () => {
    if (!mountedRef.current || !canCopy || savingRef.current) return
    savingRef.current = true
    setCopying(true)
    setIssues([])
    const operation = ++operationRef.current
    let opened = false
    try {
      const response = await apiClient.post<any>(`/scales/${id}/copy`, {})
      if (!isCurrentOperation(operation)) return
      assertResponse(response, '复制失败，请重试')
      const draft = response.data
      if (!draft?.id || draft.id === id || draft.status !== 'DRAFT' || draft.visibility !== 'HIDDEN' || draft.instrumentClass !== 'CUSTOM_DESCRIPTIVE') {
        throw new Error('未能确认新草稿，请返回量表列表核对复制结果')
      }
      opened = true
      navigate(`/scales/${draft.id}`)
    } catch (error) { await reportWriteError(error, '复制', operation) }
    finally {
      if (isCurrentOperation(operation) && !opened) {
        savingRef.current = false
        setCopying(false)
      }
    }
  }
  const saveDefinition = async () => {
    if (!id || isNew) {
      setIssues([{ path: '草稿', message: '请先保存基本信息创建草稿，再编制题目与定义。', severity: 'error' }])
      return
    }
    const operation = beginWrite()
    if (operation === null) return
    try { await persistDefinition(operation) }
    catch (error) { await reportWriteError(error, 'definition', operation) }
    finally { finishWrite(operation) }
  }

  const validate = async () => {
    if (!scale.id || savingRef.current || mediaUploadCount > 0) return
    const operation = operationRef.current
    try {
      const response = await apiClient.post<any>(`/scales/${id}/validate`, {})
      if (!isCurrentOperation(operation)) return
      assertResponse(response, '校验失败')
      setIssues(response.data.issues || [])
      if (response.data.valid) setIssues([{ path: 'definition', message: '发布检查通过，可以发布描述性量表。', severity: 'success' }])
    } catch (error) { if (isCurrentOperation(operation)) setIssues([{ path: 'validate', message: (error as { message?: string }).message || '校验失败', severity: 'error' }]) }
  }

  const previewDefinition = async () => {
    if (!scale.id || savingRef.current || mediaUploadCount > 0 || sortedItems.length === 0) return
    const operation = operationRef.current
    try {
      const response = await apiClient.post<any>(`/scales/${id}/preview`, { answers: sortedItems.map((item) => ({ itemCode: item.itemCode, responseValue: definition.responseSets.find(set => set.key === item.responseSetKey)?.options[0]?.value })) })
      if (!isCurrentOperation(operation)) return
      assertResponse(response, '预览失败')
      setPreview(response.data)
    } catch (error) { if (isCurrentOperation(operation)) setIssues([{ path: 'preview', message: (error as { message?: string }).message || '预览失败', severity: 'error' }]) }
  }

  const publish = async () => {
    const operation = beginWrite()
    if (operation === null) return
    try {
      if (basicDirty && !await persistBasic(operation)) return
      if (!await persistDefinition(operation) || !isCurrentOperation(operation) || readOnlyRef.current) return
      const response = await apiClient.post<any>(`/scales/${id}/publish`, writeVersion())
      if (!isCurrentOperation(operation)) return
      assertResponse(response, '发布失败')
      readOnlyRef.current = true
      if (response.data?.id === id && response.data.status === 'PUBLISHED') applyMetadata(response.data)
      else setScale((current) => ({ ...current, status: 'PUBLISHED', copyEligibility: undefined }))
      setIssues([{ path: 'publish', message: '量表已发布。', severity: 'success' }])
    } catch (error) { await reportWriteError(error, 'publish', operation) }
    finally { finishWrite(operation) }
  }

  const replaceOptions = (options: ResponseOption[]) => {
    if (readOnlyRef.current || controlsDisabled) return
    const removedTarget = definition.items.find(item => item.purpose === 'ATTENTION_CHECK' && item.responseSetKey === responseSet.key && item.attentionTarget !== undefined && !options.some(option => option.value === item.attentionTarget))
    if (removedTarget) { setAuthoringError('这些选项包含注意力题的目标答案，请先修改目标答案，再减少选项。'); return }
    setDefinition(current => ({ ...current, responseSets: [{ ...current.responseSets[0], options }, ...current.responseSets.slice(1)] }))
    setAuthoringError(''); setAuthoringNotice('选项已更新，尚未保存。')
  }
  const applyOptionText = (text = optionPaste) => {
    try { replaceOptions(applyScaleOptionLabels(responseSet.options, text)) }
    catch (error) { setAuthoringError((error as Error).message) }
  }
  const pastedItems = (() => { try { return { rows: parseScaleItemPaste(itemPaste), error: '' } } catch (error) { return { rows: [], error: (error as Error).message } } })()
  const appendPastedItems = () => {
    if (readOnlyRef.current || controlsDisabled || !pastedItems.rows.length || pastedItems.error) return
    if (definition.items.length + pastedItems.rows.length > 200) { setAuthoringError('量表最多 200 道题，请减少本次追加数量。'); return }
    const lastOrder = Math.max(0, ...definition.items.map(item => item.sortOrder))
    const additions = pastedItems.rows.map((row, index) => ({ itemCode: `Q_${crypto.randomUUID().replace(/-/g, '')}`, content: row.content, type: 'single', required: true, sortOrder: lastOrder + index + 1, responseSetKey: responseSet.key, randomizeOptions: false }))
    setDefinition(current => ({ ...current, items: [...current.items, ...additions], scoring: { ...current.scoring, itemRules: [...current.scoring.itemRules, ...additions.map((item, index) => ({ itemCode: item.itemCode, transform: { type: pastedItems.rows[index].reverse ? 'reverse' as const : 'identity' as const } }))] } }))
    setItemPaste(''); setAuthoringError(''); setAuthoringNotice(`已追加 ${additions.length} 道必答题，尚未保存。`)
  }
  const updateOption = (index: number, patch: Partial<ResponseOption>) => setDefinition((current) => ({ ...current, responseSets: [{ ...current.responseSets[0], options: current.responseSets[0].options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) }, ...current.responseSets.slice(1)] }))
  const addOption = () => replaceOptions(resizeScaleOptions(responseSet.options, Math.min(50, responseSet.options.length + 1)))
  const removeOption = (index: number) => { if (responseSet.options.length > 2) replaceOptions(responseSet.options.filter((_, optionIndex) => optionIndex !== index)) }


  const addItem = (purpose: 'CONTENT' | 'ATTENTION_CHECK' | 'SOCIAL_DESIRABILITY' = 'CONTENT') => setDefinition((current) => {
    const itemCode = `Q_${crypto.randomUUID().replace(/-/g, '')}`
    const ordered = [...current.items].sort((a, b) => a.sortOrder - b.sortOrder)
    const previousSetKey = ordered[ordered.length - 1]?.responseSetKey
    const sharedSet = (purpose !== 'CONTENT' && current.responseSets.find(set => set.key === previousSetKey)) || current.responseSets[0]
    return {
      ...current,
      items: [...current.items, { itemCode, content: purpose === 'SOCIAL_DESIRABILITY' ? '我从不撒谎' : purpose === 'ATTENTION_CHECK' ? `请选择「${sharedSet.options[0]?.label ?? ''}」。` : '', ...(purpose === 'CONTENT' ? {} : { purpose }), ...(purpose === 'ATTENTION_CHECK' ? { attentionTarget: sharedSet.options[0]?.value } : {}), type: 'single', required: true, sortOrder: (ordered[ordered.length - 1]?.sortOrder ?? 0) + 1, responseSetKey: sharedSet.key, randomizeOptions: false }],
      scoring: { ...current.scoring, itemRules: purpose === 'CONTENT' ? [...current.scoring.itemRules, { itemCode, transform: { type: 'identity' } }] : current.scoring.itemRules },
    }
  })
  const moveItem = (itemCode: string, delta: number) => setDefinition(current => {
    const items = [...current.items].sort((a, b) => a.sortOrder - b.sortOrder)
    const index = items.findIndex(item => item.itemCode === itemCode)
    const target = index + delta
    if (index < 0 || target < 0 || target >= items.length) return current
    ;[items[index], items[target]] = [items[target], items[index]]
    return { ...current, items: items.map((item, i) => ({ ...item, sortOrder: i + 1 })) }
  })
  const duplicateItem = (itemCode: string) => setDefinition(current => {
    const items = [...current.items].sort((a, b) => a.sortOrder - b.sortOrder)
    const index = items.findIndex(item => item.itemCode === itemCode)
    if (index < 0) return current
    const copiedCode = `Q_${crypto.randomUUID().replace(/-/g, '')}`
    items.splice(index + 1, 0, { ...items[index], itemCode: copiedCode })
    const rule = current.scoring.itemRules.find(entry => entry.itemCode === itemCode)
    return { ...current, items: items.map((item, i) => ({ ...item, sortOrder: i + 1 })),
      scoring: { ...current.scoring, itemRules: rule ? [...current.scoring.itemRules, { ...rule, itemCode: copiedCode, transform: { ...rule.transform } }] : current.scoring.itemRules } }
  })
  const updateItem = (itemCode: string, patch: Partial<ScaleDefinition['items'][number]>) => setDefinition((current) => ({ ...current, items: current.items.map((item) => item.itemCode === itemCode ? { ...item, ...patch } : item) }))
  const toggleReverse = (itemCode: string) => setDefinition(current => {
    const exists = current.scoring.itemRules.some(rule => rule.itemCode === itemCode)
    const rules = exists ? current.scoring.itemRules.map(rule => rule.itemCode === itemCode ? { ...rule, transform: { type: rule.transform.type === 'reverse' ? 'identity' as const : 'reverse' as const } } : rule)
      : [...current.scoring.itemRules, { itemCode, transform: { type: 'reverse' as const } }]
    return { ...current, scoring: { ...current.scoring, itemRules: rules } }
  })

  const removeItem = (itemCode: string) => setDefinition((current) => ({ ...current, items: [...current.items].sort((a, b) => a.sortOrder - b.sortOrder).filter((item) => item.itemCode !== itemCode).map((item, index) => ({ ...item, sortOrder: index + 1 })), scoring: { ...current.scoring, itemRules: current.scoring.itemRules.filter((rule) => rule.itemCode !== itemCode), scores: current.scoring.scores.map((score) => ({ ...score, source: { ...score.source, items: score.source.items.filter((item) => item.itemCode !== itemCode) } })) } }))

  const scoreSelectionSummary = (score: ScaleDefinition['scoring']['scores'][number]) => {
    const selected = score.source.items
    const ranges = selected.map(entry => {
      const item = definition.items.find(candidate => candidate.itemCode === entry.itemCode)
      const options = definition.responseSets.find(set => set.key === item?.responseSetKey)?.options
      if (!options?.length) return null
      const values = options.map(option => option.score)
      const weight = score.source.aggregation === 'mean' ? 1 : entry.weight
      return { min: Math.min(...values) * weight, max: Math.max(...values) * weight }
    })
    const complete = ranges.length > 0 && ranges.every(range => range !== null)
    const divisor = score.source.aggregation === 'mean' ? selected.length : 1
    const range = complete ? `${(ranges.reduce((sum, r) => sum + Math.min(r!.min, r!.max), 0) / divisor).toFixed(score.displayPrecision ?? 1)}–${(ranges.reduce((sum, r) => sum + Math.max(r!.min, r!.max), 0) / divisor).toFixed(score.displayPrecision ?? 1)}` : '请先选题并完成选项计分'
    const omitted = contentItems.filter(item => !selected.some(entry => entry.itemCode === item.itemCode)).map(item => item.itemCode)
    return `已纳入 ${selected.length}/${contentItems.length} 题 · 预计范围 ${range}。${omitted.length ? `未纳入：${omitted.join('、')}。请核对报告文案，避免将部分计分称为全部题目合计。` : '全部题目已纳入。'}`
  }

  const addScore = (type: 'total' | 'dimension') => setDefinition((current) => {
    const scoreKeys = new Set(current.scoring.scores.map((score) => score.key))
    let index = current.scoring.scores.length + 1
    while (scoreKeys.has(`${type}_${index}`)) index += 1
    const key = `${type}_${index}`
    const score = { key, type, label: type === 'total' ? '总分' : `维度 ${index}`, direction: 'descriptive' as Direction, canonical: current.scoring.scores.length === 0, displayPrecision: 1, source: { type: 'items' as const, items: [] as Array<{ itemCode: string; weight: number }>, aggregation: 'sum' as Aggregation } }
    return updateReportContract({ ...current, scoring: { ...current.scoring, scores: [...current.scoring.scores, score] } })
  })
  const updateScore = (key: string, patch: Partial<ScaleDefinition['scoring']['scores'][number]>) => setDefinition((current) => updateReportContract({ ...current, scoring: { ...current.scoring, scores: current.scoring.scores.map((score) => score.key === key ? { ...score, ...patch } : score) } }))
  const toggleScoreItem = (scoreKey: string, itemCode: string) => setDefinition((current) => updateReportContract({ ...current, scoring: { ...current.scoring, scores: current.scoring.scores.map((score) => { if (score.key !== scoreKey) return score; const exists = score.source.items.some((item) => item.itemCode === itemCode); const items = exists ? score.source.items.filter((item) => item.itemCode !== itemCode) : [...score.source.items, { itemCode, weight: 1 }]; return { ...score, source: { ...score.source, items } } }) } }))
  const removeScore = (key: string) => setDefinition((current) => updateReportContract({ ...current, scoring: { ...current.scoring, scores: current.scoring.scores.filter((score) => score.key !== key) } }))
  const updateRawFeedback = (scoreKey: string, rule: RawScoreFeedbackRule | undefined) => setDefinition(current => {
    const rules = (current.report.rawScoreFeedback?.rules ?? []).filter(entry => entry.scoreKey !== scoreKey)
    if (rule) rules.push(rule)
    const report = { ...current.report }
    if (rules.length) report.rawScoreFeedback = { schemaVersion: 1, rules }
    else delete report.rawScoreFeedback
    return { ...current, report }
  })
  const updateInterpretation = (scoreKey: string, patch: { headline?: string; summary?: string }) => setDefinition((current) => ({ ...current, report: { ...current.report, interpretations: current.report.interpretations.map((entry) => entry.scoreKey === scoreKey ? { ...entry, ...patch } : entry) } }))

  if (loading) return <ProductPage width="management"><ProductStatus kind="pending" title="正在加载量表编辑器">正在读取量表定义与报告配置。</ProductStatus></ProductPage>

  const tabs: Array<[typeof activeTab, string]> = [['basic', '基本信息'], ['responses', '响应选项'], ['items', '题目'], ['scores', '计分'], ['report', '报告文案']]
  return (
    <ProductPage width="management" className="staff-editor-page scale-edit-page">
      <PageHeader
        title={isNew ? '创建描述性量表' : scale.name || '量表编辑'}
        actions={(
          <div className="staff-inline-actions">
            <Link to={returnPath} className="staff-secondary-link"><ArrowLeft className="w-4 h-4" aria-hidden="true" />{returnLabel}</Link>
            {!isNew && <button onClick={() => void previewDefinition()} disabled={importing || mediaUploadCount > 0 || saving || copying || standard || accessBlocked || definitionDirty} title={definitionDirty ? '请先保存定义，再预览服务端计分' : '对已保存定义使用每题首个选项进行真实服务端计分'} className="hui-button hui-button--secondary"><Eye className="w-4 h-4" aria-hidden="true" />计分预览</button>}
            {canCopy && <button type="button" onClick={() => void copyAsDraft()} disabled={copying} aria-busy={copying} className="hui-button hui-button--primary scale-edit-copy"><Copy className="w-4 h-4" aria-hidden="true" />{copying ? '正在创建新草稿…' : '复制为新草稿'}</button>}
            {!readOnly && <button onClick={() => void (isNew ? saveBasic() : saveDraft())} disabled={saving || importing || mediaUploadCount > 0} className="hui-button hui-button--secondary"><Save className="w-4 h-4" aria-hidden="true" />保存草稿</button>}
          </div>
        )}
      />
      <div className="scale-edit-meta"><div className="scale-edit-state" aria-label="量表状态">
        <div className="scale-edit-state__labels">
          <span className={`scale-edit-badge ${scale.status === 'PUBLISHED' ? 'scale-edit-badge--published' : ''}`}>{standard ? '标准量表 · 只读' : scale.status === 'PUBLISHED' ? '已发布 · 只读' : readOnly ? '只读' : '草稿'}</span>
          <span>{scale.visibility === 'PUBLIC' ? '公开可用' : scale.visibility === 'COURSE' ? '课程可用' : '隐藏'}</span>
          {!isNew && scale.id && <span>版本 {scale.instrumentVersion}</span>}
        </div>
        <p className="scale-edit-save-state" role="status" aria-live="polite">{mediaUploadCount > 0 ? '正在上传反馈图片，完成后可保存或发布…' : copying ? '正在复制为独立的隐藏草稿…' : saving ? '正在保存，请稍候…' : hasConflict ? '状态已变更，本页编辑已保留，请核对后继续' : readOnly ? '当前版本不可编辑' : isNew ? '尚未创建，先保存基本信息' : basicDirty || definitionDirty ? [basicDirty && '基本信息待保存', definitionDirty && '题目与定义待保存'].filter(Boolean).join(' · ') : '已保存'}</p>
      </div>
      <div className="scale-edit-meta-details">
        {!isNew && scale.code && <details><summary>系统信息</summary><p>量表编码：<code>{scale.code}</code></p></details>}
        {scale.copySource && <aside aria-label="量表副本来源"><details><summary><Copy size={15} aria-hidden="true" />复制来源 · 独立副本</summary><p><Link to={`/scales/${scale.copySource.parentId}`}>{scale.copySource.parentCode}</Link> · 版本 {scale.copySource.parentVersion}</p><p>修改和发布仅作用于当前副本。</p><dl><dt>定义标识</dt><dd>{scale.copySource.parentDefinitionHash}</dd><dt>计分标识</dt><dd>{scale.copySource.parentScoringHash}</dd></dl></details></aside>}
        {scale.status === 'PUBLISHED' && <details><summary>版本使用说明</summary><p>{canCopy ? '此版本已发布并冻结。复制为新草稿后，可以修改内容并重新检查、发布。' : scale.copyEligibility?.reason || '此版本已发布并冻结，当前不可复制。'}</p></details>}
      </div></div>
      {issues.length > 0 && <div className="scale-edit-feedback mb-5 rounded-lg border p-4 bg-gray-50" role={issues.some(issue => issue.severity !== 'success') ? 'alert' : 'status'}><ul className="space-y-1 text-sm">{issues.map((issue, index) => <li key={`${issue.path}-${index}`} className={issue.severity === 'success' ? 'text-green-700' : 'text-red-700'}>{issue.severity === 'success' && <CheckCircle className="w-4 h-4 inline mr-1" />}{issue.path}：{issue.message}</li>)}</ul></div>}
      <div className="staff-toolbar"><div className="staff-segmented scale-edit-tabs" role="group" aria-label="量表编辑分区">{tabs.map(([key, label]) => <button key={key} type="button" aria-pressed={activeTab === key} disabled={importing || (isNew && key !== 'basic')} title={isNew && key !== 'basic' ? '请先保存基本信息创建草稿' : undefined} onClick={() => { setActiveTab(key); setAuthoringNotice(''); setAuthoringError('') }}>{label}</button>)}</div></div>

      {activeTab === 'basic' && <section className="staff-panel scale-author-panel space-y-4"><p className="scale-edit-multiset-note">{isNew ? '请先保存基本信息创建草稿，再编制响应选项、题目、计分、授权声明与报告反馈。此步骤仅保存基本元数据。' : '本区仅保存基本元数据；自有内容 / 授权声明请在“报告文案”中随量表定义保存。'}</p><div className="grid md:grid-cols-2 gap-4"><>{isNew && <label className="text-sm text-gray-700">量表编码<input disabled={controlsDisabled} value={scale.code} onChange={(event) => setScale({ ...scale, code: event.target.value })} className="input mt-1 w-full" /></label>}</><label className="text-sm text-gray-700">量表名称<input disabled={controlsDisabled} value={scale.name} onChange={(event) => setScale({ ...scale, name: event.target.value })} className="input mt-1 w-full" /></label><label className="text-sm text-gray-700">预计用时（分钟）<input type="number" disabled={controlsDisabled} value={scale.estimatedTime ?? ''} onChange={(event) => setScale({ ...scale, estimatedTime: event.target.value ? Number(event.target.value) : null })} className="input mt-1 w-full" /></label><label className="text-sm text-gray-700">可见性<select aria-label="可见性" disabled={controlsDisabled} value={scale.visibility} onChange={(event) => setScale({ ...scale, visibility: event.target.value as ScaleMeta['visibility'] })} className="input mt-1 w-full"><option value="HIDDEN">隐藏</option><option value="COURSE">课程可用</option><option value="PUBLIC">公开可用</option></select></label></div><label className="block text-sm text-gray-700">说明<textarea disabled={controlsDisabled} value={scale.description || ''} onChange={(event) => setScale({ ...scale, description: event.target.value })} className="input mt-1 w-full min-h-24" /></label><label className="block text-sm text-gray-700">作答指导<textarea disabled={controlsDisabled} value={scale.instruction || ''} onChange={(event) => setScale({ ...scale, instruction: event.target.value })} className="input mt-1 w-full min-h-24" /></label><div className="flex justify-end"><button onClick={() => void saveBasic()} disabled={controlsDisabled || mediaUploadCount > 0} className="hui-button hui-button--primary"><Save className="w-4 h-4 inline mr-1" />保存基本信息</button></div></section>}

      {activeTab === 'responses' && <section className="staff-panel scale-author-panel">
        <header className="scale-author-heading"><div><h2>作答选项</h2><p>设置学员看到的选项文字和对应分值，同一组选项供题目共用。</p></div><button onClick={addOption} disabled={controlsDisabled || responseSet.options.length >= 50} className="hui-button hui-button--secondary"><Plus size={17} aria-hidden="true" />增加选项</button></header>
        {definition.responseSets.length > 1 && <p className="scale-edit-multiset-note">此量表含 {definition.responseSets.length} 组响应选项；这里编辑第一组（{responseSet.key}），其余响应集将完整保留。</p>}
        {!readOnly && <div className="scale-author-bulk">
          <div className="scale-author-presets"><label>选项数量<select aria-label="选项数量" disabled={controlsDisabled} value={responseSet.options.length} onChange={event => replaceOptions(resizeScaleOptions(responseSet.options, Number(event.target.value)))}>{Array.from({ length: 49 }, (_, index) => index + 2).map(count => <option key={count} value={count}>{count} 项</option>)}</select></label><div><span>常用选项</span>{scaleOptionPresets.map(preset => <button key={preset.label} type="button" disabled={controlsDisabled} onClick={() => { const text = preset.labels.join('\n'); setOptionPaste(text); applyOptionText(text) }}>{preset.label}</button>)}</div></div>
          <label className="scale-author-paste-label">粘贴选项<textarea aria-label="选项批量内容" className="input" rows={4} maxLength={200000} disabled={controlsDisabled} value={optionPaste} onChange={event => setOptionPaste(event.target.value)} placeholder={'每行一个选项，例如：\n非常不同意\n不同意\n一般\n同意\n非常同意'} /></label>
          <div className="scale-author-bulk-footer"><p>系统标记自动处理。更新文字会保留同序选项原有分值；新增选项分值顺延，请在下方核对。</p><button type="button" disabled={controlsDisabled || !optionPaste.trim()} onClick={() => applyOptionText()} className="hui-button hui-button--secondary">应用选项文字</button></div>
        </div>}
        {authoringError && <p className="scale-author-error" role="alert">{authoringError}</p>}{authoringNotice && <p className="scale-author-notice" role="status">{authoringNotice}</p>}
        <div className="scale-option-list">{responseSet.options.map((option, index) => <div key={responseValueToken(option.value)} className="scale-option-row"><span className="scale-option-number">{index + 1}</span><label>选项文字<input aria-label={`选项 ${index + 1} 文字`} disabled={controlsDisabled} value={option.label} onChange={event => updateOption(index, { label: event.target.value })} className="input" placeholder="显示标签" /></label><label>分值<input aria-label={`选项 ${index + 1} 分值`} disabled={controlsDisabled} type="number" value={option.score} onChange={event => updateOption(index, { score: Number(event.target.value) })} className="input" /></label><button type="button" aria-label={`删除选项 ${index + 1}`} onClick={() => removeOption(index)} disabled={controlsDisabled || responseSet.options.length <= 2} className="scale-author-delete text-red-500"><Trash2 size={18} aria-hidden="true" /></button></div>)}</div>
        <footer className="scale-author-footer"><button onClick={() => void saveDefinition()} disabled={controlsDisabled || mediaUploadCount > 0} className="hui-button hui-button--primary">保存响应集</button></footer>
      </section>}

      {activeTab === 'items' && <section className="staff-panel scale-author-panel">
        <header className="scale-author-heading"><div><h2>题目录入</h2><p>题号自动排列，默认必答、正向计分。需要时可单独勾选反向计分。</p></div><button onClick={() => addItem()} disabled={controlsDisabled} className="hui-button hui-button--secondary"><Plus size={17} aria-hidden="true" />增加题目</button></header>
        {!readOnly && <div className="scale-author-bulk"><label className="scale-author-paste-label">粘贴题干<textarea aria-label="题干批量内容" className="input" rows={5} maxLength={200000} value={itemPaste} disabled={controlsDisabled} onChange={event => setItemPaste(event.target.value)} placeholder={'每行一道题，例如：\n我能专心完成学习任务\n我常常中途放弃 [反向]\n我愿意尝试新的学习方法'} /></label><div className="scale-author-bulk-footer"><div><p>首尾标记 [反向] 或 (R) 的题目按反向计分，其余默认正向。</p><p role={pastedItems.error ? 'alert' : 'status'}>{pastedItems.error || (pastedItems.rows.length ? `将追加 ${pastedItems.rows.length} 题，其中 ${pastedItems.rows.filter(row => row.reverse).length} 题反向计分；已有题目保留。` : '粘贴后预览数量，再追加到下方。')}</p></div><button type="button" className="hui-button hui-button--secondary" onClick={appendPastedItems} disabled={controlsDisabled || !pastedItems.rows.length || Boolean(pastedItems.error)}>追加题目</button></div></div>}
        {authoringError && <p className="scale-author-error" role="alert">{authoringError}</p>}{authoringNotice && <p className="scale-author-notice" role="status">{authoringNotice}</p>}
        <details className="scale-author-advanced"><summary>更多录入方式与辅助题</summary><div className="scale-author-assist"><button type="button" onClick={() => addItem('ATTENTION_CHECK')} disabled={controlsDisabled} className="hui-button hui-button--secondary">插入注意力题</button><button type="button" onClick={() => addItem('SOCIAL_DESIRABILITY')} disabled={controlsDisabled} className="hui-button hui-button--secondary">插入社会赞许性题（测谎题）</button></div><p>辅助题仅采集和导出原始作答，不纳入总分、维度分或系统内质量判断。</p>{!isNew && !standard && id && <ScaleCsvImport id={id} revision={updatedAtRef.current} disabled={readOnly || saving || copying || basicDirty || definitionDirty} onBusy={setImporting} onFailure={async failure => { await reportWriteError(failure, 'import', ++operationRef.current) }} onImported={value => { applyMetadata(value); const stored = normalizeDefinition(value.definition); setDefinition(stored); setSavedDefinition(JSON.stringify(stored)); setHasConflict(false) }} />}</details>
        <div className="scale-item-list">{sortedItems.map((item, itemIndex) => { const rule = definition.scoring.itemRules.find(candidate => candidate.itemCode === item.itemCode); return <article key={item.itemCode} className="scale-item-card">
          <div className="scale-item-top"><strong>第 {itemIndex + 1} 题</strong><span>{item.required ? '必答' : '选答'}{item.purpose === 'ATTENTION_CHECK' ? ' · 注意力题' : item.purpose === 'SOCIAL_DESIRABILITY' ? ' · 社会赞许性题' : ''}</span></div>
          <textarea aria-label={`第 ${itemIndex + 1} 题题干`} disabled={controlsDisabled} value={item.content} onChange={event => updateItem(item.itemCode, { content: event.target.value })} className="input" placeholder="题目内容" />
          <div className="scale-item-controls">{(!item.purpose || item.purpose === 'CONTENT') && <label><input type="checkbox" checked={rule?.transform.type === 'reverse'} disabled={controlsDisabled} onChange={() => toggleReverse(item.itemCode)} />反向计分</label>}
            {item.purpose === 'ATTENTION_CHECK' && <label>注意力题目标选项<select aria-label={`目标选项 ${item.itemCode}`} className="input" disabled={controlsDisabled} value={item.attentionTarget === undefined ? '' : responseValueToken(item.attentionTarget)} onChange={event => { const option = definition.responseSets.find(set => set.key === item.responseSetKey)?.options.find(option => responseValueToken(option.value) === event.target.value); updateItem(item.itemCode, { attentionTarget: option?.value }) }}><option value="">请选择目标选项</option>{definition.responseSets.find(set => set.key === item.responseSetKey)?.options.map(option => <option key={responseValueToken(option.value)} value={responseValueToken(option.value)}>{option.label}</option>)}</select></label>}
            <div className="scale-item-actions"><button type="button" aria-label={`上移 ${item.itemCode}`} onClick={() => moveItem(item.itemCode, -1)} disabled={controlsDisabled || itemIndex === 0} title="上移"><ArrowUp size={17} /></button><button type="button" aria-label={`下移 ${item.itemCode}`} onClick={() => moveItem(item.itemCode, 1)} disabled={controlsDisabled || itemIndex === sortedItems.length - 1} title="下移"><ArrowDown size={17} /></button><button type="button" aria-label={`复制 ${item.itemCode}`} onClick={() => duplicateItem(item.itemCode)} disabled={controlsDisabled}><Copy size={17} />复制</button><button type="button" aria-label={`删除题目 ${itemIndex + 1}`} onClick={() => removeItem(item.itemCode)} disabled={controlsDisabled} className="scale-author-delete"><Trash2 size={17} />删除</button></div>
          </div>
        </article> })}</div>
        <footer className="scale-author-footer"><p>新增题目请在“计分”中选择纳入的计分项。</p><button onClick={() => void saveDefinition()} disabled={controlsDisabled || mediaUploadCount > 0} className="hui-button hui-button--primary">保存题目</button></footer>
      </section>}

      {activeTab === 'scores' && <section className="staff-panel scale-scoring-panel" aria-labelledby="scale-scoring-title">
        <header className="scale-scoring-header">
          <div><h2 id="scale-scoring-title">计分定义</h2><p>为总分或维度分选择题目，并设置计分方式。新增计分项默认不选题。</p></div>
          <div className="scale-scoring-actions"><button onClick={() => addScore('total')} disabled={controlsDisabled || contentItems.length === 0} className="hui-button hui-button--secondary">+ 总分</button><button onClick={() => addScore('dimension')} disabled={controlsDisabled || contentItems.length === 0} className="hui-button hui-button--secondary">+ 维度</button></div>
        </header>
        <div className="scale-score-list">{definition.scoring.scores.map((score, index) => <article key={score.key} className="scale-score-card" aria-label={`计分项 ${score.label}`}>
          <div className="scale-score-heading"><span>{score.type === 'total' ? '总分' : '维度分'} · {index + 1}</span><details className="scale-score-identity"><summary>系统标识</summary><code>{score.key}</code></details><button type="button" aria-label={`删除计分项 ${score.label}`} onClick={() => removeScore(score.key)} disabled={controlsDisabled} className="scale-score-delete"><Trash2 size={18} aria-hidden="true" />删除</button></div>
          <div className="scale-score-fields">
            <label className="scale-score-field">显示名称
              <input disabled={controlsDisabled} value={score.label} onChange={event => updateScore(score.key, { label: event.target.value })} className="input" placeholder="输入报告中显示的名称，如：学习投入总分" />
              <small>报告中显示的总分或维度名称，可自行修改。</small>
            </label>
            <label className="scale-score-field">分数方向
              <select disabled={controlsDisabled} value={score.direction} onChange={event => updateScore(score.key, { direction: event.target.value as Direction })} className="input"><option value="descriptive">描述性</option><option value="higher_is_more">高分代表更多</option><option value="higher_is_worse">高分代表更多困难</option><option value="higher_is_better">高分更有利</option><option value="lower_is_better">低分更有利</option><option value="bipolar">双向</option></select>
              <small>记录分数含义，不自动改变分值或报告文案。</small>
            </label>
          </div>
          <div className="scale-score-settings">
            <div className="scale-score-primary"><label><input type="checkbox" checked={score.canonical} disabled={controlsDisabled} onChange={event => updateScore(score.key, { canonical: event.target.checked })} />主要计分项</label><p>勾选：作为报告主要指标，并参与结果有效性判断。<br />未勾选：仍会计分，作为辅助指标。至少保留一个主要计分项。</p></div>
            {!readOnly && <label className="scale-score-field scale-score-aggregation">聚合方式<select disabled={controlsDisabled} value={score.source.aggregation} onChange={event => updateScore(score.key, { source: { ...score.source, aggregation: event.target.value as Aggregation } })} className="input"><option value="sum">求和</option><option value="mean">平均</option></select><small>新建默认求和，可改为平均。求和是分数相加，平均是相加后除以题目数。</small></label>}
            {readOnly && score.source.aggregation !== 'sum' && <p className="scale-score-fixed-method">计分方式：平均（当前版本已固定）</p>}
          </div>
          <div className="scale-score-items"><h3>纳入计分的题目</h3><p role="status">{scoreSelectionSummary(score)}</p><div className="scale-score-item-options">{contentItems.map(item => <button type="button" key={item.itemCode} aria-pressed={scoreSourceFor(definition, score.key).some(candidate => candidate.itemCode === item.itemCode)} disabled={controlsDisabled} onClick={() => toggleScoreItem(score.key, item.itemCode)}><span aria-hidden="true">{scoreSourceFor(definition, score.key).some(candidate => candidate.itemCode === item.itemCode) ? '☑ ' : '☐ '}</span>{item.itemCode}</button>)}</div></div>
        </article>)}</div>
        {!definition.scoring.scores.length && <p className="scale-score-empty">尚未设置计分项。请先添加总分或维度分，再选择参与计分的题目。</p>}
        <footer className="scale-scoring-footer"><p>保存前请核对纳入题目、分数范围和报告文案。</p><button onClick={() => void saveDefinition()} disabled={controlsDisabled || mediaUploadCount > 0} className="hui-button hui-button--primary">保存计分定义</button></footer>
      </section>}


      {activeTab === 'report' && <section className="staff-panel staff-panel--padded p-6"><label className="block text-sm text-gray-700">自有内容 / 授权声明<textarea disabled={controlsDisabled} value={definition.license.note || ''} onChange={(event) => setDefinition((current) => ({ ...current, license: { ...current.license, note: event.target.value } }))} className="input mt-1 w-full min-h-20" placeholder="说明题目内容由谁提供，以及允许在本系统中使用的范围" /></label><p className="scale-edit-multiset-note">授权声明属于量表定义，请使用“保存报告定义”或“保存草稿”保存。</p><h2 className="font-semibold mb-2">量表专属解释</h2><p className="text-sm text-gray-500 mb-5">自定义量表仅能写描述性解释；可按原始总分或维度分设置区间图文反馈；不提供正常/异常、常模或百分位配置。</p><div className="space-y-4">{definition.scoring.scores.map((score) => { const entry = definition.report.interpretations.find((candidate) => candidate.scoreKey === score.key); if (!entry) return null; return <article key={score.key} className="border rounded-lg p-4 space-y-2"><h3 className="font-medium">{score.label}</h3><input disabled={controlsDisabled} value={entry.headline} onChange={(event) => updateInterpretation(score.key, { headline: event.target.value })} className="input w-full" placeholder="标题" /><textarea disabled={controlsDisabled} value={entry.summary} onChange={(event) => updateInterpretation(score.key, { summary: event.target.value })} className="input w-full min-h-20" placeholder="描述性解释" /><TrainingRawScoreFeedbackEditor onUploadBusy={onUploadBusy} scoreKey={score.key} rule={definition.report.rawScoreFeedback?.rules.find(rule => rule.scoreKey === score.key)} disabled={controlsDisabled} onChange={rule => updateRawFeedback(score.key, rule)} /></article> })}</div><label className="block text-sm text-gray-700 mt-5">免责声明<textarea disabled={controlsDisabled} value={definition.report.disclaimer} onChange={(event) => setDefinition((current) => ({ ...current, report: { ...current.report, disclaimer: event.target.value } }))} className="input mt-1 w-full min-h-20" /></label><div className="flex justify-end mt-5"><button onClick={() => void saveDefinition()} disabled={controlsDisabled || mediaUploadCount > 0} className="hui-button hui-button--primary">保存报告定义</button></div></section>}

      {preview && <section className="staff-panel staff-panel--padded p-6 mt-5"><h2 className="font-semibold mb-3">服务端计分预览</h2><p className="scale-edit-multiset-note">使用已保存定义，每题选择首个响应选项。这是服务端计分结果，区别于报告编辑中的模拟分数呈现；被试实际可见内容仍由发布与披露设置决定。</p><pre className="text-xs bg-gray-50 rounded p-3 overflow-auto">{JSON.stringify(preview, null, 2)}</pre></section>}
      {!isNew && !readOnly && <div className="flex justify-end gap-2 mt-6"><button onClick={() => void validate()} disabled={saving || importing || mediaUploadCount > 0} className="hui-button hui-button--secondary">运行发布检查</button><button onClick={() => void publish()} disabled={saving || importing || mediaUploadCount > 0 || scale.status !== 'DRAFT'} className="hui-button hui-button--primary">发布描述性量表</button></div>}
    </ProductPage>
  )
}

export default ScaleEdit
