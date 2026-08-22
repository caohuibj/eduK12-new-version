import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, Plus, Settings } from 'lucide-react'
import apiClient from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { cognitiveApi } from '../../modules/cognitive/api'

type CourseOption = { id: string; title: string; courseCode: string; isLibrary?: boolean }
type ConfigOption = { id: string; testType: string; configVersion: string; name: string }
type AssignmentRow = {
  id: string
  title: string
  status: string
  courseId: string | null
  maxAttempts: number
  listedStandalone?: boolean
  config?: { testType: string; name: string; configVersion: string }
}

const statusLabel: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
}

const CognitiveAssignmentList: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [list, setList] = useState<AssignmentRow[]>([])
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [configs, setConfigs] = useState<ConfigOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    courseId: '',
    configId: '',
    instruction: '',
    maxAttempts: 1,
  })

  const selectableCourses = isAdmin ? courses : courses.filter((course) => !course.isLibrary)
  const selectedCourse = selectableCourses.find((course) => course.id === form.courseId)

  const load = async () => {
    try {
      const [assignmentsRes, coursesRes, configsRes] = await Promise.all([
        cognitiveApi.listTeacherAssignments(),
        apiClient.get<{ list: CourseOption[] }>('/courses?status=all&page=1&pageSize=100'),
        cognitiveApi.listConfigs(),
      ])
      if (assignmentsRes.code !== 0) throw new Error(assignmentsRes.message || '获取认知任务失败')
      const rows = Array.isArray(assignmentsRes.data) ? assignmentsRes.data : assignmentsRes.data?.list || []
      setList(rows)
      setCourses(coursesRes.code === 0 ? (coursesRes.data?.list || []) : [])
      setConfigs(configsRes.code === 0 ? (configsRes.data?.list || []) : [])
    } catch (err) {
      setError((err as { message?: string }).message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const create = async () => {
    try {
      setSaving(true)
      setError(null)
      const response = await cognitiveApi.createAssignment({
        title: form.title,
        courseId: form.courseId,
        configId: form.configId,
        instruction: form.instruction || undefined,
        maxAttempts: Number(form.maxAttempts) || 1,
      })
      if (response.code !== 0 || !response.data) throw new Error(response.message || '创建失败')
      navigate(`/cognitive-assignments/${response.data.id}`)
    } catch (err) {
      setError((err as { message?: string }).message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-gray-500 p-8">加载中...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Brain className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-gray-800">认知任务</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4 inline mr-1" />新建认知任务
        </button>
      </div>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">新建认知任务</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <input className="border rounded px-3 py-2 md:col-span-2" placeholder="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select className="border rounded px-3 py-2" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
              <option value="">选择课程</option>
              {selectableCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}（{course.courseCode}）{course.isLibrary ? ' · 库课程' : ''}
                </option>
              ))}
            </select>
            <select className="border rounded px-3 py-2" value={form.configId} onChange={(e) => setForm({ ...form, configId: e.target.value })}>
              <option value="">选择任务类型</option>
              {configs.map((config) => (
                <option key={config.id} value={config.id}>{config.name} · {config.testType} {config.configVersion}</option>
              ))}
            </select>
            <input type="number" min={1} className="border rounded px-3 py-2" placeholder="最大次数" value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })} />
            <textarea className="border rounded px-3 py-2 md:col-span-2" placeholder="学生须知（可选）" value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} />
          </div>
          {selectedCourse?.isLibrary && (
            <p className="text-xs text-amber-600 mt-3">库课程上的认知任务不能单独发给学生，通常只作为综合测评模板的模块。</p>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={() => void create()} disabled={saving || !form.title || !form.courseId || !form.configId} className="btn-primary">{saving ? '保存中...' : '保存草稿'}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">取消</button>
          </div>
        </div>
      )}
      {list.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">还没有认知任务。先创建并发布后，才能加入综合测评或发给学生。</div>
      ) : (
        <div className="grid gap-4">
          {list.map((item) => (
            <div key={item.id} className="card p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-gray-800">{item.title}</h2>
                  {item.listedStandalone === false && (
                    <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700">综合测评用</span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {statusLabel[item.status] || item.status}
                  {item.config ? ` · ${item.config.name}` : ''}
                  {` · 最多 ${item.maxAttempts} 次`}
                </p>
              </div>
              <button onClick={() => navigate(`/cognitive-assignments/${item.id}`)} className="btn-secondary">
                <Settings className="w-4 h-4 inline mr-1" />配置
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CognitiveAssignmentList
