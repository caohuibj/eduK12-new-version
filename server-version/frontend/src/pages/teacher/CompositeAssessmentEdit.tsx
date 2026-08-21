import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, Download, Link as LinkIcon, Plus, Send, Trash2 } from 'lucide-react'
import apiClient from '../../api/client'
import { compositeApi } from '../../modules/composite/api'

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
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const [detailResponse, scaleResponse, tokenResponse] = await Promise.all([
        compositeApi.detail(id),
        apiClient.get<any>('/scales?status=PUBLISHED&page=1&pageSize=100'),
        compositeApi.listTokens(id),
      ])
      if (detailResponse.code !== 0 || !detailResponse.data) throw new Error(detailResponse.message || '综合测评不存在')
      setDetail(detailResponse.data)
      const scaleData = Array.isArray(scaleResponse.data) ? scaleResponse.data : scaleResponse.data?.list || scaleResponse.data?.data?.list || []
      setScales(scaleData)
      try {
        const cognitiveResponse = await apiClient.get<any>('/cognitive/assignments?status=PUBLISHED')
        const cognitiveData = Array.isArray(cognitiveResponse.data) ? cognitiveResponse.data : cognitiveResponse.data?.list || []
        setCognitiveAssignments(cognitiveResponse.code === 0 ? cognitiveData : [])
      } catch {
        // 认知模块关闭时仍允许配置纯量表/表单综合测评。
        setCognitiveAssignments([])
      }
      if (tokenResponse.code === 0 && tokenResponse.data?.list?.length) setToken(tokenResponse.data.list[0])
    } catch (err) { setError((err as { message?: string }).message || '加载配置失败') }
  }
  useEffect(() => { void load() }, [id])

  const addItem = async () => {
    try {
      const input: Record<string, unknown> = { type, required: true }
      if (type === 'SCALE') input.scaleId = selectedId
      if (type === 'COGNITIVE') input.cognitiveAssignmentId = selectedId
      if (type === 'FORM') { input.formLabel = formLabel; input.formType = formType; input.formOptions = formOptions ? formOptions.split(',').map((value) => ({ value: value.trim(), label: value.trim() })) : null }
      const response = await compositeApi.addItem(id, input)
      if (response.code !== 0) throw new Error(response.message || '添加模块失败')
      setSelectedId(''); setFormLabel(''); setFormOptions(''); await load()
    } catch (err) { setError((err as { message?: string }).message || '添加模块失败') }
  }

  const removeItem = async (itemId: string) => {
    if (!confirm('确定移除这个模块吗？')) return
    try {
      const response = await compositeApi.removeItem(id, itemId)
      if (response.code !== 0) throw new Error(response.message || '移除模块失败')
      await load()
    } catch (err) { setError((err as { message?: string }).message || '移除模块失败') }
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
    } catch (err) { setError((err as { message?: string }).message || '调整顺序失败') }
  }
  const publish = async () => { const response = await compositeApi.publish(id); if (response.code !== 0) setError(response.message || '发布失败'); else await load() }
  const createToken = async () => { if (!tokenExpiresAt) return; const response = await compositeApi.createToken(id, { expiresAt: new Date(tokenExpiresAt).toISOString(), maxUses: tokenMaxUses }); if (response.code === 0) { setToken(response.data); setTokenExpiresAt('') } else setError(response.message || '生成公开链接失败') }
  const disableToken = async () => {
    if (!token || !confirm('确定停用当前公开链接吗？')) return
    const response = await compositeApi.disableToken(id, token.id)
    if (response.code === 0) setToken({ ...token, isActive: false })
    else setError(response.message || '停用公开链接失败')
  }
  const exportData = async (detailMode: 'summary' | 'full') => {
    const response = await compositeApi.exportData(id, { detail: detailMode, format: 'csv' })
    if (response.code !== 0 || !response.data?.fileName) {
      setError(response.message || '导出失败')
      return
    }
    try {
      const authToken = localStorage.getItem('token')
      const download = await fetch(`/api/composite-assessments/${id}/export/files/${response.data.fileName}`, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} })
      if (!download.ok) throw new Error('下载导出文件失败')
      const blobUrl = URL.createObjectURL(await download.blob())
      const anchor = document.createElement('a')
      anchor.href = blobUrl
      anchor.download = response.data.fileName
      anchor.click()
      URL.revokeObjectURL(blobUrl)
    } catch (err) { setError((err as { message?: string }).message || '下载导出文件失败') }
  }

  if (!detail) return <div className="p-8 text-gray-500">{error || '加载中...'}</div>
  const isDraft = detail.status === 'DRAFT'
  return <div><button onClick={() => navigate('/composite-assessments')} className="flex items-center text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4 mr-1" />返回综合测评</button><div className="flex items-center justify-between mb-6"><div><h1 className="text-2xl font-bold text-gray-800">{detail.name}</h1><p className="text-sm text-gray-500">{detail.code} · {detail.status}</p></div><div className="flex gap-2">{isDraft && <button onClick={() => void publish()} className="btn-primary"><Send className="w-4 h-4 inline mr-1" />发布</button>}<button onClick={() => void exportData('summary')} className="btn-secondary"><Download className="w-4 h-4 inline mr-1" />导出摘要</button><button onClick={() => void exportData('full')} className="btn-secondary">导出完整数据</button></div></div>{error && <p className="text-red-500 mb-4">{error}</p>}<div className="card p-6 mb-5"><h2 className="font-semibold mb-4">测评顺序</h2>{detail.items?.length ? <div className="space-y-2">{detail.items.map((item: any, index: number) => <div key={item.id} className="border rounded px-3 py-3 flex items-center justify-between"><div><span className="text-gray-400 mr-2">{index + 1}.</span><strong>{item.type === 'SCALE' ? item.scale?.name : item.type === 'COGNITIVE' ? item.cognitiveAssignment?.title : item.form?.label}</strong><span className="text-xs text-gray-400 ml-2">{item.type}</span></div>{isDraft && <div className="flex items-center gap-1"><button onClick={() => void moveItem(index, -1)} disabled={index === 0} className="text-gray-500 disabled:text-gray-200" aria-label="上移"><ChevronUp className="w-4 h-4" /></button><button onClick={() => void moveItem(index, 1)} disabled={index === detail.items.length - 1} className="text-gray-500 disabled:text-gray-200" aria-label="下移"><ChevronDown className="w-4 h-4" /></button><button onClick={() => void removeItem(item.id)} className="text-red-500 ml-1" aria-label="移除"><Trash2 className="w-4 h-4" /></button></div>}</div>)}</div> : <p className="text-gray-500">还没有模块</p>}</div>{isDraft && <div className="card p-6 mb-5"><h2 className="font-semibold mb-4">添加模块</h2><div className="flex gap-2 mb-3"><select value={type} onChange={(e) => { setType(e.target.value as any); setSelectedId('') }} className="border rounded px-3 py-2"><option value="SCALE">心理量表</option><option value="COGNITIVE">认知任务</option><option value="FORM">表单</option></select>{type !== 'FORM' ? <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="border rounded px-3 py-2 flex-1"><option value="">请选择</option>{type === 'SCALE' ? scales.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : cognitiveAssignments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select> : <><input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} className="border rounded px-3 py-2 flex-1" placeholder="表单项标签" /><select value={formType} onChange={(e) => setFormType(e.target.value)} className="border rounded px-3 py-2"><option value="text_input">文本</option><option value="fill_blank">填空</option><option value="single_choice">单选</option><option value="multiple_choice">多选</option></select><input value={formOptions} onChange={(e) => setFormOptions(e.target.value)} className="border rounded px-3 py-2" placeholder="选项，用逗号分隔" /></>}</div><button onClick={() => void addItem()} disabled={type !== 'FORM' ? !selectedId : !formLabel} className="btn-primary"><Plus className="w-4 h-4 inline mr-1" />添加到末尾</button></div>}{detail.publicEnabled && <div className="card p-6"><h2 className="font-semibold mb-3"><LinkIcon className="w-4 h-4 inline mr-1" />公开匿名链接</h2>{token ? <div className="text-sm"><p className="break-all text-primary mb-2">{window.location.origin}/public/composite/{token.token}</p><p className="text-gray-500">有效期：{new Date(token.expiresAt).toLocaleString('zh-CN')} · 已使用 {token.usedCount} 次 · {token.isActive ? '使用中' : '已停用'}</p>{token.isActive && <button onClick={() => void disableToken()} className="text-red-500 text-sm mt-2">停用当前链接</button>}</div> : <p className="text-gray-500 mb-3">尚未生成链接</p>}<div className="flex gap-2 mt-4"><input type="datetime-local" value={tokenExpiresAt} onChange={(e) => setTokenExpiresAt(e.target.value)} className="border rounded px-3 py-2" /><input type="number" min={0} value={tokenMaxUses} onChange={(e) => setTokenMaxUses(Number(e.target.value))} className="border rounded px-3 py-2 w-28" placeholder="最大次数" /><button onClick={() => void createToken()} className="btn-secondary">生成新链接</button></div></div>}</div>
}

export default CompositeAssessmentEdit
