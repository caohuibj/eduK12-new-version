import { ReportMetric, ReportMetricGrid, ReportRangeTrack, ReportSection } from '../../modules/reporting/ReportPrimitives'

import { displayFor, hasCrossMethodEvidence, numeric, type BundleEvidence } from './bundle-evidence-display'

/** Renders only the authorized, saved audience projection. No request or scorer. */
export default function BundleEvidencePanels({ evidence, overall }: { evidence: BundleEvidence[]; overall?: string }) {
  const known = evidence.filter(item => displayFor(item))
  // Preserve unrelated and historical reports. Shared cognitive constructs can
  // be reused by the other age packages without a bundle-key dispatch table.
  if (!hasCrossMethodEvidence(evidence)
    || ['invalid', 'unavailable'].includes(overall ?? '')) return null

  function card(item: BundleEvidence) {
    const display = displayFor(item)!, raw = numeric(item)
    const inRange = raw !== null && (!display.range || raw >= display.range.min && raw <= display.range.max)
    const value = inRange ? raw : null
    const formatted = value === null ? '暂无可展示结果' : display.ratio ? `${Number((value * 100).toFixed(1))}%` : String(Number(value.toFixed(3)))
    const denominator = display.denominator ? numeric(evidence.find(e => e.constructKey === display.denominator && e.sourceKind === item.sourceKind)) : null
    const note = `${display.note}${denominator !== null && denominator > 0 ? ` 本次分母 ${denominator} 次。` : ''}${item.quality === 'limited' ? ' 仅支持有限解释。' : ''}${raw !== null && !inRange ? ' 数值超出原量尺，本次不绘图。' : ''}`
    return <div key={item.evidenceKey}>
      {display.range && value !== null
        ? <ReportRangeTrack label={display.label} value={value} formattedValue={formatted} range={display.range} status="原量尺位置，非百分位或能力等级" />
        : <ReportMetric label={display.label} value={formatted} />}
      <p className="mt-1 text-sm text-gray-600">{note}</p>
    </div>
  }
  return <>
    <ReportSection title="任务中的本次表现" eyebrow="认知任务" description="比率图的 0–1 表示事件比例；不能与问卷分数换算。">
      <ReportMetricGrid>{known.filter(item => item.sourceKind === 'COGNITIVE_METRIC').map(card)}</ReportMetricGrid>
    </ReportSection>
    {known.some(item => item.sourceKind === 'SCALE_SCORE') && <ReportSection title="日常生活中的体验" eyebrow="自评问卷" description="各分量表保留自己的原始端点；条的位置不是同龄排名。">
      <div className="space-y-4">{known.filter(item => item.sourceKind === 'SCALE_SCORE').map(card)}</div>
    </ReportSection>}
  </>
}
