/**
 * Parent observer self-serve UI shell.
 * Parent may start PUBLISHED parent-observer bundles for bound children.
 * Results default private; explicit share to current authorized course lead only.
 * Must not display child self-report, other parents, teacher raw answers, or cross-informant averages.
 */
import { useMemo, useState } from 'react'

export type ParentObserverCatalogItem = {
  bundleKey: string
  name: string
  allowsParentSelfServe: boolean
  releaseStatus: 'PUBLISHED' | 'DRAFT' | 'HOLD'
}

export type BoundChild = {
  studentUserId: string
  displayName: string
}

type Props = {
  catalog: ParentObserverCatalogItem[]
  childrenBound: BoundChild[]
  onStart: (input: { bundleKey: string; studentUserId: string }) => void
  onShare?: (input: { assignmentId: string; courseLeadUserId: string }) => void
  privateAssignments?: Array<{ assignmentId: string; bundleKey: string; studentUserId: string }>
  courseLeadUserId?: string | null
}

export default function ObserverSelfServe({
  catalog,
  childrenBound,
  onStart,
  onShare,
  privateAssignments = [],
  courseLeadUserId = null,
}: Props) {
  const published = useMemo(
    () => catalog.filter((row) => row.releaseStatus === 'PUBLISHED' && row.allowsParentSelfServe),
    [catalog],
  )
  const [studentUserId, setStudentUserId] = useState(childrenBound[0]?.studentUserId ?? '')
  const [bundleKey, setBundleKey] = useState(published[0]?.bundleKey ?? '')

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6" data-testid="parent-observer-self-serve">
      <header>
        <h1 className="text-xl font-semibold text-gray-900">家长观察测评（自助）</h1>
        <p className="mt-2 text-sm text-gray-600">
          仅为已绑定孩子发起；结果默认仅自己可见。不会展示孩子自评、其他家长或教师原始答案，也不提供跨观察者综合平均分。
        </p>
      </header>

      <section className="space-y-3 rounded border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700">
          选择孩子
          <select
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            value={studentUserId}
            onChange={(event) => setStudentUserId(event.target.value)}
          >
            {childrenBound.map((child) => (
              <option key={child.studentUserId} value={child.studentUserId}>
                {child.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          选择已发布观察量表
          <select
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            value={bundleKey}
            onChange={(event) => setBundleKey(event.target.value)}
          >
            {published.map((item) => (
              <option key={item.bundleKey} value={item.bundleKey}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!studentUserId || !bundleKey}
          onClick={() => onStart({ bundleKey, studentUserId })}
        >
          为孩子发起观察测评
        </button>
      </section>

      {privateAssignments.length > 0 && (
        <section className="space-y-2 rounded border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">私有结果（可显式分享给当前课程负责人）</h2>
          <ul className="space-y-2 text-sm text-amber-900">
            {privateAssignments.map((row) => (
              <li key={row.assignmentId} className="flex items-center justify-between gap-3">
                <span>
                  {row.bundleKey} · 孩子 {row.studentUserId}
                </span>
                <button
                  type="button"
                  className="rounded border border-amber-400 px-2 py-1 disabled:opacity-50"
                  disabled={!courseLeadUserId || !onShare}
                  onClick={() => courseLeadUserId && onShare?.({ assignmentId: row.assignmentId, courseLeadUserId })}
                >
                  分享给课程负责人
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
