import { useCallback, useEffect, useState } from 'react'
import apiClient from '../../api/client'
import { relationalApi, type RelationalProduct, type RelationalTask, type TeacherRoster } from '../../api/relational'
import RelationalTaskList from '../../components/relational/RelationalTaskList'
import { PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'
import ObserverAssign from './ObserverAssign'

type CourseSummary = { id: string; title: string }

export default function TeacherRelationalPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [courseId, setCourseId] = useState('')
  const [roster, setRoster] = useState<TeacherRoster | null>(null)
  const [catalog, setCatalog] = useState<RelationalProduct[]>([])
  const [tasks, setTasks] = useState<RelationalTask[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshTasks = useCallback(async () => {
    setTasks(await relationalApi.tasks())
  }, [])

  const loadRoster = useCallback(async (nextCourseId: string) => {
    if (!nextCourseId) {
      setRoster(null)
      return
    }
    setRoster(await relationalApi.teacherRoster(nextCourseId))
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true)
        setError(null)
        const [courseResponse, nextCatalog, nextTasks] = await Promise.all([
          apiClient.get<{ list: CourseSummary[] }>('/courses'),
          relationalApi.catalog(),
          relationalApi.tasks(),
        ])
        const nextCourses = courseResponse.data.list
        const initialCourseId = nextCourses[0]?.id ?? ''
        setCourses(nextCourses)
        setCourseId(initialCourseId)
        setCatalog(nextCatalog)
        setTasks(nextTasks)
        if (initialCourseId) await loadRoster(initialCourseId)
      } catch (err) {
        setError((err as { message?: string }).message || '关系测评数据加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [loadRoster])

  const changeCourse = async (nextCourseId: string) => {
    try {
      setCourseId(nextCourseId)
      setError(null)
      await loadRoster(nextCourseId)
    } catch (err) {
      setError((err as { message?: string }).message || '课程 roster 加载失败')
    }
  }

  return <ProductPage width="reading">
    <PageHeader title="关系测评" description="教师可以向 ACTIVE 家长关系分配观察任务，或作为 respondent 完成教师观察。Student→Teacher 的结果不会在这里以个人评分展示。" />
    {loading ? <ProductStatus kind="info" title="加载中">正在读取课程、任务和已发布内容。</ProductStatus> : error ? (
      <ProductStatus kind="error" title="操作失败">{error}</ProductStatus>
    ) : (
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">我的 respondent 任务</h2>
          <RelationalTaskList tasks={tasks} onRefresh={refreshTasks} />
        </section>

        <section className="space-y-3 rounded border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700">
            选择课程
            <select
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              value={courseId}
              onChange={(event) => void changeCourse(event.target.value)}
            >
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
          {courses.length === 0 && <p className="text-sm text-gray-600">当前没有可管理课程。</p>}
        </section>

        {courseId && roster && (
          <ObserverAssign
            catalog={catalog}
            roster={roster.roster}
            disabled={busy}
            onAssignToParent={({ product, studentUserId, parentUserId }) => {
              void (async () => {
                try {
                  setBusy(true)
                  setError(null)
                  await relationalApi.issueTeacherParent({ courseId, studentUserId, parentUserId, product })
                } catch (err) {
                  setError((err as { message?: string }).message || '无法分配家长观察任务')
                } finally {
                  setBusy(false)
                }
              })()
            }}
            onTeacherObserver={({ product, studentUserId }) => {
              void (async () => {
                try {
                  setBusy(true)
                  setError(null)
                  await relationalApi.issueTeacherObserver({ courseId, studentUserId, product })
                  await refreshTasks()
                } catch (err) {
                  setError((err as { message?: string }).message || '无法创建教师观察任务')
                } finally {
                  setBusy(false)
                }
              })()
            }}
          />
        )}
      </div>
    )}
  </ProductPage>
}
