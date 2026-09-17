import { useMemo, useState } from 'react'
import type { RelationalProduct, RelationalProductRef } from '../../api/relational'

export type BoundChild = {
  studentUserId: string
  displayName: string
}

type Props = {
  catalog: RelationalProduct[]
  childrenBound: BoundChild[]
  onStart: (input: { product: RelationalProductRef; studentUserId: string }) => void
  disabled?: boolean
}

const productId = (product: RelationalProductRef) => (
  `${product.resourceKind}:${product.resourceKey}:${product.resourceVersion}`
)

export default function ObserverSelfServe({
  catalog,
  childrenBound,
  onStart,
  disabled = false,
}: Props) {
  const published = useMemo(
    () => catalog.filter((row) => (
      row.perspectives.includes('OBSERVER_REPORT')
      && row.analysisMode === 'INDIVIDUAL_ONLY'
    )),
    [catalog],
  )
  const [studentUserId, setStudentUserId] = useState(childrenBound[0]?.studentUserId ?? '')
  const [selectedProductId, setSelectedProductId] = useState(published[0] ? productId(published[0]) : '')
  const selectedProduct = published.find((item) => productId(item) === selectedProductId)

  return (
    <div className="space-y-6" data-testid="parent-observer-self-serve">
      <header>
        <h2 className="text-lg font-semibold text-gray-900">为已绑定孩子发起观察测评</h2>
        <p className="mt-2 text-sm text-gray-600">
          仅能选择系统已发布、且明确允许家长观察的内容。结果默认按内容的可见性策略处理，不会混合孩子自评、其他家长或教师原始答案。
        </p>
      </header>

      {childrenBound.length === 0 || published.length === 0 ? (
        <p className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          {childrenBound.length === 0 ? '当前没有 ACTIVE 的亲子绑定关系。' : '当前没有已发布的家长观察内容。'}
        </p>
      ) : (
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
            选择已发布内容
            <select
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              value={selectedProductId}
              onChange={(event) => setSelectedProductId(event.target.value)}
            >
              {published.map((item) => (
                <option key={productId(item)} value={productId(item)}>
                  {item.title} · {item.resourceVersion}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={disabled || !studentUserId || !selectedProduct}
            onClick={() => selectedProduct && onStart({ product: selectedProduct, studentUserId })}
          >
            发起观察测评
          </button>
        </section>
      )}
    </div>
  )
}
