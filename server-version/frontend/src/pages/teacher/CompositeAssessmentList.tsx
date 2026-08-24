import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Copy, Plus, Settings } from 'lucide-react'
import apiClient from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { compositeApi } from '../../modules/composite/api'
import MaterialGrantModal from '../../components/MaterialGrantModal'
import type {
  AnalysisProtocolCatalogItem,
  AnalysisProtocolProfile,
  CompositeLibraryTemplate,
  CompositeTeacherListItem,
  ReportPackageCatalogItem,
  ReportPackageProfile,
} from '../../modules/composite/types'

type CourseOption = { id: string; title: string; courseCode: string; isLibrary?: boolean; creatorId?: string }

const itemTypeLabel: Record<string, string> = {
  SCALE: '量表',
  COGNITIVE: '认知',
  FORM: '表单',
}

const moduleSummary = (
  items?: Array<{
    type: string
    label?: string | null
    scale?: { name?: string } | null
    cognitiveAssignment?: { title?: string } | null
    form?: { label?: string } | null
  }>,
) => {
  if (!items?.length) return '暂无模块'
  return items
    .map((item) => item.label || item.scale?.name || item.cognitiveAssignment?.title || item.form?.label || itemTypeLabel[item.type] || item.type)
    .join(' · ')
}

const CompositeAssessmentList: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  // The package catalog is the PR6B teacher-facing contract. Keep the old
  // protocol UI only for older test/integration doubles that do not expose the
  // package endpoint; a deployed client always has this method.
  const packageCatalogAvailable = typeof compositeApi.listReportPackages === 'function'
  const [list, setList] = useState<CompositeTeacherListItem[]>([])
  const [library, setLibrary] = useState<CompositeLibraryTemplate[]>([])
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [protocols, setProtocols] = useState<AnalysisProtocolCatalogItem[]>([])
  const [reportPackages, setReportPackages] = useState<ReportPackageCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [copyCourseId, setCopyCourseId] = useState<Record<string, string>>({})
  const [grantPackage, setGrantPackage] = useState<ReportPackageCatalogItem | null>(null)
  const [tab, setTab] = useState<'mine' | 'library'>('mine')
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    courseId: '',
    publicEnabled: false,
    expiresAt: '',
    packageId: '',
    packageProfile: 'standard' as ReportPackageProfile,
    protocolId: '',
    protocolProfile: 'standard' as AnalysisProtocolProfile,
  })
  const [error, setError] = useState<string | null>(null)

  const teachingCourses = courses.filter((course) => !course.isLibrary && course.creatorId === user?.id)
  const createCourses = isAdmin ? courses : teachingCourses
  const selectedCreateCourse = createCourses.find((course) => course.id === form.courseId)
  const selectedProtocol = protocols.find((protocol) => `${protocol.key}/${protocol.version}` === form.protocolId)
  const selectedPackage = reportPackages.find((pkg) => `${pkg.key}/${pkg.version}` === form.packageId)

  const load = async () => {
    try {
      const [compositeRes, libraryRes, coursesRes, protocolRes, packageRes] = await Promise.all([
        compositeApi.list(),
        compositeApi.listLibrary(),
        apiClient.get<{ list: CourseOption[] }>('/courses?status=all&page=1&pageSize=100'),
        packageCatalogAvailable
          ? Promise.resolve({ code: 0, data: { list: [] as AnalysisProtocolCatalogItem[] }, message: '' })
          : compositeApi.listAnalysisProtocols(),
        packageCatalogAvailable
          ? compositeApi.listReportPackages!()
          : Promise.resolve({ code: 0, data: { list: [] } }),
      ])
      if (compositeRes.code === 0 && compositeRes.data) setList(compositeRes.data.list)
      else setError(compositeRes.message || '获取综合测评列表失败')
      if (libraryRes.code === 0 && libraryRes.data) setLibrary(libraryRes.data.list)
      else setError((current) => current || libraryRes.message || '获取管理员模板失败')
      const courseList = coursesRes.code === 0 ? (coursesRes.data?.list || []) : []
      setCourses(courseList)
      if (protocolRes.code === 0 && protocolRes.data) setProtocols(protocolRes.data.list)
      else setError((current) => current || protocolRes.message || '获取综合分析协议失败')
      if (packageRes.code === 0 && packageRes.data) setReportPackages(packageRes.data.list)
      const selectable = isAdmin ? courseList : courseList.filter((course) => !course.isLibrary)
      if (selectable.length === 1) {
        setForm((prev) => prev.courseId ? prev : { ...prev, courseId: selectable[0].id })
      }
    } catch (err) {
      setError((err as { message?: string }).message || '获取综合测评列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const selectedCopyCourse = (templateId: string) => {
    const chosen = copyCourseId[templateId]
    if (chosen) return chosen
    return teachingCourses.length === 1 ? teachingCourses[0].id : ''
  }

  const create = async () => {
    try {
      setSaving(true)
      setError(null)
      if (form.publicEnabled && !form.expiresAt) {
        throw new Error('请填写公开作答的有效期')
      }
      if ((selectedProtocol || selectedPackage) && !form.courseId) {
        throw new Error('报告包必须绑定课程')
      }
      const response = await compositeApi.create({
        code: form.code,
        name: form.name,
        description: form.description,
        publicEnabled: form.publicEnabled,
        courseId: form.courseId || null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        reportPackage: selectedPackage
          ? { key: selectedPackage.key, version: selectedPackage.version, profile: form.packageProfile }
          : null,
        // Keep the legacy field only for old locally published protocols. New
        // package clients omit it entirely so the external contract has one
        // fixed-report selector.
        ...(packageCatalogAvailable ? {} : {
          analysisProtocol: !selectedPackage && selectedProtocol
            ? {
                key: selectedProtocol.key,
                version: selectedProtocol.version,
                profile: form.protocolProfile,
              }
            : null,
        }),
      })
      if (response.code !== 0 || !response.data) throw new Error(response.message || '创建失败')
      navigate(`/composite-assessments/${response.data.id}`)
    } catch (err) {
      setError((err as { message?: string }).message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  const copyTemplate = async (templateId: string) => {
    const courseId = selectedCopyCourse(templateId)
    if (!courseId) {
      setError('复制管理员模板必须选择自己的授课课')
      return
    }
    try {
      setCopyingId(templateId)
      setError(null)
      const response = await compositeApi.copy(templateId, { courseId })
      if (response.code !== 0 || !response.data?.id) throw new Error(response.message || '复制失败')
      navigate(`/composite-assessments/${response.data.id}`)
    } catch (err) {
      setError((err as { message?: string }).message || '复制失败')
    } finally {
      setCopyingId(null)
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
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-6 w-fit">
        <button
          onClick={() => setTab('mine')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'mine' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          我的
        </button>
        <button
          onClick={() => setTab('library')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
            tab === 'library' ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          管理员模板
          {library.length > 0 && (
            <span className="bg-primary text-white text-xs px-1.5 py-0.5 rounded-full">{library.length}</span>
          )}
        </button>
      </div>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {isAdmin && reportPackages.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="font-semibold text-gray-800">内置报告包目录</h2>
          <p className="text-xs text-gray-500 mt-1 mb-3">包定义由代码版本控制；只有已发布版本可以授权和实例化。</p>
          <div className="space-y-2">
            {reportPackages.map((pkg) => (
              <div key={`${pkg.key}/${pkg.version}`} className="flex items-center justify-between gap-3 border rounded px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{pkg.name} · v{pkg.version}</p>
                  <p className="text-xs text-gray-500">{pkg.status}{pkg.disabledReason ? ` · ${pkg.disabledReason}` : ''}</p>
                </div>
                <button
                  className="btn-secondary text-sm"
                  disabled={pkg.status !== 'PUBLISHED'}
                  onClick={() => setGrantPackage(pkg)}
                >
                  授权教师
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
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
                {createCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}（{course.courseCode}）{course.isLibrary ? ' · 库课程' : ''}
                  </option>
                ))}
              </select>
            </label>
            {createCourses.length === 0 && (
              <p className="text-xs text-amber-600 md:col-span-2">还没有课程。请先在「课程管理」里创建课程，登录学生才能在课内看到这份综合测评。</p>
            )}
            {selectedCreateCourse?.isLibrary && (
              <p className="text-xs text-amber-600 md:col-span-2">库课程上的综合测评不能发给学生作答，只作为管理员模板。</p>
            )}
            {reportPackages.length > 0 && (
              <label className="md:col-span-2 text-sm text-gray-600">
                已授权报告包
                <select
                  aria-label="已授权报告包"
                  className="mt-1 block w-full border rounded px-3 py-2 text-base text-gray-800"
                  value={form.packageId}
                  onChange={(e) => {
                    const pkg = reportPackages.find((item) => `${item.key}/${item.version}` === e.target.value)
                    const profile = pkg?.profiles.includes(form.packageProfile) ? form.packageProfile : pkg?.profiles[0] ?? 'standard'
                    setForm({ ...form, packageId: e.target.value, packageProfile: profile, protocolId: '' })
                  }}
                >
                  <option value="">仅收集：自由添加模块，只显示单项结果</option>
                  {reportPackages.map((pkg) => (
                    <option key={`${pkg.key}/${pkg.version}`} value={`${pkg.key}/${pkg.version}`} disabled={pkg.status !== 'PUBLISHED'}>
                      {pkg.name} · v{pkg.version}{pkg.status !== 'PUBLISHED' ? '（尚未开放）' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selectedPackage && (
              <div className="md:col-span-2 rounded border border-emerald-100 bg-emerald-50 p-3 text-sm">
                <p className="font-medium text-gray-800">{selectedPackage.name}</p>
                <p className="text-gray-600 mt-1">{selectedPackage.description}</p>
                <p className="text-gray-600 mt-2">
                  固定槽位：{[...selectedPackage.slots].sort((a, b) => a.position - b.position).map((slot) => slot.label).join(' · ')}
                </p>
                <label className="mt-3 block text-gray-600">
                  测验档位
                  <select
                    aria-label="报告包档位"
                    className="mt-1 block w-full border rounded bg-white px-3 py-2 text-base text-gray-800"
                    value={form.packageProfile}
                    onChange={(e) => setForm({ ...form, packageProfile: e.target.value as ReportPackageProfile })}
                  >
                    {selectedPackage.profiles.map((profile) => {
                      const minutes = selectedPackage.estimatedMinutes[profile]
                      return <option key={profile} value={profile}>{profile === 'standard' ? '标准档' : '科研档'} · 约 {minutes[0]}–{minutes[1]} 分钟</option>
                    })}
                  </select>
                </label>
                <p className="text-xs text-emerald-700 mt-2">该包由管理员授权；创建后固定槽位、版本和报告定义不可改写。</p>
              </div>
            )}
            {!packageCatalogAvailable && <>
              <label className="md:col-span-2 text-sm text-gray-600">
                报告模式
                <select
                  aria-label="报告模式"
                  className="mt-1 block w-full border rounded px-3 py-2 text-base text-gray-800"
                  value={selectedPackage ? '' : form.protocolId}
                  onChange={(e) => {
                    const protocol = protocols.find((item) => `${item.key}/${item.version}` === e.target.value)
                    const profile = protocol?.profiles.includes(form.protocolProfile)
                      ? form.protocolProfile
                      : protocol?.profiles[0] ?? 'standard'
                    setForm({ ...form, protocolId: e.target.value, protocolProfile: profile, packageId: '' })
                  }}
                >
                  <option value="">仅收集：自由添加模块，只显示单项结果</option>
                  {protocols.map((protocol) => (
                    <option
                      key={`${protocol.key}/${protocol.version}`}
                      value={`${protocol.key}/${protocol.version}`}
                      disabled={protocol.status !== 'PUBLISHED'}
                    >
                      {protocol.name} · v{protocol.version}{protocol.status !== 'PUBLISHED' ? '（尚未开放）' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {selectedProtocol && (
              <div className="md:col-span-2 rounded border border-blue-100 bg-blue-50 p-3 text-sm">
                <p className="font-medium text-gray-800">{selectedProtocol.name}</p>
                <p className="text-gray-600 mt-1">{selectedProtocol.description}</p>
                <p className="text-gray-600 mt-2">
                  固定任务：{[...selectedProtocol.cognitiveSlots]
                    .sort((a, b) => a.position - b.position)
                    .map((slot) => slot.label)
                    .join(' · ')}
                </p>
                <label className="mt-3 block text-gray-600">
                  测验档位
                  <select
                    aria-label="测验档位"
                    className="mt-1 block w-full border rounded bg-white px-3 py-2 text-base text-gray-800"
                    value={form.protocolProfile}
                    onChange={(e) => setForm({ ...form, protocolProfile: e.target.value as AnalysisProtocolProfile })}
                  >
                    {selectedProtocol.profiles.map((profile) => {
                      const minutes = selectedProtocol.estimatedMinutes[profile]
                      return (
                        <option key={profile} value={profile}>
                          {profile === 'standard' ? '标准档' : '科研档'} · 约 {minutes[0]}–{minutes[1]} 分钟
                        </option>
                      )
                    })}
                  </select>
                </label>
                <p className="text-xs text-blue-700 mt-2">创建后任务及顺序固定；发布时冻结协议和各任务版本。</p>
              </div>
              )}
              {!selectedProtocol && !selectedPackage && protocols.some((protocol) => protocol.status !== 'PUBLISHED') && (
                <p className="md:col-span-2 text-xs text-gray-500">
                  尚未开放的分析协议会在任务和分析规则通过发布验收后启用。
                </p>
              )}
            </>}
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
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="datetime-local"
                  className="border rounded px-3 py-2 text-base text-gray-800"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                />
                <span>有效期</span>
              </label>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => void create()}
              disabled={saving || !form.code.trim() || !form.name.trim() || Boolean((selectedProtocol || selectedPackage) && !form.courseId)}
              className="btn-primary"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">取消</button>
          </div>
        </div>
      )}
      {tab === 'mine' ? (
        list.length === 0 ? (
          <div className="card p-10 text-center text-gray-500">还没有综合测评模板</div>
        ) : (
          <div className="grid gap-4">
            {list.map((item) => (
              <div key={item.id} className="card p-5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-gray-800">{item.name}</h2>
                    {item.course?.isLibrary && (
                      <span className="px-2 py-0.5 text-xs rounded bg-indigo-100 text-indigo-700">库课程</span>
                    )}
                    {item.copyable && (
                      <span className="px-2 py-0.5 text-xs rounded bg-emerald-100 text-emerald-700">可复制</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{item.code} · {item.itemCount || 0} 个模块 · {item.status}</p>
                  <p className="text-sm text-gray-600 mt-1">已开始 {item.attemptCounts?.started ?? 0} · 已完成 {item.attemptCounts?.completed ?? 0}</p>
                  {item.course && <p className="text-xs text-gray-400 mt-1">课程：{item.course.title}{item.course.courseCode ? `（${item.course.courseCode}）` : ''}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => navigate(`/composite-assessments/${item.id}/results`)} className="btn-secondary">结果</button>
                  <button onClick={() => navigate(`/composite-assessments/${item.id}`)} className="btn-secondary">
                    <Settings className="w-4 h-4 inline mr-1" />配置
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : library.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">暂无管理员模板</div>
      ) : (
        <div className="grid gap-4">
          {teachingCourses.length === 0 && (
            <p className="text-sm text-amber-600">复制管理员模板必须换绑自己的授课课。请先在「课程管理」创建课程。</p>
          )}
          {library.map((item) => {
            const courseId = selectedCopyCourse(item.id)
            return (
              <div key={item.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-gray-800">{item.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">{item.code}</p>
                    {item.description && <p className="text-sm text-gray-600 mt-1">{item.description}</p>}
                    <p className="text-sm text-gray-600 mt-2">{moduleSummary(item.items)}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-col md:flex-row md:items-end gap-3">
                  <label className="text-sm text-gray-600 flex-1">
                    复制到我的课程
                    <select
                      className="mt-1 block w-full border rounded px-3 py-2 text-base text-gray-800"
                      value={courseId}
                      onChange={(e) => setCopyCourseId((current) => ({ ...current, [item.id]: e.target.value }))}
                    >
                      <option value="">请选择授课课</option>
                      {teachingCourses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}（{course.courseCode}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() => void copyTemplate(item.id)}
                    disabled={!courseId || copyingId === item.id}
                    className="btn-primary shrink-0"
                  >
                    <Copy className="w-4 h-4 inline mr-1" />
                    {copyingId === item.id ? '复制中...' : '复制到我的课程'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {grantPackage && (
        <MaterialGrantModal
          resourceType="REPORT_PACKAGE"
          resourceId={`${grantPackage.key}@${grantPackage.version}`}
          resourceName={`${grantPackage.name} · v${grantPackage.version}`}
          onClose={() => setGrantPackage(null)}
        />
      )}
    </div>
  )
}

export default CompositeAssessmentList
