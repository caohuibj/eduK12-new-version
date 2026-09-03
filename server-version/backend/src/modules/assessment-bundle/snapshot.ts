import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptCognitivePayload, encryptCognitivePayload } from '../cognitive/cognitive.security'
import {
  hashBundleContextDefinition,
  parseBundleContextDefinition,
  type BundleContextDefinitionV1,
} from './context'
import { cloneAssessmentBundleDefinition, hashAssessmentBundleDefinition, parseAssessmentBundleDefinition } from './definition'
import { bundleContractFail } from './errors'
import { HEX_HASH, frozenAssessmentBundleSnapshotSchema, parseContract } from './schema'
import {
  ASSESSMENT_BUNDLE_SNAPSHOT_FAMILY,
  ASSESSMENT_BUNDLE_SNAPSHOT_VERSION,
  BUNDLE_SNAPSHOT_HASH_SCHEME,
  type AssessmentBundleDefinitionV1,
  type BundleRuleSetRefV1,
  type FrozenAssessmentBundleSnapshotV3,
  type FrozenBundleSlotBindingV3,
} from './types'

const snapshotHashInput = (snapshot: Omit<FrozenAssessmentBundleSnapshotV3, 'snapshotHash'>) => ({
  snapshotFamily: snapshot.snapshotFamily,
  snapshotVersion: snapshot.snapshotVersion,
  bundleKey: snapshot.bundleKey,
  bundleVersion: snapshot.bundleVersion,
  bundleDefinition: snapshot.bundleDefinition,
  bundleDefinitionHash: snapshot.bundleDefinitionHash,
  engine: snapshot.engine,
  slotBindings: snapshot.slotBindings,
  contextDefinitionHash: snapshot.contextDefinitionHash,
  rightsSnapshotHash: snapshot.rightsSnapshotHash,
  ruleSetRef: snapshot.ruleSetRef,
  reportDefinitionKey: snapshot.reportDefinitionKey,
  reportDefinitionVersion: snapshot.reportDefinitionVersion,
  hashScheme: snapshot.hashScheme,
})

export const hashFrozenAssessmentBundleSnapshot = (
  snapshot: Omit<FrozenAssessmentBundleSnapshotV3, 'snapshotHash'>,
): string => canonicalHash(snapshotHashInput(snapshot))

const slotBindingsFromDefinition = (definition: AssessmentBundleDefinitionV1): FrozenBundleSlotBindingV3[] => (
  [...definition.slots]
    .sort((left, right) => left.position - right.position)
    .map((slot) => ({
      slotKey: slot.slotKey,
      unitType: slot.unitType,
      instrumentKey: slot.instrumentKey,
      instrumentVersion: slot.instrumentVersion,
      required: slot.required,
      respondentType: slot.respondentType,
      valueSelectors: slot.valueSelectors ? [...slot.valueSelectors] : null,
    }))
)

const resolveContextDefinitionHash = (
  definition: AssessmentBundleDefinitionV1,
  contextDefinition?: BundleContextDefinitionV1 | null,
): string | null => {
  const declaresContext = definition.contextDefinitionKey !== null
  if (!declaresContext) {
    if (contextDefinition) {
      bundleContractFail(
        'SNAPSHOT_TAMPERED',
        'Bundle 未声明 Context 时不得写入 ContextDefinition',
      )
    }
    return null
  }
  if (!contextDefinition) {
    return bundleContractFail(
      'CONTEXT_DEFINITION_REQUIRED',
      'Bundle 声明了 Context key/version，冻结 snapshot 必须提供 ContextDefinition',
    )
  }
  const validated = parseBundleContextDefinition(contextDefinition)
  if (
    validated.contextDefinitionKey !== definition.contextDefinitionKey
    || validated.contextDefinitionVersion !== definition.contextDefinitionVersion
  ) {
    bundleContractFail(
      'CONTEXT_DEFINITION_VERSION_MISMATCH',
      `ContextDefinition 与 Bundle 声明不一致: expected ${definition.contextDefinitionKey}@${definition.contextDefinitionVersion}`,
    )
  }
  return hashBundleContextDefinition(validated)
}

const resolveRuleSetRef = (
  definition: AssessmentBundleDefinitionV1,
  ruleSetRef?: BundleRuleSetRefV1 | null,
): BundleRuleSetRefV1 | null => {
  const isMentalHealth = definition.engine.key === 'mental-health-rule-v1'
  if (!isMentalHealth) {
    if (ruleSetRef) {
      bundleContractFail('SNAPSHOT_TAMPERED', '非 mental-health 引擎不得写入 ruleSetRef')
    }
    return null
  }
  if (!ruleSetRef) {
    return bundleContractFail('RULE_SET_REQUIRED', 'mental-health-rule-v1 冻结 snapshot 必须提供 ruleSetRef')
  }
  const ref = ruleSetRef
  if (!HEX_HASH.test(ref.hash) || !ref.key || !ref.version) {
    bundleContractFail('RULE_SET_INVALID', 'ruleSetRef 非法')
  }
  return {
    key: ref.key,
    version: ref.version,
    hash: ref.hash,
  }
}

export const buildFrozenAssessmentBundleSnapshot = (
  definition: AssessmentBundleDefinitionV1,
  options?: {
    contextDefinition?: BundleContextDefinitionV1 | null
    ruleSetRef?: BundleRuleSetRefV1 | null
  },
): FrozenAssessmentBundleSnapshotV3 => {
  const validated = cloneAssessmentBundleDefinition(definition)
  const withoutHash = {
    snapshotFamily: ASSESSMENT_BUNDLE_SNAPSHOT_FAMILY,
    snapshotVersion: ASSESSMENT_BUNDLE_SNAPSHOT_VERSION,
    bundleKey: validated.bundleKey,
    bundleVersion: validated.bundleVersion,
    bundleDefinition: validated,
    bundleDefinitionHash: hashAssessmentBundleDefinition(validated),
    engine: { ...validated.engine },
    slotBindings: slotBindingsFromDefinition(validated),
    contextDefinitionHash: resolveContextDefinitionHash(validated, options?.contextDefinition),
    rightsSnapshotHash: null,
    ruleSetRef: resolveRuleSetRef(validated, options?.ruleSetRef ?? null),
    reportDefinitionKey: validated.reportDefinitionKey,
    reportDefinitionVersion: validated.reportDefinitionVersion,
    hashScheme: BUNDLE_SNAPSHOT_HASH_SCHEME,
  }
  return {
    ...withoutHash,
    snapshotHash: hashFrozenAssessmentBundleSnapshot(withoutHash),
  }
}

export const validateFrozenAssessmentBundleSnapshot = (
  snapshot: FrozenAssessmentBundleSnapshotV3 | unknown,
  expectedDefinition?: AssessmentBundleDefinitionV1,
): FrozenAssessmentBundleSnapshotV3 => {
  const parsed = parseContract(frozenAssessmentBundleSnapshotSchema, snapshot, 'UNSUPPORTED_SNAPSHOT')
  parseAssessmentBundleDefinition(parsed.bundleDefinition)
  if (parsed.snapshotFamily !== ASSESSMENT_BUNDLE_SNAPSHOT_FAMILY) {
    bundleContractFail('UNSUPPORTED_SNAPSHOT', `不是 Assessment Bundle snapshot: ${String(parsed.snapshotFamily)}`)
  }
  if (parsed.snapshotVersion !== ASSESSMENT_BUNDLE_SNAPSHOT_VERSION) {
    bundleContractFail('UNSUPPORTED_SNAPSHOT', `不支持的 Bundle snapshotVersion: ${String(parsed.snapshotVersion)}`)
  }
  if (parsed.hashScheme !== BUNDLE_SNAPSHOT_HASH_SCHEME) {
    bundleContractFail('UNSUPPORTED_SNAPSHOT', 'Bundle snapshot hashScheme 不匹配')
  }
  if (
    parsed.bundleKey !== parsed.bundleDefinition.bundleKey
    || parsed.bundleVersion !== parsed.bundleDefinition.bundleVersion
  ) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'snapshot identity 与 bundleDefinition 不一致')
  }
  if (parsed.engine.key !== parsed.bundleDefinition.engine.key
    || parsed.engine.version !== parsed.bundleDefinition.engine.version) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'snapshot engine 与 definition 不一致')
  }
  const expectedDefinitionHash = hashAssessmentBundleDefinition(parsed.bundleDefinition)
  if (parsed.bundleDefinitionHash !== expectedDefinitionHash) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'bundleDefinitionHash 不匹配')
  }
  const expectedBindings = slotBindingsFromDefinition(parsed.bundleDefinition)
  if (canonicalHash(parsed.slotBindings) !== canonicalHash(expectedBindings)) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'slotBindings 与 definition 不一致')
  }
  if (
    parsed.reportDefinitionKey !== parsed.bundleDefinition.reportDefinitionKey
    || parsed.reportDefinitionVersion !== parsed.bundleDefinition.reportDefinitionVersion
  ) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'snapshot report definition 与 bundleDefinition 不一致')
  }
  if (parsed.rightsSnapshotHash !== null) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'commit 2 不得写入 rightsSnapshotHash')
  }

  const declaresContext = parsed.bundleDefinition.contextDefinitionKey !== null
  if (!declaresContext && parsed.contextDefinitionHash !== null) {
    bundleContractFail('SNAPSHOT_TAMPERED', '未声明 Context 时 contextDefinitionHash 必须为 null')
  }
  if (declaresContext && parsed.contextDefinitionHash === null) {
    bundleContractFail('SNAPSHOT_TAMPERED', '声明 Context 时 contextDefinitionHash 不得为 null')
  }

  const isMentalHealth = parsed.engine.key === 'mental-health-rule-v1'
  if (!isMentalHealth && parsed.ruleSetRef !== null) {
    bundleContractFail('SNAPSHOT_TAMPERED', '非 mental-health 引擎 ruleSetRef 必须为 null')
  }
  if (isMentalHealth && parsed.ruleSetRef === null) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'mental-health-rule-v1 必须冻结 ruleSetRef')
  }

  if (expectedDefinition) {
    const expected = parseAssessmentBundleDefinition(expectedDefinition)
    if (
      expected.bundleKey !== parsed.bundleKey
      || expected.bundleVersion !== parsed.bundleVersion
      || hashAssessmentBundleDefinition(expected) !== parsed.bundleDefinitionHash
    ) {
      bundleContractFail('SNAPSHOT_TAMPERED', 'snapshot 与提供的 definition 不匹配')
    }
  }
  const expectedHash = hashFrozenAssessmentBundleSnapshot(parsed)
  if (parsed.snapshotHash !== expectedHash) {
    bundleContractFail('SNAPSHOT_HASH_MISMATCH', 'FrozenAssessmentBundleSnapshotV3 hash 不匹配')
  }
  return parsed
}

export const parseFrozenAssessmentBundleSnapshot = (value: unknown): FrozenAssessmentBundleSnapshotV3 => (
  validateFrozenAssessmentBundleSnapshot(value)
)

export const encryptFrozenAssessmentBundleSnapshot = (
  snapshot: FrozenAssessmentBundleSnapshotV3,
): string => encryptCognitivePayload(validateFrozenAssessmentBundleSnapshot(snapshot))

export const decryptFrozenAssessmentBundleSnapshot = (encrypted: string): FrozenAssessmentBundleSnapshotV3 => (
  parseFrozenAssessmentBundleSnapshot(decryptCognitivePayload<unknown>(encrypted))
)

/**
 * Verify a Context freeze state's definitionHash matches the Bundle snapshot.
 * Used by later ReportFacts / freeze orchestration.
 */
export const assertContextDefinitionHashMatchesSnapshot = (input: {
  snapshot: FrozenAssessmentBundleSnapshotV3
  contextDefinitionHash: string | null
}): void => {
  const expected = input.snapshot.contextDefinitionHash
  if (expected !== input.contextDefinitionHash) {
    bundleContractFail(
      'CONTEXT_DEFINITION_VERSION_MISMATCH',
      'state.contextDefinitionHash 必须等于 snapshot.contextDefinitionHash',
    )
  }
}
