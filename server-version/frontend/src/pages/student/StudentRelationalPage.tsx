import { useCallback, useEffect, useMemo, useState } from 'react'
import { relationalApi, type RelationalProduct, type RelationalTask, type StudentCourseContext } from '../../api/relational'
import RelationalTaskList from '../../components/relational/RelationalTaskList'
import { PageHeader, ProductPage, ProductStatus } from '../../components/product-ui'

const productId = (product: RelationalProduct) => (
  `${product.resourceKind}:${product.resourceKey}:${product.resourceVersion}`
)

export default function StudentRelationalPage() {
  const [catalog, setCatalog] = useState<RelationalProduct[]>([])
  const [courses, setCourses] = useState<StudentCourseContext[]>([])
  const [tasks, setTasks] = useState<RelationalTask[]>([])
  const [courseId, setCourseId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const experienceProducts = useMemo(
    () => catalog.filter((product) => product.journeys.includes('STUDENT_EXPERIENCE')),
    [catalog],
  )
  const selectedProduct = experienceProducts.find((product) => productId(product) === selectedProductId)

  const refreshTasks = useCallback(async () => {
    setTasks(await relationalApi.tasks())
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true)
        setError(null)
        const [nextCatalog, nextCourses, nextTasks] = await Promise.all([
          relationalApi.catalog(),
          relationalApi.studentCourses(),
          relationalApi.tasks(),
        ])
        setCatalog(nextCatalog)
        setCourses(nextCourses)
        setTasks(nextTasks)
        setCourseId(nextCourses[0]?.courseId ?? '')
        const firstExperience = nextCatalog.find((product) => product.journeys.includes('STUDENT_EXPERIENCE'))
        setSelectedProductId(firstExperience ? productId(firstExperience) : '')
      } catch (err) {
        setError((err as { message?: string }).message || '关系测评数据加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return <ProductPage width="reading">
    <PageHeader title="课堂与关系体验" description="你可以针对当前课程完成课堂/教学环境体验测评。面向教师的结果只以满足最低样本量后的群体汇总呈现，不展示你的个人评分。" />
    {loading ? <ProductStatus kind="info" title="加载中">正在读取课程、任务和已发布内容。</ProductStatus> : error ? (
      <ProductStatus kind="error" title="操作失败">{error}</ProductStatus>
    ) : (
      <div className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">我的任务</h2>
          <RelationalTaskList tasks={tasks} onRefresh={refreshTasks} />
        </section>

        <section className="space-y-4 rounded border border-gray-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">开始一次课堂体验测评</h2>
            <p className="mt-1 text-sm text-gray-600">教师身份由课程创建者关系自动确定，前端不能自行选择被评价教师。</p>
          </div>
          {courses.length === 0 || experienceProducts.length === 0 ? (
            <p className="text-sm text-gray-600">
              {courses.length === 0 ? '当前没有 ACTIVE/APPROVED 课程。' : '当前没有已发布的 Student→Teacher 体验内容。'}
            </p>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700">
                课程
                <select className="mt-1 w-full rounded border border-gray-300 px-3 py-2" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                  {courses.map((course) => (
                    <option key={course.courseId} value={course.courseId}>{course.title} · {course.teacher.displayName}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                测评内容
                <select className="mt-1 w-full rounded border border-gray-300 px-3 py-2" value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
                  {experienceProducts.map((product) => (
                    <option key={productId(product)} value={productId(product)}>{product.title} · {product.resourceVersion}</option>
                  ))}
                </select>
              </label>
              {selectedProduct?.minimumRespondents && (
                <p className="text-xs text-gray-600">该内容要求至少 {selectedProduct.minimumRespondents} 名有效 respondent 才能形成教师可见的群体汇总。</p>
              )}
              <button
                type="button"
                className="w-fit rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={busy || !courseId || !selectedProduct}
                onClick={() => selectedProduct && void (async () => {
                  try {
                    setBusy(true)
                    setError(null)
                    await relationalApi.issueStudentExperience({ courseId, product: selectedProduct })
                    await refreshTasks()
                  } catch (err) {
                    setError((err as { message?: string }).message || '无法创建课堂体验任务')
                  } finally {
                    setBusy(false)
                  }
                })()}
              >
                创建任务
              </button>
            </>
          )}
        </section>
      </div>
    )}
  </ProductPage>
}
