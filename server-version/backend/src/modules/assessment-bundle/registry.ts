import type { CompiledInstrumentRuntimeV1 } from '../assessment-runtime/types'
import { bundleContractFail } from './errors'
import type {
  BundleContextFactsV1,
  EvidenceItemV1,
  FrozenAssessmentBundleSnapshotV3,
} from './types'

/**
 * Narrow pure-engine input. Engines must not touch Prisma, Attempt, Express,
 * decrypt, or completeness checks — callers supply already-frozen material.
 */
export interface BundleEngineInputV1 {
  snapshot: FrozenAssessmentBundleSnapshotV3
  compiledRuntime: CompiledInstrumentRuntimeV1
  evidence: EvidenceItemV1[]
  contextFacts: BundleContextFactsV1 | null
  aggregateInputHash: string | null
}

export type BundleEngineResultV1 = {
  engineKey: string
  engineVersion: string
  kind: 'UNAVAILABLE' | 'COMPUTED'
  reason?: string
  payload?: unknown
}

export type BundleAnalysisEngineV1 = (input: BundleEngineInputV1) => BundleEngineResultV1

const engineResourceId = (key: string, version: string): string => `${key}@${version}`

/**
 * Exact {key, version} registry only.
 * Forbidden: latest/compatible resolution, fallback engines,
 * package-key inference, and semver ranges.
 */
export class BundleAnalysisEngineRegistry {
  private readonly engines = new Map<string, BundleAnalysisEngineV1>()

  register(key: string, version: string, engine: BundleAnalysisEngineV1): void {
    if (typeof key !== 'string' || key.length === 0) {
      bundleContractFail('INVALID_ENGINE_REF', 'engine key 缺失')
    }
    if (typeof version !== 'string' || version.length === 0) {
      bundleContractFail('INVALID_ENGINE_REF', 'engine version 缺失')
    }
    const id = engineResourceId(key, version)
    if (this.engines.has(id)) {
      bundleContractFail('DUPLICATE_ENGINE', `engine already registered: ${id}`)
    }
    this.engines.set(id, engine)
  }

  resolve(key: string, version: string): BundleAnalysisEngineV1 {
    if (typeof key !== 'string' || key.length === 0) {
      bundleContractFail('INVALID_ENGINE_REF', 'engine key 缺失')
    }
    if (typeof version !== 'string' || version.length === 0) {
      bundleContractFail('INVALID_ENGINE_REF', 'engine version 缺失')
    }
    const id = engineResourceId(key, version)
    const hit = this.engines.get(id)
    if (hit) return hit

    const keyPrefix = `${key}@`
    let keyKnown = false
    for (const registered of this.engines.keys()) {
      if (registered.startsWith(keyPrefix)) {
        keyKnown = true
        break
      }
    }
    if (!keyKnown) {
      bundleContractFail('UNKNOWN_ENGINE_KEY', `unknown engine key: ${key}`)
    }
    return bundleContractFail('UNKNOWN_ENGINE_VERSION', `unknown engine version: ${id}`)
  }

  /**
   * Dispatch using the frozen snapshot's exact engine ref only.
   * Never infers from legacy package keys, bundle keys, or category.
   */
  dispatch(input: BundleEngineInputV1): BundleEngineResultV1 {
    const { key, version } = input.snapshot.engine
    const engine = this.resolve(key, version)
    return engine(input)
  }
}

export const createBundleAnalysisEngineRegistry = (): BundleAnalysisEngineRegistry => (
  new BundleAnalysisEngineRegistry()
)
