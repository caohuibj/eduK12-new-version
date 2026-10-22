import type {ImageAuthoringAdapter} from '../modules/assessment-media/AssessmentImageField'
import { useState } from 'react'
import { matchRawScoreFeedback, validateRawScoreFeedback, type RawScoreFeedbackRule } from '../modules/scale/rawScoreFeedback'
import { TrainingFeedbackImageField, TrainingFeedbackImagePreview } from './TrainingFeedbackImageField'

export function TrainingRawScoreFeedbackEditor({ scoreKey, rule, disabled, onChange, onUploadBusy, mediaEnabled = true, imageAdapter }: {
  scoreKey: string; rule?: RawScoreFeedbackRule; disabled: boolean; onChange: (rule: RawScoreFeedbackRule | undefined) => void; onUploadBusy?: (busy: boolean) => void; mediaEnabled?: boolean; imageAdapter?: ImageAuthoringAdapter
}) {
  const [simulated, setSimulated] = useState('')
  const config = rule ? { schemaVersion: 1 as const, rules: [rule] } : undefined
  const issues = validateRawScoreFeedback(config, [scoreKey])
  const match = issues.length ? null : matchRawScoreFeedback(config, scoreKey, simulated.trim() ? Number(simulated) : null)
  const addRange = () => {
    const ranges = rule?.ranges ?? []
    const min = ranges[ranges.length - 1]?.max ?? 0
    onChange({ scoreKey, ...rule, ranges: [...ranges.map(range => ({ ...range, includeMax: false })), { key: `range_${crypto.randomUUID().replace(/-/g, '')}`, min, max: min + 1, includeMax: true, text: '' }] })
  }
  return <div className="scale-raw-feedback">
    <h4>按原始分区间反馈</h4>
    <p>仅描述性文字与图片，不提供常模、诊断或自定义计算公式。区间左闭右开，最后一区间可包含上限；按未四舍五入的原始分匹配。</p>
    {rule?.ranges.map((range, index) => {
      const change = (patch: Partial<typeof range>) => onChange({ ...rule, ranges: rule.ranges.map((entry, i) => i === index ? { ...entry, ...patch } : entry) })
      return <fieldset className="scale-feedback-range" key={range.key} disabled={disabled}>
        <legend>区间 {index + 1}</legend>
        <div className="scale-feedback-boundaries">
          <label>下限（包含）<input className="input" aria-label={`${scoreKey} 区间 ${index + 1} 下限`} type="number" step="any" value={Number.isFinite(range.min) ? range.min : ''} onChange={event => change({ min: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>
          <label>上限<input className="input" aria-label={`${scoreKey} 区间 ${index + 1} 上限`} type="number" step="any" value={Number.isFinite(range.max) ? range.max : ''} onChange={event => change({ max: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>
          <label><input type="checkbox" checked={range.includeMax} disabled={disabled || index !== rule.ranges.length - 1} onChange={event => change({ includeMax: event.target.checked })} />包含上限（仅最后区间）</label>
        </div>
        <label>反馈文字<textarea className="input" aria-label={`${scoreKey} 区间 ${index + 1} 反馈文字`} rows={3} value={range.text} onChange={event => change({ text: event.target.value })} /></label>
        {mediaEnabled ? <TrainingFeedbackImageField adapter={imageAdapter} onBusy={onUploadBusy} images={range.images} disabled={disabled} onChange={images => change({ images })} /> : <p role="status">当前入口暂不支持报告图片附件；现有图片定义不会自动删除。</p>}
        <button type="button" className="hui-button hui-button--secondary" onClick={() => { const ranges = rule.ranges.filter((_, i) => i !== index); onChange(ranges.length ? { ...rule, ranges } : undefined) }}>删除区间</button>
      </fieldset>
    })}
    <button type="button" disabled={disabled} className="hui-button hui-button--secondary" onClick={addRange}>增加原始分反馈区间</button>
    {rule && <>
      <label className="scale-feedback-fallback"><input type="checkbox" disabled={disabled} checked={Boolean(rule.fallback)} onChange={event => { const next = { ...rule }; if (event.target.checked) next.fallback = { text: '' }; else delete next.fallback; onChange(next) }} />为未匹配分数配置反馈（区间空档时必填）</label>
      {rule.fallback && <><label>未匹配时的文字<textarea className="input" disabled={disabled} value={rule.fallback.text} onChange={event => onChange({ ...rule, fallback: { ...rule.fallback!, text: event.target.value } })} /></label>{mediaEnabled && <TrainingFeedbackImageField adapter={imageAdapter} onBusy={onUploadBusy} disabled={disabled} images={rule.fallback.images} onChange={images => onChange({ ...rule, fallback: { ...rule.fallback!, images } })} />}</>}
      {issues.length > 0 && <ul className="scale-feedback-issues" role="alert">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      <div className="scale-feedback-simulation"><label>模拟原始分（仅检查呈现，不是实际计分）<input className="input" type="number" step="any" value={simulated} onChange={event => setSimulated(event.target.value)} /></label>
        <p role="status">{issues.length ? '请先修正区间配置。' : match ? match.text : '未匹配区间时保留原有描述性解释。'}</p>
        {mediaEnabled && match?.images?.map((image, index) => <TrainingFeedbackImagePreview adapter={imageAdapter} key={`${image.asset.assetId}-${index}`} image={image} />)}
      </div>
    </>}
  </div>
}
