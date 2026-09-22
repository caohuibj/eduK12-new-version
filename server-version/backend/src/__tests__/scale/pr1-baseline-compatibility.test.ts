import { describe, expect, it } from 'vitest'
import {
  hashFrozenUnitAdmission,
  parseFrozenUnitAdmission,
  type FrozenUnitAdmissionV1,
} from '../../modules/assessment-runtime/admission-snapshot'
import { createFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { listScalePackages } from '../../modules/scale/scale-package.registry'
import { scoreScale } from '../../modules/scale/scale-scoring'

const BASE_SHA = '0f64fccae34d39bf5f602be0359fe2fea919081d'
const FROZEN_AT = new Date('2026-09-21T00:00:00.000Z')

const BASELINE_PACKAGE_ROWS = [
  { identity: 'adexi_v1@2.0.0', definitionHash: '14722172c7203b8f04f3dc8428e0e125c5c21c2a769f487f532b2945bbe88949', goldenDigest: '8d83951b93783359dfdd86afb2c45d6742f9b959bdb8230cda561992c9f8726b' },
  { identity: 'who5@1.0.0', definitionHash: '900dd182737241ffdacd7af9e38939b11e19e409f335a4cdc19f7a26bdd5b321', goldenDigest: 'b10d74b03f7e7777c344438e07eb3f8183cc3dce589145261e10c98423dbcf48' },
  { identity: 'sdq_parent_zh_cn@1.0.0', definitionHash: '80b7065ad96a4af86292c6907a1de24636a77d0bc5801eecb1920bc698b38e40', goldenDigest: '499b76180ebe369e4da8440873236c84c08cdda4f76b63a7f5e451507aa6f01c' },
  { identity: 'sdq_teacher_zh_cn@1.0.0', definitionHash: '9f2f341714a1f90363d1edd65d7ad523adf8bfe0157ce9fd291b6c880e6461db', goldenDigest: 'e27bd0e24b6babebe55cc5d8e28a8dec834b779acaceb913b777a5db3b6a5a25' },
  { identity: 'texi_parent_zh_cn@1.0.0', definitionHash: '5aa811bf406a9790749b780390d8a067207e8d1e227ce2e4c19d30284e370c5b', goldenDigest: 'c8f5bc070f9b470f9f00f4f3198fcdad84fe869d1a89736ba3ba4a213a83596a' },
  { identity: 'texi_teacher_zh_cn@1.0.0', definitionHash: 'dfb5ac0982b6d39eb7daaf84bf8fbcac0e1cbb43de3622fb4ef69b5ff789a7d6', goldenDigest: 'c8f5bc070f9b470f9f00f4f3198fcdad84fe869d1a89736ba3ba4a213a83596a' },
] as const

const BASELINE_PACKAGE_IDENTITIES = new Set(BASELINE_PACKAGE_ROWS.map((row) => row.identity))

const BASELINE_RUNTIME_SNAPSHOT_HASH = '5744a7a717dc628a1f8a96216c01342522cbcc10075e31ade6591ec745b8edfc'
const BASELINE_ADMISSION_SNAPSHOT_HASH = '3a3fa92226c6f17b4e6f208afc55812e354c9ec3e48f77a7d8441f570583dc5d'

const BASELINE_ADMISSION_FIXTURE: FrozenUnitAdmissionV1 = {
  schemaVersion: 1,
  runtimeGeneration: 'UNIFIED_V1',
  frozenAt: FROZEN_AT.toISOString(),
  attemptEpoch: 1,
  scale: { id: 'scale-1', code: 'adexi_v1', name: 'ADEXI', instrumentVersion: '2.0.0' },
  principal: { userId: 'user-1', questionnaireSessionId: null, recoveryTokenHash: null },
  parent: null,
  requiresContext: false,
  contextSnapshotHash: null,
  contextValues: null,
  governance: { status: 'READY', holdReason: null },
  snapshotHash: BASELINE_ADMISSION_SNAPSHOT_HASH,
}

describe(`PR-1 fixed compatibility baseline ${BASE_SHA}`, () => {
  it('pins all six legacy definition hashes and golden output digests', () => {
    const rows = listScalePackages()
      .filter((pkg) => BASELINE_PACKAGE_IDENTITIES.has(`${pkg.key}@${pkg.instrumentVersion}` as typeof BASELINE_PACKAGE_ROWS[number]['identity']))
      .map((pkg) => ({
        identity: `${pkg.key}@${pkg.instrumentVersion}`,
        definitionHash: hashScaleDefinition(pkg.definition),
        goldenDigest: canonicalHash(pkg.goldenCases.map((fixture) => scoreScale(pkg.definition, fixture.answers))),
      }))
    expect(rows).toEqual(BASELINE_PACKAGE_ROWS)
  })

  it('pins the legacy V1 runtime snapshot hash instead of self-validating a new hash', () => {
    const adexi = listScalePackages().find((pkg) => pkg.key === 'adexi_v1' && pkg.instrumentVersion === '2.0.0')!
    const runtime = createFrozenScaleRuntimeSnapshot({
      instrumentKey: adexi.key,
      instrumentVersion: adexi.instrumentVersion,
      definition: adexi.definition,
      frozenAt: FROZEN_AT,
    })
    expect(runtime.snapshotHash).toBe(BASELINE_RUNTIME_SNAPSHOT_HASH)
  })

  it('parses a literal persisted V1 admission fixture with its pinned historical hash', () => {
    expect(hashFrozenUnitAdmission(BASELINE_ADMISSION_FIXTURE)).toBe(BASELINE_ADMISSION_SNAPSHOT_HASH)
    expect(parseFrozenUnitAdmission(BASELINE_ADMISSION_FIXTURE)).toEqual(BASELINE_ADMISSION_FIXTURE)
  })
})
