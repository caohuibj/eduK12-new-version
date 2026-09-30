import type { ResultDisclosureContractV1 } from '../assessment-policy/result-disclosure'
import type { AssessmentInitiationModeV1 } from '../assessment-policy/journey'
import type { EvaluationTargetMode, EvaluationTargetRequest } from '../assessment-policy/target'
import { assertEvaluationTarget } from '../assessment-policy/target'
import {
  relationalProductRegistry,
  type RelationalProductEntryV1,
  type RelationalProductRegistryV1,
} from '../assessment-relational/product-registry'
import type { RelationalResourceKindV1 } from '../assessment-relational/types'

export type RunResourceFamily = RelationalResourceKindV1 | 'COGNITIVE'
export type RunAdapterTransactionMode = 'TRANSACTIONAL_DB' | 'EXTERNAL'
export type RunAdapterStartMode = 'TRANSACTIONAL' | 'OPERATION_KEY' | 'UNSUPPORTED'

export interface RunResourceRef {
  family: RunResourceFamily
  key: string
  version: string
}

export interface RunResourcePolicy {
  resultDisclosure?: ResultDisclosureContractV1
  initiationModes?: readonly AssessmentInitiationModeV1[]
  allowedTargetModes?: readonly EvaluationTargetMode[]
  family: RunResourceFamily
  key: string
  version: string
  scientificMaturity: 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE'
  applicabilityHash: string
  subjectRoles: readonly string[]
  respondentRoles: readonly string[]
  relationshipKinds: readonly string[]
  perspectives: readonly string[]
  analysisMode: string
  visibilityPolicyKey: string
  minimumRespondents: number | null
  runtimeLaunchTarget: { kind: string; ref: string } | null
}

export interface RunResourceAdapterCapabilities {
  transactionMode: RunAdapterTransactionMode
  startMode: RunAdapterStartMode
  supportsLookupByOperationKey: boolean
  supportsSafeCancel: boolean
  finalAuthority: 'CANONICAL_RUNTIME'
  runtimeBindingKind: string
  runV1Enabled: boolean
}

export interface RunResourceAuthorityAdapter {
  family: RunResourceFamily
  capabilities: RunResourceAdapterCapabilities
  resolveExact(ref: RunResourceRef): Promise<RunResourcePolicy>
}

export class RunResourceAuthorityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 409,
  ) {
    super(message)
    this.name = 'RunResourceAuthorityError'
  }
}

const assertSafeCapabilities = (adapter: RunResourceAuthorityAdapter): void => {
  const c = adapter.capabilities
  if (!c.runV1Enabled) return
  if (c.transactionMode === 'TRANSACTIONAL_DB') {
    if (c.startMode !== 'TRANSACTIONAL') {
      throw new Error(`${adapter.family}: enabled transactional adapter must use TRANSACTIONAL start`)
    }
    return
  }
  if (c.startMode !== 'OPERATION_KEY' || !c.supportsLookupByOperationKey) {
    throw new Error(`${adapter.family}: enabled external adapter must support stable operationKey + lookup`)
  }
}

export class RunResourceAuthorityRegistry {
  private readonly byFamily = new Map<RunResourceFamily, RunResourceAuthorityAdapter>()

  constructor(adapters: RunResourceAuthorityAdapter[]) {
    for (const adapter of adapters) {
      if (this.byFamily.has(adapter.family)) throw new Error(`duplicate Run resource adapter: ${adapter.family}`)
      assertSafeCapabilities(adapter)
      this.byFamily.set(adapter.family, adapter)
    }
  }

  adapterFor(family: RunResourceFamily): RunResourceAuthorityAdapter {
    const adapter = this.byFamily.get(family)
    if (!adapter) {
      throw new RunResourceAuthorityError('RUN_RESOURCE_UNSUPPORTED', `Run resource family is unsupported: ${family}`, 400)
    }
    return adapter
  }

  async resolveExact(ref: RunResourceRef): Promise<RunResourcePolicy> {
    if (!ref.key.trim() || !ref.version.trim()) {
      throw new RunResourceAuthorityError('RUN_RESOURCE_IDENTITY_REQUIRED', 'resource key/version are required', 400)
    }
    return this.adapterFor(ref.family).resolveExact(ref)
  }

  assertStartSupported(family: RunResourceFamily): RunResourceAuthorityAdapter {
    const adapter = this.adapterFor(family)
    if (!adapter.capabilities.runV1Enabled) {
      throw new RunResourceAuthorityError('RUN_START_ADAPTER_UNAVAILABLE', `Run START is not enabled for ${family}`, 409)
    }
    return adapter
  }

  capabilityMatrix(): Array<{ family: RunResourceFamily; capabilities: RunResourceAdapterCapabilities }> {
    return [...this.byFamily.values()].map((adapter) => ({
      family: adapter.family,
      capabilities: { ...adapter.capabilities },
    }))
  }
}

const relationalEntryToRunPolicy = (
  entry: RelationalProductEntryV1,
  registry: RelationalProductRegistryV1,
): RunResourcePolicy => ({
  resultDisclosure: entry.resultDisclosure,
  initiationModes: entry.initiationModes,
  allowedTargetModes: entry.allowedTargetModes,
  family: entry.applicability.resourceKind,
  key: entry.applicability.resourceKey,
  version: entry.applicability.resourceVersion,
  scientificMaturity: entry.scienceMaturity,
  applicabilityHash: registry.applicabilityHash(entry),
  subjectRoles: [...entry.applicability.subjectRoles],
  respondentRoles: [...entry.applicability.respondentRoles],
  relationshipKinds: [...entry.applicability.relationshipKinds],
  perspectives: [...entry.applicability.perspectives],
  analysisMode: entry.applicability.analysisMode,
  visibilityPolicyKey: entry.applicability.visibilityPolicyKey,
  minimumRespondents: entry.applicability.minimumRespondents,
  runtimeLaunchTarget: entry.launchTarget
    ? { kind: entry.launchTarget.runtime, ref: entry.launchTarget.compositeAssessmentId }
    : null,
})

export const createRelationalRunResourceAdapter = (input: {
  family: RelationalResourceKindV1
  registry?: RelationalProductRegistryV1
  capabilities?: Partial<RunResourceAdapterCapabilities>
}): RunResourceAuthorityAdapter => {
  const registry = input.registry ?? relationalProductRegistry
  const capabilities: RunResourceAdapterCapabilities = {
    transactionMode: 'TRANSACTIONAL_DB',
    startMode: 'UNSUPPORTED',
    supportsLookupByOperationKey: false,
    supportsSafeCancel: false,
    finalAuthority: 'CANONICAL_RUNTIME',
    runtimeBindingKind: 'COMPOSITE',
    runV1Enabled: false,
    ...input.capabilities,
  }
  return {
    family: input.family,
    capabilities,
    async resolveExact(ref) {
      const entry = registry.findExact({
        resourceKind: input.family,
        resourceKey: ref.key,
        resourceVersion: ref.version,
      })
      if (!entry) {
        throw new RunResourceAuthorityError('RUN_RESOURCE_NOT_FOUND', 'exact resource version was not found', 404)
      }
      if (entry.releaseStatus !== 'PUBLISHED') {
        throw new RunResourceAuthorityError('RUN_RESOURCE_NOT_PUBLISHED', 'resource version is not published', 409)
      }
      if (!entry.launchTarget) {
        throw new RunResourceAuthorityError('RUN_RESOURCE_RUNTIME_UNAVAILABLE', 'resource has no runtime launch target', 409)
      }
      if (entry.applicability.subjectRoles.includes('TEACHER') && entry.applicability.respondentRoles.includes('STUDENT') && !entry.allowedTargetModes?.length) {
        throw new RunResourceAuthorityError('RUN_TARGET_POLICY_MISSING', 'Published teacher-evaluation content must declare target modes', 409)
      }
      if (!entry.initiationModes?.length) throw new RunResourceAuthorityError('RUN_INITIATION_POLICY_MISSING', 'Published delivery content must declare initiation modes', 409)
      return relationalEntryToRunPolicy(entry, registry)
    },
  }
}

export interface RunTrackNarrowingRequest {
  targetPolicy?: EvaluationTargetRequest
  subjectRoles: readonly string[]
  respondentRoles: readonly string[]
  relationshipKinds: readonly string[]
  perspectives: readonly string[]
  analysisMode: string
  visibilityPolicyKey: string
  minimumRespondents: number | null
}

const assertSubset = (name: string, requested: readonly string[], allowed: readonly string[]): void => {
  if (requested.length === 0 || requested.some((value) => !allowed.includes(value))) {
    throw new RunResourceAuthorityError('RUN_TRACK_WIDENING', `${name} must be a non-empty subset of resource authority`, 409)
  }
}

/** Track policy may narrow owning-resource authority, never widen or lower privacy floors. */
export const assertRunTrackNarrowing = (
  policy: RunResourcePolicy,
  requested: RunTrackNarrowingRequest,
): void => {
  if (requested.targetPolicy || (policy.allowedTargetModes?.length && requested.subjectRoles.includes('TEACHER') && requested.respondentRoles.includes('STUDENT'))) {
    try { assertEvaluationTarget(policy.allowedTargetModes, requested.targetPolicy) }
    catch { throw new RunResourceAuthorityError('RUN_TARGET_POLICY', 'A content-authorized evaluation target is required', 409) }
  }
  assertSubset('subjectRoles', requested.subjectRoles, policy.subjectRoles)
  assertSubset('respondentRoles', requested.respondentRoles, policy.respondentRoles)
  assertSubset('relationshipKinds', requested.relationshipKinds, policy.relationshipKinds)
  assertSubset('perspectives', requested.perspectives, policy.perspectives)
  if (requested.analysisMode !== policy.analysisMode) {
    throw new RunResourceAuthorityError('RUN_TRACK_WIDENING', 'analysisMode must match owning resource policy', 409)
  }
  if (requested.visibilityPolicyKey !== policy.visibilityPolicyKey) {
    throw new RunResourceAuthorityError('RUN_TRACK_WIDENING', 'visibility policy cannot be replaced by Run', 409)
  }
  if (
    policy.minimumRespondents !== null
    && (requested.minimumRespondents === null || requested.minimumRespondents < policy.minimumRespondents)
  ) {
    throw new RunResourceAuthorityError('RUN_PRIVACY_FLOOR', 'Run cannot lower resource minimumRespondents', 409)
  }
}

const transactionalCompositeCapabilities: Partial<RunResourceAdapterCapabilities> = {
  transactionMode: 'TRANSACTIONAL_DB',
  startMode: 'TRANSACTIONAL',
  supportsLookupByOperationKey: false,
  supportsSafeCancel: false,
  finalAuthority: 'CANONICAL_RUNTIME',
  runtimeBindingKind: 'COMPOSITE',
  runV1Enabled: true,
}

// C12 proves the existing relational Composite START can transition the assignment,
// create the runtime attempt, attach the Run binding, and complete the claim in one
// database transaction. Families that do not launch through Composite stay unsupported.
export const productionRunResourceAuthorityRegistry = new RunResourceAuthorityRegistry([
  createRelationalRunResourceAdapter({ family: 'BUNDLE', capabilities: transactionalCompositeCapabilities }),
  createRelationalRunResourceAdapter({ family: 'SCALE', capabilities: transactionalCompositeCapabilities }),
  createRelationalRunResourceAdapter({ family: 'FORM', capabilities: transactionalCompositeCapabilities }),
  createRelationalRunResourceAdapter({ family: 'SITUATIONAL', capabilities: transactionalCompositeCapabilities }),
])
