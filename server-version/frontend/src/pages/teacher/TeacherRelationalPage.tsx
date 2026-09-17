import { useCallback, useEffect, useMemo, useState } from 'react'
import apiClient from '../../api/client'
import {
  relationalApi,
  type RelationalCohortReport,
  type RelationalProduct,
  type RelationalTask,
  type TeacherRoster,
} from '../../api/relational'
import RelationalTaskList from '../../components/relational/RelationalTaskList'
import { PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'
import ObserverAssign from './ObserverAssign'

type CourseSummary = { id: string; title: string }

const metricLabel = (key: string) => key.split('_').join(' ')

export default function TeacherRelationalPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [courseId, setCourseId] = useState('')
  const [roster, setRoster] = useState<TeacherRoster | null>(null)
  const [catalog, setCatalog] = useState<RelationalProduct[]>([])
  const [tasks, setTasks] = useState<RelationalTask[]>([])
  const [cohortReports, setCohortReports] = useState<RelationalCohortReport[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cohortProducts = useMemo(
    () => catalog.filter((product) => product.journeys.includes('TEACHER_COHORT_REPORT')),
    [catalog],
  )

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

  const loadCohortReports = useCallback(async (nextCourseId: string, products: RelationalProduct[]) => {
    const reportProducts = products.filter((product) => product.journeys.includes('TEACHER_COHORT_REPORT'))
    if (!nextCourseId || reportProducts.length === 0) {
      setCohortReports([])
      return
    }
    setCohortReports(await Promise.all(
      reportProducts.map((product) => relationalApi.cohortReport(nextCourseId, product)),
    ))
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
        if (initialCourseId) {
          await Promise.all([
            loadRoster(initialCourseId),
            loadCohortReports(initialCourseId, nextCatalog),
          ])
        }
      } catch (err) {
        setError((err as { message?: string }).message || '关系测评数据加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [loadCohortReports, loadRoster])

  const changeCourse = async (nextCourseId: string) => {
    try {
      setCourseId(nextCourseId)
      setError(null)
      await Promise.all([
        loadRoster(nextCourseId),
        loadCohortReports(nextCourseId, catalog),
      ])
    } catch (err) {
      setError((err as { message?: string }).message || '课程关系测评数据加载失败')
    }
  }

  return <ProductPage width="reading">
    <PageHeader title="关系测评" description="教师可以向 ACTIVE 家长关系分配观察任务，或作为 respondent 完成教师观察。Student→Teacher 仅以满足最低样本量后的群体结果呈现。" />
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

        <section className="space-y-3" data-testid="relational-cohort-reports">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">课堂体验群体报告</h2>
            <p className="mt-1 text-sm text-gray-600">只显示达到内容冻结最低样本量后的群体汇总；不会显示学生身份或个人评分。</p>
          </div>
          {cohortProducts.length === 0 ? (
            <p className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">当前没有已发布的 Student→Teacher 群体内容。</p>
          ) : cohortReports.map((report) => (
            <article key={`${report.resourceKind}:${report.resourceKey}:${report.resourceVersion}`} className="rounded border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900">{report.title}</h3>
              {report.state === 'EMPTY' && (
                <p className="mt-2 text-sm text-gray-600">当前尚无可形成群体报告的已完成作答。最低样本量为 {report.minimumRespondents}。</p>
              )}
              {report.state === 'INSUFFICIENT' && (
                <p className="mt-2 text-sm text-gray-600">有效 respondent 尚未达到最低 {report.minimumRespondents} 人。阈值前不显示精确参与人数。</p>
              )}
              {report.state === 'AWAITING_ANALYSIS' && (
                <p className="mt-2 text-sm text-gray-600">已达到隐私阈值，权威 aggregate snapshot 尚未生成或尚不可用。</p>
              )}
              {report.state === 'READY' && report.snapshot && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-500">有效 respondent：{report.snapshot.respondentCount} · policy {report.snapshot.policyKey} {report.snapshot.policyVersion}</p>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(report.snapshot.metrics).map(([key, metric]) => (
                      <div key={key} className="rounded bg-gray-50 p-3">
                        <dt className="text-xs font-medium text-gray-600">{metricLabel(key)}</dt>
                        <dd className="mt-1 text-sm text-gray-900">
                          {metric.state === 'present'
                            ? `均值 ${metric.mean.toFixed(2)} · N=${metric.validN}`
                            : `该指标有效 N=${metric.validN}，未达到最低样本量`}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </article>
          ))}
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
