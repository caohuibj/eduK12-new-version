import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { Save } from 'lucide-react'

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
      <ProductPage width="management">
        <ProductStatus kind="pending" title="正在加载课堂">正在读取课堂信息。</ProductStatus>
      </ProductPage>
    )
  }

  if (!classroom) {
    return (
      <ProductPage width="management">
        <ProductStatus
          kind="error"
          title="课堂不可用"
          actions={<Link to="/teacher/classrooms" className="staff-secondary-link">返回课堂列表</Link>}
        >
          {error || '课堂不存在，或当前账户无法访问。'}
        </ProductStatus>
      </ProductPage>
    )
  }

  if (classroom.status !== 'PREPARING') {
    return (
      <ProductPage width="management">
        <ProductStatus
          kind="info"
          title="当前课堂不可编辑"
          actions={<Link to="/teacher/classrooms" className="staff-secondary-link">返回课堂列表</Link>}
        >
          只有准备中的课堂可以修改基本信息。
        </ProductStatus>
      </ProductPage>
    )
  }

  return (
    <ProductPage width="management" className="staff-editor-page space-y-6">
      <PageHeader
        title="编辑课堂"
        description={`${classroom.course.title} · 课堂码 ${classroom.code}`}
        actions={<Link to="/teacher/classrooms" className="staff-secondary-link">返回课堂列表</Link>}
      />

      {error && <ProductStatus kind="error" title="无法保存">{error}</ProductStatus>}

      <form onSubmit={handleSubmit} className="staff-panel staff-panel--padded staff-form">
        <label className="staff-field">
          <span>课堂名称</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入课堂名称"
          />
        </label>

        <label className="staff-field">
          <span>课堂码</span>
          <input type="text" value={classroom.code} disabled />
          <span className="staff-field__hint">课堂码由系统管理，此处仅用于核对。</span>
        </label>

        <label className="staff-field">
          <span>所属课程</span>
          <input type="text" value={classroom.course.title} disabled />
        </label>

        <div className="staff-action-footer">
          <Link to="/teacher/classrooms" className="staff-secondary-link">取消</Link>
          <ProductButton type="submit" variant="primary" disabled={saving}>
            <Save className="w-4 h-4" aria-hidden="true" />
            {saving ? '保存中...' : '保存'}
          </ProductButton>
        </div>
      </form>
    </ProductPage>
  )
}

export default ClassroomEdit
