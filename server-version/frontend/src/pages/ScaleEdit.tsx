import {useFormPendingBuffers} from '../modules/assessment-core/form/useFormBulkDraft'
import {usePageEditorGuard} from '../components/shared-ui/usePageEditorGuard'
import {normalizedMaterialList} from '../modules/assessment-media/material'
import { validateRawScoreFeedback } from '../modules/scale/rawScoreFeedback'
import { type ScaleDefinition, emptyDefinition, normalizeDefinition, updateReportContract } from './scaleDefinitionEditorModel'
import ScaleCsvImport from './ScaleCsvImport'
import { TrainingScaleVersions } from '../components/scale-governance/TrainingScaleVersions'
import { TrainingScaleLibrarySubmission } from '../components/scale-governance/TrainingScaleLibrarySubmission'
import React, { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, UNSAFE_DataRouterContext, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Copy, Eye, Save } from 'lucide-react'
import apiClient from '../api/client'
import { PageHeader, ProductPage, ProductStatus } from '../components/product-ui'
import { isTrainingHost } from '../training/context'
import { trainingCourseContext } from '../training/courseNavigation'
import { ScaleAuthoringHelp } from '../components/assessment-authoring/ScaleAuthoringHelp'
import './ScaleEdit.css'
import './ScaleEditPolish.css'

const ScaleEditDefinition = lazy(() => import('./ScaleEditDefinition'))

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
  authoringFamilyId?: string
  authoringVersion?: number
  sourceScaleId?: string | null
  legacyPublicAccess?: boolean
  revisionEligibility?: { allowed: boolean; reason?: string }
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

const emptyScale = (): ScaleMeta => ({
  id: '', code: '', name: '', description: '', status: 'DRAFT', visibility: 'HIDDEN', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '2.0.0', estimatedTime: 15, instruction: '', tags: [],
})

const ScaleEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  // A route change owns a fresh editor. Pending work from the previous scale
  // must never update this one or navigate after a delayed create completes.
  return <ScaleEditor key={id || ''} id={id} />
}

function ScaleLeaveGuard({dirty,busy}:{dirty:boolean;busy:boolean}){
  const guard=usePageEditorGuard(null,{dirty,busy})
  return guard.confirmation
}
const ScaleEditor: React.FC<{ id?: string }> = ({ id }) => {
  const {hasPending:bulkPending,onPendingChange}=useFormPendingBuffers()
  const dataRouter=useContext(UNSAFE_DataRouterContext)
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
  // Once opened, retain the editor's unapplied paste buffers across tab changes.
  const [definitionOpened, setDefinitionOpened] = useState(false)
  const [issues, setIssues] = useState<Array<{ path: string; message: string; severity?: string }>>([])
  const [preview, setPreview] = useState<any>(null)

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
  const canRevise = canCopy && scale.revisionEligibility?.allowed === true
  const sortedItems = useMemo(() => [...definition.items].sort((a, b) => a.sortOrder - b.sortOrder), [definition.items])


  const applyMetadata = useCallback((value: any, preserveDraftEdits = false) => {
    const frozen = (value.instrumentClass || 'CUSTOM_DESCRIPTIVE') !== 'CUSTOM_DESCRIPTIVE' || value.status !== 'DRAFT'
    readOnlyRef.current = frozen
    updatedAtRef.current = value.updatedAt
    const next: ScaleMeta = {
      id: value.id, code: value.code, name: value.name, description: value.description, status: value.status, visibility: value.visibility,
      instrumentClass: value.instrumentClass || 'CUSTOM_DESCRIPTIVE', instrumentVersion: value.instrumentVersion || '2.0.0', estimatedTime: value.estimatedTime, instruction: value.instruction, tags: value.tags || [],
      authoringFamilyId: value.authoringFamilyId, authoringVersion: value.authoringVersion, sourceScaleId: value.sourceScaleId, legacyPublicAccess: value.legacyPublicAccess, revisionEligibility: value.revisionEligibility,
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
    if (bulkPending || !mountedRef.current || loading || readOnlyRef.current || savingRef.current || importing || mediaUploadCount > 0) return null
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
      return value.report.rawScoreFeedback?.rules.map(rule => ({ scoreKey: rule.scoreKey, ranges: rule.ranges.map(range => ({ key: range.key, min: range.min, max: range.max, includeMax: range.includeMax, text: range.text.trim(), materials:normalizedMaterialList(range.materials), images: images(range.images) })), fallback: rule.fallback ? { text: rule.fallback.text.trim(), materials:normalizedMaterialList(rule.fallback.materials), images: images(rule.fallback.images) } : undefined })) ?? []
    }
    const stimulusContract=(value:ScaleDefinition)=>value.items.map(item=>({key:item.itemCode,materials:normalizedMaterialList(item.materials)}))
    if(JSON.stringify(stimulusContract(stored))!==JSON.stringify(stimulusContract(next)))throw new Error('保存后的题目素材与当前编辑不一致，未确认保存；当前编辑内容已保留')
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

  const copyAsDraft = async (mode: 'copy' | 'revise' = 'copy') => {
    if (!mountedRef.current || !(mode === 'revise' ? canRevise : canCopy) || savingRef.current) return
    savingRef.current = true
    setCopying(true)
    setIssues([])
    const operation = ++operationRef.current
    let opened = false
    try {
      const response = await apiClient.post<any>(`/scales/${id}/${mode}`, {})
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
    if(bulkPending)return
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

  if (loading) return <ProductPage width="management"><ProductStatus kind="pending" title="正在加载量表编辑器">正在读取量表定义与报告配置。</ProductStatus></ProductPage>

  const tabs: Array<[typeof activeTab, string]> = [['basic', '基本信息'], ['items', '题目'], ['responses', '响应选项'], ['scores', '计分'], ['report', '报告文案']]
  return (
    <ProductPage width="management" className="staff-editor-page scale-edit-page scale-edit-guided">
      {dataRouter&&bulkPending&&<ScaleLeaveGuard dirty={bulkPending} busy={saving||copying||importing||mediaUploadCount>0}/>}
      <PageHeader
        title={isNew ? '创建描述性量表' : scale.name || '量表编辑'}
        description={readOnly ? '查看当前量表的内容、计分与报告设置' : '依次完成信息、题目、选项、计分与报告；每一步都可展开查看说明。'}
        actions={(
          <div className="staff-inline-actions">
            <Link to={returnPath} onClick={event=>{if(!dataRouter&&bulkPending&&!window.confirm('批量内容尚未应用，确定放弃并离开吗？'))event.preventDefault()}} className="staff-secondary-link"><ArrowLeft className="w-4 h-4" aria-hidden="true" />{returnLabel}</Link>
            {!isNew && <button onClick={() => void previewDefinition()} disabled={bulkPending || importing || mediaUploadCount > 0 || saving || copying || standard || accessBlocked || definitionDirty} title={definitionDirty ? '请先保存定义，再预览服务端计分' : '对已保存定义使用每题首个选项进行真实服务端计分'} className="hui-button hui-button--secondary"><Eye className="w-4 h-4" aria-hidden="true" />计分预览</button>}
            {canCopy && <button type="button" onClick={() => void copyAsDraft()} disabled={copying} aria-busy={copying} className="hui-button hui-button--primary scale-edit-copy"><Copy className="w-4 h-4" aria-hidden="true" />{copying ? '正在创建新草稿…' : '另存为新量表'}</button>}
            {canRevise && <button type="button" onClick={() => void copyAsDraft('revise')} disabled={copying} className="hui-button hui-button--secondary">修订为新版本</button>}
            {!readOnly && <button onClick={() => void (isNew ? saveBasic() : saveDraft())} disabled={bulkPending || saving || importing || mediaUploadCount > 0} className="hui-button hui-button--secondary"><Save className="w-4 h-4" aria-hidden="true" />保存草稿</button>}
          </div>
        )}
      />
      <div className="scale-edit-meta"><div className="scale-edit-state" aria-label="量表状态">
        <div className="scale-edit-state__labels">
          <span className={`scale-edit-badge ${scale.status === 'PUBLISHED' ? 'scale-edit-badge--published' : ''}`}>{standard ? '标准量表 · 只读' : scale.status === 'PUBLISHED' ? '已发布 · 只读' : readOnly ? '只读' : '草稿'}</span>
          <span>{scale.visibility === 'PUBLIC' ? '历史公开范围（兼容保留）' : scale.visibility === 'COURSE' ? '课程可用' : '隐藏'}</span>
          {!isNew && scale.id && <span>正式版本 v{scale.authoringVersion ?? 1}</span>}
        </div>
        <p className="scale-edit-save-state" role="status" aria-live="polite">{bulkPending ? '请先应用或清空批量内容，再保存或发布' : mediaUploadCount > 0 ? '正在上传反馈图片，完成后可保存或发布…' : copying ? '正在创建隐藏草稿…' : saving ? '正在保存，请稍候…' : hasConflict ? '状态已变更，本页编辑已保留，请核对后继续' : readOnly ? '当前版本不可编辑' : isNew ? '尚未创建，先保存基本信息' : basicDirty || definitionDirty ? [basicDirty && '基本信息待保存', definitionDirty && '题目与定义待保存'].filter(Boolean).join(' · ') : '草稿内容已保存'}</p>
      </div>
      <div className="scale-edit-meta-details">
        {!isNew && scale.code && <details><summary>系统信息</summary><p>量表编码：<code>{scale.code}</code></p><p>定义格式：{scale.instrumentVersion}</p></details>}
        {scale.copySource && <aside aria-label="量表副本来源"><details><summary><Copy size={15} aria-hidden="true" />{(scale.authoringVersion ?? 1) > 1 ? '复制来源 · 版本修订' : '复制来源 · 独立副本'}</summary><p><Link to={`/scales/${scale.copySource.parentId}`}>{scale.copySource.parentCode}</Link> · 版本 {scale.copySource.parentVersion}</p><p>{(scale.authoringVersion ?? 1) > 1 ? '这是同一量表的后续编制版本，修改和发布不覆盖原版。' : '这是独立副本，修改和发布仅作用于当前量表。'}</p><dl><dt>定义标识</dt><dd>{scale.copySource.parentDefinitionHash}</dd><dt>计分标识</dt><dd>{scale.copySource.parentScoringHash}</dd></dl></details></aside>}
        {scale.status === 'PUBLISHED' && <details><summary>版本使用说明</summary><p>{canCopy ? '此版本已发布并冻结。另存为新量表将创建独立量表，不是原量表的版本修订。旧任务和问卷不会自动升级。' : scale.copyEligibility?.reason || '此版本已发布并冻结，当前不可复制。'}</p></details>}
        {!isNew && !standard && scale.id === id && <details className="scale-edit-history"><summary>版本历史与来源</summary><TrainingScaleVersions key={`versions:${scale.id}:${scale.status}`} sourceId={scale.id} />{scale.sourceScaleId && <p><Link to={`/scales/${scale.sourceScaleId}`}>查看来源工具 / 版本</Link> → 当前 v{scale.authoringVersion ?? 1}。修订不会自动替换旧任务、问卷或报告绑定的版本。</p>}</details>}
      </div></div>
      {issues.length > 0 && <div className={`scale-edit-feedback ${issues.every(issue => issue.severity === 'success') ? 'scale-edit-feedback--success' : 'scale-edit-feedback--error'}`} role={issues.some(issue => issue.severity !== 'success') ? 'alert' : 'status'}><ul className="space-y-1 text-sm">{issues.map((issue, index) => <li key={`${issue.path}-${index}`} className={issue.severity === 'success' ? 'text-green-700' : 'text-red-700'}>{issue.severity === 'success' && <CheckCircle className="w-4 h-4 inline mr-1" />}{issue.path}：{issue.message}</li>)}</ul></div>}
      <div className="staff-toolbar"><div className="staff-segmented scale-edit-tabs" role="group" aria-label="量表编辑分区">{tabs.map(([key, label], index) => <button key={key} type="button" aria-pressed={activeTab === key} disabled={importing || (isNew && key !== 'basic')} title={isNew && key !== 'basic' ? '请先保存基本信息创建草稿' : undefined} onClick={() => { if (key !== 'basic') setDefinitionOpened(true); setActiveTab(key) }}><span className="scale-edit-step" aria-hidden="true">{index + 1}</span><span>{label}</span></button>)}</div></div>
      <ScaleAuthoringHelp section={activeTab} readOnly={readOnly} />

      {activeTab === 'basic' && <section className="staff-panel scale-author-panel scale-basic-panel">
        <header className="scale-author-heading"><div><h2>基本信息</h2><p>{isNew ? '先给量表命名并保存，随后即可编制其他内容。' : '介绍用途和作答方式，方便后续查找与使用。'}</p></div></header>
        <div className="scale-basic-grid">
          {isNew && <div className="scale-basic-field"><label htmlFor="scale-edit-code">量表编码</label><input id="scale-edit-code" disabled={controlsDisabled} value={scale.code} onChange={event => setScale({ ...scale, code: event.target.value })} className="input" placeholder="例如：learning-engagement" aria-describedby="scale-edit-code-help"/><small id="scale-edit-code-help">用于标识这份量表，创建后可在系统信息中查看。</small></div>}
          <div className="scale-basic-field"><label htmlFor="scale-edit-name">量表名称</label><input id="scale-edit-name" disabled={controlsDisabled} value={scale.name} onChange={event => setScale({ ...scale, name: event.target.value })} className="input" placeholder="例如：学习投入问卷"/></div>
          <div className="scale-basic-field"><label htmlFor="scale-edit-time">预计用时（分钟）</label><input id="scale-edit-time" type="number" disabled={controlsDisabled} value={scale.estimatedTime ?? ''} onChange={event => setScale({ ...scale, estimatedTime: event.target.value ? Number(event.target.value) : null })} className="input" placeholder="例如：5"/></div>
          <div className="scale-basic-field"><label htmlFor="scale-edit-visibility">可见性</label><select id="scale-edit-visibility" aria-label="可见性" disabled={controlsDisabled} value={scale.visibility} onChange={event => setScale({ ...scale, visibility: event.target.value as ScaleMeta['visibility'] })} className="input" aria-describedby="scale-edit-visibility-help"><option value="HIDDEN">隐藏</option><option value="COURSE">课程可用</option>{scale.visibility === 'PUBLIC' && <option value="PUBLIC" disabled>历史公开范围（兼容保留，不可新增）</option>}</select><small id="scale-edit-visibility-help">可见性不代替发布、课程投放或使用授权。</small></div>
          <div className="scale-basic-field scale-basic-field--wide"><label htmlFor="scale-edit-description">说明</label><textarea id="scale-edit-description" disabled={controlsDisabled} value={scale.description || ''} onChange={event => setScale({ ...scale, description: event.target.value })} className="input" rows={3} placeholder="说明这份量表的用途、关注的内容或适用场景。"/></div>
          <div className="scale-basic-field scale-basic-field--wide"><label htmlFor="scale-edit-instruction">作答指导</label><textarea id="scale-edit-instruction" disabled={controlsDisabled} value={scale.instruction || ''} onChange={event => setScale({ ...scale, instruction: event.target.value })} className="input" rows={3} placeholder="例如：请根据最近两周的实际情况，选择最符合你的选项。"/></div>
        </div>
        <footer className="scale-author-footer"><p>这里只保存基本信息；题目、计分和报告在对应分区保存。</p><button onClick={() => void saveBasic()} disabled={controlsDisabled || mediaUploadCount > 0} className="hui-button hui-button--primary"><Save size={17} aria-hidden="true"/>保存基本信息</button></footer>
      </section>}

      {definitionOpened && <Suspense fallback={<p role="status">正在加载量表编辑器…</p>}><ScaleEditDefinition onPendingChange={onPendingChange} definition={definition} setDefinition={setDefinition} activeTab={activeTab} readOnly={readOnly} controlsDisabled={controlsDisabled} saveDefinition={saveDefinition} mediaUploadCount={mediaUploadCount} onUploadBusy={onUploadBusy} importControl={!isNew && !standard && id && <ScaleCsvImport id={id} revision={updatedAtRef.current} disabled={bulkPending || readOnly || saving || copying || basicDirty || definitionDirty} onBusy={setImporting} onFailure={async failure => { await reportWriteError(failure, 'import', ++operationRef.current) }} onImported={value => { applyMetadata(value); const stored = normalizeDefinition(value.definition); setDefinition(stored); setSavedDefinition(JSON.stringify(stored)); setHasConflict(false) }} />} /></Suspense>}

      {preview && <section className="staff-panel scale-edit-preview"><h2>服务端计分预览</h2><p className="scale-edit-multiset-note">使用已保存定义，每题选择首个响应选项。这是示例计分结果，不是真实作答；实际可见内容仍由发布与披露设置决定。</p>{Array.isArray(preview.scores) && <ul className="scale-edit-preview-scores">{preview.scores.map((score: {key: string;label?: string;value?: number | null}) => <li key={score.key}><span>{score.label || score.key}</span><strong>{score.value ?? '—'}</strong></li>)}</ul>}<details className="scale-edit-preview-data"><summary>查看完整计分数据（技术明细）</summary><pre>{JSON.stringify(preview, null, 2)}</pre></details></section>}
      {!isNew && !readOnly && <div className="scale-edit-publish-bar"><p><strong>完成编制后</strong><span>先检查，再发布自用；保存草稿不会自动发布。</span></p><div><button onClick={() => void validate()} disabled={bulkPending || saving || importing || mediaUploadCount > 0} className="hui-button hui-button--secondary">运行发布检查</button><button onClick={() => void publish()} disabled={bulkPending || saving || importing || mediaUploadCount > 0 || scale.status !== 'DRAFT'} className="hui-button hui-button--primary">发布自用（描述性量表）</button></div></div>}
      {!isNew && !standard && scale.id === id && <TrainingScaleLibrarySubmission key={`submission:${scale.id}:${scale.status}`} sourceId={scale.id} />}
    </ProductPage>
  )
}

export default ScaleEdit
