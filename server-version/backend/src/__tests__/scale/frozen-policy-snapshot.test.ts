import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  createFrozenUnitAdmission,
  hashFrozenUnitAdmission,
  parseFrozenUnitAdmission,
} from '../../modules/assessment-runtime/admission-snapshot'
import {
  createFrozenUnitAdmissionV2ForTest,
  parseFrozenUnitAdmissionV2,
  parseVersionedFrozenUnitAdmission,
} from '../../modules/assessment-runtime/admission-snapshot-v2'
import {
  createFrozenScaleRuntimeSnapshot,
  hashFrozenScaleRuntimeSnapshot,
  parseFrozenScaleRuntimeSnapshot,
} from '../../modules/assessment-runtime/runtime-snapshot'
import {
  createFrozenScaleRuntimeSnapshotV2ForTest,
  parseFrozenScaleRuntimeSnapshotV2,
  parseVersionedFrozenScaleRuntimeSnapshot,
} from '../../modules/assessment-runtime/runtime-snapshot-v2'
import { compileScalePolicy } from '../../modules/scale/policy/compile'
import { SCALE_ELIGIBILITY_EVALUATOR_VERSION } from '../../modules/scale/policy/eligibility'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'

const frozenAt = new Date('2026-09-21T00:00:00.000Z')

describe('versioned Scale policy snapshots', () => {
  it('keeps V1 runtime/admission hash and parser behavior unchanged', () => {
    const source = getScaleInstrumentSource('adexi_v1', '2.0.0')!
    const runtimeV1 = createFrozenScaleRuntimeSnapshot({
      instrumentKey: source.identity.instrumentKey,
      instrumentVersion: source.identity.instrumentVersion,
      definition: source.executable!.definition,
      frozenAt,
    })
    expect(parseFrozenScaleRuntimeSnapshot(runtimeV1)).toEqual(runtimeV1)
    expect(hashFrozenScaleRuntimeSnapshot(runtimeV1)).toBe(runtimeV1.snapshotHash)
    expect(parseVersionedFrozenScaleRuntimeSnapshot(runtimeV1)).toEqual(runtimeV1)

    const admissionV1 = createFrozenUnitAdmission({
      attemptEpoch: 1,
      scale: { id: 'scale-1', code: 'adexi_v1', name: 'ADEXI', instrumentVersion: '2.0.0' },
      frozenAt,
    })
    expect(parseFrozenUnitAdmission(admissionV1)).toEqual(admissionV1)
    expect(hashFrozenUnitAdmission(admissionV1)).toBe(admissionV1.snapshotHash)
    expect(parseVersionedFrozenUnitAdmission(admissionV1)).toEqual(admissionV1)
  })

  it('roundtrips a V2 runtime snapshot without making the production writer V2', () => {
    const source = getScaleInstrumentSource('adexi_v1', '2.0.0')!
    const compiledPolicy = compileScalePolicy(source)
    const snapshot = createFrozenScaleRuntimeSnapshotV2ForTest({
      instrumentKey: source.identity.instrumentKey,
      instrumentVersion: source.identity.instrumentVersion,
      definition: source.executable!.definition,
      compiledPolicy,
      frozenAt,
    })
    expect(snapshot.schemaVersion).toBe(2)
    expect(parseFrozenScaleRuntimeSnapshotV2(snapshot)).toEqual(snapshot)
    expect(parseVersionedFrozenScaleRuntimeSnapshot(snapshot)).toEqual(snapshot)
    expect(() => parseFrozenScaleRuntimeSnapshot(snapshot)).toThrow()
  })

  it('rejects V2 runtime policy tampering', () => {
    const source = getScaleInstrumentSource('adexi_v1', '2.0.0')!
    const snapshot = createFrozenScaleRuntimeSnapshotV2ForTest({
      instrumentKey: source.identity.instrumentKey,
      instrumentVersion: source.identity.instrumentVersion,
      definition: source.executable!.definition,
      compiledPolicy: compileScalePolicy(source),
      frozenAt,
    })
    const tampered = {
      ...snapshot,
      runtimePolicyHash: '0'.repeat(64),
      snapshotHash: snapshot.snapshotHash,
    }
    expect(() => parseFrozenScaleRuntimeSnapshotV2(tampered)).toThrow(/hash mismatch/)
  })

  it('roundtrips a V2 Scale admission with frozen eligibility provenance', () => {
    const source = getScaleInstrumentSource('adexi_v1', '2.0.0')!
    const compiledPolicy = compileScalePolicy(source)
    const identityBindingHash = canonicalHash({ scaleId: 'scale-1', code: 'adexi_v1', version: '2.0.0' })
    const snapshot = createFrozenUnitAdmissionV2ForTest({
      attemptEpoch: 1,
      scale: { id: 'scale-1', code: 'adexi_v1', name: 'ADEXI', instrumentVersion: '2.0.0' },
      frozenAt,
      scalePolicy: {
        runtimePolicyHash: compiledPolicy.runtimePolicyHash,
        eligibility: {
          schemaVersion: 1,
          evaluatorVersion: SCALE_ELIGIBILITY_EVALUATOR_VERSION,
          policyVersion: compiledPolicy.applicability.policyVersion,
          policyHash: compiledPolicy.runtimePolicyHash,
          contextHash: null,
          identityBindingHash,
          contextFrozenAt: null,
          evaluatedAt: frozenAt.toISOString(),
          outcome: 'ELIGIBLE',
          reasons: [],
          factProvenance: { subject: 'legacy-scale-subject', respondent: 'legacy-scale-respondent' },
        },
      },
    })
    expect(snapshot.schemaVersion).toBe(2)
    expect(parseFrozenUnitAdmissionV2(snapshot)).toEqual(snapshot)
    expect(parseVersionedFrozenUnitAdmission(snapshot)).toEqual(snapshot)
    expect(() => parseFrozenUnitAdmission(snapshot)).toThrow()
  })

  it('rejects V2 admission policy/context tampering', () => {
    const source = getScaleInstrumentSource('adexi_v1', '2.0.0')!
    const compiledPolicy = compileScalePolicy(source)
    const snapshot = createFrozenUnitAdmissionV2ForTest({
      attemptEpoch: 1,
      scale: { id: 'scale-1', code: 'adexi_v1', name: 'ADEXI', instrumentVersion: '2.0.0' },
      frozenAt,
      scalePolicy: {
        runtimePolicyHash: compiledPolicy.runtimePolicyHash,
        eligibility: {
          schemaVersion: 1,
          evaluatorVersion: SCALE_ELIGIBILITY_EVALUATOR_VERSION,
          policyVersion: compiledPolicy.applicability.policyVersion,
          policyHash: compiledPolicy.runtimePolicyHash,
          contextHash: null,
          identityBindingHash: canonicalHash({ scaleId: 'scale-1' }),
          contextFrozenAt: null,
          evaluatedAt: frozenAt.toISOString(),
          outcome: 'ELIGIBLE',
          reasons: [],
          factProvenance: { subject: 'subject', respondent: 'respondent' },
        },
      },
    })
    const tampered = {
      ...snapshot,
      scalePolicy: {
        ...snapshot.scalePolicy!,
        runtimePolicyHash: 'f'.repeat(64),
      },
    }
    tampered.snapshotHash = canonicalHash(Object.fromEntries(Object.entries(tampered).filter(([key]) => key !== 'snapshotHash')))
    expect(() => parseFrozenUnitAdmissionV2(tampered)).toThrow(/policy hash mismatch/)
  })
})
