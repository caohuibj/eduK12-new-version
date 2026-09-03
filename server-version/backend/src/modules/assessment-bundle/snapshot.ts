import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptCognitivePayload, encryptCognitivePayload } from '../cognitive/cognitive.security'
import { cloneAssessmentBundleDefinition, hashAssessmentBundleDefinition, parseAssessmentBundleDefinition } from './definition'
import { bundleContractFail } from './errors'
import { frozenAssessmentBundleSnapshotSchema, parseContract } from './schema'
import {
  ASSESSMENT_BUNDLE_SNAPSHOT_FAMILY,
  ASSESSMENT_BUNDLE_SNAPSHOT_VERSION,
  BUNDLE_SNAPSHOT_HASH_SCHEME,
  type AssessmentBundleDefinitionV1,
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

export const buildFrozenAssessmentBundleSnapshot = (
  definition: AssessmentBundleDefinitionV1,
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
    contextDefinitionHash: null,
    rightsSnapshotHash: null,
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
