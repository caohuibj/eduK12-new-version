import { describe, expect, it } from 'vitest'
import { BundleContractError } from '../../modules/assessment-bundle/errors'
import {
  createBundleAnalysisEngineRegistry,
  type BundleAnalysisEngineV1,
  type BundleEngineInputV1,
  type BundleEngineResultV1,
} from '../../modules/assessment-bundle/registry'
import { compileBundleRuntimeFromFrozenRead } from '../../modules/assessment-bundle/compile'
import { buildFrozenAssessmentBundleSnapshot } from '../../modules/assessment-bundle/snapshot'
import type { FrozenAssessmentBundleSnapshotV3 } from '../../modules/assessment-bundle/types'
import { cognitiveSelfBundle, scaleEvidenceItem } from './fixtures'

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected BundleContractError')
  } catch (error) {
    if (error instanceof BundleContractError) return error.code
    throw error
  }
}

const buildInput = (
  engine: { key: FrozenAssessmentBundleSnapshotV3['engine']['key']; version: string },
): BundleEngineInputV1 => {
  const definition = cognitiveSelfBundle({ engine })
  const snapshot = buildFrozenAssessmentBundleSnapshot(definition)
  const compiledRuntime = compileBundleRuntimeFromFrozenRead({
    family: 'ASSESSMENT_BUNDLE',
    snapshotVersion: 3,
    snapshot,
  })
  return {
    snapshot,
    compiledRuntime,
    evidence: [scaleEvidenceItem()],
    contextFacts: null,
    aggregateInputHash: null,
  }
}

const stubEngine = (tag: string): BundleAnalysisEngineV1 => (input) => ({
  kind: 'COMPUTED',
  payload: {
    tag,
    snapshotHash: input.snapshot.snapshotHash,
    evidenceCount: input.evidence.length,
    aggregateInputHash: input.aggregateInputHash,
  },
})

describe('BundleAnalysisEngineRegistry', () => {
  it('resolves and dispatches an exact key@version hit', () => {
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('test-stub-engine-v1', '1.0.0', stubEngine('hit'))
    const productRegistry = createBundleAnalysisEngineRegistry()
    productRegistry.register('cognitive-domain-v1', '1.0.0', stubEngine('cog'))
    const input = buildInput({ key: 'cognitive-domain-v1', version: '1.0.0' })
    const result = productRegistry.dispatch(input)
    expect(result).toEqual({
      kind: 'COMPUTED',
      payload: {
        tag: 'cog',
        snapshotHash: input.snapshot.snapshotHash,
        evidenceCount: 1,
        aggregateInputHash: null,
      },
    } satisfies BundleEngineResultV1)
    expect(result).not.toHaveProperty('engineKey')
    expect(result).not.toHaveProperty('engineVersion')
    expect(registry.resolve('test-stub-engine-v1', '1.0.0')).toBeTypeOf('function')
  })

  it('rejects unknown engine key and known key with unknown version distinctly', () => {
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('test-stub-engine-v1', '1.0.0', stubEngine('a'))
    expect(failCode(() => registry.resolve('no-such-engine-v1', '1.0.0'))).toBe('UNKNOWN_ENGINE_KEY')
    expect(failCode(() => registry.resolve('test-stub-engine-v1', '9.9.9'))).toBe('UNKNOWN_ENGINE_VERSION')
  })

  it('allows multiple versions of the same key and rejects duplicate register', () => {
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('test-stub-engine-v1', '1.0.0', stubEngine('v100'))
    registry.register('test-stub-engine-v1', '1.0.1', stubEngine('v101'))
    const fakeInput = {
      snapshot: { snapshotHash: 'x'.repeat(64) },
      evidence: [],
      aggregateInputHash: null,
    } as unknown as BundleEngineInputV1
    expect(registry.resolve('test-stub-engine-v1', '1.0.0')(fakeInput).payload)
      .toMatchObject({ tag: 'v100' })
    expect(registry.resolve('test-stub-engine-v1', '1.0.1')(fakeInput).payload)
      .toMatchObject({ tag: 'v101' })
    expect(failCode(() => registry.register(
      'test-stub-engine-v1',
      '1.0.0',
      stubEngine('dup'),
    ))).toBe('DUPLICATE_ENGINE')
  })

  it('rejects non-exact versions on register and resolve with INVALID_ENGINE_REF', () => {
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('cognitive-domain-v1', '1.0.0', stubEngine('only-100'))
    expect(failCode(() => registry.resolve('cognitive-domain-v1', '1.0.1'))).toBe('UNKNOWN_ENGINE_VERSION')
    expect(failCode(() => registry.resolve('cognitive-domain-v1', '^1.0.0'))).toBe('INVALID_ENGINE_REF')
    expect(failCode(() => registry.resolve('cognitive-domain-v1', 'latest'))).toBe('INVALID_ENGINE_REF')
    expect(failCode(() => registry.resolve('cognitive-domain-v1', '1.x'))).toBe('INVALID_ENGINE_REF')
    expect(failCode(() => registry.register('cognitive-domain-v1', '^1.0.0', stubEngine('bad'))))
      .toBe('INVALID_ENGINE_REF')
    expect(failCode(() => registry.register('cognitive-domain-v1', 'latest', stubEngine('bad'))))
      .toBe('INVALID_ENGINE_REF')
  })

  it('keeps BundleEngineResultV1 as a discriminated union without identity fields', () => {
    const computed: BundleEngineResultV1 = { kind: 'COMPUTED', payload: { ok: true } }
    const unavailable: BundleEngineResultV1 = { kind: 'UNAVAILABLE', reason: 'not_computed' }
    expect(computed.kind === 'COMPUTED' ? computed.payload : null).toEqual({ ok: true })
    expect(unavailable.kind === 'UNAVAILABLE' ? unavailable.reason : null).toBe('not_computed')
    expect(computed).not.toHaveProperty('engineKey')
    expect(unavailable).not.toHaveProperty('engineVersion')
  })

  it('invokes exactly one engine per dispatch', () => {
    const calls: string[] = []
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('cognitive-domain-v1', '1.0.0', (input) => {
      calls.push('cognitive-domain-v1@1.0.0')
      return stubEngine('a')(input)
    })
    registry.register('cognitive-domain-v1', '2.0.0', (input) => {
      calls.push('cognitive-domain-v1@2.0.0')
      return stubEngine('b')(input)
    })
    registry.register('scale-evidence-v1', '1.0.0', (input) => {
      calls.push('scale-evidence-v1@1.0.0')
      return stubEngine('c')(input)
    })
    const input = buildInput({ key: 'cognitive-domain-v1', version: '1.0.0' })
    registry.dispatch(input)
    expect(calls).toEqual(['cognitive-domain-v1@1.0.0'])
  })

  it('does not admit legacy packageKey as an engine entry point', () => {
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('cognitive-domain-v1', '1.0.0', stubEngine('ok'))
    expect(failCode(() => registry.resolve('attention_stability_v1', '1.0.0'))).toBe('UNKNOWN_ENGINE_KEY')
    expect(failCode(() => registry.resolve('inhibitory_control_multisource_v1', '1.0.0')))
      .toBe('UNKNOWN_ENGINE_KEY')
    const source = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '../../modules/assessment-bundle/registry.ts'),
      'utf8',
    ) as string
    expect(source).not.toMatch(/inferEngineFromPackageKey/)
    expect(source).not.toMatch(/resolveLatest/)
    expect(source).not.toMatch(/resolveCompatible/)
    expect(source).not.toMatch(/fallbackEngine/)
    expect(source).not.toMatch(/packageKey/)
  })

  it('is deterministic for the same frozen input', () => {
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('cognitive-domain-v1', '1.0.0', stubEngine('stable'))
    const input = buildInput({ key: 'cognitive-domain-v1', version: '1.0.0' })
    const first = registry.dispatch(input)
    const second = registry.dispatch(input)
    expect(first).toEqual(second)
    expect(first).toMatchObject({
      kind: 'COMPUTED',
      payload: {
        tag: 'stable',
        snapshotHash: input.snapshot.snapshotHash,
      },
    })
  })
})
