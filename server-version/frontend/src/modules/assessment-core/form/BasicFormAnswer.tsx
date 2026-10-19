import type { FormQuestion } from './types'

export type BasicFormValue = string | number | null
export type BasicFormQuestion = Pick<FormQuestion<never>, 'prompt' | 'min' | 'max' | 'step' | 'integerOnly' | 'precision' | 'maxLength'> & { type: string; timeZone?: string }

/** Product-neutral controls. Values remain typed in local drafts and FINAL. */
export function BasicFormAnswer({ question: q, value, onChange, disabled = false, className = 'input block w-full', id, describedBy, invalid, placeholder, rows }: {
  question: BasicFormQuestion
  value: BasicFormValue | undefined
  onChange: (value: BasicFormValue) => void
  disabled?: boolean
  className?: string
  id?: string
  describedBy?: string
  invalid?: boolean
  placeholder?: string
  rows?: number
}) {
  const common = { id, className, disabled, 'aria-label': q.prompt, 'aria-describedby': describedBy, 'aria-invalid': invalid }
  if (q.type === 'SHORT_TEXT' || q.type === 'LONG_TEXT') return <textarea {...common}
    rows={rows ?? (q.type === 'SHORT_TEXT' ? 2 : 5)} maxLength={q.maxLength ?? (q.type === 'SHORT_TEXT' ? 300 : 10000)}
    placeholder={placeholder} value={typeof value === 'string' ? value : ''}
    onChange={e => onChange(e.target.value)} />
  if (q.type === 'NUMBER') return <input {...common} type="number" min={q.min} max={q.max}
    step={q.step ?? (q.integerOnly ? 1 : 'any')} placeholder={placeholder}
    value={typeof value === 'number' && Number.isFinite(value) ? value : ''}
    onChange={e => onChange(e.target.value === '' || !Number.isFinite(e.target.valueAsNumber) ? null : e.target.valueAsNumber)} />
  if (q.type === 'DATE' || q.type === 'TIME') return <div className="space-y-1">
    <input {...common} type={q.type === 'DATE' ? 'date' : 'time'}
      value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value || null)} />
    {q.type === 'TIME' && <p className="text-xs text-slate-600">时间解释时区：{q.timeZone === 'UTC' ? 'UTC' : '中国标准时间（UTC+08:00）'}；请填写 24 小时制。</p>}
  </div>
  return null
}
