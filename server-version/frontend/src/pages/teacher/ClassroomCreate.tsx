import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { Save, X } from 'lucide-react'

import { ProductPage, ProductStatus } from '../../components/product-ui'
interface Course {
  id: string
  title: string
}

const ClassroomCreate: React.FC = () => {
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
        alert(`课堂创建成功！课堂码: ${response.data.code}`)
        navigate('/teacher/classrooms')
      } else {
        alert(response.message || '创建失败')
      }
    } catch (error: any) {
      alert(error.message || '创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProductPage width="management" className="staff-editor-page">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">创建课堂</h1>
            <button
              onClick={() => navigate('/teacher/classrooms')}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 课堂名称 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                课堂名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="例如: 第三章课堂互动"
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
            </div>

            {/* 关联课程 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                关联课程 <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.courseId}
                onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.courseId ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">请选择课程</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              {errors.courseId && <p className="text-red-500 text-sm mt-1">{errors.courseId}</p>}
              <p className="text-gray-500 text-sm mt-1">
                学生必须加入该课程才能参与课堂互动
              </p>
            </div>

            {/* 提示信息 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>提示：</strong>
              </p>
              <ul className="text-sm text-blue-700 mt-2 list-disc list-inside space-y-1">
                <li>创建后会生成6位课堂码，学生可通过扫码或输入课堂码加入</li>
                <li>只有该课程的学生才能加入课堂</li>
                <li>课堂创建后可添加题目并开始互动</li>
              </ul>
            </div>

            {/* 提交按钮 */}
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => navigate('/teacher/classrooms')}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {loading ? '创建中...' : '创建课堂'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ProductPage>
  )
}

export default ClassroomCreate
