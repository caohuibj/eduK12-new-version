import type { FormQuestion } from '../../modules/assessment-core/form/types'

/** Authoring contract only. Participant paths are always computed by the server. */
export type TrainingFlowCondition =
  | { op: 'AND' | 'OR'; terms: TrainingFlowCondition[] }
  | { op: 'NOT'; term: TrainingFlowCondition }
  | { op: 'EQUALS' | 'INCLUDES' | 'IS_MISSING'; field: { source: 'ANSWER'; instrumentKey: string; itemKey: string }; value?: string }
export type TrainingFlowBlock = {
  blockKey: string
  kind: 'INSTRUMENT' | 'MATERIAL' | 'END'
  instrumentKey?: string
  title?: string
  body?: string
  when?: TrainingFlowCondition
  termination?: 'COMPLETE_EARLY' | 'SCREEN_OUT'
}
export type TrainingFlowConfig = { schemaVersion: 1; blocks: TrainingFlowBlock[] }
export type TrainingFlowAuthoringUnit = {
  id: string; type: string; label: string
  items?: Array<{ formDefinition?: FormQuestion<never> | null }>
}
export const trainingFlowUnitKey = (unit: Pick<TrainingFlowAuthoringUnit, 'id' | 'type'>) =>
  `${unit.type === 'FORM_SECTION' ? 'section' : 'item'}_${unit.id.replace(/-/g, '_')}`
export const trainingFlowSources = (units: TrainingFlowAuthoringUnit[]) => units.flatMap(unit =>
  unit.type === 'FORM_SECTION' ? (unit.items ?? []).flatMap(item => {
    const question = item.formDefinition
    return question && ['SINGLE', 'MULTIPLE', 'LIKERT'].includes(question.type)
      ? [{ instrumentKey: trainingFlowUnitKey(unit), unitLabel: unit.label, question }]
      : []
  }) : [])
export const createTrainingFlow = (units: TrainingFlowAuthoringUnit[]): TrainingFlowConfig => ({
  schemaVersion: 1,
  blocks: units.map((unit, index) => ({ blockKey: `tool_${index + 1}`, kind: 'INSTRUMENT', instrumentKey: trainingFlowUnitKey(unit) })),
})
export const formatTrainingFlow = (config: TrainingFlowConfig | null) => config ? JSON.stringify(config, null, 2) : ''
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const key = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,79}$/.test(value)
const exact = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(name => allowed.includes(name))

/** Bounded UX validation mirrors the supported subset, never evaluates answers.
 * The API still performs authoritative compilation and revision checks. */
export function parseTrainingFlow(text: string, units: TrainingFlowAuthoringUnit[]): TrainingFlowConfig | null {
  if (!text.trim()) return null
  if (text.length > 262144) throw new Error('流程 JSON 过大，请缩减至 256 KB 以内。')
  let input: unknown
  try { input = JSON.parse(text) } catch { throw new Error('流程 JSON 格式无效，请检查引号、逗号和括号。') }
  if (!record(input) || !exact(input, ['schemaVersion', 'blocks']) || input.schemaVersion !== 1 || !Array.isArray(input.blocks) || !input.blocks.length || input.blocks.length > 64) throw new Error('流程须为 schemaVersion: 1，包含 1–64 个 blocks。')
  const unitKeys = new Set(units.map(trainingFlowUnitKey)), visited = new Set<string>(), blockKeys = new Set<string>()
  const sources = trainingFlowSources(units)
  let predicates = 0, started = false
  const condition = (node: unknown, depth: number): void => {
    if (++predicates > 64 || depth > 6) throw new Error('条件最多 64 个节点，嵌套深度最多 6 层。')
    if (!record(node)) throw new Error('when 必须是条件对象。')
    if (node.op === 'AND' || node.op === 'OR') {
      if (!exact(node, ['op', 'terms']) || !Array.isArray(node.terms) || !node.terms.length || node.terms.length > 8) throw new Error('AND / OR 须包含 1–8 个 terms。')
      node.terms.forEach(term => condition(term, depth + 1)); return
    }
    if (node.op === 'NOT') {
      if (!exact(node, ['op', 'term'])) throw new Error('NOT 只允许 op 和 term。')
      condition(node.term, depth + 1); return
    }
    if (!exact(node, ['op', 'field', 'value']) || !['EQUALS', 'INCLUDES', 'IS_MISSING'].includes(String(node.op))) throw new Error('条件只支持 AND、OR、NOT、EQUALS、INCLUDES、IS_MISSING。')
    const field = node.field
    if (!record(field) || !exact(field, ['source', 'instrumentKey', 'itemKey']) || field.source !== 'ANSWER' || typeof field.instrumentKey !== 'string' || !visited.has(field.instrumentKey)) throw new Error('条件只能引用前置 Form 单元已接受的答案，不能引用自身或未来单元。')
    const source = sources.find(source => source.instrumentKey === field.instrumentKey && source.question.itemKey === field.itemKey)
    if (!source) throw new Error('条件须引用前置 typed SINGLE / MULTIPLE / LIKERT 的稳定 itemKey。')
    if (node.op === 'IS_MISSING') {
      if ('value' in node) throw new Error('IS_MISSING 不可填写 value。')
    } else {
      if (typeof node.value !== 'string' || !source.question.options.some(option => option.optionKey === node.value)) throw new Error('value 须使用该题的稳定 optionKey。')
      if ((node.op === 'INCLUDES') !== (source.question.type === 'MULTIPLE')) throw new Error('MULTIPLE 使用 INCLUDES；SINGLE / LIKERT 使用 EQUALS。')
    }
  }
  for (const [index, raw] of input.blocks.entries()) {
    try {
      if (!record(raw) || !exact(raw, ['blockKey', 'kind', 'instrumentKey', 'title', 'body', 'when', 'termination']) || !key(raw.blockKey) || blockKeys.has(raw.blockKey)) throw new Error('blockKey 须唯一，以小写字母开头，只含小写字母、数字、下划线或连字符。')
      blockKeys.add(raw.blockKey)
      if (raw.when !== undefined) condition(raw.when, 0)
      if (raw.kind === 'INSTRUMENT') {
        if (typeof raw.instrumentKey !== 'string' || !unitKeys.has(raw.instrumentKey) || visited.has(raw.instrumentKey)) throw new Error('工具须使用现有 instrumentKey，且每个工具只能出现一次。')
        if (raw.title !== undefined || raw.body !== undefined || raw.termination !== undefined) throw new Error('INSTRUMENT 不可包含 title、body 或 termination。')
        visited.add(raw.instrumentKey)
        if (!raw.when) started = true
      } else if (raw.kind === 'MATERIAL') {
        if (raw.instrumentKey !== undefined || raw.termination !== undefined || typeof raw.body !== 'string' || !raw.body.trim() || raw.body.length > 8000) throw new Error('MATERIAL 须有 1–8000 字 body，不可包含工具或终止参数。')
      } else if (raw.kind === 'END') {
        if (!raw.when || !started || !['SCREEN_OUT', 'COMPLETE_EARLY'].includes(String(raw.termination)) || raw.instrumentKey !== undefined || raw.body !== undefined) throw new Error('END 须位于无条件工具之后，填写 when 和 SCREEN_OUT / COMPLETE_EARLY，不可包含工具或正文。')
      } else throw new Error('kind 只支持 INSTRUMENT、MATERIAL、END。')
      if (raw.title !== undefined && (typeof raw.title !== 'string' || raw.title.length > 8000)) throw new Error('title 须为不超过 8000 字的文本。')
      if ([raw.title, raw.body].some(value => typeof value === 'string' && /\{\{|\}\}/.test(value))) throw new Error('当前材料仅支持纯文本，不支持变量或表达式插值。')
    } catch (error) { throw new Error(`第 ${index + 1} 个流程块：${(error as Error).message}`) }
  }
  if (visited.size !== unitKeys.size) throw new Error('全部内容单元须在流程中准确出现一次；请保留所有工具，再用 when 决定是否执行。')
  return input as TrainingFlowConfig
}
