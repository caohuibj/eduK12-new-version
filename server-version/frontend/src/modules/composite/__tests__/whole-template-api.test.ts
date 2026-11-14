import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../../../api/client', () => ({ default: mockClient }))

import { compositeApi, publicCompositeApi } from '../api'
import {
  cacheWholeQuestionnaireTemplate,
  clearWholeQuestionnaireTemplateCacheForTest,
} from '../whole-definition-source'
import type { WholeQuestionnaireBinding, WholeQuestionnaireDefinition } from '../types'

const hashA = 'a'.repeat(64)
const slotHash = 'b'.repeat(64)
const defHash = 'c'.repeat(64)

const sampleDefinition = (attemptId = 'attempt-1'): WholeQuestionnaireDefinition => ({
  attemptId,
  attemptEpoch: 1,
  slotSetHash: slotHash,
  contextSnapshotHash: null,
  templateHash: hashA,
  formSections: [],
  units: [{
    itemId: 'item-1',
    scaleAssessmentId: 'scale-1',
    definitionHash: defHash,
    presentationMode: 'ONE_BY_ONE',
    scale: {
      id: 'scale-master-1',
      name: 'Scale 1',
      instruction: null,
      instrumentVersion: '1',
      definition: { items: [{ itemCode: 'q1', required: true, responseSetKey: 'r' }] },
    },
  }],
}) as unknown as WholeQuestionnaireDefinition

describe('composite whole template HTTP negotiation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearWholeQuestionnaireTemplateCacheForTest()
  })

  it('omits X-Whole-Template-Hash when template cache is empty on start', async () => {
    mockClient.post.mockResolvedValue({ code: 0, data: { attempt: { id: 'attempt-1' }, recoveryToken: null } })
    await compositeApi.start('comp-1')
    expect(mockClient.post).toHaveBeenCalledWith('/composite-assessments/comp-1/attempts', { delivery: 'whole' })
  })

  it('sends X-Whole-Template-Hash on start and wholeDefinition when template is cached and assembles wholeBinding locally', async () => {
    cacheWholeQuestionnaireTemplate(sampleDefinition('attempt-0'))
    const binding: WholeQuestionnaireBinding = {
      attemptId: 'attempt-2',
      attemptEpoch: 1,
      slotSetHash: slotHash,
      contextSnapshotHash: null,
      templateHash: hashA,
      units: [{
        itemId: 'item-1',
        scaleAssessmentId: 'scale-user-2',
        definitionHash: defHash,
        presentationMode: 'ALL_AT_ONCE',
      }],
    }
    mockClient.post.mockResolvedValue({
      code: 0,
      data: { attempt: { id: 'attempt-2' }, recoveryToken: 'tok-2', wholeBinding: binding },
    })

    await publicCompositeApi('tok-2').start('pub-1', 'tok-2')
    expect(mockClient.post).toHaveBeenCalledWith(
      '/public/composite-assessments/pub-1/start?delivery=whole',
      { recoveryToken: 'tok-2' },
      { headers: { 'X-Whole-Template-Hash': hashA } },
    )

    mockClient.get.mockResolvedValueOnce({ code: 0, message: 'OK', data: { wholeBinding: binding } })
    const defResponse = await publicCompositeApi('tok-2').wholeDefinition('attempt-2')
    expect(mockClient.get).toHaveBeenCalledTimes(1)
    expect(mockClient.get).toHaveBeenCalledWith(
      '/public/composite-assessments/attempts/attempt-2/whole/definition',
      { headers: { 'X-Recovery-Token': 'tok-2', 'X-Whole-Template-Hash': hashA } },
    )
    expect(defResponse.data?.units[0]?.scaleAssessmentId).toBe('scale-user-2')
    expect(defResponse.data?.units[0]?.scale.name).toBe('Scale 1')
  })

  it('caches full definition returned by GET /whole/definition for subsequent starts', async () => {
    mockClient.get.mockResolvedValueOnce({ code: 0, message: 'OK', data: sampleDefinition('attempt-1') })
    await compositeApi.wholeDefinition('attempt-1')

    mockClient.post.mockResolvedValueOnce({ code: 0, data: { attempt: { id: 'attempt-2' }, recoveryToken: null } })
    await compositeApi.start('comp-1')
    expect(mockClient.post).toHaveBeenCalledWith(
      '/composite-assessments/comp-1/attempts',
      { delivery: 'whole' },
      { headers: { 'X-Whole-Template-Hash': hashA } },
    )
  })
})
