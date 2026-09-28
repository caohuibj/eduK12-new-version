import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain, Plus, Settings } from 'lucide-react'
import apiClient from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { cognitiveApi } from '../../modules/cognitive/api'
import MaterialGrantModal from '../../components/MaterialGrantModal'
import { PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'

type CourseOption = { id: string; title: string; courseCode: string; isLibrary?: boolean }
type ConfigOption = {
  id: string
  testType: string
  configVersion: string
  name: string
  engineVersion?: string
  scoringVersion?: string
  accessPolicy?: 'OPEN' | 'GRANT'
}
type TestCatalogRow = {
  testType: string
  engineVersion: string
  scoringVersion: string
  profiles: Array<{ profile: 'experience' | 'standard' | 'research'; reportCaveats: string[] }>
}
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
  const [tests, setTests] = useState<TestCatalogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [grantConfig, setGrantConfig] = useState<ConfigOption | null>(null)
  const [form, setForm] = useState({
    title: '',
    courseId: '',
    configId: '',
    instruction: '',
    maxAttempts: 1,
    profile: 'standard' as 'experience' | 'standard' | 'research',
  })

  const selectableCourses = isAdmin ? courses : courses.filter((course) => !course.isLibrary)
  const selectedCourse = selectableCourses.find((course) => course.id === form.courseId)
  const selectedConfig = configs.find((config) => config.id === form.configId)
  const selectedTest = selectedConfig?.engineVersion && selectedConfig.scoringVersion
    ? tests.find((test) =>
      test.testType === selectedConfig.testType
      && test.engineVersion === selectedConfig.engineVersion
      && test.scoringVersion === selectedConfig.scoringVersion
    )
    : undefined
  const catalogMismatch = Boolean(selectedConfig) && !selectedTest

  const load = async () => {
    try {
      setError(null)
      const [assignmentsRes, coursesRes, configsRes, testsRes] = await Promise.all([
        cognitiveApi.listTeacherAssignments(undefined, isAdmin ? undefined : true),
        apiClient.get<{ list: CourseOption[] }>('/courses?status=all&page=1&pageSize=100'),
        cognitiveApi.listConfigs(),
        cognitiveApi.listTests(),
      ])
      if (assignmentsRes.code !== 0) throw new Error(assignmentsRes.message || '获取认知任务失败')
      const rows = Array.isArray(assignmentsRes.data) ? assignmentsRes.data : assignmentsRes.data?.list || []
      // Keep package-internal wrappers out of the teacher library even if an
      // older backend ignores the default listedStandalone query parameter.
      setList(isAdmin ? rows : rows.filter((row: AssignmentRow) => row.listedStandalone !== false))
      setCourses(coursesRes.code === 0 ? (coursesRes.data?.list || []) : [])
      setConfigs(configsRes.code === 0 ? (configsRes.data?.list || []) : [])
      setTests(testsRes.code === 0 ? (testsRes.data?.list || []) : [])
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
        profile: form.profile,
      })
      if (response.code !== 0 || !response.data) throw new Error(response.message || '创建失败')
      navigate(`/cognitive-assignments/${response.data.id}`)
    } catch (err) {
      setError((err as { message?: string }).message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  const changeAccessPolicy = async (accessPolicy: 'OPEN' | 'GRANT') => {
    if (!selectedConfig) return
    try {
      setError(null)
      const response = await cognitiveApi.updateConfigAccessPolicy(selectedConfig.id, accessPolicy)
      if (response.code !== 0) throw new Error(response.message || '更新访问策略失败')
      setConfigs((current) => current.map((config) => (
        config.id === selectedConfig.id ? { ...config, accessPolicy } : config
      )))
    } catch (err) {
      setError((err as { message?: string }).message || '更新访问策略失败')
    }
  }

  if (loading) return <ProductPage width="management"><ProductStatus kind="pending" title="正在加载认知任务">正在读取任务、课程与可用配置。</ProductStatus></ProductPage>

  return (
    <ProductPage width="management" className="space-y-6">
      <PageHeader
        title="认知任务"
        description="创建和管理认知任务；任务类型、版本、Profile 与访问策略仍由 Cognitive domain contract 决定。"
        actions={
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="btn-primary"
            aria-expanded={showForm}
            aria-controls="cognitive-assignment-create"
          >
            <Plus className="w-4 h-4 inline mr-1" />新建认知任务
          </button>
        }
      />

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <section id="cognitive-assignment-create" className="card p-6" aria-labelledby="cognitive-assignment-create-title">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-primary" aria-hidden="true" />
            <h2 id="cognitive-assignment-create-title" className="text-lg font-semibold">新建认知任务</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="md:col-span-2 text-sm text-gray-700">
              标题
              <input className="mt-1 w-full border rounded px-3 py-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="text-sm text-gray-700">
              课程
              <select className="mt-1 w-full border rounded px-3 py-2" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
                <option value="">选择课程</option>
                {selectableCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}（{course.courseCode}）{course.isLibrary ? ' · 库课程' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-700">
              任务类型
              <select className="mt-1 w-full border rounded px-3 py-2" value={form.configId} onChange={(e) => setForm({ ...form, configId: e.target.value, profile: 'standard' })}>
                <option value="">选择任务类型</option>
                {configs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.name} · {config.testType} {config.configVersion}{config.accessPolicy ? ` · ${config.accessPolicy}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {isAdmin && selectedConfig && (
              <fieldset className="md:col-span-2 flex flex-wrap items-center gap-3 text-sm text-gray-700">
                <legend className="sr-only">访问策略</legend>
                <span aria-hidden="true">访问策略</span>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="accessPolicy"
                    checked={(selectedConfig.accessPolicy || 'OPEN') === 'OPEN'}
                    onChange={() => void changeAccessPolicy('OPEN')}
                  />
                  OPEN 全员可用
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="accessPolicy"
                    checked={selectedConfig.accessPolicy === 'GRANT'}
                    onChange={() => void changeAccessPolicy('GRANT')}
                  />
                  GRANT 需授权
                </label>
                <button type="button" onClick={() => setGrantConfig(selectedConfig)} className="btn-secondary">
                  授权给教师
                </button>
              </fieldset>
            )}
            <label className="text-sm text-gray-700">
              测验档位
              <select
                className="mt-1 w-full border rounded px-3 py-2"
                value={form.profile}
                disabled={!selectedTest}
                onChange={(e) => setForm({ ...form, profile: e.target.value as 'experience' | 'standard' | 'research' })}
              >
                {(selectedTest?.profiles || []).map((profile) => (
                  <option key={profile.profile} value={profile.profile}>
                    {profile.profile === 'experience' ? '体验版' : profile.profile === 'research' ? '科研版' : '正式版'}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-700">
              最大次数
              <input type="number" min={1} className="mt-1 w-full border rounded px-3 py-2" value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })} />
            </label>
            {form.profile === 'experience' && (
              <p className="text-xs text-amber-600 md:col-span-2">体验版，结果仅供体验。</p>
            )}
            <label className="md:col-span-2 text-sm text-gray-700">
              学生须知（可选）
              <textarea className="mt-1 w-full border rounded px-3 py-2" value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} />
            </label>
          </div>
          {selectedCourse?.isLibrary && (
            <p className="text-xs text-amber-600 mt-3">库课程上的认知任务不能单独发给学生，通常只作为综合测评模板的模块。</p>
          )}
          {catalogMismatch && (
            <p className="text-xs text-red-600 mt-3">任务配置与 Catalog 版本不一致，无法选择 Profile。请重新选择匹配 engineVersion / scoringVersion 的任务类型。</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void create()} disabled={saving || !form.title || !form.courseId || !form.configId || !selectedTest} className="btn-primary">{saving ? '保存中...' : '保存草稿'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">取消</button>
          </div>
        </section>
      )}

      {list.length === 0 ? <ProductStatus kind="info" title="暂无认知任务">先创建并发布后，才能加入综合测评或发给学生。</ProductStatus> : (
        <div className="staff-table-container"><table className="staff-table"><thead><tr><th>任务</th><th>状态</th><th>任务类型</th><th>最大次数</th><th className="text-right">操作</th></tr></thead><tbody>
          {list.map(item => <tr key={item.id}><td><Link className="staff-record-title" to={`/cognitive-assignments/${item.id}`}>{item.title}</Link>{item.listedStandalone === false && <div className="staff-muted">综合测评内部任务</div>}</td><td><span className={`staff-badge ${item.status === 'PUBLISHED' ? 'staff-badge--success' : ''}`}>{statusLabel[item.status] || item.status}</span></td><td>{item.config?.name || '—'}</td><td>{item.maxAttempts}</td><td><div className="staff-table-actions"><Link className="staff-secondary-link" to={`/cognitive-assignments/${item.id}`}><Settings className="w-4 h-4" aria-hidden="true" />配置任务</Link></div></td></tr>)}
        </tbody></table></div>
      )}
      {grantConfig && (
        <MaterialGrantModal
          resourceType="COGNITIVE_CONFIG"
          resourceId={grantConfig.id}
          resourceName={grantConfig.name}
          onClose={() => setGrantConfig(null)}
        />
      )}
    </ProductPage>
  )
}

export default CognitiveAssignmentList
