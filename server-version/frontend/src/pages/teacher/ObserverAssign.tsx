import { useMemo, useState } from 'react'
import type { RelationalProduct, RelationalProductRef } from '../../api/relational'

export type RosterStudent = {
  studentUserId: string
  displayName: string
  approvedParents: Array<{ parentUserId: string; displayName: string }>
}

type Props = {
  catalog: RelationalProduct[]
  roster: RosterStudent[]
  onAssignToParent: (input: {
    product: RelationalProductRef
    studentUserId: string
    parentUserId: string
  }) => void
  onTeacherObserver: (input: { product: RelationalProductRef; studentUserId: string }) => void
  disabled?: boolean
}

const productId = (product: RelationalProductRef) => (
  `${product.resourceKind}:${product.resourceKey}:${product.resourceVersion}`
)

export default function ObserverAssign({
  catalog,
  roster,
  onAssignToParent,
  onTeacherObserver,
  disabled = false,
}: Props) {
  const parentProducts = useMemo(() => catalog.filter((row) => (
    row.perspectives.includes('OBSERVER_REPORT')
    && row.analysisMode === 'INDIVIDUAL_ONLY'
  )), [catalog])
  const teacherProducts = parentProducts
  const [studentUserId, setStudentUserId] = useState(roster[0]?.studentUserId ?? '')
  const student = roster.find((row) => row.studentUserId === studentUserId)
  const [parentUserId, setParentUserId] = useState(student?.approvedParents[0]?.parentUserId ?? '')
  const [parentProductId, setParentProductId] = useState(parentProducts[0] ? productId(parentProducts[0]) : '')
  const [teacherProductId, setTeacherProductId] = useState(teacherProducts[0] ? productId(teacherProducts[0]) : '')
  const parentProduct = parentProducts.find((item) => productId(item) === parentProductId)
  const teacherProduct = teacherProducts.find((item) => productId(item) === teacherProductId)

  return (
    <div className="space-y-6" data-testid="teacher-observer-assign">
      <header>
        <h2 className="text-lg font-semibold text-gray-900">教师分配观察测评</h2>
        <p className="mt-2 text-sm text-gray-600">
          仅能为当前课程 roster 学生和 ACTIVE 亲子关系发起任务；身份、关系与 consent 都由服务端重新校验。
        </p>
      </header>

      {roster.length === 0 ? (
        <p className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">当前课程没有 ACTIVE/APPROVED 学生。</p>
      ) : (
        <>
          <label className="block text-sm font-medium text-gray-700">
            课程学生
            <select
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              value={studentUserId}
              onChange={(event) => {
                const next = event.target.value
                setStudentUserId(next)
                const nextStudent = roster.find((row) => row.studentUserId === next)
                setParentUserId(nextStudent?.approvedParents[0]?.parentUserId ?? '')
              }}
            >
              {roster.map((row) => (
                <option key={row.studentUserId} value={row.studentUserId}>{row.displayName}</option>
              ))}
            </select>
          </label>

          <section className="space-y-3 rounded border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800">分配给获批家长</h3>
            {(student?.approvedParents.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-600">该学生当前没有 ACTIVE 的家长关系。</p>
            ) : (
              <>
                <select className="w-full rounded border border-gray-300 px-3 py-2" value={parentUserId} onChange={(event) => setParentUserId(event.target.value)}>
                  {(student?.approvedParents ?? []).map((parent) => (
                    <option key={parent.parentUserId} value={parent.parentUserId}>{parent.displayName}</option>
                  ))}
                </select>
                <select className="w-full rounded border border-gray-300 px-3 py-2" value={parentProductId} onChange={(event) => setParentProductId(event.target.value)}>
                  {parentProducts.map((item) => <option key={productId(item)} value={productId(item)}>{item.title} · {item.resourceVersion}</option>)}
                </select>
                <button
                  type="button"
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={disabled || !studentUserId || !parentUserId || !parentProduct}
                  onClick={() => parentProduct && onAssignToParent({ product: parentProduct, studentUserId, parentUserId })}
                >
                  向家长发送观察任务
                </button>
              </>
            )}
          </section>

          <section className="space-y-3 rounded border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800">教师观察（本人作答）</h3>
            {teacherProducts.length === 0 ? (
              <p className="text-sm text-gray-600">当前没有已发布的教师观察内容。</p>
            ) : (
              <>
                <select className="w-full rounded border border-gray-300 px-3 py-2" value={teacherProductId} onChange={(event) => setTeacherProductId(event.target.value)}>
                  {teacherProducts.map((item) => <option key={productId(item)} value={productId(item)}>{item.title} · {item.resourceVersion}</option>)}
                </select>
                <button
                  type="button"
                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={disabled || !studentUserId || !teacherProduct}
                  onClick={() => teacherProduct && onTeacherObserver({ product: teacherProduct, studentUserId })}
                >
                  创建教师观察任务
                </button>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
