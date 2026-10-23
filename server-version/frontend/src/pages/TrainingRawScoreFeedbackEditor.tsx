import type {ImageAuthoringAdapter} from '../modules/assessment-media/AssessmentImageField'
import type {ReactNode} from 'react'
import type {RawScoreFeedbackContent} from '../modules/scale/rawScoreFeedback'
import {RawScoreFeedbackFields} from '../modules/assessment-core/scale/RawScoreFeedbackFields'
import { useState } from 'react'
import { matchRawScoreFeedback, validateRawScoreFeedback, type RawScoreFeedbackRule } from '../modules/scale/rawScoreFeedback'
import { TrainingFeedbackImageField, TrainingFeedbackImagePreview } from './TrainingFeedbackImageField'

export function TrainingRawScoreFeedbackEditor({ scoreKey, rule, disabled, onChange, onUploadBusy, mediaEnabled = true, imageAdapter, renderContent, renderPreview }: {
  scoreKey: string; rule?: RawScoreFeedbackRule; disabled: boolean; onChange: (rule: RawScoreFeedbackRule | undefined) => void; onUploadBusy?: (busy: boolean) => void; mediaEnabled?: boolean; imageAdapter?: ImageAuthoringAdapter; renderContent?: (content:RawScoreFeedbackContent,onChange:(content:RawScoreFeedbackContent)=>void)=>ReactNode; renderPreview?: (content:RawScoreFeedbackContent)=>ReactNode
}) {
  const [simulated, setSimulated] = useState('')
  const config = rule ? { schemaVersion: 1 as const, rules: [rule] } : undefined
  const issues = validateRawScoreFeedback(config, [scoreKey])
  const match = issues.length ? null : matchRawScoreFeedback(config, scoreKey, simulated.trim() ? Number(simulated) : null)
  return <div className="scale-raw-feedback">
    <h4>按原始分区间反馈</h4>
    <p>仅描述性文字与展示素材，不提供常模、诊断或自定义计算公式。区间左闭右开，最后一区间可包含上限；按未四舍五入的原始分匹配。</p>
    <RawScoreFeedbackFields rule={rule??{scoreKey,ranges:[]}} disabled={disabled} appearance="training" labelPrefix={scoreKey} fallbackTextLabel="未匹配时的文字" fallbackLabel="为未匹配分数配置反馈（区间空档时必填）" addLabel="增加原始分反馈区间" onChange={next=>onChange(next.ranges.length?next:undefined)} renderContent={(content,change)=><>{renderContent?.(content,change)}{mediaEnabled ? <TrainingFeedbackImageField adapter={imageAdapter} onBusy={onUploadBusy} images={content.images} disabled={disabled} onChange={images=>change({...content,images})}/> : <p role="status">当前入口暂不支持报告图片附件；现有图片定义不会自动删除。</p>}</>}/>
    {rule && <>
      {issues.length > 0 && <ul className="scale-feedback-issues" role="alert">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      <div className="scale-feedback-simulation"><label>模拟原始分（仅检查呈现，不是实际计分）<input className="input" type="number" step="any" value={simulated} onChange={event => setSimulated(event.target.value)} /></label>
        <p role="status">{issues.length ? '请先修正区间配置。' : match ? match.text : '未匹配区间时保留原有描述性解释。'}</p>
        {match&&renderPreview?.(match)}
        {mediaEnabled&&match?.images?.map((image, index) => <TrainingFeedbackImagePreview adapter={imageAdapter} key={`${image.asset.assetId}-${index}`} image={image} />)}
      </div>
    </>}
  </div>
}
