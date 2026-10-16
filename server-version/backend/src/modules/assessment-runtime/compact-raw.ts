import type { ScaleAnswer } from '../scale/scale-scoring'
const ANSWER_KEYS = ['itemCode', 'responseValue', 'responseTimeMs', 'answeredAt', 'changeCount', 'revision'] as const
type Rows = { kind: 'SCALE_ANSWER_ROWS'; version: 1; fields: string[]; rows: unknown[][] }
export const encodeAnswerRows = (answers: ScaleAnswer[]): Rows => {
  const fields = ANSWER_KEYS.filter(key => answers.some(answer => Object.prototype.hasOwnProperty.call(answer, key)))
  for (const answer of answers) if (Object.keys(answer).some(key => !(ANSWER_KEYS as readonly string[]).includes(key))) throw new Error('Unsupported raw answer field')
  return { kind: 'SCALE_ANSWER_ROWS', version: 1, fields, rows: answers.map(answer => {
    let mask = 0; const values: unknown[] = []
    fields.forEach((key, i) => { if (Object.prototype.hasOwnProperty.call(answer, key)) { mask |= 1 << i; values.push(answer[key]) } })
    return [mask, ...values]
  }) }
}
export const isAnswerRows = (value: any): value is Rows => value?.kind === 'SCALE_ANSWER_ROWS'
export const decodeAnswerRows = (value: unknown): ScaleAnswer[] => {
  const data = value as Rows
  if (data?.kind !== 'SCALE_ANSWER_ROWS' || data.version !== 1 || !Array.isArray(data.fields) || data.fields.length > ANSWER_KEYS.length
    || new Set(data.fields).size !== data.fields.length || data.fields.some(key => !(ANSWER_KEYS as readonly string[]).includes(key))
    || !Array.isArray(data.rows) || data.rows.length > 20000) throw new Error('Invalid compact raw answers')
  return data.rows.map(row => {
    if (!Array.isArray(row) || !Number.isInteger(row[0]) || (row[0] as number) < 0 || (row[0] as number) >= 1 << data.fields.length) throw new Error('Invalid raw answer presence mask')
    const mask = row[0] as number, entries: Array<[string, unknown]> = []; let at = 1
    data.fields.forEach((field, index) => { if (mask & 1 << index) entries.push([field, row[at++]]) })
    if (at !== row.length) throw new Error('Invalid compact raw row length')
    const answer = Object.fromEntries(entries) as unknown as ScaleAnswer
    if (typeof answer.itemCode !== 'string' || !answer.itemCode || !['string', 'number'].includes(typeof answer.responseValue)
      || (typeof answer.responseValue === 'number' && !Number.isFinite(answer.responseValue))) throw new Error('Invalid compact raw value')
    if (answer.responseTimeMs !== undefined && (typeof answer.responseTimeMs !== 'number' || !Number.isFinite(answer.responseTimeMs) || answer.responseTimeMs < 0)) throw new Error('Invalid compact raw timing')
    for (const field of ['changeCount', 'revision'] as const) if (answer[field] !== undefined && (!Number.isSafeInteger(answer[field]) || answer[field]! < 0)) throw new Error('Invalid compact raw count')
    if (answer.answeredAt !== undefined && typeof answer.answeredAt !== 'string') throw new Error('Invalid compact raw timestamp')
    return answer
  })
}
/** Preserve identities, provenance, timing precision and string/number choices. */
export const packWholeRawEnvelope = (envelope: any): any => {
  if (!envelope || !Array.isArray(envelope.units)) throw new Error('Invalid whole raw envelope')
  return { kind: 'WHOLE_RAW_FACTS', version: 1, envelope: { ...envelope,
    units: envelope.units.map((unit: any) => ({ ...unit, answers: encodeAnswerRows(unit.answers) })) } }
}
export const unpackWholeRawEnvelope = <T>(input: T): T => {
  const value = input as any
  if (value?.kind !== 'WHOLE_RAW_FACTS') return value as T
  if (value.version !== 1 || !value.envelope || !Array.isArray(value.envelope.units) || value.envelope.units.length > 32) throw new Error('Invalid whole raw facts')
  return { ...value.envelope, units: value.envelope.units.map((unit: any) => ({ ...unit, answers: decodeAnswerRows(unit.answers) })) } as T
}
