import { waitForExportArtifacts, requestExportIntent, assertExportDownload, clearExportIntentKey, ExportJobFailedError } from '../../utils/exportJobs'
import { PublicDeliveryManager } from '../../components/PublicDeliveryManager'
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Send, Archive } from 'lucide-react'
import { cognitiveApi } from '../../modules/cognitive/api'
import { sessionFetch } from '../../api/client'
import { PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'
import CognitiveProfessionalReports from '../../modules/cognitive/CognitiveProfessionalReports'

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
}

type CognitiveExportKind = 'summary-csv' | 'full-csv' | 'research-zip' | 'research-xlsx'

const CognitiveAssignmentEdit: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<any>(null)
  const [title, setTitle] = useState('')
  const [instruction, setInstruction] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState<CognitiveExportKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [readingReports, setReadingReports] = useState(false)

  const isWrapper = detail?.listedStandalone === false
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

  const publish = async () => {
    const response = await cognitiveApi.publishAssignment(id)
    if (response.code !== 0) setError(response.message || '发布失败')
    else await load()
  }

  const archive = async () => {
    if (!confirm('归档后学生将看不到此任务，确定继续？')) return
    const response = await cognitiveApi.archiveAssignment(id)
    if (response.code !== 0) setError(response.message || '归档失败')
    else await load()
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
    const scope = `cognitiveApi:${id}:${JSON.stringify({ detail: detailMode, format })}`
    setExporting(kind)
    setError(null)
    try {
      const response = await requestExportIntent(scope, key => cognitiveApi.exportData(id, { detail: detailMode, format }, key))
      if (response.code !== 0 || !response.data?.artifacts) throw new Error(response.message || '导出失败')
      const artifacts = await waitForExportArtifacts(response.data.artifacts)
      const artifact = artifacts[0]
      const download = await sessionFetch(artifact.downloadUrl, { signal: AbortSignal.timeout(60000) })
      assertExportDownload(download)
      const blobUrl = URL.createObjectURL(await download.blob())
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = artifact.fileName
      anchor.click()
      URL.revokeObjectURL(blobUrl)
      clearExportIntentKey(scope)
    } catch (err) {
      if (err instanceof ExportJobFailedError) clearExportIntentKey(scope)
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
            {canArchive && !isPackageLocked && <button onClick={() => void archive()} className="hui-button hui-button--secondary"><Archive className="w-4 h-4" aria-hidden="true" />归档</button>}
            {!isWrapper && <button disabled={exporting !== null} onClick={() => void exportData('summary-csv', 'summary')} className="hui-button hui-button--secondary disabled:cursor-not-allowed disabled:opacity-50"><Download className="w-4 h-4" aria-hidden="true" />{exporting === 'summary-csv' ? '导出摘要中...' : '导出摘要'}</button>}
            {!isWrapper && <button type="button" onClick={() => setReadingReports(value => !value)} aria-expanded={readingReports} className="hui-button hui-button--secondary">{readingReports ? '收起专业报告' : '阅读专业报告'}</button>}
            {!isWrapper && <button disabled={exporting !== null} onClick={() => void exportData('full-csv', 'full')} className="hui-button hui-button--secondary disabled:cursor-not-allowed disabled:opacity-50">{exporting === 'full-csv' ? '导出完整数据中...' : '导出完整数据'}</button>}
          </div>
        )}
      />
      {error && <p role="alert" className="text-red-500 mb-4">{error}</p>}
      {readingReports && !isWrapper && <CognitiveProfessionalReports key={id} assignmentId={id} />}
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
