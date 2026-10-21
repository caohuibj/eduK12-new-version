import './training-checkin-schedules.css'
import type { CheckinRecurrence } from './checkinRecurrence'

export default function CheckinRecurrenceFields({ value, onChange }: { value?: CheckinRecurrence; onChange: (value?: CheckinRecurrence) => void }) {
  return <fieldset className="training-checkin-recurrence">
    <legend className="label">发布方式</legend>
    <div className="training-checkin-recurrence__modes">
      <label><input type="radio" name="checkin-publish-mode" checked={!value} onChange={() => onChange(undefined)} />单次打卡</label>
      <label><input type="radio" name="checkin-publish-mode" checked={Boolean(value)} onChange={() => onChange({ firstPublishAt: '', interval: 1, unit: 'days', durationHours: 24, endsAt: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })} />周期打卡</label>
    </div>
    {value && <div className="training-checkin-recurrence__fields">
      <label>首次发布时间<input type="datetime-local" className="input w-full" value={value.firstPublishAt} onChange={e => onChange({ ...value, firstPublishAt: e.target.value })} /><small>留空则立即开始。时区：{value.timezone}</small></label>
      <label>重复间隔<div className="training-checkin-recurrence__interval"><span>每</span><input aria-label="重复间隔数量" type="number" className="input" min={1} max={value.unit === 'weeks' ? 52 : 365} required value={value.interval} onChange={e => onChange({ ...value, interval: Number(e.target.value) })} /><select aria-label="重复间隔单位" className="input" value={value.unit} onChange={e => onChange({ ...value, unit: e.target.value as 'days' | 'weeks' })}><option value="days">天</option><option value="weeks">周</option></select></div></label>
      <label>每期有效时长（小时）<input type="number" className="input w-full" min={1} max={8760} required value={value.durationHours} onChange={e => onChange({ ...value, durationHours: Number(e.target.value) })} /></label>
      <label>结束发布时间（可选）<input type="datetime-local" className="input w-full" value={value.endsAt} onChange={e => onChange({ ...value, endsAt: e.target.value })} /><small>留空则持续发布，可随时在课程打卡页停止。</small></label>
      <p>每期内容相同、提交独立，截止时间从该期计划发布时间计算。一天按 24 小时、一周按 7 天间隔计算；系统约每分钟发布到期任务。服务恢复时仅补发最近一期仍有效的任务。</p>
    </div>}
  </fieldset>
}
