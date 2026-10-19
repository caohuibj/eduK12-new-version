import { describe, expect, it } from 'vitest'
import { parseScaleImport } from '../../modules/assessment-core/scale/import-parser'
import { scaleDefinitionFor } from '../integration/mini-scale-definition'
import { scoreScale } from '../../modules/scale/scale-scoring'
const header = 'item_code,prompt,reverse,score_keys,response_set_key\n'
const row = 'Q2,Second,true,total,default'
const base = () => scaleDefinitionFor(1, 'Q')
const parse = (csv = header + row, definition = base()) => parseScaleImport(csv, definition)
describe('shared Scale import fixed independent oracle', () => {
  it('appends exact stable keys and explicit score membership without changing existing scientific metadata', () => {
    const definition = base(), before = structuredClone(definition)
    const result = parse(header + row, definition)
    expect(definition).toEqual(before)
    expect(result.items).toEqual([{ itemCode: 'Q2', content: 'Second', reverse: true, scoreKeys: ['total'] }])
    expect(result.definition.items[1]).toEqual({ itemCode: 'Q2', content: 'Second', type: 'single', required: true, sortOrder: 1, responseSetKey: 'default', randomizeOptions: false })
    expect(result.definition.scoring.itemRules[1]).toEqual({ itemCode: 'Q2', transform: { type: 'reverse' } })
    expect(result.definition.scoring.scores[0].source).toEqual({ type: 'items', aggregation: 'sum', items: [{ itemCode: 'Q-1', weight: 1 }, { itemCode: 'Q2', weight: 1 }] })
    for (const k of ['source', 'license', 'responseSets', 'report', 'referencePolicy'] as const) expect(result.definition[k]).toEqual(before[k])
    // Independent arithmetic: yes -> 1, reverse(no -> 0) -> 1; total 2.
    const scored = scoreScale(result.definition, [{ itemCode: 'Q-1', responseValue: 'yes' }, { itemCode: 'Q2', responseValue: 'no' }])
    expect(scored.scores[0]).toMatchObject({ key: 'total', value: 2, range: { min: 0, max: 2 }, status: 'calculated' })
  })
  it('accepts BOM, quoted multiline, comma and escaped quote without losing content', () => {
    expect(parse('\uFEFF' + header + 'Q2,"First,\nsecond ""line""",false,total,default').items[0].content).toBe('First,\nsecond "line"')
  })
  it.each([
    [header + row + '\n' + row, '重复'], [header + row.replace('Q2', 'Q-1'), '重复'],
    [header + row.replace('Q2', '__proto__'), '非法'], [header + row.replace('Q2', 'Q.2'), '非法'],
    [header + row.replace('true', 'yes'), 'true 或 false'], [header + row.replace('total', 'other'), '现有'],
    [header + row.replace('total', 'total|total'), '不重复'], [header + row.replace('default', 'other'), '一致'],
    [header.replace('reverse', 'score_keys') + row, '重复'], [header.replace('reverse', 'score') + row, '表头'],
    [header + row + ',7', '列数'], [header + 'Q2,"x"oops,true,total,default', '引号'],
    [header + 'Q2,"x,true,total,default', '引号'], [header + 'Q2,x"y,true,total,default', '引号'],
    [header + 'Q2,,true,total,default', '题干'], [header + row.replace('Second', 'a'.repeat(16001)), '题干'],
    [header + row.replace('Second', '字'.repeat(70000)), '字节'], [header, '题目总数'],
    [header + row.replace('true', 'false,Infinity'), '列数'],
  ])('rejects invalid input without changing the source: %s', (csv, message) => {
    const definition = base(), frozen = JSON.stringify(definition)
    expect(() => parse(csv, definition)).toThrow()
    try { parse(csv, definition) } catch (error: any) { expect(JSON.stringify(error.issues)).toContain(message) }
    expect(JSON.stringify(definition)).toBe(frozen)
  })
  it('rejects multiple/mismatched response sets, duplicate values, nonfinite scores and unsupported transformations', () => {
    for (const mutate of [
      (d: any) => d.responseSets.push({ ...d.responseSets[0], key: 'second' }),
      (d: any) => d.items[0].responseSetKey = 'missing',
      (d: any) => d.responseSets[0].options[1].value = 'no',
      (d: any) => d.responseSets[0].options[1].score = Infinity,
      (d: any) => d.scoring.itemRules[0].transform = { type: 'map', values: { 0: 1, 1: 0 } },
    ]) { const definition = base(); mutate(definition); expect(() => parse(header + row, definition)).toThrow() }
  })
  it('enforces the total item budget and preserves explicit multiple memberships', () => {
    expect(() => parse(header + row, scaleDefinitionFor(200, 'Q'))).toThrow()
    const d = base(); d.scoring.scores.push({ ...structuredClone(d.scoring.scores[0]), key: 'dimension', type: 'dimension', canonical: false })
    d.report.scoreOrder.push('dimension'); d.report.interpretations.push({ ...structuredClone(d.report.interpretations[0]), scoreKey: 'dimension' })
    expect(parse(header + row.replace('total', 'total|dimension'), d).definition.scoring.scores[1].source).toMatchObject({ items: [{ itemCode: 'Q-1', weight: 1 }, { itemCode: 'Q2', weight: 1 }] })
  })
})
