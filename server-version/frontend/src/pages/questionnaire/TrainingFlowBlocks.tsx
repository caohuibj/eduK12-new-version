import { ConditionEditor } from '../../modules/assessment-core/flow/ConditionEditor'
import { defaultPredicate, type FieldChoice, type FlowCondition } from '../../modules/assessment-core/flow/conditions'
import { formatTrainingFlow, parseTrainingFlow, trainingFlowSources, trainingFlowUnitKey,
  type TrainingFlowAuthoringUnit, type TrainingFlowConfig, type TrainingFlowCondition } from './trainingFlow'

// Shared controls emit the union of both products; this adapter keeps Training's subset explicit.
function trainingCondition(value: FlowCondition): TrainingFlowCondition {
  if (value.op === 'AND' || value.op === 'OR') return { op: value.op, terms: value.terms.map(trainingCondition) }
  if (value.op === 'NOT') return { op: 'NOT', term: trainingCondition(value.term) }
  if ('field' in value && value.field.source === 'ANSWER' && ['EQUALS', 'INCLUDES', 'IS_MISSING'].includes(value.op)
    && (value.value === undefined || typeof value.value === 'string')) {
    return { op: value.op as 'EQUALS' | 'INCLUDES' | 'IS_MISSING', field: value.field,
      ...(value.value === undefined ? {} : { value: value.value }) }
  }
  throw new Error('Training 仅支持前置选择题的等于、包含或未回答条件。')
}
export function TrainingFlowBlocks({ config, units, disabled, onChange, onError }: {
  config: TrainingFlowConfig; units: TrainingFlowAuthoringUnit[]; disabled: boolean
  onChange: (text: string) => void; onError: (message: string) => void
}) {
  const sources = trainingFlowSources(units)
  const apply = (next: TrainingFlowConfig) => {
    try {
      const text = formatTrainingFlow(next)
      parseTrainingFlow(text, units)
      onChange(text)
    } catch (cause) { onError((cause as Error).message) }
  }
  return <fieldset disabled={disabled} className="training-flow-blocks" aria-label="可视化流程编制">
    {config.blocks.map((block, index) => {
      const previous = new Set(config.blocks.slice(0, index).filter(x => x.kind === 'INSTRUMENT').map(x => x.instrumentKey))
      const fields: FieldChoice[] = sources.filter(x => previous.has(x.instrumentKey)).map(x => ({
        id: `A:${x.instrumentKey}:${x.question.itemKey}`, label: `${x.unitLabel} / ${x.question.prompt}`,
        field: { source: 'ANSWER', instrumentKey: x.instrumentKey, itemKey: x.question.itemKey },
        kind: x.question.type === 'MULTIPLE' ? 'choices' : 'choice',
        options: x.question.options.map(o => ({ key: o.optionKey, label: o.label })),
      }))
      const update = (patch: Partial<typeof block>) => apply({ ...config, blocks: config.blocks.map((x, i) => i === index ? { ...x, ...patch } : x) })
      const move = (offset: number) => {
        const blocks = [...config.blocks]
        ;[blocks[index], blocks[index + offset]] = [blocks[index + offset], blocks[index]]
        apply({ ...config, blocks })
      }
      const title = block.kind === 'INSTRUMENT' ? units.find(x => trainingFlowUnitKey(x) === block.instrumentKey)?.label
        : block.kind === 'END' ? '条件结束' : block.title || '展示材料'
      return <section className="training-flow-block" key={block.blockKey} aria-label={`流程块 ${index + 1}：${title}`}>
        <header><strong>{index + 1}. {title}</strong><div className="training-flow-block-actions">
          <button type="button" className="btn-secondary" aria-label={`上移 ${title}`} disabled={index === 0} onClick={() => move(-1)}>上移</button>
          <button type="button" className="btn-secondary" aria-label={`下移 ${title}`} disabled={index === config.blocks.length - 1} onClick={() => move(1)}>下移</button>
          {block.kind !== 'INSTRUMENT' && <button type="button" className="btn-secondary" onClick={() => apply({ ...config, blocks: config.blocks.filter((_, i) => i !== index) })}>移除</button>}
        </div></header>
        {block.kind === 'MATERIAL' && <p>{block.body}</p>}
        {block.kind !== 'END' && <label><input type="checkbox" checked={Boolean(block.when)} disabled={!fields.length && !block.when}
          onChange={e => {
            if (e.target.checked) update({ when: trainingCondition(defaultPredicate(fields)) })
            else { const next = { ...block }; delete next.when; apply({ ...config, blocks: config.blocks.map((x, i) => i === index ? next : x) }) }
          }} /> 满足条件时才展示</label>}
        {block.when && <ConditionEditor value={block.when} fields={fields} appearance="training"
          operators={['EQUALS', 'INCLUDES', 'IS_MISSING']} sourceLabel="前置表单题目（只显示本块之前的选择题）"
          onChange={value => { try { update({ when: trainingCondition(value) }) } catch (cause) { onError((cause as Error).message) } }} />}
        {block.kind === 'END' && <label>结束方式<select className="input" value={block.termination} onChange={e => update({ termination: e.target.value as 'SCREEN_OUT' | 'COMPLETE_EARLY' })}>
          <option value="SCREEN_OUT">资格筛除</option><option value="COMPLETE_EARLY">提前结束</option>
        </select></label>}
      </section>
    })}
  </fieldset>
}
