import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { assertStandardItemsVerifiedByContentBinding } from '../../modules/composite/training-start-child-admission'
import { lockAuthenticatedAdmission, lockCompositeAdmissionShare } from '../../modules/composite/authenticated-admission-lock'

const standard = { kind: 'STANDARD', releaseId: 'release-1', version: '1' }
const item = { id: 'item-1', type: 'SCALE', scaleId: 'scale-1', standardCombinationSource: standard }
const unit = { itemId: 'item-1', source: { id: 'scale-1', standardCombination: { ...standard } } }

describe('Training START child admission (PR-1: no per-child repeat of parent admission)', () => {
  it('accepts native Scale items and exact STANDARD items bound by the verified content candidate', () => {
    expect(() => assertStandardItemsVerifiedByContentBinding([{ id: 'n', type: 'SCALE', scaleId: 's', standardCombinationSource: null }], undefined)).not.toThrow()
    expect(() => assertStandardItemsVerifiedByContentBinding([item], [unit])).not.toThrow()
    expect(canonicalHash(unit.source.standardCombination)).toBe(canonicalHash(standard))
  })
  it('fails closed for a STANDARD item without binding (legacy) or with a changed frozen identity', () => {
    expect(() => assertStandardItemsVerifiedByContentBinding([item], undefined)).toThrow('CONTENT_TRAINING_STANDARD_BINDING_REQUIRED')
    expect(() => assertStandardItemsVerifiedByContentBinding([item], [{ ...unit, itemId: 'other' }])).toThrow('CONTENT_TRAINING_STANDARD_BINDING_REQUIRED')
    expect(() => assertStandardItemsVerifiedByContentBinding([item], [{ itemId: 'item-1', source: { id: 'scale-1' } }])).toThrow('CONTENT_TRAINING_STANDARD_FROZEN_IDENTITY_CHANGED')
    expect(() => assertStandardItemsVerifiedByContentBinding([item], [{ ...unit, source: { ...unit.source, id: 'scale-2' } }])).toThrow('CONTENT_TRAINING_STANDARD_FROZEN_IDENTITY_CHANGED')
    expect(() => assertStandardItemsVerifiedByContentBinding([item], [{ ...unit, source: { ...unit.source, standardCombination: { ...standard, version: '2' } } }])).toThrow('CONTENT_TRAINING_STANDARD_FROZEN_IDENTITY_CHANGED')
  })
  it('skips the createAttempt FOR SHARE only after lockAuthenticatedAdmission took it on the same tx', async () => {
    const mk = () => ({ $queryRaw: vi.fn().mockResolvedValue([]), $queryRawUnsafe: vi.fn().mockResolvedValue([]) })
    const tx = mk(), other = mk()
    await lockAuthenticatedAdmission(tx as any, 'c1', 'u1')
    await lockCompositeAdmissionShare(tx as any, 'c1')
    await lockCompositeAdmissionShare(tx as any, 'c2')
    await lockCompositeAdmissionShare(other as any, 'c1')
    await lockCompositeAdmissionShare(other as any, 'c1')
    const shares = (mock: any) => mock.$queryRawUnsafe.mock.calls
    expect(shares(tx).map((call: any) => call[0])).toEqual(Array(2).fill('SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR SHARE'))
    expect(shares(tx).map((call: any) => call[1])).toEqual(['c1', 'c2'])
    expect(tx.$queryRaw.mock.calls.filter((call: any) => call[0].join('?').includes('pg_advisory_xact_lock'))).toHaveLength(1)
    // an unmarked client (no lockAuthenticatedAdmission in it) never skips
    expect(shares(other)).toHaveLength(2); expect(other.$queryRaw).not.toHaveBeenCalled()
  })
  it('keeps per-item admission only for lazily materialized flow units (source contract)', () => {
    const source = readFileSync('src/modules/composite/composite.service.ts', 'utf8')
    const body = source.slice(source.indexOf('const createChildRecords = async ('), source.indexOf('const createChildRecords = async (') + 6000)
    const gate = body.indexOf('if(verifiedFlowMaterialization){')
    expect(gate).toBeGreaterThan(0)
    expect(body.indexOf('assertTrainingScaleCollectionAllowed(')).toBeGreaterThan(gate)
    expect(body.match(/assertTrainingScaleCollectionAllowed\(/g)).toHaveLength(1)
    expect(body).toContain('assertStandardItemsVerifiedByContentBinding([item],attempt.trainingContentBinding?.units)')
    const start = source.slice(source.indexOf('const createAttempt = async'))
    expect(start.indexOf('await lockCompositeAdmissionShare(db')).toBeGreaterThan(0)
    expect(start).toContain('assertTrainingScaleCollectionAllowed(db as Prisma.TransactionClient,nativeScaleIds,{sourceOwnerId:composite.createdBy})')
  })
})
