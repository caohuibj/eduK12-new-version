import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptCognitivePayload, encryptCognitivePayload } from '../cognitive/cognitive.security'
import { cloneAssessmentBundleDefinition, hashAssessmentBundleDefinition, validateAssessmentBundleDefinition } from './definition'
import { bundleContractFail } from './errors'
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
  snapshot: FrozenAssessmentBundleSnapshotV3,
  expectedDefinition?: AssessmentBundleDefinitionV1,
): FrozenAssessmentBundleSnapshotV3 => {
  if (snapshot.snapshotFamily !== ASSESSMENT_BUNDLE_SNAPSHOT_FAMILY) {
    bundleContractFail('UNSUPPORTED_SNAPSHOT', `不是 Assessment Bundle snapshot: ${String(snapshot.snapshotFamily)}`)
  }
  if (snapshot.snapshotVersion !== ASSESSMENT_BUNDLE_SNAPSHOT_VERSION) {
    bundleContractFail('UNSUPPORTED_SNAPSHOT', `不支持的 Bundle snapshotVersion: ${String(snapshot.snapshotVersion)}`)
  }
  if (snapshot.hashScheme !== BUNDLE_SNAPSHOT_HASH_SCHEME) {
    bundleContractFail('UNSUPPORTED_SNAPSHOT', 'Bundle snapshot hashScheme 不匹配')
  }
  validateAssessmentBundleDefinition(snapshot.bundleDefinition)
  if (
    snapshot.bundleKey !== snapshot.bundleDefinition.bundleKey
    || snapshot.bundleVersion !== snapshot.bundleDefinition.bundleVersion
  ) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'snapshot identity 与 bundleDefinition 不一致')
  }
  if (snapshot.engine.key !== snapshot.bundleDefinition.engine.key
    || snapshot.engine.version !== snapshot.bundleDefinition.engine.version) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'snapshot engine 与 definition 不一致')
  }
  const expectedDefinitionHash = hashAssessmentBundleDefinition(snapshot.bundleDefinition)
  if (snapshot.bundleDefinitionHash !== expectedDefinitionHash) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'bundleDefinitionHash 不匹配')
  }
  const expectedBindings = slotBindingsFromDefinition(snapshot.bundleDefinition)
  if (canonicalHash(snapshot.slotBindings) !== canonicalHash(expectedBindings)) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'slotBindings 与 definition 不一致')
  }
  if (snapshot.rightsSnapshotHash !== null) {
    bundleContractFail('SNAPSHOT_TAMPERED', 'commit 2 不得写入 rightsSnapshotHash')
  }
  if (expectedDefinition) {
    const expected = validateAssessmentBundleDefinition(expectedDefinition)
    if (
      expected.bundleKey !== snapshot.bundleKey
      || expected.bundleVersion !== snapshot.bundleVersion
      || hashAssessmentBundleDefinition(expected) !== snapshot.bundleDefinitionHash
    ) {
      bundleContractFail('SNAPSHOT_TAMPERED', 'snapshot 与提供的 definition 不匹配')
    }
  }
  const expectedHash = hashFrozenAssessmentBundleSnapshot(snapshot)
  if (snapshot.snapshotHash !== expectedHash) {
    bundleContractFail('SNAPSHOT_HASH_MISMATCH', 'FrozenAssessmentBundleSnapshotV3 hash 不匹配')
  }
  return snapshot
}

export const parseFrozenAssessmentBundleSnapshot = (value: unknown): FrozenAssessmentBundleSnapshotV3 => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    bundleContractFail('UNSUPPORTED_SNAPSHOT', 'Bundle snapshot 不是对象')
  }
  const snapshot = value as FrozenAssessmentBundleSnapshotV3
  return validateFrozenAssessmentBundleSnapshot(snapshot)
}

export const encryptFrozenAssessmentBundleSnapshot = (
  snapshot: FrozenAssessmentBundleSnapshotV3,
): string => encryptCognitivePayload(validateFrozenAssessmentBundleSnapshot(snapshot))

export const decryptFrozenAssessmentBundleSnapshot = (encrypted: string): FrozenAssessmentBundleSnapshotV3 => (
  parseFrozenAssessmentBundleSnapshot(decryptCognitivePayload<unknown>(encrypted))
)
