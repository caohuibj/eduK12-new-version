import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { post }, sessionFetch: vi.fn() }))
import { compositeApi, publicCompositeApi } from '../api'
const body = { submissionId: 'submission-0000001', attemptEpoch: 1, definitionHash: 'hash', answers: [{ itemCode: 'one', responseValue: 1 }] }
beforeEach(() => vi.clearAllMocks())
describe('Composite explicit receipt-only API', () => {
  it.each([false, true])('keeps default endpoint/body and recovery credential for public=%s', async publicMode => {
    const api = publicMode ? publicCompositeApi('synthetic-proof') : compositeApi
    await api.submitFinalScale('attempt', 'item', body)
    expect(post.mock.calls[0][0]).toBe(`${publicMode ? '/public' : ''}/composite-assessments/attempts/attempt/items/item/scale/submit`)
    expect(post.mock.calls[0][1]).toBe(body)
    if (publicMode) expect(post.mock.calls[0][2]).toEqual({ headers: { 'X-Recovery-Token': 'synthetic-proof' } })
  })
  it.each([false, true])('opts in without changing sealed body for public=%s', async publicMode => {
    const api = publicMode ? publicCompositeApi('synthetic-proof') : compositeApi
    await api.submitFinalScale('attempt', 'item', body, { response: 'receipt' })
    expect(post.mock.calls[0][0]).toBe(`${publicMode ? '/public' : ''}/composite-assessments/attempts/attempt/items/item/scale/submit?response=receipt`)
    expect(post.mock.calls[0][1]).toBe(body)
    expect(body).not.toHaveProperty('response')
    if (publicMode) expect(post.mock.calls[0][2]).toEqual({ headers: { 'X-Recovery-Token': 'synthetic-proof' } })
  })
  it('opts in only at the actual final page while retaining authoritative reload', () => {
    const page = readFileSync('src/modules/composite/CompositeAssessmentPage.tsx', 'utf8')
    expect(page).toContain("submitScale={(id, itemId, input) => api.submitFinalScale(id, itemId, input, { response: 'receipt' })}")
    const runner = readFileSync('src/components/FinalCompositeAssessment.tsx', 'utf8')
    const accepted = runner.indexOf('accepted = true', runner.indexOf('const next = await submitScale'))
    expect(accepted).toBeGreaterThan(0)
    expect(runner.indexOf('await onReload()', accepted)).toBeGreaterThan(accepted)
  })
})
