import { describe, it, expect, vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createScaleAdmissionForRuntime } from '../../modules/scale/scale-admission.service'
import { getScaleInstrumentSource, getScaleInstrumentRuntimePolicy } from '../../modules/scale/onboarding/instrument-registry'
import { hashScaleDeploymentPolicy, scaleDeploymentPolicyV1Schema, scaleDeploymentPolicyV2Schema, type ScaleDeploymentPolicy } from '../../modules/scale/policy/deployment'
import { hashScaleDefinition, validateScaleDefinition } from '../../modules/scale/scale-definition'
import { parseFrozenUnitAdmissionV2, hashFrozenUnitAdmissionV2, type FrozenUnitAdmissionV2 } from '../../modules/assessment-runtime/admission-snapshot-v2'

// This pre-existing 355 instrument exercises real policy/admission code without
// the 356-only authorship, classification or version-mapping additions.
const key = 'academic_self_concept_biology_zh_cn', version = '1.0.0'
const source = getScaleInstrumentSource(key, version)!, compiled = getScaleInstrumentRuntimePolicy(key, version)!
const oldAuthoredHash = 'a'.repeat(64)
const policy: ScaleDeploymentPolicy = { schemaVersion: 2, revision: 1, locale: 'zh-CN', territory: 'CN', deploymentModes: ['COMPOSITE'], runtimePolicyHash: compiled.runtimePolicyHash, localizationVersion: version, inFlightCompletion: 'FROZEN_DEADLINE' }
const scale = { id: 'synthetic-scale', code: key, name: 'Synthetic biology', instrumentVersion: version, instrumentClass: 'STANDARD' as const, status: 'PUBLISHED' }
function input(p: ScaleDeploymentPolicy = policy) {
  const db = {
    instrumentAuthorization: { findMany: vi.fn(() => { throw new Error('Retired ledger must not be queried') }) },
    $queryRaw: vi.fn(async () => [{ id: 'deployment', scaleId: scale.id, revision: 1, status: 'ACTIVE', policyJson: p, policyHash: hashScaleDeploymentPolicy(p), authorizationRefs: p.schemaVersion === 1 ? p.authorizationRefs : [], createdByUserId: 'system', createdAt: new Date(), activatedAt: new Date(), retiredAt: null }]),
  }
  return { db: db as any, attemptEpoch: 1, scale, principal: { userId: 'student', questionnaireSessionId: null, recoveryTokenHash: null }, parent: null,
    runtime: { schemaVersion: 2, instrumentKey: key, instrumentVersion: version, sourceDefinitionHash: hashScaleDefinition(source.executable!.definition), runtimePolicyHash: compiled.runtimePolicyHash, compiledPolicy: compiled, compiledRuntime: { compiledRuntimeHash: canonicalHash({ fixture: 'compiled-runtime' }) } } as any,
    requestedMode: 'COMPOSITE' as const, contextSnapshotHash: canonicalHash({ gradeLevel: '7' }), contextValues: { gradeLevel: '7' as const }, contextFrozenAt: '2026-10-25T00:00:00.000Z' }
}
async function frozen() { return await createScaleAdmissionForRuntime(input()) as FrozenUnitAdmissionV2 }
function withBinding(snapshot: FrozenUnitAdmissionV2, binding: any) { const copy = structuredClone(snapshot); copy.scalePolicy!.deployment = binding; copy.snapshotHash = hashFrozenUnitAdmissionV2(copy); return copy }

describe('license retirement preserves operational identity and frozen compatibility', () => {
  it('keeps unknown metadata truthful while retaining report requirements', () => {
    const definition = structuredClone(source.executable!.definition)
    definition.license = { status: 'unknown', redistribution: 'unknown' }
    expect(validateScaleDefinition(definition, { instrumentClass: 'STANDARD', forPublish: true }).issues.filter(i => i.path === 'license' && i.severity === 'error')).toEqual([])
    expect(definition.license).toEqual({ status: 'unknown', redistribution: 'unknown' })
    definition.report.disclaimer = ''
    expect(validateScaleDefinition(definition, { instrumentClass: 'STANDARD', forPublish: true }).issues.some(i => i.path === 'report.disclaimer' && i.severity === 'error')).toBe(true)
  })
  it('new admission freezes identity without copying or reading any license record', async () => {
    const args = input(), snapshot = await createScaleAdmissionForRuntime(args) as FrozenUnitAdmissionV2
    expect(parseFrozenUnitAdmissionV2(snapshot)).toEqual(snapshot)
    expect(snapshot.scalePolicy!.deployment).toMatchObject({ basis: 'DEPLOYMENT_IDENTITY', revision: 1, policyHash: hashScaleDeploymentPolicy(policy) })
    expect(snapshot.scalePolicy!.deployment).not.toHaveProperty('authorizationId')
    expect(snapshot.scalePolicy!.deployment).not.toHaveProperty('sourceHash')
    expect(snapshot.scalePolicy!.deployment!.completionDeadline).toBeTruthy()
    expect(args.db.instrumentAuthorization.findMany).not.toHaveBeenCalled()
  })
  it('reads old V1 policies without changing their exact hash or copying legacy authorization into new admission', async () => {
    for (const old of [
      { ...policy, schemaVersion: 1 as const, commercialNature: 'NON_COMMERCIAL' as const, requiredRightsActions: ['display'], authorizationRefs: ['historic-auth'] },
      { ...policy, schemaVersion: 1 as const, commercialNature: 'UNSPECIFIED' as const, requiredRightsActions: ['display'], authorizationRefs: [], selfAuthoredSourceHash: oldAuthoredHash },
    ]) {
      const parsed = scaleDeploymentPolicyV1Schema.parse(old)
      expect(hashScaleDeploymentPolicy(parsed)).toBe(canonicalHash(old))
      const args = input(parsed), snapshot = await createScaleAdmissionForRuntime(args) as FrozenUnitAdmissionV2
      expect(snapshot.scalePolicy!.deployment!.basis).toBe('DEPLOYMENT_IDENTITY')
      expect(args.db.instrumentAuthorization.findMany).not.toHaveBeenCalled()
    }
  })
  it('new V2 policies reject retired fields and still enforce runtime and mode', async () => {
    for (const field of ['authorizationRefs', 'requiredRightsActions', 'selfAuthoredSourceHash', 'commercialNature'])
      expect(scaleDeploymentPolicyV2Schema.safeParse({ ...policy, [field]: [] }).success).toBe(false)
    await expect(createScaleAdmissionForRuntime(input({ ...policy, deploymentModes: ['STANDALONE'] }))).rejects.toThrow('DEPLOYMENT_MODE_NOT_BOUND')
    await expect(createScaleAdmissionForRuntime(input({ ...policy, runtimePolicyHash: '0'.repeat(64) }))).rejects.toThrow('RUNTIME_POLICY_HASH_MISMATCH')
  })
  it('retains exact old third-party and authored frozen admission alternatives', async () => {
    const original = await frozen(), { basis: _, ...common } = original.scalePolicy!.deployment as any
    for (const legacy of [{ authorizationId: 'original-auth', authorizationVersion: 4 }, { basis: 'SELF_AUTHORED_SOURCE', sourceHash: oldAuthoredHash }]) {
      const old = withBinding(original, { ...common, ...legacy })
      const expected = structuredClone(old) as any; delete expected.snapshotHash
      expect(old.snapshotHash).toBe(canonicalHash(expected))
      expect(parseFrozenUnitAdmissionV2(old)).toEqual(old)
    }
  })
  it('rejects mixed, partial and unknown alternatives even when the outer hash is recomputed', async () => {
    const original = await frozen(), { basis: _, ...common } = original.scalePolicy!.deployment as any
    for (const bad of [{}, { basis: 'DEPLOYMENT_IDENTITY', authorizationId: 'a', authorizationVersion: 1 }, { basis: 'DEPLOYMENT_IDENTITY', sourceHash: oldAuthoredHash }, { authorizationId: 'a' }, { authorizationVersion: 1 }, { basis: 'SELF_AUTHORED_SOURCE' }, { sourceHash: oldAuthoredHash }, { basis: 'SELF_AUTHORED_SOURCE', sourceHash: 'bad' }, { basis: 'OTHER' }, { basis: 'SELF_AUTHORED_SOURCE', sourceHash: oldAuthoredHash, authorizationId: 'a', authorizationVersion: 1 }])
      expect(() => parseFrozenUnitAdmissionV2(withBinding(original, { ...common, ...bad }))).toThrow()
  })
  it('rejects frozen tampering without a matching original hash', async () => {
    const snapshot = await frozen(); snapshot.scalePolicy!.deployment!.policyHash = '0'.repeat(64)
    expect(() => parseFrozenUnitAdmissionV2(snapshot)).toThrow('hash mismatch')
  })
})
