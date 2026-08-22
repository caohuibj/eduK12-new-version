import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Plus, Settings } from 'lucide-react'
import apiClient from '../../api/client'
import { compositeApi } from '../../modules/composite/api'

type CourseOption = { id: string; title: string; courseCode: string }

const CompositeAssessmentList: React.FC = () => {
  const navigate = useNavigate()
  const [list, setList] = useState<any[]>([])
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    courseId: '',
    publicEnabled: false,
    expiresAt: '',
  })
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const [compositeRes, coursesRes] = await Promise.all([
        compositeApi.list(),
        apiClient.get<{ list: CourseOption[] }>('/courses?status=all&page=1&pageSize=100'),
      ])
      if (compositeRes.code === 0 && compositeRes.data) setList(compositeRes.data.list)
      else setError(compositeRes.message || '获取综合测评列表失败')
      const courseList = coursesRes.code === 0 ? (coursesRes.data?.list || []) : []
      setCourses(courseList)
      if (courseList.length === 1) {
        setForm((prev) => prev.courseId ? prev : { ...prev, courseId: courseList[0].id })
      }
    } catch (err) {
      setError((err as { message?: string }).message || '获取综合测评列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const create = async () => {
    try {
      setSaving(true)
      setError(null)
      const response = await compositeApi.create({
        ...form,
        courseId: form.courseId || null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      })
      if (response.code !== 0 || !response.data) throw new Error(response.message || '创建失败')
      navigate(`/composite-assessments/${response.data.id}`)
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
          <ClipboardList className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-gray-800">综合测评</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4 inline mr-1" />新建综合测评
        </button>
      </div>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">新建综合测评</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <input
              className="border rounded px-3 py-2"
              placeholder="编码"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder="名称"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <label className="md:col-span-2 text-sm text-gray-600">
              绑定课程（登录学生入口需要）
              <select
                className="mt-1 block w-full border rounded px-3 py-2 text-base text-gray-800"
                value={form.courseId}
                onChange={(e) => setForm({ ...form, courseId: e.target.value })}
              >
                <option value="">不绑定（仅公开匿名链接可用）</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}（{course.courseCode}）
                  </option>
                ))}
              </select>
            </label>
            {courses.length === 0 && (
              <p className="text-xs text-amber-600 md:col-span-2">还没有课程。请先在「课程管理」里创建课程，登录学生才能在课内看到这份综合测评。</p>
            )}
            <textarea
              className="border rounded px-3 py-2 md:col-span-2"
              placeholder="说明"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.publicEnabled}
                onChange={(e) => setForm({ ...form, publicEnabled: e.target.checked })}
              />
              允许公开匿名参与
            </label>
            {form.publicEnabled && (
              <input
                type="datetime-local"
                className="border rounded px-3 py-2"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void create()}
              disabled={saving || !form.code.trim() || !form.name.trim()}
              className="btn-primary"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">取消</button>
          </div>
        </div>
      )}
      {list.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">还没有综合测评模板</div>
      ) : (
        <div className="grid gap-4">
          {list.map((item) => (
            <div key={item.id} className="card p-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">{item.name}</h2>
                <p className="text-sm text-gray-500 mt-1">{item.code} · {item.itemCount || 0} 个模块 · {item.status}</p>
                {item.course && <p className="text-xs text-gray-400 mt-1">课程：{item.course.title}（{item.course.courseCode}）</p>}
              </div>
              <button onClick={() => navigate(`/composite-assessments/${item.id}`)} className="btn-secondary">
                <Settings className="w-4 h-4 inline mr-1" />配置
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CompositeAssessmentList
