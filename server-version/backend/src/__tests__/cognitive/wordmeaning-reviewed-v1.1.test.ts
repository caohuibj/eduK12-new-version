import { describe, it, expect } from 'vitest'
import { WORDMEANING_BANK_V11 as bank } from '../../modules/cognitive/tasks/wordmeaning/bank-v1.1'
import { WORDMEANING_BANK as legacy } from '../../modules/cognitive/tasks/wordmeaning/bank'
import { WORDMEANING_BANK_V11 as frontend } from '../../../../frontend/src/modules/cognitive/tasks/wordmeaning/bank-v1.1'
import { scoreWordmeaningV11 as score } from '../../modules/cognitive/scoring/wordmeaning.v1.1'
import { wordmeaningConfigSchemaV11 as schema } from '../../modules/cognitive/schemas/wordmeaning.config'
import { wordmeaningTrialSchema as trialSchema } from '../../modules/cognitive/schemas/wordmeaning.trial'

const config = { totalTrials: 36, stimulusSetVersion: 'wordmeaning-zh-v1.1.0', fixationMs: 400, timeoutMs: 15000, validRtFloorMs: 300, report: { reportVersion: '1.1.0', referenceMode: 'none' as const } }
const trials = () => bank.map((item, trialIndex) => ({ trialIndex, payload: { itemId: item.id, responseIndex: item.answer as number | null, rtMs: 500 as number | null, interrupted: false } }))

describe('wordmeaning reviewed bank/scoring', () => {
 it('covers all 36 reviewed answer keys and frontend stimulus projections', () => {
   expect(new Set(bank.map(i => i.id)).size).toBe(36)
   expect(bank.every(i => i.options.length === 4 && new Set(i.options).size === 4 && i.explanation.length > 10)).toBe(true)
   expect(frontend).toEqual(bank.map(({ answer: _answer, explanation: _explanation, ...stimulus }) => stimulus))
   expect([0,1,2,3].map(k => bank.filter(i => i.answer === k).length)).toEqual([9,9,9,9])
   expect(score({config, trials: trials()}).metrics).toMatchObject({accuracy:1, errorCount:0, timeoutCount:0, validRtCount:36})
   expect(legacy).toHaveLength(36)
 })
 it('preserves the full profile capacity and rejects over-capacity declarations', () => {
   for (const n of [18,30,36]) expect(schema.safeParse({...config,totalTrials:n}).success).toBe(true)
   expect(schema.safeParse({...config,totalTrials:37}).success).toBe(false)
   expect(schema.safeParse({...config,stimulusSetVersion:'wordmeaning-zh-v1.0.0'}).success).toBe(false)
 })
 it('keeps first option and zero elapsed time distinct from null timeout', () => {
   const rows=trials(); rows[0].payload.rtMs=0; rows[1].payload.responseIndex=null; rows[1].payload.rtMs=null
   const result=score({config,trials:rows})
   expect(result.metrics).toMatchObject({accuracy:35/36, timeoutCount:1, errorCount:0, validRtCount:34})
   expect(trialSchema.safeParse(rows[0].payload).success).toBe(true)
   expect(trialSchema.safeParse({...rows[0].payload,responseIndex:null}).success).toBe(false)
 })
 it('rejects practice/unknown, duplicate, missing or impossible response facts', () => {
   const run=(mutate:(rows:ReturnType<typeof trials>)=>void) => { const rows=trials(); mutate(rows); return () => score({config,trials:rows}) }
   expect(run(rows=>{rows[0].payload.itemId='practice-only'})).toThrow()
   expect(run(rows=>{rows[1].payload.itemId=rows[0].payload.itemId})).toThrow()
   expect(run(rows=>{rows.pop()})).toThrow()
   expect(run(rows=>{rows[0].payload.responseIndex=null})).toThrow()
   expect(run(rows=>{rows[0].payload.rtMs=15001})).toThrow()
 })
})
