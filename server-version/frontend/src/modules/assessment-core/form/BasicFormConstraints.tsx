import type { FormQuestion } from './types'
type Constraints = Pick<FormQuestion<never>, 'type' | 'min' | 'max' | 'step' | 'integerOnly' | 'precision' | 'maxLength' | 'timeZone'>
/** No product credentials, image endpoints or publication side effects. */
export function BasicFormConstraints({ question: q, onChange }: { question: Constraints; onChange: (patch: Partial<Constraints>) => void }) {
  return <>
    {['NUMBER', 'SLIDER'].includes(q.type) && <div className="grid sm:grid-cols-2 gap-3">
      <label className="text-sm inline-flex gap-2 items-center"><input type="checkbox" checked={q.integerOnly === true}
        onChange={e => onChange({ integerOnly: e.target.checked, precision: e.target.checked ? 0 : q.precision,
          step: e.target.checked && q.step !== undefined && !Number.isInteger(q.step) ? undefined : q.step })} />只允许整数</label>
      <label className="block text-sm">步长（留空表示任意）<input className="input block w-full" type="number" min="0" step="any"
        value={q.step ?? ''} onChange={e => onChange({ step: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
      <label className="block text-sm">最大小数位（留空表示不限制）<input className="input block w-full" type="number" min="0" max="8" step="1"
        disabled={q.integerOnly} value={q.precision ?? ''} onChange={e => onChange({ precision: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
      {(['min', 'max'] as const).map(key => <label className="block text-sm" key={key}>{key === 'min' ? '最小值' : '最大值'}
        <input className="input block w-full" type="number" step="any" value={q[key] ?? ''}
          onChange={e => onChange({ [key]: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>)}
    </div>}
    {q.type === 'TIME' && <label className="block text-sm">时间时区<select className="input block" value={q.timeZone ?? 'Asia/Shanghai'}
      onChange={e => onChange({ timeZone: e.target.value as 'UTC' | 'Asia/Shanghai' })}>
      <option value="Asia/Shanghai">中国标准时间（UTC+08:00）</option><option value="UTC">UTC</option></select></label>}
    {['SHORT_TEXT', 'LONG_TEXT'].includes(q.type) && <label className="block text-sm">字数上限<input className="input block" type="number" min="1" max="10000"
      value={q.maxLength ?? ''} onChange={e => onChange({ maxLength: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>}
  </>
}
