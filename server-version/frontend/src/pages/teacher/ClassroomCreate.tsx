import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { Save } from 'lucide-react'

import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'
interface Course {
  id: string
  title: string
}

const ClassroomCreate: React.FC = () => {
  const { feedback, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [courses, setCourses] = useState<Course[]>([])
  const [formData, setFormData] = useState({
    name: '',
    courseId: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // 获取课程列表
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await apiClient.get<{ list: Course[]; total: number }>('/courses?pageSize=100')
        if (response.code === 0) {
          setCourses(response.data.list)
          // 如果只有一个课程，自动选中
          if (response.data.list.length === 1) {
            setFormData((prev) => ({ ...prev, courseId: response.data.list[0].id }))
          }
        }
      } catch (error) {
        console.error('获取课程列表失败:', error)
      }
    }
    fetchCourses()
  }, [])

  // 表单验证
  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = '请输入课堂名称'
    }

    if (!formData.courseId) {
      newErrors.courseId = '请选择关联课程'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      setLoading(true)
      const response = await apiClient.post<{ id: string; code: string }>('/classrooms', formData)
      if (response.code === 0) {
        showMessage(`课堂创建成功！课堂码: ${response.data.code}`)
        navigate('/teacher/classrooms')
      } else {
        showMessage(response.message || '创建失败')
      }
    } catch (error: any) {
      showMessage(error.message || '创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProductPage width="management" className="staff-editor-page space-y-6">
      <PageHeader
        title="创建课堂"
        description="为课程创建实时互动课堂。创建完成后可继续添加题目并进入课堂控制。"
        actions={<ProductButton onClick={() => navigate('/teacher/classrooms')}>返回课堂列表</ProductButton>}
      />
      {feedback}

      <form onSubmit={handleSubmit} className="staff-panel staff-panel--padded staff-form" noValidate>
        <label className="staff-field">
          <span>课堂名称 <span aria-hidden="true">*</span></span>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="例如：第三章课堂互动"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'classroom-name-error' : undefined}
          />
          {errors.name && <span id="classroom-name-error" className="text-sm text-red-600">{errors.name}</span>}
        </label>

        <label className="staff-field">
          <span>关联课程 <span aria-hidden="true">*</span></span>
          <select
            value={formData.courseId}
            onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
            aria-invalid={Boolean(errors.courseId)}
            aria-describedby={errors.courseId ? 'classroom-course-error classroom-course-hint' : 'classroom-course-hint'}
          >
            <option value="">请选择课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          {errors.courseId && <span id="classroom-course-error" className="staff-field__error">{errors.courseId}</span>}
          <span id="classroom-course-hint" className="staff-field__hint">学生必须加入该课程才能参与课堂互动。</span>
        </label>

        <ProductStatus kind="info" title="创建后">
          系统会生成 6 位课堂码；该课程学生可以扫码或输入课堂码加入。创建后可继续添加题目并开始互动。
        </ProductStatus>

        <div className="staff-action-footer">
          <ProductButton type="button" onClick={() => navigate('/teacher/classrooms')}>
            取消
          </ProductButton>
          <ProductButton type="submit" variant="primary" disabled={loading}>
            <Save className="w-4 h-4" aria-hidden="true" />
            {loading ? '创建中...' : '创建课堂'}
          </ProductButton>
        </div>
      </form>
    </ProductPage>
  )
}

export default ClassroomCreate
