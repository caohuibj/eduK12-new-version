import { useRef, useState } from 'react'
import { ReportDetails, ReportDisclaimer, ReportMetric, ReportMetricGrid, ReportRangeTrack, ReportSection } from './ReportPrimitives'
import './task-group-report.css'

export interface TaskGroupArtifact {
  artifactId: string
  generatedAt: string
  projection: {
    title: string; sourceLabel: string; cutoff: string; populationLabel: string
    completedN: number; countUnit: 'RESPONSE' | 'PERSON'; assignedN: number | null
    tool: { key: string; title: string; kind: string }
    metrics: Array<{ key: string; label: string; type: 'NUMBER' | 'SINGLE' | 'MULTIPLE'; unit: string | null
      validN: number; missingN: number; mean: number | null; sdSample: number | null
      range: { min: number; max: number } | null; observedRange: { min: number; max: number } | null
      qualityCounts: Record<string, number>; measurement: unknown
      frequencies: Array<{ value: string; label: string; count: number; proportion: number | null }> }>
    limitations: string[]
  }
}
const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 }).format(value)
const date = (value: string) => new Date(value).toLocaleString('zh-CN')

/** Both reading and printing consume this already authorized projection. */
export function TaskGroupReport({ artifact }: { artifact: TaskGroupArtifact }) {
  const root = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState('')
  const [presentationError, setPresentationError] = useState('')
  const report = artifact.projection
  const metric = report.metrics.find(value => value.key === selected) ?? report.metrics[0]
  async function fullscreen() {
    try { await root.current?.requestFullscreen(); setPresentationError('') }
    catch { setPresentationError('浏览器未能进入全屏，可继续阅读或打印。') }
  }
  return <article ref={root} className="task-group-report" aria-label="群体报告阅读">
    <header className="task-group-report__header"><div><p className="report-eyebrow">群体报告 · {report.tool.kind}</p>
      <h2>{report.title}</h2><p>{report.sourceLabel} · {report.populationLabel}</p>
      <p>数据截止 {date(report.cutoff)}</p></div>
      <div className="task-group-report__actions"><button type="button" onClick={() => void fullscreen()}>全屏展示</button>
        <button type="button" onClick={() => window.print()}>打印 / 保存 PDF</button></div></header>
    {presentationError && <p role="status" className="task-group-report__actions">{presentationError}</p>}
    <ReportMetricGrid><ReportMetric label={report.countUnit === 'RESPONSE' ? '纳入答卷' : '纳入人数'} value={report.completedN} />
      <ReportMetric label="报告生成" value={date(artifact.generatedAt)} />
      <ReportMetric label="可用指标" value={report.metrics.length} /></ReportMetricGrid>
    {report.metrics.length > 0 ? <><label className="task-group-report__actions">阅读指标<select value={metric.key} onChange={event => setSelected(event.target.value)}>
      {report.metrics.map(value => <option key={value.key} value={value.key}>{value.label}</option>)}</select></label>
      {report.metrics.map(value => <section className={value.key === metric.key ? 'task-group-report__metric' : 'task-group-report__metric task-group-report__metric--print'} key={value.key} aria-label={value.label}>
        <ReportSection title={value.label} description={value.type === 'MULTIPLE' ? '多选比例以该题有效作答数为分母，合计可能超过 100%。' : '每项指标独立计算有效样本；缺失值不作为零分。'}>
          <ReportMetricGrid><ReportMetric label="有效 N" value={value.validN} /><ReportMetric label="缺失 / 不适用" value={value.missingN} />
            {value.type === 'NUMBER' && <><ReportMetric label={`均值${value.unit ? ` (${value.unit})` : ''}`} value={number(value.mean)} emphasis />
              <ReportMetric label="样本标准差" value={number(value.sdSample)} description={value.validN < 2 ? '有效样本不足 2，标准差不适用。' : undefined} /></>}</ReportMetricGrid>
          {value.type === 'NUMBER' && <><ReportRangeTrack label={value.label} value={value.mean} formattedValue={number(value.mean)} range={value.range}
            status={value.observedRange ? `本次观测范围 ${number(value.observedRange.min)}–${number(value.observedRange.max)}，并非理论量尺范围。` : '暂无有效数值。'} />
            <p>有效 N={value.validN}，均值 {number(value.mean)}{value.unit ? ` ${value.unit}` : ''}；样本标准差 {number(value.sdSample)}。</p></>}
          {value.frequencies.length > 0 && <table><caption>选项分布 · 有效作答 N={value.validN}</caption><thead><tr><th>选项</th><th>频数</th><th>比例</th></tr></thead>
            <tbody>{value.frequencies.map(cell => <tr key={cell.value}><th scope="row">{cell.label}</th><td>{cell.count}</td><td>
              <span className="task-group-report__bar" style={{ width: `${(cell.proportion ?? 0) * 100}%` }} />{cell.proportion === null ? '—' : `${number(cell.proportion * 100)}%`}</td></tr>)}</tbody></table>}
          {Object.keys(value.qualityCounts).length > 0 && <p>已有质量标记：{Object.entries(value.qualityCounts).map(([key, count]) => `${key} ${count}`).join(' · ')}</p>}
        </ReportSection></section>)}</> : <p>此工具暂无可作群体描述的数值或选项指标。</p>}
    <ReportSection title="样本与说明">{report.limitations.map(text => <ReportDisclaimer key={text}>{text}</ReportDisclaimer>)}</ReportSection>
    <ReportDetails title="报告版本与测量信息"><p>快照 {artifact.artifactId} · 描述模板 group-descriptive-v1</p>
      <p>该报告保存生成时的结果；主动生成更新版后，原版本仍保留。</p></ReportDetails>
    <footer>快照 {artifact.artifactId} · 生成 {date(artifact.generatedAt)}</footer>
  </article>
}
