import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, Download, Link as LinkIcon, Plus, Send, Trash2 } from 'lucide-react'
import apiClient from '../../api/client'
import { compositeApi } from '../../modules/composite/api'
import { useCognitiveEnabled } from '../../contexts/CapabilitiesContext'

const pad = (value: number) => String(value).padStart(2, '0')

const toDatetimeLocal = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`

const suggestedTokenExpiry = (compositeExpiresAt?: string | null) => {
  const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000)
  if (!compositeExpiresAt) return toDatetimeLocal(inOneDay)
  const cap = new Date(compositeExpiresAt)
  if (Number.isNaN(cap.getTime()) || cap.getTime() <= Date.now()) return toDatetimeLocal(inOneDay)
  return toDatetimeLocal(inOneDay.getTime() < cap.getTime() ? inOneDay : cap)
}

const errorMessage = (err: unknown, fallback: string) => {
  if (typeof err === 'string' && err.trim()) return err
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return fallback
}

const CompositeAssessmentEdit: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<any>(null)
  const [scales, setScales] = useState<any[]>([])
  const [cognitiveAssignments, setCognitiveAssignments] = useState<any[]>([])
  const [type, setType] = useState<'SCALE' | 'COGNITIVE' | 'FORM'>('SCALE')
  const [selectedId, setSelectedId] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formType, setFormType] = useState('text_input')
  const [formOptions, setFormOptions] = useState('')
  const [token, setToken] = useState<any>(null)
  const [tokenExpiresAt, setTokenExpiresAt] = useState('')
  const [tokenMaxUses, setTokenMaxUses] = useState(0)
  const [savingToken, setSavingToken] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingCopyable, setSavingCopyable] = useState(false)
  const cognitiveModuleEnabled = useCognitiveEnabled()

  const load = async () => {
    try {
      const [detailResponse, scaleResponse, tokenResponse] = await Promise.all([
        compositeApi.detail(id),
        apiClient.get<any>('/scales?status=PUBLISHED&page=1&pageSize=100'),
        compositeApi.listTokens(id),
      ])
      if (detailResponse.code !== 0 || !detailResponse.data) throw new Error(detailResponse.message || '综合测评不存在')
      setDetail(detailResponse.data)
      setTokenExpiresAt((current) => current || suggestedTokenExpiry(detailResponse.data.expiresAt))
      const scaleData = Array.isArray(scaleResponse.data) ? scaleResponse.data : scaleResponse.data?.list || scaleResponse.data?.data?.list || []
      setScales(scaleData)
      try {
        const cognitiveResponse = await apiClient.get<any>('/cognitive/assignments?status=PUBLISHED')
        const cognitiveData = Array.isArray(cognitiveResponse.data)
          ? cognitiveResponse.data
          : cognitiveResponse.data?.list || []
        if (cognitiveResponse.code !== 0) throw new Error(cognitiveResponse.message || '无法加载认知任务')
        setCognitiveAssignments(cognitiveData)
      } catch (err) {
        setCognitiveAssignments([])
        setError(errorMessage(err, '无法加载已发布的认知任务'))
      }
      if (tokenResponse.code === 0 && tokenResponse.data?.list?.length) setToken(tokenResponse.data.list[0])
    } catch (err) {
      setError(errorMessage(err, '加载配置失败'))
    }
  }

  useEffect(() => { void load() }, [id])

  const addItem = async () => {
    try {
      const input: Record<string, unknown> = { type, required: true }
      if (type === 'SCALE') input.scaleId = selectedId
      if (type === 'COGNITIVE') input.cognitiveAssignmentId = selectedId
      if (type === 'FORM') {
        input.formLabel = formLabel
        input.formType = formType
        input.formOptions = formOptions
          ? formOptions.split(',').map((value) => ({ value: value.trim(), label: value.trim() }))
          : null
      }
      const response = await compositeApi.addItem(id, input)
      if (response.code !== 0) throw new Error(response.message || '添加模块失败')
      setSelectedId('')
      setFormLabel('')
      setFormOptions('')
      await load()
    } catch (err) {
      setError(errorMessage(err, '添加模块失败'))
    }
  }

  const removeItem = async (itemId: string) => {
    if (!confirm('确定移除这个模块吗？')) return
    try {
      const response = await compositeApi.removeItem(id, itemId)
      if (response.code !== 0) throw new Error(response.message || '移除模块失败')
      await load()
    } catch (err) {
      setError(errorMessage(err, '移除模块失败'))
    }
  }

  const moveItem = async (index: number, direction: -1 | 1) => {
    if (!detail?.items) return
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= detail.items.length) return
    const reordered = detail.items.map((item: any, itemIndex: number) => {
      if (itemIndex === index) return { id: item.id, position: detail.items[targetIndex].position }
      if (itemIndex === targetIndex) return { id: item.id, position: detail.items[index].position }
      return { id: item.id, position: item.position }
    })
    try {
      const response = await compositeApi.reorderItems(id, reordered)
      if (response.code !== 0) throw new Error(response.message || '调整顺序失败')
      await load()
    } catch (err) {
      setError(errorMessage(err, '调整顺序失败'))
    }
  }

  const publish = async () => {
    try {
      const response = await compositeApi.publish(id)
      if (response.code !== 0) setError(response.message || '发布失败')
      else await load()
    } catch (err) {
      setError(errorMessage(err, '发布失败'))
    }
  }

  const createToken = async () => {
    if (!tokenExpiresAt) {
      setError('请先选择公开链接的有效期')
      return
    }
    try {
      setSavingToken(true)
      setError(null)
      const expiry = new Date(tokenExpiresAt)
      if (Number.isNaN(expiry.getTime())) throw new Error('有效期格式无效')
      const compositeExpiry = detail?.expiresAt ? new Date(detail.expiresAt) : null
      if (compositeExpiry && expiry.getTime() > compositeExpiry.getTime()) {
        const updated = await compositeApi.update(id, { expiresAt: expiry.toISOString() })
        if (updated.code !== 0) throw new Error(updated.message || '无法延长测评有效期')
        setDetail((current: any) => current ? { ...current, expiresAt: expiry.toISOString() } : current)
      }
      const response = await compositeApi.createToken(id, {
        expiresAt: expiry.toISOString(),
        maxUses: Number(tokenMaxUses) || 0,
      })
      if (response.code !== 0 || !response.data) throw new Error(response.message || '生成公开链接失败')
      setToken({ ...response.data, isActive: true, usedCount: response.data.usedCount ?? 0 })
    } catch (err) {
      setError(errorMessage(err, '生成公开链接失败'))
    } finally {
      setSavingToken(false)
    }
  }

  const disableToken = async () => {
    if (!token || !confirm('确定停用当前公开链接吗？')) return
    try {
      const response = await compositeApi.disableToken(id, token.id)
      if (response.code === 0) setToken({ ...token, isActive: false })
      else setError(response.message || '停用公开链接失败')
    } catch (err) {
      setError(errorMessage(err, '停用公开链接失败'))
    }
  }

  const toggleCopyable = async (copyable: boolean) => {
    try {
      setSavingCopyable(true)
      setError(null)
      const response = await compositeApi.update(id, { copyable })
      if (response.code !== 0) throw new Error(response.message || '更新复制开关失败')
      await load()
    } catch (err) {
      setError(errorMessage(err, '更新复制开关失败'))
    } finally {
      setSavingCopyable(false)
    }
  }

  const exportData = async (detailMode: 'summary' | 'full') => {
    try {
      const response = await compositeApi.exportData(id, { detail: detailMode, format: 'csv' })
      if (response.code !== 0 || !response.data?.fileName) {
        setError(response.message || '导出失败')
        return
      }
      const authToken = localStorage.getItem('token')
      const download = await fetch(`/api/composite-assessments/${id}/export/files/${response.data.fileName}`, {
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
      setError(errorMessage(err, '下载导出文件失败'))
    }
  }

  if (!detail) return <div className="p-8 text-gray-500">{error || '加载中...'}</div>

  const isDraft = detail.status === 'DRAFT'
  const isLibraryCourse = Boolean(detail.course?.isLibrary)
  const itemLabel = (item: any) =>
    item.type === 'SCALE' ? item.scale?.name : item.type === 'COGNITIVE' ? item.cognitiveAssignment?.title : item.form?.label

  return (
    <div>
      <button onClick={() => navigate('/composite-assessments')} className="flex items-center text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />返回综合测评
      </button>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-800">{detail.name}</h1>
            {isLibraryCourse && (
              <span className="px-2 py-0.5 text-xs rounded bg-indigo-100 text-indigo-700">库课程</span>
            )}
            {detail.copyable && (
              <span className="px-2 py-0.5 text-xs rounded bg-emerald-100 text-emerald-700">可复制</span>
            )}
          </div>
          <p className="text-sm text-gray-500">{detail.code} · {detail.status}</p>
          <p className="text-sm text-gray-600 mt-1">已开始 {detail.attemptCounts?.started ?? 0} · 已完成 {detail.attemptCounts?.completed ?? 0}</p>
        </div>
        <div className="flex gap-2">
          {isDraft && (
            <button onClick={() => void publish()} className="btn-primary">
              <Send className="w-4 h-4 inline mr-1" />发布
            </button>
          )}
          <button onClick={() => navigate(`/composite-assessments/${id}/results`)} className="btn-secondary">查看结果</button>
          <button onClick={() => void exportData('summary')} className="btn-secondary">
            <Download className="w-4 h-4 inline mr-1" />导出摘要
          </button>
          <button onClick={() => void exportData('full')} className="btn-secondary">导出完整数据</button>
        </div>
      </div>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {detail.canSetCopyable && (
        <div className="card p-6 mb-5">
          <h2 className="font-semibold mb-2">管理员模板</h2>
          <p className="text-sm text-gray-500 mb-3">
            打开后，教师可把这份已发布综合测评复制成自己的草稿。关闭后立即从教师模板目录消失，已复制的草稿不受影响。
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(detail.copyable)}
              disabled={savingCopyable}
              onChange={(e) => void toggleCopyable(e.target.checked)}
            />
            允许教师复制
          </label>
        </div>
      )}
      <div className="card p-6 mb-5">
        <h2 className="font-semibold mb-4">测评顺序</h2>
        {detail.items?.length ? (
          <div className="space-y-2">
            {detail.items.map((item: any, index: number) => (
              <div key={item.id} className="border rounded px-3 py-3 flex items-center justify-between">
                <div>
                  <span className="text-gray-400 mr-2">{index + 1}.</span>
                  <strong>{itemLabel(item)}</strong>
                  <span className="text-xs text-gray-400 ml-2">{item.type}</span>
                </div>
                {isDraft && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => void moveItem(index, -1)} disabled={index === 0} className="text-gray-500 disabled:text-gray-200" aria-label="上移">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => void moveItem(index, 1)} disabled={index === detail.items.length - 1} className="text-gray-500 disabled:text-gray-200" aria-label="下移">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button onClick={() => void removeItem(item.id)} className="text-red-500 ml-1" aria-label="移除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">还没有模块</p>
        )}
      </div>
      {isDraft && (
        <div className="card p-6 mb-5">
          <h2 className="font-semibold mb-4">添加模块</h2>
          <div className="flex gap-2 mb-3">
            <select value={type} onChange={(e) => { setType(e.target.value as any); setSelectedId('') }} className="border rounded px-3 py-2">
              <option value="SCALE">心理量表</option>
              {cognitiveModuleEnabled && <option value="COGNITIVE">认知任务</option>}
              <option value="FORM">表单</option>
            </select>
            {type !== 'FORM' ? (
              <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="border rounded px-3 py-2 flex-1">
                <option value="">请选择</option>
                {type === 'SCALE'
                  ? scales.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)
                  : cognitiveAssignments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}{item.listedStandalone === false ? '（综合测评用）' : ''}
                    </option>
                  ))}
              </select>
            ) : (
              <>
                <input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} className="border rounded px-3 py-2 flex-1" placeholder="表单项标签" />
                <select value={formType} onChange={(e) => setFormType(e.target.value)} className="border rounded px-3 py-2">
                  <option value="text_input">文本</option>
                  <option value="fill_blank">填空</option>
                  <option value="single_choice">单选</option>
                  <option value="multiple_choice">多选</option>
                </select>
                <input value={formOptions} onChange={(e) => setFormOptions(e.target.value)} className="border rounded px-3 py-2" placeholder="选项，用逗号分隔" />
              </>
            )}
          </div>
          <button onClick={() => void addItem()} disabled={type !== 'FORM' ? !selectedId : !formLabel} className="btn-primary">
            <Plus className="w-4 h-4 inline mr-1" />添加到末尾
          </button>
        </div>
      )}
      {detail.status === 'PUBLISHED' && isLibraryCourse && (
        <p className="text-sm text-gray-500 mb-5">库课程上的综合测评不能生成公开链接，也不能发给学生作答。</p>
      )}
      {detail.status === 'PUBLISHED' && !isLibraryCourse && (
        <div className="card p-6">
          <h2 className="font-semibold mb-3">
            <LinkIcon className="w-4 h-4 inline mr-1" />公开匿名链接
          </h2>
          {!detail.publicEnabled && (
            <p className="text-amber-600 text-sm mb-3">创建时未勾选「允许公开匿名参与」。仍可生成链接，登录学生课内入口不受影响。</p>
          )}
          {token ? (
            <div className="text-sm">
              <p className="break-all text-primary mb-2">{window.location.origin}/public/composite/{token.token}</p>
              <p className="text-gray-500">
                有效期：{new Date(token.expiresAt).toLocaleString('zh-CN')} · 已使用 {token.usedCount ?? 0} 次 · {token.isActive ? '使用中' : '已停用'}
              </p>
              {token.isActive && (
                <button onClick={() => void disableToken()} className="text-red-500 text-sm mt-2">停用当前链接</button>
              )}
            </div>
          ) : (
            <p className="text-gray-500 mb-3">尚未生成链接</p>
          )}
          <div className="flex flex-wrap gap-3 mt-4 items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="datetime-local"
                value={tokenExpiresAt}
                onChange={(e) => setTokenExpiresAt(e.target.value)}
                className="border rounded px-3 py-2 text-base text-gray-800"
              />
              <span>有效期</span>
            </label>
            <label className="text-sm text-gray-600">
              最大次数（0 不限制）
              <input
                type="number"
                min={0}
                value={tokenMaxUses}
                onChange={(e) => setTokenMaxUses(Number(e.target.value))}
                className="mt-1 block border rounded px-3 py-2 w-36 text-base text-gray-800"
              />
            </label>
            <button onClick={() => void createToken()} disabled={savingToken} className="btn-secondary">
              {savingToken ? '生成中...' : '生成新链接'}
            </button>
          </div>
          {detail.expiresAt && (
            <p className="text-xs text-gray-400 mt-2">
              不能晚于本测评有效期 {new Date(detail.expiresAt).toLocaleString('zh-CN')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default CompositeAssessmentEdit
