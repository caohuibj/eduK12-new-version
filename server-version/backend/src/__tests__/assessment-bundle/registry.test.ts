import { describe, expect, it } from 'vitest'
import { BundleContractError } from '../../modules/assessment-bundle/errors'
import {
  createBundleAnalysisEngineRegistry,
  type BundleAnalysisEngineV1,
  type BundleEngineInputV1,
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

const stubEngine = (
  engineKey: string,
  engineVersion: string,
  tag: string,
): BundleAnalysisEngineV1 => (input) => ({
  engineKey,
  engineVersion,
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
    registry.register('test-stub-engine-v1', '1.0.0', stubEngine('test-stub-engine-v1', '1.0.0', 'hit'))
    // Product key used only as frozen ref in input; registry lookup is exact string match.
    const productRegistry = createBundleAnalysisEngineRegistry()
    productRegistry.register('cognitive-domain-v1', '1.0.0', stubEngine('cognitive-domain-v1', '1.0.0', 'cog'))
    const input = buildInput({ key: 'cognitive-domain-v1', version: '1.0.0' })
    const result = productRegistry.dispatch(input)
    expect(result).toMatchObject({
      engineKey: 'cognitive-domain-v1',
      engineVersion: '1.0.0',
      kind: 'COMPUTED',
      payload: { tag: 'cog', evidenceCount: 1 },
    })
    expect(registry.resolve('test-stub-engine-v1', '1.0.0')).toBeTypeOf('function')
  })

  it('rejects unknown engine key and known key with unknown version distinctly', () => {
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('test-stub-engine-v1', '1.0.0', stubEngine('test-stub-engine-v1', '1.0.0', 'a'))
    expect(failCode(() => registry.resolve('no-such-engine-v1', '1.0.0'))).toBe('UNKNOWN_ENGINE_KEY')
    expect(failCode(() => registry.resolve('test-stub-engine-v1', '9.9.9'))).toBe('UNKNOWN_ENGINE_VERSION')
  })

  it('allows multiple versions of the same key and rejects duplicate register', () => {
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('test-stub-engine-v1', '1.0.0', stubEngine('test-stub-engine-v1', '1.0.0', 'v100'))
    registry.register('test-stub-engine-v1', '1.0.1', stubEngine('test-stub-engine-v1', '1.0.1', 'v101'))
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
      stubEngine('test-stub-engine-v1', '1.0.0', 'dup'),
    ))).toBe('DUPLICATE_ENGINE')
  })

  it('does not fall back across semver versions', () => {
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('cognitive-domain-v1', '1.0.0', stubEngine('cognitive-domain-v1', '1.0.0', 'only-100'))
    expect(failCode(() => registry.resolve('cognitive-domain-v1', '1.0.1'))).toBe('UNKNOWN_ENGINE_VERSION')
    expect(failCode(() => registry.resolve('cognitive-domain-v1', '^1.0.0'))).toBe('UNKNOWN_ENGINE_VERSION')
    expect(failCode(() => registry.resolve('cognitive-domain-v1', 'latest'))).toBe('UNKNOWN_ENGINE_VERSION')
  })

  it('invokes exactly one engine per dispatch', () => {
    const calls: string[] = []
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('cognitive-domain-v1', '1.0.0', (input) => {
      calls.push('cognitive-domain-v1@1.0.0')
      return stubEngine('cognitive-domain-v1', '1.0.0', 'a')(input)
    })
    registry.register('cognitive-domain-v1', '2.0.0', (input) => {
      calls.push('cognitive-domain-v1@2.0.0')
      return stubEngine('cognitive-domain-v1', '2.0.0', 'b')(input)
    })
    registry.register('scale-evidence-v1', '1.0.0', (input) => {
      calls.push('scale-evidence-v1@1.0.0')
      return stubEngine('scale-evidence-v1', '1.0.0', 'c')(input)
    })
    const input = buildInput({ key: 'cognitive-domain-v1', version: '1.0.0' })
    registry.dispatch(input)
    expect(calls).toEqual(['cognitive-domain-v1@1.0.0'])
  })

  it('does not admit legacy packageKey as an engine entry point', () => {
    const registry = createBundleAnalysisEngineRegistry()
    registry.register('cognitive-domain-v1', '1.0.0', stubEngine('cognitive-domain-v1', '1.0.0', 'ok'))
    // Legacy package keys must not resolve as engines.
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
    registry.register('cognitive-domain-v1', '1.0.0', stubEngine('cognitive-domain-v1', '1.0.0', 'stable'))
    const input = buildInput({ key: 'cognitive-domain-v1', version: '1.0.0' })
    const first = registry.dispatch(input)
    const second = registry.dispatch(input)
    expect(first).toEqual(second)
    expect(first.payload).toMatchObject({
      tag: 'stable',
      snapshotHash: input.snapshot.snapshotHash,
    })
  })
})
