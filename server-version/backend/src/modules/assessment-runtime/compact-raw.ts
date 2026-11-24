import type { ScaleAnswer } from '../scale/scale-scoring'
const ANSWER_KEYS = ['itemCode', 'responseValue', 'responseTimeMs', 'answeredAt', 'changeCount', 'revision'] as const
const SHARED_WHOLE_UNIT_KEYS = ['compositeAttemptId', 'attemptEpoch', 'contextSnapshotHash', 'userId', 'recoveryTokenHash'] as const
type RowsV1 = { kind: 'SCALE_ANSWER_ROWS'; version: 1; fields: string[]; rows: unknown[][] }
type RowsV2 = { kind: 'SCALE_ANSWER_ROWS'; version: 2; codes: string[]; values: Array<string | number> }
type Rows = RowsV1 | RowsV2

const validateRawAnswer = (answer: ScaleAnswer): ScaleAnswer => {
  if (typeof answer.itemCode !== 'string' || !answer.itemCode || !['string', 'number'].includes(typeof answer.responseValue)
    || (typeof answer.responseValue === 'number' && !Number.isFinite(answer.responseValue))) throw new Error('Invalid compact raw value')
  if (answer.responseTimeMs !== undefined && (typeof answer.responseTimeMs !== 'number' || !Number.isFinite(answer.responseTimeMs) || answer.responseTimeMs < 0)) throw new Error('Invalid compact raw timing')
  for (const field of ['changeCount', 'revision'] as const) if (answer[field] !== undefined && (!Number.isSafeInteger(answer[field]) || answer[field]! < 0)) throw new Error('Invalid compact raw count')
  if (answer.answeredAt !== undefined && typeof answer.answeredAt !== 'string') throw new Error('Invalid compact raw timestamp')
  return answer
}

export const encodeAnswerRows = (answers: ScaleAnswer[]): Rows => {
  const fields = ANSWER_KEYS.filter(key => answers.some(answer => Object.prototype.hasOwnProperty.call(answer, key)))
  for (const answer of answers) if (Object.keys(answer).some(key => !(ANSWER_KEYS as readonly string[]).includes(key))) throw new Error('Unsupported raw answer field')
  if (
    fields.length === 2
    && fields[0] === 'itemCode'
    && fields[1] === 'responseValue'
    && answers.every(answer => Object.prototype.hasOwnProperty.call(answer, 'itemCode') && Object.prototype.hasOwnProperty.call(answer, 'responseValue'))
  ) {
    return {
      kind: 'SCALE_ANSWER_ROWS',
      version: 2,
      codes: answers.map(answer => answer.itemCode),
      values: answers.map(answer => answer.responseValue),
    }
  }
  return { kind: 'SCALE_ANSWER_ROWS', version: 1, fields, rows: answers.map(answer => {
    let mask = 0; const values: unknown[] = []
    fields.forEach((key, i) => { if (Object.prototype.hasOwnProperty.call(answer, key)) { mask |= 1 << i; values.push(answer[key]) } })
    return [mask, ...values]
  }) }
}
export const isAnswerRows = (value: any): value is Rows => value?.kind === 'SCALE_ANSWER_ROWS'
export const decodeAnswerRows = (value: unknown): ScaleAnswer[] => {
  const data = value as Rows
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.kind !== 'SCALE_ANSWER_ROWS') throw new Error('Invalid compact raw answers')
  if (data.version === 2) {
    const keys = Object.keys(data)
    if (keys.length !== 4 || !keys.every(key => key === 'kind' || key === 'version' || key === 'codes' || key === 'values')) {
      throw new Error('Invalid compact raw answers')
    }
    if (!Array.isArray(data.codes) || !Array.isArray(data.values) || data.codes.length !== data.values.length || data.codes.length > 20000) {
      throw new Error('Invalid compact raw answers')
    }
    return data.codes.map((itemCode, index) => validateRawAnswer({ itemCode, responseValue: data.values[index] } as ScaleAnswer))
  }
  if (data.version !== 1 || !Array.isArray(data.fields) || data.fields.length > ANSWER_KEYS.length
    || new Set(data.fields).size !== data.fields.length || data.fields.some(key => !(ANSWER_KEYS as readonly string[]).includes(key))
    || !Array.isArray(data.rows) || data.rows.length > 20000) throw new Error('Invalid compact raw answers')
  return data.rows.map(row => {
    if (!Array.isArray(row) || !Number.isInteger(row[0]) || (row[0] as number) < 0 || (row[0] as number) >= 1 << data.fields.length) throw new Error('Invalid raw answer presence mask')
    const mask = row[0] as number, entries: Array<[string, unknown]> = []; let at = 1
    data.fields.forEach((field, index) => { if (mask & 1 << index) entries.push([field, row[at++]]) })
    if (at !== row.length) throw new Error('Invalid compact raw row length')
    return validateRawAnswer(Object.fromEntries(entries) as unknown as ScaleAnswer)
  })
}
/** Preserve identities, provenance, timing precision and string/number choices. */
export const packWholeRawEnvelope = (envelope: any): any => {
  if (!envelope || !Array.isArray(envelope.units)) throw new Error('Invalid whole raw envelope')
  const shared: Record<string, unknown> = {}
  if (envelope.units.length > 1) {
    for (const key of SHARED_WHOLE_UNIT_KEYS) {
      if (envelope.units.every((unit: any) => unit && Object.prototype.hasOwnProperty.call(unit, key))) {
        const first = envelope.units[0][key]
        if (envelope.units.every((unit: any) => Object.is(unit[key], first))) {
          shared[key] = first
        }
      }
    }
  }
  const sharedKeys = Object.keys(shared)
  if (!sharedKeys.length) {
    return { kind: 'WHOLE_RAW_FACTS', version: 1, envelope: { ...envelope,
      units: envelope.units.map((unit: any) => ({ ...unit, answers: encodeAnswerRows(unit.answers) })) } }
  }
  const sharedSet = new Set(sharedKeys)
  return {
    kind: 'WHOLE_RAW_FACTS',
    version: 2,
    shared,
    envelope: {
      ...envelope,
      units: envelope.units.map((unit: any) => {
        const stripped: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(unit)) {
          if (!sharedSet.has(k)) stripped[k] = v
        }
        stripped.answers = encodeAnswerRows(unit.answers)
        return stripped
      }),
    },
  }
}
export const unpackWholeRawEnvelope = <T>(input: T): T => {
  const value = input as any
  if (value?.kind !== 'WHOLE_RAW_FACTS') return value as T
  if (value.version === 1) {
    if (!value.envelope || !Array.isArray(value.envelope.units) || value.envelope.units.length > 32) throw new Error('Invalid whole raw facts')
    return { ...value.envelope, units: value.envelope.units.map((unit: any) => ({ ...unit, answers: decodeAnswerRows(unit.answers) })) } as T
  }
  if (value.version === 2) {
    if (!value.envelope || !Array.isArray(value.envelope.units) || value.envelope.units.length > 32
      || !value.shared || typeof value.shared !== 'object' || Array.isArray(value.shared)) throw new Error('Invalid whole raw facts')
    for (const key of Object.keys(value.shared)) {
      if (!(SHARED_WHOLE_UNIT_KEYS as readonly string[]).includes(key)) throw new Error('Invalid whole raw shared key')
    }
    return {
      ...value.envelope,
      units: value.envelope.units.map((unit: any) => ({ ...value.shared, ...unit, answers: decodeAnswerRows(unit.answers) })),
    } as T
  }
  throw new Error('Invalid whole raw facts')
}
