import { describe, expect, it } from 'vitest'
import { compositeScaleFinalResponseQuerySchema, finalScaleSubmitSchema } from '../../services/scale-final-submit.schema'
import { readFileSync } from 'node:fs'
describe('Composite Scale receipt response selection', () => {
  it('retains omitted default and accepts only explicit receipt mode', () => {
    expect(compositeScaleFinalResponseQuerySchema.parse({})).toEqual({})
    expect(compositeScaleFinalResponseQuerySchema.parse({ response: 'receipt' })).toEqual({ response: 'receipt' })
  })
  it.each([{ response: 'detail' }, { response: 'admin' }, { response: ['receipt', 'receipt'] }, { response: true }, { receiptOnly: true }])('rejects unknown or ambiguous selection %j', query => {
    expect(compositeScaleFinalResponseQuerySchema.safeParse(query).success).toBe(false)
  })
  it('does not accept response selection in the sealed scientific payload', () => {
    const body = { submissionId: 'submission-0000001', attemptEpoch: 1, definitionHash: 'hash', answers: [] }
    expect(finalScaleSubmitSchema.parse(body)).toEqual(body)
    expect(finalScaleSubmitSchema.safeParse({ ...body, response: 'receipt' }).success).toBe(false)
  })
  it('validates both route options before saving and retains the final fresh policy projection', () => {
    const source = readFileSync('src/modules/composite/composite.controller.ts', 'utf8')
    for (const name of ['submitFinalScale', 'publicSubmitFinalScale']) {
      const start = source.indexOf(`async ${name}(`), route = source.slice(start, source.indexOf('\n  },', start))
      expect(route.indexOf('compositeScaleFinalResponseQuerySchema.parse(req.query)')).toBeLessThan(route.indexOf('const data = await submitCompositeScaleFinal('))
      expect(route).toContain("response === 'receipt' ? { receiptOnly: true } : undefined")
      expect(route.indexOf('projectRelationalUnitFinalResponse(req.params.attemptId, data)')).toBeGreaterThan(route.indexOf('const data = await submitCompositeScaleFinal('))
    }
  })
})
