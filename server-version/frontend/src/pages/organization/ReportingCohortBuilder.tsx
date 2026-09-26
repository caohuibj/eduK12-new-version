import { ReportingMemberPicker } from './ReportingMemberPicker'
import type { CohortOptions, CohortSelector } from '../../api/reporting'

export function ReportingCohortBuilder({ organizationId, options, value, onChange }: {
  organizationId: string;
  options: CohortOptions; value: CohortSelector; onChange: (value: CohortSelector) => void
}) {
  const classes = value.clauses.find(c => c.kind === 'CLASS_UNITS')
  const selectedClasses = classes?.kind === 'CLASS_UNITS' ? classes.classUnitIds : []
  const toggle = (values: string[], id: string, checked: boolean) => checked ? [...values, id] : values.filter(v => v !== id)
  return <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-label="分析人群">
    <h2 className="text-xl font-semibold">分析人群</h2>
    <p>以下选择同时用于单次群体报告和纵向报告。不勾选时分析全部受测者；不同条件之间须同时满足。</p>
    <button type="button" onClick={() => onChange({ schemaVersion: 2, combine: 'ALL', clauses: [] })}>重置为全部受测者</button>
    <fieldset><legend>班级（任选其一）</legend><div className="flex flex-wrap gap-4">{options.classes.map(c => <label key={c.id}><input type="checkbox" checked={selectedClasses.includes(c.id)} onChange={e => {
      const classUnitIds = toggle(selectedClasses, c.id, e.target.checked)
      onChange({ ...value, clauses: [...value.clauses.filter(c => c.kind !== 'CLASS_UNITS'), ...(classUnitIds.length ? [{ kind: 'CLASS_UNITS' as const, classUnitIds }] : [])] })
    }} /> {c.name}</label>)}</div></fieldset>
    {options.dimensions.map(d => {
      const labels = options.labels.filter(l => l.dimensionId === d.id)
      const labelSet = new Set(labels.map(l => l.id))
      const clause = value.clauses.find(c => c.kind === 'LABELS' && c.labelIds.some(id => labelSet.has(id)))
      const selected = clause?.kind === 'LABELS' ? clause.labelIds : []
      const match = clause?.kind === 'LABELS' ? clause.match : 'ANY'
      const update = (labelIds: string[], nextMatch: 'ANY' | 'ALL') => onChange({ ...value, clauses: [
        ...value.clauses.filter(c => !(c.kind === 'LABELS' && c.labelIds.some(id => labelSet.has(id)))),
        ...(labelIds.length ? [{ kind: 'LABELS' as const, labelIds, match: nextMatch }] : []),
      ] })
      return <fieldset key={d.id}><legend>{d.name}</legend><select aria-label={`${d.name}匹配方式`} value={match} onChange={e => update(selected, e.target.value as 'ANY' | 'ALL')}><option value="ANY">符合任一标签</option><option value="ALL">符合所有标签</option></select><div className="mt-2 flex flex-wrap gap-4">{labels.map(l => <label key={l.id}><input type="checkbox" checked={selected.includes(l.id)} onChange={e => update(toggle(selected, l.id, e.target.checked), match)} /> {l.name}</label>)}</div></fieldset>
    })}
    <ReportingMemberPicker organizationId={organizationId} value={value} onChange={onChange} />
    <p className="text-sm text-slate-600">{value.clauses.length ? '已选择部分人群。历史班级与标签按测量发布时的记录解析。' : '当前选择：全部受测者'}</p>
  </section>
}
