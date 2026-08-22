import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Link as LinkIcon, Send, Archive } from 'lucide-react'
import { cognitiveApi } from '../../modules/cognitive/api'

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
}

const CognitiveAssignmentEdit: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<any>(null)
  const [token, setToken] = useState<any>(null)
  const [tokenExpiresAt, setTokenExpiresAt] = useState('')
  const [tokenMaxUses, setTokenMaxUses] = useState(0)
  const [title, setTitle] = useState('')
  const [instruction, setInstruction] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isWrapper = detail?.listedStandalone === false

  const load = async () => {
    try {
      const detailResponse = await cognitiveApi.getAssignment(id)
      if (detailResponse.code !== 0 || !detailResponse.data) throw new Error(detailResponse.message || '认知任务不存在')
      setDetail(detailResponse.data)
      setTitle(detailResponse.data.title)
      setInstruction(detailResponse.data.instruction || '')
      if (detailResponse.data.listedStandalone !== false) {
        const tokenResponse = await cognitiveApi.listPublicTokens(id)
        const tokens = tokenResponse.code === 0 ? (tokenResponse.data?.list || []) : []
        setToken(tokens.find((item: any) => item.isActive) || tokens[0] || null)
      } else {
        setToken(null)
      }
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

  const createToken = async () => {
    if (!tokenExpiresAt) {
      setError('请先选择公开链接的有效期')
      return
    }
    try {
      setError(null)
      const response = await cognitiveApi.createPublicToken(id, {
        expiresAt: new Date(tokenExpiresAt).toISOString(),
        maxUses: Number(tokenMaxUses) || 0,
      })
      if (response.code !== 0 || !response.data) throw new Error(response.message || '生成公开链接失败')
      setToken({ ...response.data, isActive: true, usedCount: response.data.usedCount ?? 0 })
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '生成公开链接失败'
      setError(message)
    }
  }

  const disableToken = async () => {
    if (!token || !confirm('确定停用当前公开链接吗？')) return
    const response = await cognitiveApi.disablePublicToken(id, token.id)
    if (response.code === 0) setToken({ ...token, isActive: false })
    else setError(response.message || '停用公开链接失败')
  }

  const exportData = async (detailMode: 'summary' | 'full') => {
    const response = await cognitiveApi.exportData(id, { detail: detailMode, format: 'csv' })
    if (response.code !== 0 || !response.data?.fileName) {
      setError(response.message || '导出失败')
      return
    }
    try {
      const authToken = localStorage.getItem('token')
      const download = await fetch(`/api/cognitive/assignments/${id}/export/files/${response.data.fileName}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      })
      if (!download.ok) throw new Error('下载导出文件失败')
      const blobUrl = URL.createObjectURL(await download.blob())
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = response.data.fileName
      anchor.click()
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      setError((err as { message?: string }).message || '下载导出文件失败')
    }
  }

  if (!detail) return <div className="p-8 text-gray-500">{error || '加载中...'}</div>

  const isDraft = detail.status === 'DRAFT'
  const canArchive = detail.status === 'DRAFT' || detail.status === 'PUBLISHED'

  return (
    <div>
      <button onClick={() => navigate('/cognitive-assignments')} className="flex items-center text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />返回认知任务
      </button>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-800">{detail.title}</h1>
            {isWrapper && (
              <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">综合测评用</span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {statusLabel[detail.status] || detail.status}
            {detail.config?.name ? ` · ${detail.config.name}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {isDraft && !isWrapper && (
            <button onClick={() => void publish()} className="btn-primary">
              <Send className="w-4 h-4 inline mr-1" />发布
            </button>
          )}
          {canArchive && (
            <button onClick={() => void archive()} className="btn-secondary">
              <Archive className="w-4 h-4 inline mr-1" />归档
            </button>
          )}
          {!isWrapper && (
            <>
              <button onClick={() => void exportData('summary')} className="btn-secondary">
                <Download className="w-4 h-4 inline mr-1" />导出摘要
              </button>
              <button onClick={() => void exportData('full')} className="btn-secondary">导出完整数据</button>
            </>
          )}
        </div>
      </div>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {isWrapper ? (
        <div className="card p-6 mb-5">
          <h2 className="font-semibold mb-2">任务信息</h2>
          <p className="text-sm text-gray-500 mb-4">
            此任务仅用于综合测评，不能单独发给学生或生成公开链接。群体数据请从综合测评导出。
          </p>
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
          <button onClick={() => void saveWrapper()} disabled={saving || !title.trim()} className="btn-primary">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      ) : (
        detail.instruction && (
          <div className="card p-6 mb-5">
            <h2 className="font-semibold mb-2">学生须知</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{detail.instruction}</p>
          </div>
        )
      )}
      {detail.status === 'PUBLISHED' && !isWrapper && (
        <div className="card p-6">
          <h2 className="font-semibold mb-3">
            <LinkIcon className="w-4 h-4 inline mr-1" />公开匿名链接
          </h2>
          {token ? (
            <div className="text-sm">
              <p className="break-all text-primary mb-2">{window.location.origin}/public/cognitive/assignments/{token.token}</p>
              <p className="text-gray-500">
                有效期：{new Date(token.expiresAt).toLocaleString('zh-CN')} · 已使用 {token.usedCount} 次 · {token.isActive ? '使用中' : '已停用'}
              </p>
              {token.isActive && (
                <button onClick={() => void disableToken()} className="text-red-500 text-sm mt-2">停用当前链接</button>
              )}
            </div>
          ) : (
            <p className="text-gray-500 mb-3">尚未生成链接</p>
          )}
          <div className="flex flex-wrap gap-3 mt-4 items-center">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="datetime-local" value={tokenExpiresAt} onChange={(e) => setTokenExpiresAt(e.target.value)} className="border rounded px-3 py-2 text-base text-gray-800" />
              <span>有效期</span>
            </label>
            <input type="number" min={0} value={tokenMaxUses} onChange={(e) => setTokenMaxUses(Number(e.target.value))} className="border rounded px-3 py-2 w-28" placeholder="最大次数" />
            <button onClick={() => void createToken()} className="btn-secondary">生成新链接</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CognitiveAssignmentEdit
