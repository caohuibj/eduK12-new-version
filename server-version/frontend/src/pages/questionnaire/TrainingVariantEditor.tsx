import { Shuffle } from 'lucide-react'
import { ProductButton } from '../../components/product-ui'
import {
  createTrainingVariants,
  newTrainingVariantGroup,
  toggleTrainingVariantUnit,
  variantUnit,
  variantUnitKey,
  type TrainingAuthoringUnit,
  type TrainingVariantConfig,
  type TrainingVariantGroup,
} from './trainingVariants'

type Props = {
  guided?: boolean
  config: TrainingVariantConfig | null
  frozen: TrainingVariantConfig | null
  maxAttempts: number
  units: TrainingAuthoringUnit[]
  draft: boolean
  eligible: boolean
  busy: boolean
  dirty: boolean
  onChange: (config: TrainingVariantConfig | null) => void
  onMaxAttemptsChange: (maxAttempts: number) => void
  onSave: () => void
}

export function TrainingVariantEditor({
  config, frozen, maxAttempts, units, draft, eligible, busy, dirty, guided = false,
  onChange, onMaxAttemptsChange, onSave,
}: Props) {
  const displayed = draft ? config : frozen
  const totalWeight = displayed?.groups.reduce((sum, group) => sum + group.weight, 0) ?? 0
  const updateGroup = (index: number, next: TrainingVariantGroup) => {
    if (config) onChange({ ...config, groups: config.groups.map((group, i) => i === index ? next : group) })
  }
  const unitLabel = (unit: { type: string; id: string }) => units.find(candidate => candidate.id === unit.id && variantUnit(candidate).type === unit.type)?.label ?? '已冻结内容单元'
  return (
    <section aria-label="按权重随机分组" className={guided ? 'qt-strategy-card qt-variant-editor' : 'space-y-3 my-4 rounded border p-4'}>
      {guided ? <header className="qt-option-heading"><span className="qt-option-icon" aria-hidden="true"><Shuffle size={19} /></span><div><h3>随机分配测评内容</h3><p>适合不同学员作答不同版本的测评，例如 A / B 两套内容。</p></div><span className={'qt-option-status' + (displayed ? ' is-on' : '')}>{displayed ? '已开启' : '未开启'}</span></header> : <h2 className="font-semibold">可选：按权重随机分组</h2>}
      {draft ? <label className="block">
        <input type="checkbox" checked={Boolean(config)} disabled={busy || (!eligible && !config)} onChange={event => onChange(event.target.checked ? createTrainingVariants(units) : null)} />{' '}
        启用按权重随机分组
      </label> : <p>当前发布版本的分组、权重、内容与作答次数已冻结，不可修改。</p>}
      {guided && draft && !eligible && !config && <p className="qt-inline-notice">请先绑定并保存 Training 课程；若已启用条件流程，请先关闭并保存后再使用随机分组。</p>}
      {guided && <p className="qt-option-example">例如：A 组和 B 组的权重都设为 1，各有约 50% 的机会被抽中。权重是抽取比例，不保证两组人数相同。</p>}
      {draft && !eligible && config && <p role="alert">仅支持真实 Training 课程投放；启用公开链接时须唯一绑定一个课程。请调整并保存投放设置，或关闭随机分组。</p>}
      {displayed && <>
        {!guided && <p>每次合法的新作答按权重随机选择一个分组。权重代表概率，不保证精确人数或配额；下一次合法作答仍可能抽到同一分组。</p>}
        {guided && <p className="qt-option-help">每次新的合法作答都会重新抽组，可能再次抽到同一组；继续未完成的作答则保持原组。</p>}
        <p className={guided ? "qt-inline-notice" : undefined}>取消作答也会消耗一次作答次数。继续未结束的作答会保持原分组。</p>
        {draft ? <label className={guided ? "qt-attempt-limit" : "block"}>最多作答次数
          <input className="input ml-2" type="number" min={1} max={100} step={1} value={Number.isNaN(maxAttempts) ? '' : maxAttempts} disabled={busy} onChange={event => onMaxAttemptsChange(event.target.value === '' ? NaN : Number(event.target.value))} />
        </label> : <p>每位作答者最多作答 {maxAttempts} 次。</p>}
        {!guided && <p>每组只选择已有的完整内容单元，表单按完整区段选择，不拆分题目。共享背景区段会自动保留在所有组的第一位。所有内容须至少属于一个组。</p>}
        {draft && !guided && <p>如需新增、移除或重排原内容，且影响现有分组，请先关闭并保存随机分组，调整内容后再配置。</p>}
        <div className={guided ? "qt-variant-groups" : "space-y-3"}>
          {displayed.groups.map((group, index) => <fieldset key={group.variantKey} disabled={busy || !draft} className={guided ? "qt-variant-group" : "space-y-2 rounded border p-3"}>
            <legend>{draft ? `分组 ${index + 1}` : group.label}</legend>
            {guided && <div className="qt-probability"><span>预计抽取概率</span><strong>{totalWeight > 0 && Number.isFinite(totalWeight) && Number.isFinite(group.weight) ? `${(group.weight / totalWeight * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%` : '待填写权重'}</strong><div className="qt-probability-track" aria-hidden="true"><i style={{ width: totalWeight > 0 && Number.isFinite(totalWeight) && Number.isFinite(group.weight) ? `${Math.max(0, Math.min(100, group.weight / totalWeight * 100))}%` : '0%' }} /></div></div>}
            {draft ? <>
              <div className={guided ? 'qt-group-fields' : undefined}>
              <label className="block">分组 {index + 1} 名称
                <input className="input ml-2" maxLength={200} value={group.label} onChange={event => updateGroup(index, { ...group, label: event.target.value })} />
              </label>
              <label className="block">分组 {index + 1} 权重
                <input className="input ml-2" type="number" min={1} max={100} step={1} value={Number.isNaN(group.weight) ? '' : group.weight} onChange={event => updateGroup(index, { ...group, weight: event.target.value === '' ? NaN : Number(event.target.value) })} />
              </label>
              </div>
              {guided && <p className="qt-option-help">勾选这组需要作答的内容，可与其他组重复选择。</p>}
              <fieldset className={guided ? 'qt-unit-checklist' : undefined}>
                <legend>分组 {index + 1} 的完整内容单元</legend>
                {units.map(unit => {
                  const ref = variantUnit(unit)
                  const checked = group.units.some(selected => variantUnitKey(selected) === variantUnitKey(ref))
                  return <label className="block" key={variantUnitKey(ref)}>
                    <input type="checkbox" checked={checked} disabled={Boolean(unit.contextSection)} onChange={event => updateGroup(index, toggleTrainingVariantUnit(group, ref, event.target.checked, units))} />{' '}
                    {unit.label}{unit.type === 'FORM_SECTION' ? '（完整表单区段）' : ''}{unit.contextSection ? ' · 共享背景，所有组必选且置顶' : ''}
                  </label>
                })}
                {!units.length && <p>请先添加内容单元。</p>}
              </fieldset>
              {guided && <p className="qt-selection-count">已选择 {group.units.length} 个完整内容单元</p>}
              <ProductButton disabled={displayed.groups.length <= 2} onClick={() => onChange({ ...displayed, groups: displayed.groups.filter((_, i) => i !== index) })}>移除分组 {index + 1}</ProductButton>
            </> : <ul>{group.units.map(unit => <li key={variantUnitKey(unit)}>{unitLabel(unit)}{unit.type === 'FORM_SECTION' ? '（完整表单区段）' : ''}</li>)}</ul>}
            <p>权重 {Number.isNaN(group.weight) ? '未填写' : group.weight}{totalWeight > 0 && Number.isFinite(totalWeight) ? `，抽取概率约 ${(group.weight / totalWeight * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%` : ''}</p>
          </fieldset>)}
        </div>
        {draft && <ProductButton disabled={busy || displayed.groups.length >= 8} onClick={() => onChange({ ...displayed, groups: [...displayed.groups, newTrainingVariantGroup(displayed.groups, units)] })}>添加分组（最多 8 组）</ProductButton>}
      </>}
      {guided && <details className="qt-rule-details"><summary>分组规则与内容调整说明</summary><p>每组选择完整内容单元，表单按完整答题阶段选择，不拆分题目。共享背景阶段自动保留在所有组的第一位；所有内容须至少属于一个组。</p><p>若要调整已纳入分组的原内容，请先关闭并保存随机分组，再调整内容并重新配置。发布后分组、权重和作答次数固定。</p></details>}
      {draft && <div className={guided ? 'qt-strategy-save' : 'flex flex-wrap items-center gap-3'}>
        <p role="status">{dirty ? '分组设置有未保存的修改' : config ? '分组设置已保存，发布时冻结' : '未启用随机分组，保持原有完整作答流程'}</p>
        <ProductButton disabled={busy || !dirty} onClick={onSave}>保存分组设置</ProductButton>
      </div>}
    </section>
  )
}
