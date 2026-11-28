import type { ReportVisibility } from '../../api/scaleComponentImport'
import type { RawScoreFeedback } from '../../modules/scale/rawScoreFeedback'

export type StandardReportBand = {
  key: string
  label: string
  interpretation: string
}

export type StandardReportGuidance = {
  category: 'reflection' | 'strategy' | 'environment' | 'support'
  text: string
}

export type StandardReportInterpretationSource =
  | { type: 'score_only' }
  | { type: 'reference_context' }
  | { type: 'shared_theoretical_range' }
  | { type: 'reference'; referenceVersion?: string; referenceKind?: string }

export type StandardReportInterpretation = {
  scoreKey: string
  scoreLabel?: string
  provisional?: true
  headline: string
  source: StandardReportInterpretationSource
  summary: string
  bands: StandardReportBand[]
  guidance: StandardReportGuidance[]
}

export type StandardReportDefinition = {
  artworkKey?: string
  illustrationKey?: string
  audienceContract?: {
    schemaVersion: 1
    respondent: 'STUDENT_SELF' | 'ADULT_SELF' | 'PARENT_REPORT' | 'TEACHER_REPORT' | 'OBSERVER_REPORT'
    audience: 'student' | 'parent' | 'teacher'
    locale: string
    longitudinalMetricKeys?: string[]
    qcReview?: { reviewer: string; reviewedAt: string; basis: string }
  }
  rawScoreFeedback?: RawScoreFeedback
  reportVersion: string
  primaryScoreKeys: string[]
  scoreOrder: string[]
  interpretations: StandardReportInterpretation[]
  limitations: string[]
  disclaimer: string
}

type ScaleReport = StandardReportDefinition
type Interpretation = StandardReportInterpretation
type Band = StandardReportBand
type Guidance = StandardReportGuidance

const REPORT_AUDIENCES = {
  respondent: '作答者',
  subject: '被测者',
  teacher: '教师',
  researcher: '研究者',
} as const

const REPORT_CAPABILITIES = {
  numericScores: '指标分数',
  references: '参考分数',
  scoreDerivedLabels: '分数分档',
  individualInterpretations: '个人解读',
  educationalContent: '科普与建议',
  artwork: '配图',
} as const

type Audience = keyof typeof REPORT_AUDIENCES
type Capability = keyof typeof REPORT_CAPABILITIES
const emptyVisibility: Record<Capability, boolean> = {
  numericScores: false,
  references: false,
  scoreDerivedLabels: false,
  individualInterpretations: false,
  educationalContent: false,
  artwork: false,
}

export function ScaleComponentReportPresentation({
  version,
  visibility,
  artworkKey,
  onArtworkChange,
  templateArtworkKey,
  onTemplateArtworkChange,
  disabled,
  onVisibilityChange,
  visibleAudiences = Object.keys(REPORT_AUDIENCES) as Audience[],
  capabilities = Object.keys(REPORT_CAPABILITIES) as Capability[],
}: {
  version: string
  visibility?: ReportVisibility
  artworkKey?: string
  onArtworkChange: (key: string) => void
  templateArtworkKey?: string
  onTemplateArtworkChange?: (key: string) => void
  disabled: boolean
  onVisibilityChange: (visibility: ReportVisibility) => void
  visibleAudiences?: readonly Audience[]
  capabilities?: readonly Capability[]
}) {
  const updateVisibility = (audience: Audience, capability: Capability, checked: boolean) => {
    if (!visibility) return
    onVisibilityChange({
      ...visibility,
      audiences: {
        ...visibility.audiences,
        [audience]: { ...(visibility.audiences[audience] ?? emptyVisibility), [capability]: checked },
      },
    })
  }

  return (
    <details className="component-technical">
      <summary>报告展示范围与配图</summary>
      <div className="mt-3 space-y-3">
        <p className="component-help">这些设置按报告版本冻结。原始答卷、单题分和计分方法仍受题本权限约束。</p>
        {visibility ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleAudiences.map(audience => (
              <fieldset key={audience} disabled={disabled} className="min-w-0 space-y-2 rounded-lg border p-3">
                <legend className="px-1 font-medium">{REPORT_AUDIENCES[audience]}</legend>
                {capabilities.map(capability => (
                  <label key={capability} className="component-check">
                    <input type="checkbox" checked={visibility.audiences[audience]?.[capability] ?? false}
                      onChange={event => updateVisibility(audience, capability, event.target.checked)} />
                    {REPORT_CAPABILITIES[capability]}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="component-help">当前沿用旧版展示规则。设置独立范围后，请勾选各类受众可以看到的内容。</p>
            {!disabled && <button type="button" disabled={!version.trim()} onClick={() => onVisibilityChange({
              schemaVersion: 1, policyVersion: version.trim(), unknownAudience: 'DENY', audiences: {},
            })}>设置报告展示范围</button>}
          </div>
        )}
        <label className="component-field">
          报告配图标识
          <input value={artworkKey ?? ''} disabled={disabled} placeholder="工具标识/题本版本/配图版本"
            onChange={event => onArtworkChange(event.target.value)} />
        </label>
        {onTemplateArtworkChange && <label className="component-field">
          自定义模板配图标识
          <input value={templateArtworkKey ?? ''} disabled={disabled} placeholder="工具标识/题本版本/配图版本"
            onChange={event => onTemplateArtworkChange(event.target.value)} />
        </label>}
      </div>
    </details>
  )
}

const GUIDANCE_CATEGORIES: Array<{ value: Guidance['category']; label: string }> = [
  { value: 'reflection', label: '反思' },
  { value: 'strategy', label: '策略' },
  { value: 'environment', label: '环境' },
  { value: 'support', label: '支持' },
]

export function ScaleComponentReportEditor({
  report,
  scoreLabels,
  disabled,
  onChange,
}: {
  report: ScaleReport
  scoreLabels: Record<string, string>
  disabled: boolean
  onChange: (next: ScaleReport) => void
}) {
  const updateInterpretation = (index: number, patch: Partial<Interpretation>) => {
    const nextInterpretations = report.interpretations.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))
    onChange({ ...report, interpretations: nextInterpretations })
  }

  const updateBand = (interpIndex: number, bandIndex: number, patch: Partial<Band>) => {
    const entry = report.interpretations[interpIndex]
    const nextBands = entry.bands.map((band, i) => (i === bandIndex ? { ...band, ...patch } : band))
    updateInterpretation(interpIndex, { bands: nextBands })
  }

  const addBand = (interpIndex: number) => {
    const entry = report.interpretations[interpIndex]
    const nextKey = `band_${entry.bands.length + 1}`
    updateInterpretation(interpIndex, {
      bands: [...entry.bands, { key: nextKey, label: '新分档', interpretation: '' }],
    })
  }

  const removeBand = (interpIndex: number, bandIndex: number) => {
    const entry = report.interpretations[interpIndex]
    updateInterpretation(interpIndex, { bands: entry.bands.filter((_, i) => i !== bandIndex) })
  }

  const updateGuidance = (interpIndex: number, guidanceIndex: number, patch: Partial<Guidance>) => {
    const entry = report.interpretations[interpIndex]
    const nextGuidance = entry.guidance.map((item, i) => (i === guidanceIndex ? { ...item, ...patch } : item))
    updateInterpretation(interpIndex, { guidance: nextGuidance })
  }

  const addGuidance = (interpIndex: number) => {
    const entry = report.interpretations[interpIndex]
    updateInterpretation(interpIndex, {
      guidance: [...entry.guidance, { category: 'reflection', text: '' }],
    })
  }

  const removeGuidance = (interpIndex: number, guidanceIndex: number) => {
    const entry = report.interpretations[interpIndex]
    updateInterpretation(interpIndex, { guidance: entry.guidance.filter((_, i) => i !== guidanceIndex) })
  }

  return (
    <div className="space-y-4">
      <p className="component-help">
        直接编辑各指标的分档阈值文案、建议、解释局限与免责声明；无需展开完整 JSON。分档标识须与 P（参数与阈值）中的分档标识一致。
      </p>
      {report.interpretations.map((entry, idx) => (
        <article key={entry.scoreKey + ':' + idx} className="border rounded-lg p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>{scoreLabels[entry.scoreKey] || entry.scoreKey}（{entry.scoreKey}）</strong>
            <span className="component-badge">
              {entry.source.type === 'score_only'
                ? '仅分数'
                : entry.source.type === 'reference_context' ? '选定参数分档'
                  : entry.source.type === 'shared_theoretical_range' ? '共同理论区间' : '精确参考分档'}
            </span>
          </div>
          <label className="component-field">
            指标报告标题
            <input
              disabled={disabled}
              value={entry.headline}
              onChange={(e) => updateInterpretation(idx, { headline: e.target.value })}
            />
          </label>
          <label className="component-field">
            总体说明
            <textarea
              rows={2}
              disabled={disabled}
              value={entry.summary}
              onChange={(e) => updateInterpretation(idx, { summary: e.target.value })}
            />
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">阈值分档解读（{entry.bands.length} 档）</span>
              <button type="button" disabled={disabled} onClick={() => addBand(idx)}>
                新增分档
              </button>
            </div>
            {entry.bands.map((band, bandIdx) => (
              <div key={bandIdx} className="rounded border p-2 space-y-2 bg-slate-50">
                <div className="component-inline-fields">
                  <label className="component-field">
                    分档标识
                    <input
                      disabled={disabled}
                      value={band.key}
                      onChange={(e) => updateBand(idx, bandIdx, { key: e.target.value })}
                    />
                  </label>
                  <label className="component-field">
                    分档名称
                    <input
                      disabled={disabled}
                      value={band.label}
                      onChange={(e) => updateBand(idx, bandIdx, { label: e.target.value })}
                    />
                  </label>
                </div>
                <label className="component-field">
                  分档解读文案
                  <textarea
                    rows={2}
                    disabled={disabled}
                    value={band.interpretation}
                    onChange={(e) => updateBand(idx, bandIdx, { interpretation: e.target.value })}
                  />
                </label>
                <button type="button" disabled={disabled} onClick={() => removeBand(idx, bandIdx)}>
                  删除该分档
                </button>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">行动建议（{entry.guidance.length} 条）</span>
              <button type="button" disabled={disabled} onClick={() => addGuidance(idx)}>
                新增建议
              </button>
            </div>
            {entry.guidance.map((item, gIdx) => (
              <div key={gIdx} className="rounded border p-2 space-y-2">
                <label className="component-field">
                  建议类别
                  <select
                    disabled={disabled}
                    value={item.category}
                    onChange={(e) => updateGuidance(idx, gIdx, { category: e.target.value as Guidance['category'] })}
                  >
                    {GUIDANCE_CATEGORIES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <label className="component-field">
                  建议正文
                  <textarea
                    rows={2}
                    disabled={disabled}
                    value={item.text}
                    onChange={(e) => updateGuidance(idx, gIdx, { text: e.target.value })}
                  />
                </label>
                <button type="button" disabled={disabled} onClick={() => removeGuidance(idx, gIdx)}>
                  删除该建议
                </button>
              </div>
            ))}
          </div>
        </article>
      ))}
      <label className="component-field">
        解释局限（每行一条）
        <textarea
          rows={3}
          disabled={disabled}
          value={(report.limitations ?? []).join('\n')}
          onChange={(e) => onChange({
            ...report,
            limitations: e.target.value.split('\n').map((line) => line.trim()).filter(Boolean),
          })}
        />
      </label>
      <label className="component-field">
        免责声明
        <textarea
          rows={2}
          disabled={disabled}
          value={report.disclaimer ?? ''}
          onChange={(e) => onChange({ ...report, disclaimer: e.target.value })}
        />
      </label>
    </div>
  )
}
