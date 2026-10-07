import { waitForExportArtifacts, requestExportIntent, assertExportDownload, triggerExportDownload, clearExportIntentKey, ExportJobFailedError } from '../../utils/exportJobs'
import { PublicDeliveryManager } from '../../components/PublicDeliveryManager'
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Send, Archive } from 'lucide-react'
import { cognitiveApi } from '../../modules/cognitive/api'
import { compositeApi } from '../../modules/composite/api'
import { sessionFetch } from '../../api/client'
import { PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'
import CognitiveProfessionalReports from '../../modules/cognitive/CognitiveProfessionalReports'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'
import { apiErrorMessage } from '../../utils/apiErrorMessage'

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
}

type CognitiveExportKind = 'summary-csv' | 'full-csv' | 'summary-zip' | 'research-zip' | 'research-xlsx'

const CognitiveAssignmentEdit: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { feedback, confirm: confirmAction, success } = useStaffFeedback()
  const [archiving, setArchiving] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [title, setTitle] = useState('')
  const [instruction, setInstruction] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState<CognitiveExportKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [readingReports, setReadingReports] = useState(false)
  const [exportNotice, setExportNotice] = useState('')
  const [collections, setCollections] = useState<Array<{ id: string; name: string; completedCount: number }>>([])
  const [collectionId, setCollectionId] = useState('')
  const [collectionsError, setCollectionsError] = useState('')

  const isWrapper = detail?.listedStandalone === false
  const hasDetail = Boolean(detail)
  const isPackageLocked = isWrapper && Boolean(detail?.reportPackageLocked)

  const load = async () => {
    try {
      const detailResponse = await cognitiveApi.getAssignment(id)
      if (detailResponse.code !== 0 || !detailResponse.data) throw new Error(detailResponse.message || '认知任务不存在')
      setDetail(detailResponse.data)
      setTitle(detailResponse.data.title)
      setInstruction(detailResponse.data.instruction || '')
    } catch (err) {
      setError((err as { message?: string }).message || '加载失败')
    }
  }

  useEffect(() => { void load() }, [id])

  useEffect(() => {
    if (!hasDetail || isWrapper) return
    let cancelled = false
    setCollectionsError('')
    void cognitiveApi.collections(id).then(response => {
      if (cancelled) return
      if (response.code !== 0 || !response.data) throw new Error(response.message || '关联问卷加载失败')
      setCollections(response.data)
      setCollectionId(response.data.find(value => value.completedCount > 0)?.id || '')
    }).catch(() => { if (!cancelled) setCollectionsError('同版本问卷列表暂不可用，请刷新重试。独立任务导出仍可使用。') })
    return () => { cancelled = true }
  }, [id, hasDetail, isWrapper])

  const publish = async () => {
    const response = await cognitiveApi.publishAssignment(id)
    if (response.code !== 0) setError(response.message || '发布失败')
    else await load()
  }

  const archive = async () => {
    if (archiving || !await confirmAction({ title: '归档认知任务', body: '归档后停止新作答，已完成记录和历史报告会保留。若被未归档测评引用，请先处理对应测评。', confirmLabel: '确认归档' })) return
    try {
      setArchiving(true)
      setError(null)
      const response = await cognitiveApi.archiveAssignment(id)
      if (response.code !== 0) throw new Error(response.message || '归档失败')
      await load()
      success('任务已归档', '历史记录和报告已保留。')
    } catch (cause) { setError(apiErrorMessage(cause, '归档失败，请重试')) }
    finally { setArchiving(false) }
  }

  const saveWrapper = async () => {
    if (!title.trim()) {
      setError('标题不能为空')
      return
    }
    try {
      setSaving(true)
      setError(null)
      const response = await cognitiveApi.updateAssignment(id, { title: title.trim(), instruction })
      if (response.code !== 0) throw new Error(response.message || '保存失败')
      await load()
    } catch (err) {
      setError((err as { message?: string }).message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const exportData = async (
    kind: CognitiveExportKind,
    detailMode: 'summary' | 'full' | 'research',
    format: 'csv' | 'zip' | 'xlsx' = 'csv',
  ) => {
    if (exporting) return
    const scope = `cognitiveApi:${id}:${JSON.stringify({ detail: detailMode, format, collectionId })}`
    setExporting(kind)
    setError(null)
    setExportNotice('正在生成导出文件…')
    try {
      const response = await requestExportIntent(scope, key => collectionId && detailMode !== 'research' && (format === 'csv' || format === 'zip')
        ? compositeApi.exportData(collectionId, { detail: detailMode, format }, key)
        : cognitiveApi.exportData(id, { detail: detailMode, format }, key))
      if (response.code !== 0 || !response.data?.artifacts) throw new Error(response.message || '导出失败')
      setExportNotice('导出已受理，正在生成文件；刷新后可重试同一导出，继续等待原任务。')
      const artifacts = await waitForExportArtifacts(response.data.artifacts)
      const artifact = artifacts[0]
      const download = await sessionFetch(artifact.downloadUrl, { signal: AbortSignal.timeout(60000) })
      assertExportDownload(download)
      triggerExportDownload(await download.blob(), artifact.fileName)
      setExportNotice('已请求下载导出文件，请查看浏览器下载列表；若被拦截，请允许本站下载。')
      clearExportIntentKey(scope)
    } catch (err) {
      if (err instanceof ExportJobFailedError) clearExportIntentKey(scope)
      setExportNotice('')
      setError((err as { message?: string }).message || '导出失败，请重试')
    } finally {
      setExporting(null)
    }
  }

  if (!detail) return <ProductPage width="management"><ProductStatus kind={error ? 'error' : 'pending'} title={error ? '认知任务不可用' : '正在加载认知任务'}>{error || '正在读取任务配置。'}</ProductStatus></ProductPage>

  const isDraft = detail.status === 'DRAFT'
  const canArchive = detail.status === 'DRAFT' || detail.status === 'PUBLISHED'

  return (
    <ProductPage width="management" className={`staff-editor-page${readingReports ? ' cognitive-staff-report-open' : ''}`}>
      <PageHeader
        title={detail.title}
        description={(
          <span className="flex flex-wrap items-center gap-2">
            <span>{statusLabel[detail.status] || detail.status}{detail.config?.name ? ` · ${detail.config.name}` : ''}</span>
            {isWrapper && <span className="staff-badge">综合测评用</span>}
          </span>
        )}
        actions={(
          <div className="staff-inline-actions">
            <button type="button" onClick={() => navigate('/cognitive-assignments')} className="hui-button hui-button--secondary">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />返回认知任务
            </button>
            {isDraft && !isWrapper && <button onClick={() => void publish()} className="hui-button hui-button--primary"><Send className="w-4 h-4" aria-hidden="true" />发布</button>}
            {canArchive && !isPackageLocked && <button disabled={archiving} onClick={() => void archive()} className="hui-button hui-button--secondary"><Archive className="w-4 h-4" aria-hidden="true" />{archiving ? '正在归档…' : '归档'}</button>}
            {!isWrapper && <button disabled={exporting !== null} onClick={() => void exportData('summary-csv', 'summary')} className="hui-button hui-button--secondary disabled:cursor-not-allowed disabled:opacity-50"><Download className="w-4 h-4" aria-hidden="true" />{exporting === 'summary-csv' ? '导出摘要中...' : '导出摘要'}</button>}
            {!isWrapper && <button type="button" onClick={() => setReadingReports(value => !value)} aria-expanded={readingReports} className="hui-button hui-button--secondary">{readingReports ? '收起专业报告' : '阅读专业报告'}</button>}
            {!isWrapper && <button disabled={exporting !== null} onClick={() => void exportData('full-csv', 'full')} className="hui-button hui-button--secondary disabled:cursor-not-allowed disabled:opacity-50">{exporting === 'full-csv' ? '导出完整数据中...' : '导出完整数据'}</button>}
            {!isWrapper && <button disabled={exporting !== null} onClick={() => void exportData('summary-zip', 'summary', 'zip')} className="hui-button hui-button--secondary">{exporting === 'summary-zip' ? '生成数据与字典…' : '摘要与字段字典（ZIP）'}</button>}
          </div>
        )}
      />
      {feedback}
      {exportNotice && <p role="status" className="mb-4">{exportNotice}</p>}
      {!isWrapper && <p className="mb-4 text-sm text-gray-600">ZIP 包含标准 CSV、对应字段字典和解释说明。单位及版本以冻结结果为准，参与者编号不保证跨测评关联。</p>}
      {error && <p role="alert" className="text-red-500 mb-4">{error}</p>}
      {!isWrapper && <section className="staff-panel staff-panel--padded mb-5 p-4" aria-label="数据来源设置">
        <label>数据来源<select aria-label="认知数据来源" value={collectionId} disabled={exporting !== null} onChange={event => { setCollectionId(event.target.value); setExportNotice(''); setReadingReports(false) }} className="input ml-2">
          <option value="">当前独立任务</option>
          {collections.map(value => <option key={value.id} value={value.id}>{value.name} · 已完成 {value.completedCount} 份认知记录</option>)}
        </select></label>
        <p className="mt-2 text-sm text-gray-600">同版本问卷按冻结任务与报告设置匹配，仅列出你创建的普通问卷。选择问卷后，导出包含该问卷的全部单元；专业报告只读取其中此版本认知任务的冻结结果。</p>
        {collectionsError && <p role="alert">{collectionsError}</p>}
      </section>}
      {readingReports && !isWrapper && <CognitiveProfessionalReports key={id + ':' + collectionId} assignmentId={id} collectionId={collectionId || undefined} />}
      {isWrapper ? (
        <div className="staff-panel staff-panel--padded p-6 mb-5">
          <h2 className="font-semibold mb-2">任务信息</h2>
          <p className="text-sm text-gray-500 mb-4">
            此任务仅用于综合测评，不能单独发给学生或生成公开链接。群体数据请从综合测评导出。
          </p>
          {isPackageLocked ? (
            <>
              <p className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 mb-4">
                此任务已被报告包引用并冻结，标题、指导语和生命周期不能修改；综合测评中的固定槽位名称以报告包快照为准。
              </p>
              <div className="space-y-3 text-sm text-gray-700">
                <div><span className="text-gray-500">标题：</span>{detail.title}</div>
                {detail.instruction && <div><span className="text-gray-500">学生须知：</span><span className="whitespace-pre-wrap">{detail.instruction}</span></div>}
              </div>
            </>
          ) : (
            <>
              <label className="block text-sm text-gray-600 mb-3">
                标题
                <input
                  className="mt-1 block w-full border rounded px-3 py-2 text-base text-gray-800"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="block text-sm text-gray-600 mb-4">
                学生须知
                <textarea
                  className="mt-1 block w-full border rounded px-3 py-2 text-base text-gray-800 min-h-[96px]"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                />
              </label>
              <button onClick={() => void saveWrapper()} disabled={saving || !title.trim()} className="hui-button hui-button--primary">
                {saving ? '保存中...' : '保存'}
              </button>
            </>
          )}
        </div>
      ) : (
        detail.instruction && (
          <div className="staff-panel staff-panel--padded p-6 mb-5">
            <h2 className="font-semibold mb-2">学生须知</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{detail.instruction}</p>
          </div>
        )
      )}
      {detail.status === 'PUBLISHED' && !isWrapper && <PublicDeliveryManager key={id} family="COGNITIVE" resourceId={id} />}

    </ProductPage>
  )
}

export default CognitiveAssignmentEdit
