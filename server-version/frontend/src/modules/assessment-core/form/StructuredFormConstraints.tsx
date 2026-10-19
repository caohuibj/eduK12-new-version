import type { FormQuestion } from './types'
type Constraints = Pick<FormQuestion<never>, 'type' | 'total' | 'integerOnly' | 'minSelections' | 'maxSelections'>
/** Product-independent structured answer constraints; the shared server schema is authoritative. */
export function StructuredFormConstraints({ question: q, onChange }: { question: Constraints; onChange: (patch: Partial<Constraints>) => void }) {
  return <>
    {q.type === 'CONSTANT_SUM' && <div className="grid sm:grid-cols-2 gap-3">
      <label className="block text-sm">指定总和
        <input className="input block w-full" type="number" min="0" step="any"
          value={q.total ?? 100} onChange={e => onChange({ total: Number(e.target.value) })} /></label>
      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox"
        checked={q.integerOnly === true} onChange={e => onChange({ integerOnly: e.target.checked })} />每项必须为整数</label>
    </div>}
    {['MULTIPLE', 'MATRIX_MULTIPLE'].includes(q.type) && <div className="grid sm:grid-cols-2 gap-3">
      {(['minSelections', 'maxSelections'] as const).map(key => <label className="block text-sm" key={key}>
        {key === 'minSelections' ? '最少选择' : '最多选择'}（留空不限）
        <input className="input block w-full" type="number" min="1" max="30" step="1"
          value={q[key] ?? ''} onChange={e => onChange({ [key]: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>)}
    </div>}
  </>
}
