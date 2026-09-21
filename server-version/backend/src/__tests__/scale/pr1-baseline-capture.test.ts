import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createFrozenUnitAdmission } from '../../modules/assessment-runtime/admission-snapshot'
import { createFrozenScaleRuntimeSnapshot } from '../../modules/assessment-runtime/runtime-snapshot'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { listScalePackages } from '../../modules/scale/scale-package.registry'
import { scoreScale } from '../../modules/scale/scale-scoring'

describe('PR-1 baseline capture', () => {
  it('prints fixed compatibility constants for the frozen base', () => {
    const frozenAt = new Date('2026-09-21T00:00:00.000Z')
    const packages = listScalePackages()
    const rows = packages.map((pkg) => ({
      identity: `${pkg.key}@${pkg.instrumentVersion}`,
      definitionHash: hashScaleDefinition(pkg.definition),
      goldenDigest: canonicalHash(pkg.goldenCases.map((fixture) => scoreScale(pkg.definition, fixture.answers))),
    }))
    const adexi = packages.find((pkg) => pkg.key === 'adexi_v1' && pkg.instrumentVersion === '2.0.0')!
    const runtime = createFrozenScaleRuntimeSnapshot({
      instrumentKey: adexi.key,
      instrumentVersion: adexi.instrumentVersion,
      definition: adexi.definition,
      frozenAt,
    })
    const admission = createFrozenUnitAdmission({
      attemptEpoch: 1,
      scale: { id: 'scale-1', code: 'adexi_v1', name: 'ADEXI', instrumentVersion: '2.0.0' },
      principal: { userId: 'user-1' },
      frozenAt,
    })
    process.stdout.write(`PR1_BASELINE_CAPTURE=${JSON.stringify({ rows, runtimeSnapshotHash: runtime.snapshotHash, admissionSnapshotHash: admission.snapshotHash })}\n`)
    expect(rows).toHaveLength(6)
  })
})
