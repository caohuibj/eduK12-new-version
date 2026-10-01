import { useEffect, useId, useRef, useState } from 'react'
import type { CognitiveReportReading } from './types'

const unitLabel = (unit: string) => unit === 'ms' ? '毫秒（ms）' : unit === 'ratio' ? '比例（%）' : unit === 'count' ? '次数' : unit === 'd-prime' ? '区分指标（d′）' : unit
const displayValue = (value: number, unit: string) => unit === 'ratio' ? `${Math.round(value * 100)}%` : `${Math.round(value * 100) / 100}${unit === 'ms' ? ' ms' : ''}`
const labelLines = (label: string, length: number): string[] => {
  const characters = Array.from(label)
  return Array.from({ length: Math.ceil(characters.length / length) }, (_, i) => characters.slice(i * length, (i + 1) * length).join(''))
}

export default function CognitiveReportVisual({ visual }: { visual: CognitiveReportReading['visuals'][number] }) {
  const id = useId()
  const container = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const element = container.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => setCompact(entries[0].contentRect.width < 480))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const recorded = visual.points.filter(point => point.value !== null && Number.isFinite(point.value))
  if (!visual.points.length) return null
  const values = recorded.map(point => point.value as number)
  const isTrials = visual.kind === 'reaction_trials'
  const width = compact ? 420 : 620
  const height = isTrials ? 240 : Math.max(130, visual.points.length * 58 + 32)
  const min = Math.min(0, ...values)
  const max = visual.unit === 'ratio' ? Math.max(1, ...values) : Math.max(1, ...values)
  const span = Math.max(1e-6, max - min)
  const barLeft = compact ? 160 : 210
  const chartWidth = width - barLeft - 80
  const x = (value: number) => barLeft + (value - min) / span * chartWidth
  const trialFloor = values.length ? Math.floor(Math.min(...values) / 50) * 50 : 0
  const trialCeiling = values.length ? Math.max(trialFloor + 50, Math.ceil(Math.max(...values) / 50) * 50) : 100
  const trialY = (value: number) => 28 + (trialCeiling - value) / Math.max(50, trialCeiling - trialFloor) * 140
  const trialX = (index: number) => 55 + index / Math.max(1, visual.points.length - 1) * (width - 85)
  const tickStep = Math.max(50, Math.ceil((trialCeiling - trialFloor) / 200) * 50)
  const ticks = Array.from({ length: Math.floor((trialCeiling - trialFloor) / tickStep) + 1 }, (_, i) => trialFloor + i * tickStep)
  return (
    <figure className="cognitive-reading__chart" aria-labelledby={`${id}-title`}>
      <div className="cognitive-reading__section-heading"><h2 id={`${id}-title`}>{visual.title}</h2><span>单位：{unitLabel(visual.unit)}</span></div>
      <div className="cognitive-reading__chart-scroll" ref={container}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
          <desc id={`${id}-description`}>{visual.caption}。{visual.points.map(p => `${p.label}：${p.value === null ? '未响应或无效记录' : displayValue(p.value, visual.unit)}`).join('；')}</desc>
          {isTrials ? <>
            {ticks.map((tick, index) => <g key={index}><line x1="55" x2={width - 30} y1={trialY(tick)} y2={trialY(tick)} className="cognitive-reading__grid" /><text x="44" y={trialY(tick) + 5} textAnchor="end">{Math.round(tick)}</text></g>)}
            <rect x="55" y="184" width={width - 85} height="18" rx="4" className="cognitive-reading__missing-band" />
            {visual.points.map((point, index) => <g key={`${point.label}-${index}`}>
              {point.value === null ? <path d={`M${trialX(index) - 4} 188l8 8m0-8l-8 8`} className="cognitive-reading__missing" /> : <circle cx={trialX(index)} cy={trialY(point.value)} r="4.5" className="cognitive-reading__dot"><title>第 {point.label} 次：{displayValue(point.value, visual.unit)}</title></circle>}
              {(index === 0 || index === visual.points.length - 1 || index % Math.max(1, Math.ceil(visual.points.length / 5)) === 0) && <text x={trialX(index)} y="222" textAnchor="middle">{point.label}</text>}
            </g>)}
          </> : <>
            <line x1={x(0)} x2={x(0)} y1="14" y2={height - 16} className="cognitive-reading__grid" />
            {min < 0 && <text x={x(0)} y="12" textAnchor="middle">0</text>}
            {visual.points.map((point, index) => <g key={`${point.label}-${index}`}>
              <text x={barLeft - 14} y={index * 58 + (labelLines(point.label, compact ? 8 : 12).length > 1 ? 29 : 40)} textAnchor="end">{labelLines(point.label, compact ? 8 : 12).map((line, i) => <tspan key={i} x={barLeft - 14} dy={i === 0 ? 0 : 18}>{line}</tspan>)}</text>
              {point.value !== null && <><rect x={Math.min(x(0), x(point.value))} y={index * 58 + 20} width={Math.max(0, Math.abs(x(point.value) - x(0)))} height="26" rx="5" className="cognitive-reading__bar" /><text x={width - 12} y={index * 58 + 39} textAnchor="end">{displayValue(point.value, visual.unit)}</text></>}
            </g>)}
          </>}
        </svg>
      </div>
      {isTrials && <p className="cognitive-reading__legend"><span>● 有效用时</span><span>× 未响应或无效记录</span></p>}
      <figcaption>{visual.caption}</figcaption>
      <details className="cognitive-reading__chart-data"><summary>查看图表数据</summary><ul>{visual.points.map((point, index) => <li key={`${point.label}-${index}`}>{isTrials ? '第 ' : ''}{point.label}{isTrials ? ' 次' : ''}：{point.value === null ? '未响应或无效记录' : displayValue(point.value, visual.unit)}</li>)}</ul></details>
    </figure>
  )
}
