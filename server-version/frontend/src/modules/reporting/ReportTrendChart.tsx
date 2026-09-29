import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { LongitudinalTrendModel } from './longitudinalVisualization'
import './report-ui.css'

echarts.use([LineChart, GridComponent, SVGRenderer])

const stateLabel = (state: LongitudinalTrendModel['state']) => ({
  comparable: '允许描述趋势',
  not_comparable: '存在不可直接比较区段',
  suppressed: '隐私保护',
  unavailable: '暂无可绘制数据',
}[state])

const readToken = (name: string, fallback: string) => {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function ReportTrendChart({
  model,
  title,
  description,
  valueLabel = '服务端投影值',
}: {
  model: LongitudinalTrendModel
  title: string
  description?: string
  valueLabel?: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || model.state === 'suppressed' || model.state === 'unavailable') return

    let disposed = false
    const render = () => {
      if (disposed || !host.isConnected || host.clientWidth <= 0) return
      const action = readToken('--hui-ds-color-action', '#2f6fed')
      const ink = readToken('--hui-ds-color-ink', '#14304a')
      const muted = readToken('--hui-ds-color-muted', '#64748b')
      const line = readToken('--hui-ds-color-line', '#dde7f0')
      const chart = chartRef.current ?? echarts.init(host, undefined, { renderer: 'svg' })
      chartRef.current = chart

      const baseSeries = {
        name: title,
        type: 'line' as const,
        data: model.points.map((point) => point.value),
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 9,
        connectNulls: false,
        silent: true,
        animation: false,
        lineStyle: { opacity: 0 },
        itemStyle: { color: action, borderColor: '#ffffff', borderWidth: 2 },
        label: {
          show: true,
          position: 'top' as const,
          formatter: '{c}',
          color: ink,
          fontSize: 11,
          fontWeight: 600,
        },
      }

      const segmentSeries = model.segments
        .filter((segment) => segment.connect)
        .map((segment) => ({
          name: `${title}-segment-${segment.fromIndex}-${segment.toIndex}`,
          type: 'line' as const,
          data: model.points.map((point, index) => (
            index === segment.fromIndex || index === segment.toIndex ? point.value : null
          )),
          showSymbol: false,
          symbol: 'none',
          connectNulls: false,
          silent: true,
          animation: false,
          lineStyle: { color: action, width: 2 },
        }))

      chart.setOption({
        animation: false,
        grid: { left: 46, right: 18, top: 34, bottom: 50, containLabel: false },
        xAxis: {
          type: 'category',
          data: model.points.map((point) => point.label),
          boundaryGap: false,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: line } },
          axisLabel: { color: muted, fontSize: 11, interval: 0, hideOverlap: true, margin: 14 },
        },
        yAxis: {
          type: 'value',
          scale: true,
          axisTick: { show: false },
          axisLine: { show: false },
          axisLabel: { color: muted, fontSize: 10 },
          splitLine: { lineStyle: { color: line, type: 'dashed' } },
        },
        series: [baseSeries, ...segmentSeries],
      }, { notMerge: true, lazyUpdate: false })
      chart.resize()
    }

    const frame = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(render) : null
    if (frame === null) render()
    const resize = () => chartRef.current?.resize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    observer?.observe(host)
    window.addEventListener('resize', resize)

    return () => {
      disposed = true
      if (frame !== null && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [model, title])

  const deltas = model.segments.filter((segment) => segment.delta !== undefined)
  const presentPoints = model.points.filter((point) => point.value !== null)

  return (
    <figure className={`report-trend-chart report-trend-chart--${model.state}`}>
      <div className="report-trend-chart__header">
        <div className="min-w-0">
          <p className="report-eyebrow">Longitudinal</p>
          <h4 className="report-trend-chart__title">{title}</h4>
          {description && <p className="report-trend-chart__description">{description}</p>}
        </div>
        <span className="report-trend-chart__state">{stateLabel(model.state)}</span>
      </div>

      {model.state === 'suppressed' ? (
        <div className="report-trend-chart__empty" role="status">
          隐私保护规则已生效；图表不包含被抑制的统计值、tooltip 数据或可访问文本值。
        </div>
      ) : model.state === 'unavailable' ? (
        <div className="report-trend-chart__empty" role="status">
          当前服务端投影没有足够的明确数值用于绘制纵向趋势；前端不会从其他字段推导。
        </div>
      ) : (
        <>
          <div ref={hostRef} className="report-trend-chart__canvas" aria-hidden="true" />
          <figcaption className="report-trend-chart__caption">
            <p>
              {model.state === 'not_comparable'
                ? '只有服务端明确允许 DESCRIPTIVE_TREND 的相邻时间点才会连线；不可直接比较的区段保持断开。'
                : '连线仅表示服务端明确允许的描述性纵向趋势。'}
            </p>
            {model.hasSuppressedValues && (
              <p>部分时间点受隐私保护；这些值不会进入图表数据，也不会跨越缺失点连线。</p>
            )}
            <dl className="report-trend-chart__values" aria-label={`${title} ${valueLabel}`}>
              {presentPoints.map((point) => (
                <div key={point.label}>
                  <dt>{point.label}</dt>
                  <dd>{point.value}</dd>
                </div>
              ))}
            </dl>
            {deltas.length > 0 && (
              <div className="report-trend-chart__deltas" aria-label="服务端变化量">
                {deltas.map((segment) => (
                  <span key={`${segment.fromIndex}-${segment.toIndex}`}>
                    {model.points[segment.fromIndex]?.label} → {model.points[segment.toIndex]?.label} · Δ {segment.delta}
                  </span>
                ))}
              </div>
            )}
          </figcaption>
        </>
      )}
    </figure>
  )
}
