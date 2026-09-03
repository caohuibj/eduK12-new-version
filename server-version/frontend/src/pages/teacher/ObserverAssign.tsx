/**
 * Teacher observer assignment UI shell.
 * Assign independent observer tasks to approved parents, or start teacher-report
 * for roster students. Does not synthesize SELF/PARENT/TEACHER averages.
 */
import { useState } from 'react'

export type TeacherObserverCatalogItem = {
  bundleKey: string
  name: string
  respondentType: 'PARENT' | 'TEACHER'
  releaseStatus: 'PUBLISHED' | 'DRAFT' | 'HOLD'
}

export type RosterStudent = {
  studentUserId: string
  displayName: string
  approvedParents: Array<{ parentUserId: string; displayName: string }>
}

type Props = {
  catalog: TeacherObserverCatalogItem[]
  roster: RosterStudent[]
  onAssignToParent: (input: {
    bundleKey: string
    studentUserId: string
    parentUserId: string
  }) => void
  onTeacherSelfReport: (input: { bundleKey: string; studentUserId: string }) => void
}

export default function ObserverAssign({
  catalog,
  roster,
  onAssignToParent,
  onTeacherSelfReport,
}: Props) {
  const published = catalog.filter((row) => row.releaseStatus === 'PUBLISHED')
  const parentBundles = published.filter((row) => row.respondentType === 'PARENT')
  const teacherBundles = published.filter((row) => row.respondentType === 'TEACHER')
  const [studentUserId, setStudentUserId] = useState(roster[0]?.studentUserId ?? '')
  const student = roster.find((row) => row.studentUserId === studentUserId)
  const [parentUserId, setParentUserId] = useState(student?.approvedParents[0]?.parentUserId ?? '')
  const [parentBundleKey, setParentBundleKey] = useState(parentBundles[0]?.bundleKey ?? '')
  const [teacherBundleKey, setTeacherBundleKey] = useState(teacherBundles[0]?.bundleKey ?? '')

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6" data-testid="teacher-observer-assign">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">教师分配观察测评</h1>
        <p className="mt-2 text-sm text-gray-600">
          可为获批家长生成独立观察任务，或完成教师观察。本版本不提供跨 informant 综合或平均分。
        </p>
      </header>

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
            <option key={row.studentUserId} value={row.studentUserId}>
              {row.displayName}
            </option>
          ))}
        </select>
      </label>

      <section className="space-y-3 rounded border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-800">分配给获批家长</h2>
        <select
          className="w-full rounded border border-gray-300 px-3 py-2"
          value={parentUserId}
          onChange={(event) => setParentUserId(event.target.value)}
        >
          {(student?.approvedParents ?? []).map((parent) => (
            <option key={parent.parentUserId} value={parent.parentUserId}>
              {parent.displayName}
            </option>
          ))}
        </select>
        <select
          className="w-full rounded border border-gray-300 px-3 py-2"
          value={parentBundleKey}
          onChange={(event) => setParentBundleKey(event.target.value)}
        >
          {parentBundles.map((item) => (
            <option key={item.bundleKey} value={item.bundleKey}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!studentUserId || !parentUserId || !parentBundleKey}
          onClick={() => onAssignToParent({ bundleKey: parentBundleKey, studentUserId, parentUserId })}
        >
          向家长发送观察任务
        </button>
      </section>

      <section className="space-y-3 rounded border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-800">教师观察（本人作答）</h2>
        <select
          className="w-full rounded border border-gray-300 px-3 py-2"
          value={teacherBundleKey}
          onChange={(event) => setTeacherBundleKey(event.target.value)}
        >
          {teacherBundles.map((item) => (
            <option key={item.bundleKey} value={item.bundleKey}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!studentUserId || !teacherBundleKey}
          onClick={() => onTeacherSelfReport({ bundleKey: teacherBundleKey, studentUserId })}
        >
          开始教师观察
        </button>
      </section>
    </div>
  )
}
