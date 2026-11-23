import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'

const mocks = vi.hoisted(() => ({
  getContentReleaseBatch: vi.fn(),
}))

vi.mock('../../modules/measurement-content/repository', () => ({
  getContentReleaseBatch: mocks.getContentReleaseBatch,
}))

import {
  tryReadPreMaterializedDeclaredFeedback,
  type PreMaterializedEducationWholeFeedbackV2,
} from '../../modules/reporting/education-ordinary-declared-feedback'

const oldKey = process.env.DATA_ENCRYPTION_KEY
const oldCompact = process.env.ASSESSMENT_COMPACT_FACTS_ENABLED

describe('tryReadPreMaterializedDeclaredFeedback', () => {
  const blockId = '00000000-0000-4000-8000-000000000001'
  const itemId = '00000000-0000-4000-8000-000000000002'
  const versionId = '00000000-0000-4000-8000-000000000003'
  const releaseId = '00000000-0000-4000-8000-000000000010'
  const contentHash = 'a'.repeat(64)
  const manifestHash = 'b'.repeat(64)
  const policyHash = 'c'.repeat(64)
  const aggregateInputHash = 'd'.repeat(64)
  const interpretationHash = 'e'.repeat(64)
  const metricKeys = ['total', 'dim1']

  const identity: any = {
    compositeId: 'comp-1',
    title: 'School Pack',
    origin: { entry: 'SCHOOL', variantKey: 'STUDENT:SELF', ownerUserId: 'owner-1' },
    manifest: [{
      blockId,
      kind: 'SCALE',
      versionId,
      contentHash,
      sourceProvider: 'STANDARD_SCALE',
      itemIds: [itemId],
      sectionIds: [],
      title: 'Scale 1',
    }],
    units: [],
    binding: {
      manifestHash,
      unitReports: [{
        blockId,
        versionId,
        contentHash,
        respondent: { mode: 'INDIVIDUAL_SUMMARY', metricKeys, longitudinalMetricKeys: [] },
      }],
    },
  }

  const own: any = {
    parentId: 'attempt-1',
    attemptEpoch: 1,
    policyHash,
    contentState: {
      trainingContentBinding: {},
      trainingContentBindingHash: '1'.repeat(64),
      trainingReferenceBinding: null,
      trainingReferenceBindingHash: null,
      trainingContentInterpretationEncrypted: 'enc',
      trainingContentInterpretationHash: interpretationHash,
      aggregateInputHash,
    },
  }

  const makePayload = (overrides?: Partial<PreMaterializedEducationWholeFeedbackV2>): PreMaterializedEducationWholeFeedbackV2 => ({
    schemaVersion: 2,
    kind: 'EDUCATION_WHOLE_FEEDBACK_V2',
    attemptId: 'attempt-1',
    attemptEpoch: 1,
    aggregateInputHash,
    compositeId: 'comp-1',
    manifestHash,
    policyHash,
    interpretationHash,
    releaseIds: [releaseId],
    declared: [{
      blockId,
      itemId,
      versionId,
      contentHash,
      metricKeysHash: canonicalHash(metricKeys),
      report: { itemId, status: 'READY', rendered: { title: 'Scale 1 Report', sections: [] } } as any,
    }],
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATA_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    process.env.ASSESSMENT_COMPACT_FACTS_ENABLED = 'true'
    mocks.getContentReleaseBatch.mockResolvedValue(new Map([
      [releaseId, { releaseId, status: 'PUBLISHED' }],
    ]))
  })

  afterEach(() => {
    if (oldKey === undefined) delete process.env.DATA_ENCRYPTION_KEY
    else process.env.DATA_ENCRYPTION_KEY = oldKey
    if (oldCompact === undefined) delete process.env.ASSESSMENT_COMPACT_FACTS_ENABLED
    else process.env.ASSESSMENT_COMPACT_FACTS_ENABLED = oldCompact
  })

  it('returns pre-materialized declared reports when identity, ceilings, and live release status match', async () => {
    const encrypted = encryptUnifiedRuntimePayload(makePayload())
    const result = await tryReadPreMaterializedDeclaredFeedback({} as never, {
      preMaterializedReport: encrypted,
      identity,
      own,
      declaredBlocks: new Set([blockId]),
    })
    expect(result).not.toBeNull()
    expect(result!.get(itemId)).toMatchObject({ itemId, status: 'READY' })
    expect(mocks.getContentReleaseBatch).toHaveBeenCalledWith(expect.anything(), [releaseId])
  })

  it('falls back to live projection when an underlying release was REVOKED after materialization', async () => {
    mocks.getContentReleaseBatch.mockResolvedValue(new Map([
      [releaseId, { releaseId, status: 'REVOKED' }],
    ]))
    const encrypted = encryptUnifiedRuntimePayload(makePayload())
    const result = await tryReadPreMaterializedDeclaredFeedback({} as never, {
      preMaterializedReport: encrypted,
      identity,
      own,
      declaredBlocks: new Set([blockId]),
    })
    expect(result).toBeNull()
  })

  it('falls back to live projection on policyHash, aggregateInputHash, ceiling metricKeys, or legacy v1 stub mismatch', async () => {
    const cases = [
      encryptUnifiedRuntimePayload({ schemaVersion: 1, kind: 'EDUCATION_WHOLE_MATERIALIZED', attemptId: 'attempt-1', aggregateInputHash }),
      encryptUnifiedRuntimePayload(makePayload({ policyHash: 'f'.repeat(64) })),
      encryptUnifiedRuntimePayload(makePayload({ aggregateInputHash: 'f'.repeat(64) })),
      encryptUnifiedRuntimePayload(makePayload({
        declared: [{
          blockId,
          itemId,
          versionId,
          contentHash,
          metricKeysHash: canonicalHash(['only_one']),
          report: { itemId, status: 'READY' } as any,
        }],
      })),
    ]
    for (const cipher of cases) {
      const result = await tryReadPreMaterializedDeclaredFeedback({} as never, {
        preMaterializedReport: cipher,
        identity,
        own,
        declaredBlocks: new Set([blockId]),
      })
      expect(result).toBeNull()
    }
    expect(mocks.getContentReleaseBatch).not.toHaveBeenCalled()
  })
})
