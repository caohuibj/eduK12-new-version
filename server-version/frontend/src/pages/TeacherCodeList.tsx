import React, { useState, useEffect } from 'react'
import { Plus, Key, Trash2, Copy } from 'lucide-react'
import apiClient from '../api/client'
import type { TeacherCode } from '../types'

const TeacherCodeList: React.FC = () => {
  const [codes, setCodes] = useState<TeacherCode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCodes()
  }, [])

  const fetchCodes = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/teacher-codes')
      if (response.code === 0) {
        setCodes(response.data.list)
      }
    } catch (error) {
      console.error('获取教师码列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    try {
      const response = await apiClient.post('/teacher-codes', { maxUses: 1 })
      if (response.code === 0) {
        fetchCodes()
      }
    } catch (error: any) {
      alert(error.message || '生成失败')
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    alert('已复制到剪贴板')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">教师码管理</h2>
        <button
          onClick={handleCreate}
          className="btn-primary flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>生成教师码</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : codes.length === 0 ? (
        <div className="text-center py-12">
          <Key className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">暂无教师码</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {codes.map((code) => (
            <div key={code.id} className="card hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Key className="w-5 h-5 text-primary" />
                  <span className="text-lg font-mono font-bold tracking-wider">
                    {code.code}
                  </span>
                </div>
                <button
                  onClick={() => copyCode(code.code)}
                  className="p-2 text-gray-400 hover:text-primary hover:bg-blue-50 rounded"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>使用次数:</span>
                  <span>
                    {code.usedCount} / {code.maxUses}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>创建者:</span>
                  <span>{code.creator?.nickname || code.creator?.username}</span>
                </div>
                {code.expiresAt && (
                  <div className="flex justify-between">
                    <span>过期时间:</span>
                    <span>{new Date(code.expiresAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span
                  className={`px-2 py-1 rounded text-xs ${
                    code.isActive && code.usedCount < code.maxUses
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {code.isActive && code.usedCount < code.maxUses ? '有效' : '已失效'}
                </span>
                <button className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TeacherCodeList
