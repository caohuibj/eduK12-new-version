import type { SurveyScaleItemTimingV1 as ScaleItemTimingV1 } from '../scale/item-timing'
export interface TrainingTimingReportValue {
  scope: 'TRAINING_COURSE' | 'LEGACY_UNSCOPED'
  status: 'RECORDED' | 'MISSING' | 'NOT_COLLECTED'
  unit: 'ms'
  items: Record<string, ScaleItemTimingV1>
}
/** Render only the current authorized teacher projection, never inferred from answers. */
export function TrainingTimingReport({ value }: { value: TrainingTimingReportValue }) {
  return <section aria-label="浏览器有效作答计时" className="mt-4 text-sm">
    <h4>浏览器有效作答计时</h4>
    <p>描述性浏览器测量，单位：毫秒。不用于科学评分或认真度判断，也不保证防作弊。</p>
    <p>{value.status === 'NOT_COLLECTED' ? '未采集' : value.status === 'MISSING' ? '计时缺失或不完整' : '已记录'}</p>
    {Object.keys(value.items).length > 0 && <table><thead><tr><th>题目</th><th>首次反应（毫秒）</th><th>有效前台时间（毫秒）</th><th>修改次数</th><th>重访次数</th><th>记录说明</th></tr></thead><tbody>
      {Object.entries(value.items).map(([key, row]) => <tr key={key}><th>{key}</th><td>{row.firstResponseMs ?? '缺失'}</td><td>{row.activeTimeMs}</td><td>{row.changeCount}</td><td>{row.revisitCount}</td><td>{row.recoveredWithoutClock ? '恢复时无首次计时' : row.interrupted ? '曾中断' : '已记录'}</td></tr>)}
    </tbody></table>}
  </section>
}
