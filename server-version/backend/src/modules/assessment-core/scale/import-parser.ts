import { parseCsvRows, type ImportIssue } from '../form/import-parser'
import { validateScaleDefinition, type ScaleDefinitionV2 } from '../../scale/scale-definition'

export const SCALE_IMPORT_MAX_BYTES = 200000
export const SCALE_IMPORT_MAX_ITEMS = 200
const key = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const columns = ['item_code', 'prompt', 'reverse', 'score_keys', 'response_set_key']
export class ScaleImportValidationError extends Error {
  constructor(readonly issues: ImportIssue[]) { super('量表导入未通过校验') }
}
const fail = (line: number, message: string): never => { throw new ScaleImportValidationError([{ line, message }]) }

// The legacy tokenizer deliberately remains unchanged. Reject malformed quoting
// here before consuming it (e.g. "value"suffix); no silent cell repair.
function assertStrictCsv(content: string) {
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start', line = 1
  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (state === 'quoted') {
      if (c === '"' && content[i + 1] === '"') { i++; continue }
      if (c === '"') state = 'closed'
      if (c === '\n') line++
      continue
    }
    if (c === ',' || c === '\n' || c === '\r') { state = 'start'; if (c === '\n') line++; continue }
    if (state === 'closed' || (c === '"' && state !== 'start')) fail(line, 'CSV 引号或分隔格式错误')
    state = c === '"' ? 'quoted' : 'plain'
  }
  if (state === 'quoted') fail(line, 'CSV 引号未闭合')
}

/** Pure authoring adapter. No identity, persistence, runtime, or scoring model. */
export function parseScaleImport(content: string, rawDefinition: unknown): {
  definition: ScaleDefinitionV2; count: number; items: Array<{ itemCode: string; content: string; reverse: boolean; scoreKeys: string[] }>
} {
  if (!content || Buffer.byteLength(content, 'utf8') > SCALE_IMPORT_MAX_BYTES) fail(1, 'CSV 必须非空且不超过 200000 字节')
  const validation = validateScaleDefinition(rawDefinition, { instrumentClass: 'CUSTOM_DESCRIPTIVE' })
  if (!validation.definition || validation.issues.some(issue => issue.severity === 'error'))
    fail(1, '请先保存合法的单共享响应集自定义量表定义及计分项')
  const definition = structuredClone(validation.definition!)
  const shared = definition.responseSets[0]
  if (definition.responseSets.length !== 1 || !key.test(shared.key)) fail(1, '仅支持一套合法共享 responseSet')
  const keys = [...definition.items.map(item => item.itemCode), ...definition.scoring.scores.map(score => score.key)]
  if (keys.some(value => !key.test(value))) fail(1, '现有题目或计分项标识不符合导入稳定键规则')
  if (shared.options.length > 100 || shared.options.some(option => option.label.length > 2000)) fail(1, '共享选项超出导入限制')
  const source = content.replace(/^\uFEFF/, '')
  assertStrictCsv(source)
  const rows = parseCsvRows(source)
  if (!rows.length) fail(1, 'CSV 为空')
  const header = rows.shift()!.cells.map(value => value.trim())
  if (new Set(header).size !== header.length) fail(1, '表头不能重复')
  if (header.length !== columns.length || columns.some(name => !header.includes(name))) fail(1, `仅支持且必须包含表头：${columns.join(',')}`)
  const data = rows.filter(row => row.cells.some(cell => cell.trim()))
  if (!data.length || data.length + definition.items.length > SCALE_IMPORT_MAX_ITEMS) fail(1, '导入后题目总数必须为 1–200')
  const knownItems = new Set(definition.items.map(item => item.itemCode))
  const items: Array<{ itemCode: string; content: string; reverse: boolean; scoreKeys: string[] }> = []
  let sortOrder = Math.max(-1, ...definition.items.map(item => item.sortOrder)) + 1
  for (const row of data) {
    const line = row.sourceLine
    if (row.cells.length !== header.length) fail(line, 'CSV 列数与表头不一致')
    const field = (name: string) => row.cells[header.indexOf(name)].trim()
    const itemCode = field('item_code'), prompt = field('prompt'), reverse = field('reverse')
    if (!key.test(itemCode) || knownItems.has(itemCode)) fail(line, 'item_code 非法或重复（含现有题目）')
    if (!prompt || prompt.length > 16000) fail(line, '题干必须为 1–16000 字符')
    if (reverse !== 'true' && reverse !== 'false') fail(line, 'reverse 必须明确填写 true 或 false')
    if (field('response_set_key') !== shared.key) fail(line, 'response_set_key 必须与现有共享响应集一致')
    const scoreKeys = field('score_keys').split('|')
    if (new Set(scoreKeys).size !== scoreKeys.length || scoreKeys.some(value => !key.test(value))) fail(line, 'score_keys 必须为合法且不重复的计分项标识，用 | 分隔')
    for (const scoreKey of scoreKeys) {
      const score = definition.scoring.scores.find(candidate => candidate.key === scoreKey)
      if (!score || score.source.type !== 'items') fail(line, 'score_keys 必须引用现有直接按题目计分的计分项')
      if (score!.source.type === 'items') score!.source.items.push({ itemCode, weight: 1 })
    }
    knownItems.add(itemCode)
    definition.items.push({ itemCode, content: prompt, type: 'single', required: true, sortOrder: sortOrder++, responseSetKey: shared.key, randomizeOptions: false })
    definition.scoring.itemRules.push({ itemCode, transform: { type: reverse === 'true' ? 'reverse' : 'identity' } })
    items.push({ itemCode, content: prompt, reverse: reverse === 'true', scoreKeys })
  }
  const next = validateScaleDefinition(definition, { instrumentClass: 'CUSTOM_DESCRIPTIVE' })
  const errors = next.issues.filter(issue => issue.severity === 'error')
  if (!next.definition || errors.length) throw new ScaleImportValidationError(errors.map(issue => ({ line: 1, message: `${issue.path}: ${issue.message}` })))
  return { definition: next.definition!, count: items.length, items }
}
