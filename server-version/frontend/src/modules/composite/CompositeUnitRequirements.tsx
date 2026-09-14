import type { CompositeCurrentItem } from './types'
import { describeCompositeUnitRequirements } from './unit-requirements'

export function CompositeUnitRequirements({ item }: { item: CompositeCurrentItem | null | undefined }) {
  const summary = describeCompositeUnitRequirements(item)

  return (
    <section aria-label="当前单元运行要求" className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <p className="font-medium text-slate-700">当前单元运行要求</p>
      {summary.facts.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
          {summary.facts.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-slate-600">父级冻结数据未声明可展示的设备或输入要求；进入单元后以该 runner 的 readiness 提示为准。</p>
      )}
      {summary.warnings.length > 0 ? (
        <div className="mt-3 space-y-1 text-amber-800">
          {summary.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}
    </section>
  )
}

export default CompositeUnitRequirements
