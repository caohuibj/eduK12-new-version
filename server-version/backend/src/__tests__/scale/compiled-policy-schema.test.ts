import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  createFrozenScaleRuntimeSnapshotV2ForTest,
  parseFrozenScaleRuntimeSnapshotV2,
} from '../../modules/assessment-runtime/runtime-snapshot-v2'
import {
  compileScalePolicy,
  compiledScalePolicyV1Schema,
} from '../../modules/scale/policy/compile'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'

const unsignedSnapshot = (snapshot: Record<string, unknown>) => (
  Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== 'snapshotHash'))
)

describe('CompiledScalePolicyV1 schema', () => {
  it('rejects unknown compiled policy fields', () => {
    const source = getScaleInstrumentSource('adexi_v1', '2.0.0')!
    const policy = compileScalePolicy(source)
    expect(compiledScalePolicyV1Schema.safeParse({ ...policy, unexpected: true }).success).toBe(false)
  })

  it('rejects an unknown nested compiled policy field from a rehashed V2 snapshot', () => {
    const source = getScaleInstrumentSource('adexi_v1', '2.0.0')!
    const snapshot = createFrozenScaleRuntimeSnapshotV2ForTest({
      instrumentKey: source.identity.instrumentKey,
      instrumentVersion: source.identity.instrumentVersion,
      definition: source.executable!.definition,
      compiledPolicy: compileScalePolicy(source),
      frozenAt: new Date('2026-09-21T00:00:00.000Z'),
    })
    const tampered: Record<string, unknown> = {
      ...snapshot,
      compiledPolicy: { ...snapshot.compiledPolicy, unexpected: true },
    }
    tampered.snapshotHash = canonicalHash(unsignedSnapshot(tampered))
    expect(() => parseFrozenScaleRuntimeSnapshotV2(tampered)).toThrow()
  })
})
