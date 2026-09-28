import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { ArrowLeft, Save } from 'lucide-react'

import { ProductPage, ProductStatus } from '../../components/product-ui'
interface Classroom {
  id: string
  name: string
  code: string
  status: string
  course: {
    id: string
    title: string
  }
}

const ClassroomEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchClassroom()
  }, [id])

  const fetchClassroom = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get<Classroom>(`/classrooms/${id}`)
      if (response.code === 0) {
        setClassroom(response.data)
        setName(response.data.name)
      } else {
        setError(response.message)
      }
    } catch (err: any) {
      setError(err.message || '获取课堂信息失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('课堂名称不能为空')
      return
    }

    try {
      setSaving(true)
      setError(null)

      const response = await apiClient.put(`/classrooms/${id}`, { name })
      if (response.code === 0) {
        alert('课堂更新成功')
        navigate('/teacher/classrooms')
      } else {
        setError(response.message)
      }
    } catch (err: any) {
      setError(err.message || '更新失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <ProductPage width="management"><ProductStatus kind="pending" title="正在加载课堂">正在读取课堂配置。</ProductStatus></ProductPage>
    )
  }

  if (!classroom) {
    return (
      <ProductPage width="management" className="staff-editor-page">
        <div className="text-center text-gray-500">
          <p>课堂不存在</p>
          <Link to="/teacher/classrooms" className="text-primary hover:underline mt-2 inline-block">
            返回列表
          </Link>
        </div>
      </div>
    )
  }

  if (classroom.status !== 'PREPARING') {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <p>只能编辑准备中的课堂</p>
          <Link to="/teacher/classrooms" className="text-primary hover:underline mt-2 inline-block">
            返回列表
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          to="/teacher/classrooms"
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回列表
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">编辑课堂</h1>

        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              课堂名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="请输入课堂名称"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              课堂码
            </label>
            <input
              type="text"
              value={classroom.code}
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              所属课程
            </label>
            <input
              type="text"
              value={classroom.course.title}
              disabled
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Link
              to="/teacher/classrooms"
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </ProductPage>
  )
}

export default ClassroomEdit
