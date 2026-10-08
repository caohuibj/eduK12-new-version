import React, { useEffect, useState } from 'react'
import { Copy, Key, Plus, Trash2 } from 'lucide-react'
import apiClient from '../api/client'
import { PageHeader } from '../components/product-ui/PageHeader'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'
import { ProductPage } from '../components/product-ui/ProductPage'
import type { TeacherCode } from '../types'

const TeacherCodeList: React.FC = () => {
  const { feedback, confirm, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const ask = (message: string) => confirm({ title: '确认操作', body: message, confirmLabel: '确认' })
  const [codes, setCodes] = useState<TeacherCode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    void fetchCodes()
  }, [])

  const fetchCodes = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.get('/teacher-codes')
      if (response.code === 0) {
        setCodes(response.data.list)
      } else {
        setError(response.message || '获取教师码列表失败')
      }
    } catch (fetchError) {
      console.error('获取教师码列表失败:', fetchError)
      setError((fetchError as { message?: string }).message || '获取教师码列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      setCreating(true)
      setError(null)
      const response = await apiClient.post('/teacher-codes', { maxUses: 1 })
      if (response.code === 0) {
        await fetchCodes()
      } else {
        setError(response.message || '生成教师码失败')
      }
    } catch (operationError: any) {
      setError(operationError.message || '生成失败')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (teacherCode: TeacherCode) => {
    if (!await ask(`确定要删除教师码 ${teacherCode.code} 吗？`)) return

    try {
      setDeletingId(teacherCode.id)
      setError(null)
      const response = await apiClient.delete(`/teacher-codes/${teacherCode.id}`)
      if (response.code === 0) {
        setCodes(current => current.filter(item => item.id !== teacherCode.id))
      } else {
        setError(response.message || '删除教师码失败')
      }
    } catch (operationError: any) {
      setError(operationError.message || '删除教师码失败')
    } finally {
      setDeletingId(null)
    }
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      showMessage('已复制到剪贴板')
    } catch {
      setError('复制教师码失败，请手动复制。')
    }
  }

  return (
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <PageHeader
        title="教师码管理"
        description="生成一次性教师注册码，并撤销不再需要的注册码。"
        actions={(
          <button type="button" onClick={() => void handleCreate()} disabled={creating} className="hui-button hui-button--primary inline-flex items-center gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {creating ? '生成中...' : '生成教师码'}
          </button>
        )}
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button type="button" className="hui-button hui-button--secondary" onClick={() => void fetchCodes()}>重新加载</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center" role="status" aria-live="polite">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-action" />
          <span className="sr-only">正在加载教师码</span>
        </div>
      ) : codes.length === 0 ? (
        <div className="py-12 text-center">
          <Key className="mx-auto mb-4 h-16 w-16 text-gray-300" aria-hidden="true" />
          <p className="text-gray-500">暂无教师码</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {codes.map(code => {
            const valid = code.isActive && code.usedCount < code.maxUses
            return (
              <article key={code.id} className="staff-panel staff-panel--padded transition-shadow hover:shadow-lg" aria-label={`教师码 ${code.code}`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <Key className="h-5 w-5 flex-none text-action" aria-hidden="true" />
                    <span className="truncate font-mono text-lg font-bold tracking-wider">{code.code}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyCode(code.code)}
                    className="rounded p-2 text-gray-400 hover:bg-blue-50 hover:text-action"
                    aria-label={`复制教师码 ${code.code}`}
                    title="复制教师码"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <dl className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between gap-4">
                    <dt>使用次数:</dt>
                    <dd>{code.usedCount} / {code.maxUses}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>创建者:</dt>
                    <dd className="text-right">{code.creator?.nickname || code.creator?.username}</dd>
                  </div>
                  {code.expiresAt && (
                    <div className="flex justify-between gap-4">
                      <dt>过期时间:</dt>
                      <dd>{new Date(code.expiresAt).toLocaleDateString('zh-CN')}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 flex items-center justify-between border-t pt-4">
                  <span className={`rounded px-2 py-1 text-xs ${valid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {valid ? '有效' : '已失效'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(code)}
                    disabled={deletingId === code.id}
                    className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    aria-label={`删除教师码 ${code.code}`}
                    title="删除教师码"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </ProductPage>
  )
}

export default TeacherCodeList