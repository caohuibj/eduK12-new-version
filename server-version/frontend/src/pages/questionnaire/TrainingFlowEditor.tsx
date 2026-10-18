import { ProductButton } from '../../components/product-ui'
import { createTrainingFlow, enableTrainingMaterials, isMaterialFlowText, formatTrainingFlow, parseTrainingFlow, trainingFlowSources, trainingFlowUnitKey,
  type TrainingFlowAuthoringUnit, type TrainingFlowConfig } from './trainingFlow'

export const trainingFlowEditorId = 'questionnaire-training-flow-json'
type Props = {
  maxAttempts: number; onMaxAttemptsChange: (value: number) => void
  text: string; frozen: TrainingFlowConfig | null; units: TrainingFlowAuthoringUnit[]
  draft: boolean; eligible: boolean; busy: boolean; dirty: boolean; error: string
  onChange: (text: string) => void; onSave: () => void; onError: (message: string) => void
}
export function TrainingFlowEditor({ maxAttempts, onMaxAttemptsChange, text, frozen, units, draft, eligible, busy, dirty, error, onChange, onSave, onError }: Props) {
  const enabled = Boolean(text.trim()), sources = trainingFlowSources(units)
  const materialsEnabled = draft ? isMaterialFlowText(text) : frozen?.schemaVersion === 2
  const addExperiment = (quota: boolean) => {
    try {
      const existing = parseTrainingFlow(text, units)
      if (!existing) return
      const config = enableTrainingMaterials(existing)
      if (quota && !config.quotaPolicy) config.quotaPolicy = { schemaVersion: 1, groupLimits: Object.fromEntries(config.experiment.groups.map(group => [group.groupKey, 100])) }
      onChange(formatTrainingFlow(config))
    } catch (cause) { onError((cause as Error).message); document.getElementById(trainingFlowEditorId)?.focus() }
  }
  const insert = (kind: 'MATERIAL' | 'END') => {
    try {
      const config = parseTrainingFlow(text, units)
      if (!config) return
      let number = 1
      while (config.blocks.some(block => block.blockKey === `added_${number}`)) number++
      if (kind === 'MATERIAL') config.blocks.push({ blockKey: `added_${number}`, kind, title: '课程材料', body: '请在此填写需要展示的材料正文。' })
      else {
        const source = sources.find(source => source.question.options.length)
        if (!source) throw new Error('请先添加 typed SINGLE / MULTIPLE / LIKERT 题目并保存，再添加条件结束。')
        const index = config.blocks.findIndex(block => block.instrumentKey === source.instrumentKey)
        config.blocks.splice(index + 1, 0, { blockKey: `added_${number}`, kind, termination: 'SCREEN_OUT', when: {
          op: source.question.type === 'MULTIPLE' ? 'INCLUDES' : 'EQUALS',
          field: { source: 'ANSWER', instrumentKey: source.instrumentKey, itemKey: source.question.itemKey },
          value: source.question.options[0].optionKey,
        } })
      }
      onChange(formatTrainingFlow(config))
    } catch (cause) { onError((cause as Error).message); document.getElementById(trainingFlowEditorId)?.focus() }
  }
  return <section aria-label="跨工具条件流程" className="space-y-3 my-4 rounded border p-4">
    <h2 className="font-semibold">可选：跨工具条件流程</h2>
    {draft ? <label className="block"><input type="checkbox" checked={enabled} disabled={busy || (!eligible && !enabled) || (!units.length && !enabled)} onChange={event => onChange(event.target.checked ? formatTrainingFlow(createTrainingFlow(units)) : '')} />{' '}启用跨工具条件流程</label>
      : <p>当前发布版本的工具、条件、材料与结束规则已冻结。</p>}
    <p>仅支持真实 Training 课程问卷，暂不能与概率分卷、匿名研究、关系测评、报告包或其他投放策略组合。</p>
    {draft && enabled && !eligible && <p role="alert">请先调整课程绑定或关闭不兼容的分组配置，再保存流程。</p>}
    {(enabled || (!draft && frozen)) && <>
      <p>服务端只依据已接受的前置表单答案决定后续路径。材料只供展示，“继续”不证明已阅读，也不产生分数或任务完成记录。</p>
      <p>SCREEN_OUT 表示资格筛除；COMPLETE_EARLY 表示提前结束。交卷结束与任务达成分别判断，材料本身不能满足任务。</p>
      {materialsEnabled && <>
        {draft ? <label className="block">最多作答次数（材料实验）
          <input className="input ml-2" type="number" min={1} max={100} step={1} value={Number.isNaN(maxAttempts) ? '' : maxAttempts} disabled={busy} onChange={event => onMaxAttemptsChange(event.target.value === '' ? NaN : Number(event.target.value))} />
        </label> : <p>每位作答者最多作答 {maxAttempts} 次。</p>}
        <p>材料组按权重分配，并始终在流程开头展示。配额统计已分配机会，不统计阅读、FINAL 或完成；SCREEN_OUT 不退还配额。满额组退出抽样后，其余组的实际概率会改变。</p>
        <p>KEEP_LINKED 仅对已登录者在同一授权所有者、课程与 experimentKey 范围内跨发布保留分组。匿名重启沿用原认领并轮换凭证；新链接不代表同一关联身份。RERANDOMIZE 在新的合法作答机会重新抽组。</p>
      </>}
      <label className="block" htmlFor={trainingFlowEditorId}>流程 JSON（高级编辑）</label>
      <textarea id={trainingFlowEditorId} rows={20} className="input w-full font-mono" spellCheck={false} readOnly={!draft} disabled={busy}
        value={draft ? text : formatTrainingFlow(frozen)} aria-invalid={Boolean(error)} aria-describedby="training-flow-guide training-flow-error" onChange={event => onChange(event.target.value)} />
      {error && <p id="training-flow-error" role="alert">{error}</p>}
      <div id="training-flow-guide" className="space-y-2 text-sm">
        <p>普通流程使用 schemaVersion: 1；显式材料实验使用 schemaVersion: 2。blocks 按执行顺序排列，最多 64 块；每块须有唯一 blockKey，所有工具须准确出现一次。</p>
        <p>V2 的 experiment 包含 experimentKey、linkedPolicy（KEEP_LINKED / RERANDOMIZE）和 2–8 个 groups；每组填写唯一 groupKey、整数 weight（1–100）、非空 materialTitle 与 materialBody（各最多 8000 字）。可选 quotaPolicy 使用 schemaVersion: 1，groupLimits 精确列出各组的整数配额（1–10000）。</p>
        <p>assigned_material 是 V2 保留块名。不能按 groupKey 分支，不支持材料插值或额外条件类型。</p>
        <p>INSTRUMENT：填写 instrumentKey。MATERIAL：填写 body，可加 title。END：填写 when 和 termination。所有块可加 when。</p>
        <p>条件格式：op 为 EQUALS / INCLUDES / IS_MISSING，field 为 source: ANSWER、instrumentKey 和 itemKey；value 使用下方 optionKey。IS_MISSING 不填 value。组合条件使用 AND / OR 的 terms 数组，或 NOT 的 term。</p>
        <p>只能引用流程中已在前面出现的 typed SINGLE / MULTIPLE / LIKERT；SINGLE 和 LIKERT 用 EQUALS，MULTIPLE 用 INCLUDES。前置工具未执行时，引用它的整个条件会跳过，包括 NOT 和 OR。</p>
        <p>材料模板添加到流程末尾；条件结束模板添加在首个可用选择题区段之后。请在 JSON 中调整位置与条件后保存，服务端会再次校验。</p>
      </div>
      <details><summary>可用工具与稳定答案键</summary><ul className="space-y-2">{units.map(unit => <li key={unit.id}>{unit.label}：{trainingFlowUnitKey(unit)}</li>)}</ul>
        {sources.map(source => <p key={`${source.instrumentKey}:${source.question.itemKey}`}>{source.unitLabel} / {source.question.prompt}（{source.question.type}）：itemKey = {source.question.itemKey}；optionKey：{source.question.options.map(option => `${option.optionKey}（${option.label}）`).join('、')}</p>)}
        {!sources.length && <p>当前没有可用于分支的 typed 选择题。历史文本题不提供分支答案键。</p>}
      </details>
      {draft && <div className="flex flex-wrap gap-3"><ProductButton disabled={busy || materialsEnabled} onClick={() => addExperiment(false)}>启用两组材料实验</ProductButton>{materialsEnabled && <ProductButton disabled={busy} onClick={() => addExperiment(true)}>添加配额示例</ProductButton>}<ProductButton disabled={busy} onClick={() => insert('MATERIAL')}>添加材料模板</ProductButton><ProductButton disabled={busy || !sources.length} onClick={() => insert('END')}>添加条件结束模板</ProductButton></div>}
    </>}
    {draft && <div className="flex flex-wrap items-center gap-3"><p role="status">{dirty ? '流程有未保存的修改' : enabled ? '流程已保存，发布时冻结' : '未启用条件流程，保持原有作答流程'}</p><ProductButton disabled={busy || !dirty} onClick={onSave}>保存流程设置</ProductButton></div>}
  </section>
}
