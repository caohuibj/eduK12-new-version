import { validateRawScoreFeedback } from '../modules/scale/rawScoreFeedback'
import { ScaleDefinitionEditor } from './ScaleDefinitionEditor'
import { type ScaleDefinition, emptyDefinition, normalizeDefinition, updateReportContract } from './scaleDefinitionEditorModel'
import ScaleCsvImport from './ScaleCsvImport'
import { TrainingScaleVersions } from '../components/scale-governance/TrainingScaleVersions'
import { TrainingScaleLibrarySubmission } from '../components/scale-governance/TrainingScaleLibrarySubmission'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Copy, Eye, Save } from 'lucide-react'
import apiClient from '../api/client'
import { PageHeader, ProductPage, ProductStatus } from '../components/product-ui'
import { isTrainingHost } from '../training/context'
import { trainingCourseContext } from '../training/courseNavigation'
import './ScaleEdit.css'

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

  const tabs: Array<[typeof activeTab, string]> = [['basic', '基本信息'], ['responses', '响应选项'], ['items', '题目'], ['scores', '计分'], ['report', '报告文案']]
  return (
    <ProductPage width="management" className="staff-editor-page scale-edit-page">
      <PageHeader
        title={isNew ? '创建描述性量表' : scale.name || '量表编辑'}
        actions={(
          <div className="staff-inline-actions">
            <Link to={returnPath} className="staff-secondary-link"><ArrowLeft className="w-4 h-4" aria-hidden="true" />{returnLabel}</Link>
            {!isNew && <button onClick={() => void previewDefinition()} disabled={importing || mediaUploadCount > 0 || saving || copying || standard || accessBlocked || definitionDirty} title={definitionDirty ? '请先保存定义，再预览服务端计分' : '对已保存定义使用每题首个选项进行真实服务端计分'} className="hui-button hui-button--secondary"><Eye className="w-4 h-4" aria-hidden="true" />计分预览</button>}
            {canCopy && <button type="button" onClick={() => void copyAsDraft()} disabled={copying} aria-busy={copying} className="hui-button hui-button--primary scale-edit-copy"><Copy className="w-4 h-4" aria-hidden="true" />{copying ? '正在创建新草稿…' : '另存为新量表'}</button>}
            {canRevise && <button type="button" onClick={() => void copyAsDraft('revise')} disabled={copying} className="hui-button hui-button--secondary">修订为新版本</button>}
            {!readOnly && <button onClick={() => void (isNew ? saveBasic() : saveDraft())} disabled={saving || importing || mediaUploadCount > 0} className="hui-button hui-button--secondary"><Save className="w-4 h-4" aria-hidden="true" />保存草稿</button>}
          </div>
        )}
      />
      <div className="scale-edit-meta"><div className="scale-edit-state" aria-label="量表状态">
        <div className="scale-edit-state__labels">
          <span className={`scale-edit-badge ${scale.status === 'PUBLISHED' ? 'scale-edit-badge--published' : ''}`}>{standard ? '标准量表 · 只读' : scale.status === 'PUBLISHED' ? '已发布 · 只读' : readOnly ? '只读' : '草稿'}</span>
          <span>{scale.visibility === 'PUBLIC' ? '历史公开范围（兼容保留）' : scale.visibility === 'COURSE' ? '课程可用' : '隐藏'}</span>
          {!isNew && scale.id && <span>正式版本 v{scale.authoringVersion ?? 1} · 定义格式 {scale.instrumentVersion}</span>}
        </div>
        <p className="scale-edit-save-state" role="status" aria-live="polite">{mediaUploadCount > 0 ? '正在上传反馈图片，完成后可保存或发布…' : copying ? '正在创建隐藏草稿…' : saving ? '正在保存，请稍候…' : hasConflict ? '状态已变更，本页编辑已保留，请核对后继续' : readOnly ? '当前版本不可编辑' : isNew ? '尚未创建，先保存基本信息' : basicDirty || definitionDirty ? [basicDirty && '基本信息待保存', definitionDirty && '题目与定义待保存'].filter(Boolean).join(' · ') : '草稿内容已保存'}</p>
      </div>
      <div className="scale-edit-meta-details">
        {!isNew && scale.code && <details><summary>系统信息</summary><p>量表编码：<code>{scale.code}</code></p></details>}
        {scale.copySource && <aside aria-label="量表副本来源"><details><summary><Copy size={15} aria-hidden="true" />{(scale.authoringVersion ?? 1) > 1 ? '复制来源 · 版本修订' : '复制来源 · 独立副本'}</summary><p><Link to={`/scales/${scale.copySource.parentId}`}>{scale.copySource.parentCode}</Link> · 版本 {scale.copySource.parentVersion}</p><p>{(scale.authoringVersion ?? 1) > 1 ? '这是同一量表的后续编制版本，修改和发布不覆盖原版。' : '这是独立副本，修改和发布仅作用于当前量表。'}</p><dl><dt>定义标识</dt><dd>{scale.copySource.parentDefinitionHash}</dd><dt>计分标识</dt><dd>{scale.copySource.parentScoringHash}</dd></dl></details></aside>}
        {scale.status === 'PUBLISHED' && <details><summary>版本使用说明</summary><p>{canCopy ? '此版本已发布并冻结。另存为新量表将创建独立量表，不是原量表的版本修订。旧任务和问卷不会自动升级。' : scale.copyEligibility?.reason || '此版本已发布并冻结，当前不可复制。'}</p></details>}
      </div></div>
      {!isNew && !standard && scale.id === id && <TrainingScaleVersions key={scale.id + scale.status} sourceId={scale.id} />}
      {scale.sourceScaleId && <div className="scale-edit-source"><strong>版本谱系</strong><p><Link to={`/scales/${scale.sourceScaleId}`}>查看来源工具 / 版本</Link> → 当前 v{scale.authoringVersion ?? 1}</p><p>修订沿用量表谱系，另存建立独立谱系。来源仅作追溯，旧任务和问卷不会自动升级。</p></div>}
      {issues.length > 0 && <div className="scale-edit-feedback mb-5 rounded-lg border p-4 bg-gray-50" role={issues.some(issue => issue.severity !== 'success') ? 'alert' : 'status'}><ul className="space-y-1 text-sm">{issues.map((issue, index) => <li key={`${issue.path}-${index}`} className={issue.severity === 'success' ? 'text-green-700' : 'text-red-700'}>{issue.severity === 'success' && <CheckCircle className="w-4 h-4 inline mr-1" />}{issue.path}：{issue.message}</li>)}</ul></div>}
      <div className="staff-toolbar"><div className="staff-segmented scale-edit-tabs" role="group" aria-label="量表编辑分区">{tabs.map(([key, label]) => <button key={key} type="button" aria-pressed={activeTab === key} disabled={importing || (isNew && key !== 'basic')} title={isNew && key !== 'basic' ? '请先保存基本信息创建草稿' : undefined} onClick={() => { setActiveTab(key) }}>{label}</button>)}</div></div>

      {activeTab === 'basic' && <section className="staff-panel scale-author-panel space-y-4"><p className="scale-edit-multiset-note">{isNew ? '请先保存基本信息创建草稿，再编制响应选项、题目、计分、授权声明与报告反馈。此步骤仅保存基本元数据，私有量表不会自动对全平台学生开放。' : '本区仅保存基本元数据；自有内容 / 授权声明请在“报告文案”中随量表定义保存。'}</p><div className="grid md:grid-cols-2 gap-4"><>{isNew && <label className="text-sm text-gray-700">量表编码<input disabled={controlsDisabled} value={scale.code} onChange={(event) => setScale({ ...scale, code: event.target.value })} className="input mt-1 w-full" /></label>}</><label className="text-sm text-gray-700">量表名称<input disabled={controlsDisabled} value={scale.name} onChange={(event) => setScale({ ...scale, name: event.target.value })} className="input mt-1 w-full" /></label><label className="text-sm text-gray-700">预计用时（分钟）<input type="number" disabled={controlsDisabled} value={scale.estimatedTime ?? ''} onChange={(event) => setScale({ ...scale, estimatedTime: event.target.value ? Number(event.target.value) : null })} className="input mt-1 w-full" /></label><label className="text-sm text-gray-700">可见性<select aria-label="可见性" disabled={controlsDisabled} value={scale.visibility} onChange={(event) => setScale({ ...scale, visibility: event.target.value as ScaleMeta['visibility'] })} className="input mt-1 w-full"><option value="HIDDEN">隐藏</option><option value="COURSE">课程可用</option>{scale.visibility === 'PUBLIC' && <option value="PUBLIC" disabled>历史公开范围（兼容保留，不可新增）</option>}</select></label></div><label className="block text-sm text-gray-700">说明<textarea disabled={controlsDisabled} value={scale.description || ''} onChange={(event) => setScale({ ...scale, description: event.target.value })} className="input mt-1 w-full min-h-24" /></label><label className="block text-sm text-gray-700">作答指导<textarea disabled={controlsDisabled} value={scale.instruction || ''} onChange={(event) => setScale({ ...scale, instruction: event.target.value })} className="input mt-1 w-full min-h-24" /></label><div className="flex justify-end"><button onClick={() => void saveBasic()} disabled={controlsDisabled || mediaUploadCount > 0} className="hui-button hui-button--primary"><Save className="w-4 h-4 inline mr-1" />保存基本信息</button></div></section>}

      <ScaleDefinitionEditor definition={definition} setDefinition={setDefinition} activeTab={activeTab} readOnly={readOnly} controlsDisabled={controlsDisabled} saveDefinition={saveDefinition} mediaUploadCount={mediaUploadCount} onUploadBusy={onUploadBusy} importControl={!isNew && !standard && id && <ScaleCsvImport id={id} revision={updatedAtRef.current} disabled={readOnly || saving || copying || basicDirty || definitionDirty} onBusy={setImporting} onFailure={async failure => { await reportWriteError(failure, 'import', ++operationRef.current) }} onImported={value => { applyMetadata(value); const stored = normalizeDefinition(value.definition); setDefinition(stored); setSavedDefinition(JSON.stringify(stored)); setHasConflict(false) }} />} />

      {preview && <section className="staff-panel staff-panel--padded p-6 mt-5"><h2 className="font-semibold mb-3">服务端计分预览</h2><p className="scale-edit-multiset-note">使用已保存定义，每题选择首个响应选项。这是服务端计分结果，区别于报告编辑中的模拟分数呈现；被试实际可见内容仍由发布与披露设置决定。</p><pre className="text-xs bg-gray-50 rounded p-3 overflow-auto">{JSON.stringify(preview, null, 2)}</pre></section>}
      {!isNew && !standard && scale.id === id && <TrainingScaleLibrarySubmission key={scale.id + scale.status} sourceId={scale.id} />}
      {!isNew && !readOnly && <div className="flex justify-end gap-2 mt-6"><button onClick={() => void validate()} disabled={saving || importing || mediaUploadCount > 0} className="hui-button hui-button--secondary">运行发布检查</button><button onClick={() => void publish()} disabled={saving || importing || mediaUploadCount > 0 || scale.status !== 'DRAFT'} className="hui-button hui-button--primary">发布自用（描述性量表）</button></div>}
    </ProductPage>
  )
}

export default ScaleEdit
