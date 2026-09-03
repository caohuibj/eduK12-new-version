import { canonicalHash } from '../assessment-runtime/canonical'
import { bundleContractFail } from './errors'
import {
  ASSESSMENT_BUNDLE_DEFINITION_SCHEMA,
  BUNDLE_ENGINE_KEYS,
  type AssessmentBundleDefinitionV1,
  type BundleCategoryV1,
  type BundleEngineKeyV1,
  type BundleInitiationModeV1,
  type BundleRespondentTypeV1,
  type BundleSlotUnitTypeV1,
} from './types'

const BUNDLE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/
const SLOT_KEY_PATTERN = /^[a-z][a-z0-9_.]*$/
const SLOT_UNIT_TYPES: readonly BundleSlotUnitTypeV1[] = ['COGNITIVE', 'SCALE', 'FORM']
const RESPONDENT_TYPES: readonly BundleRespondentTypeV1[] = ['SELF', 'PARENT', 'TEACHER']
const INITIATION_MODES: readonly BundleInitiationModeV1[] = [
  'TEACHER_ASSIGNMENT',
  'PARENT_SELF_SERVE',
  'ANONYMOUS_SELF',
  'STUDENT_COURSE',
]
const CATEGORIES: readonly BundleCategoryV1[] = ['cognitive', 'scale_self', 'observer', 'integrated']

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const assertEngineRef = (engine: AssessmentBundleDefinitionV1['engine']) => {
  if (!engine || !isNonEmptyString(engine.key) || !isNonEmptyString(engine.version)) {
    bundleContractFail('ENGINE_REQUIRED', 'Bundle engine 必须提供精确 key 和 version')
  }
  if (!(BUNDLE_ENGINE_KEYS as readonly string[]).includes(engine.key)) {
    bundleContractFail('ENGINE_REQUIRED', `未知 Bundle engine: ${engine.key}`)
  }
  if (!VERSION_PATTERN.test(engine.version)) {
    bundleContractFail('ENGINE_REQUIRED', `Bundle engine version 必须是精确 x.y.z: ${engine.version}`)
  }
}

const assertRespondentPopulation = (definition: AssessmentBundleDefinitionV1) => {
  const respondents = new Set(definition.respondentTypes)
  const modes = new Set(definition.initiationModes)
  if (respondents.size === 0) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'respondentTypes 不能为空')
  }
  if (modes.size === 0) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'initiationModes 不能为空')
  }
  if (definition.respondentTypes.some((item) => !RESPONDENT_TYPES.includes(item))) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', '存在未知 respondentType')
  }
  if (definition.initiationModes.some((item) => !INITIATION_MODES.includes(item))) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', '存在未知 initiationMode')
  }
  if (!CATEGORIES.includes(definition.category)) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', `未知 Bundle category: ${definition.category}`)
  }

  if (definition.category === 'observer') {
    if (respondents.has('SELF') || (!respondents.has('PARENT') && !respondents.has('TEACHER'))) {
      bundleContractFail('INVALID_RESPONDENT_POPULATION', 'observer Bundle 只能使用 PARENT 和/或 TEACHER')
    }
  } else if (respondents.size !== 1 || !respondents.has('SELF')) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', `${definition.category} Bundle 只能使用 SELF respondent`)
  }

  if (definition.category === 'integrated' && definition.population.subjectPopulation !== 'adult') {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'integrated Bundle 的 subjectPopulation 必须是 adult')
  }
  if (modes.has('PARENT_SELF_SERVE') && !respondents.has('PARENT')) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'PARENT_SELF_SERVE 需要 PARENT respondentType')
  }
  if (modes.has('ANONYMOUS_SELF') && !respondents.has('SELF')) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'ANONYMOUS_SELF 需要 SELF respondentType')
  }

  const minAge = definition.population.subjectMinAgeYears
  const maxAge = definition.population.subjectMaxAgeYears
  if (minAge !== undefined && (!Number.isInteger(minAge) || minAge < 0)) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'subjectMinAgeYears 无效')
  }
  if (maxAge !== undefined && (!Number.isInteger(maxAge) || maxAge < 0)) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'subjectMaxAgeYears 无效')
  }
  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'subjectMinAgeYears 不能大于 subjectMaxAgeYears')
  }
  if (definition.category === 'integrated' && minAge !== undefined && minAge < 18) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'integrated Bundle 不得把最低年龄设在 18 岁以下')
  }
}

const assertSlots = (definition: AssessmentBundleDefinitionV1) => {
  if (!Array.isArray(definition.slots) || definition.slots.length === 0) {
    bundleContractFail('UNKNOWN_SLOT_TYPE', 'Bundle 至少需要一个 slot')
  }
  const slotKeys = new Set<string>()
  const positions = new Set<number>()
  const respondents = new Set(definition.respondentTypes)
  for (const slot of definition.slots) {
    if (!SLOT_UNIT_TYPES.includes(slot.unitType)) {
      bundleContractFail('UNKNOWN_SLOT_TYPE', `未知 slot unitType: ${String(slot.unitType)}`)
    }
    if (!isNonEmptyString(slot.slotKey) || !SLOT_KEY_PATTERN.test(slot.slotKey)) {
      bundleContractFail('DUPLICATE_SLOT_KEY', `非法 slotKey: ${String(slot.slotKey)}`)
    }
    if (slotKeys.has(slot.slotKey)) {
      bundleContractFail('DUPLICATE_SLOT_KEY', `重复 slotKey: ${slot.slotKey}`)
    }
    slotKeys.add(slot.slotKey)
    if (!Number.isInteger(slot.position) || slot.position < 0 || positions.has(slot.position)) {
      bundleContractFail('DUPLICATE_SLOT_KEY', `slot position 无效或重复: ${slot.slotKey}`)
    }
    positions.add(slot.position)
    if (!isNonEmptyString(slot.instrumentKey) || !isNonEmptyString(slot.instrumentVersion)) {
      bundleContractFail('ENGINE_REQUIRED', `slot ${slot.slotKey} 缺少 instrument key/version`)
    }
    if (!respondents.has(slot.respondentType)) {
      bundleContractFail('INVALID_RESPONDENT_POPULATION', `slot ${slot.slotKey} respondentType 不在 Bundle respondentTypes 中`)
    }
    if (slot.unitType === 'FORM' && slot.valueSelectors && slot.valueSelectors.length > 0) {
      bundleContractFail('UNKNOWN_SLOT_TYPE', `FORM slot 不得携带 valueSelectors: ${slot.slotKey}`)
    }
    if (slot.valueSelectors?.some((item) => !isNonEmptyString(item))) {
      bundleContractFail('UNKNOWN_SLOT_TYPE', `slot ${slot.slotKey} 的 valueSelectors 含空值`)
    }
  }
}

export const validateAssessmentBundleDefinition = (
  definition: AssessmentBundleDefinitionV1,
): AssessmentBundleDefinitionV1 => {
  if (definition.schemaVersion !== ASSESSMENT_BUNDLE_DEFINITION_SCHEMA) {
    bundleContractFail('UNSUPPORTED_SNAPSHOT', `不支持的 Bundle definition schemaVersion: ${String(definition.schemaVersion)}`)
  }
  if (!isNonEmptyString(definition.bundleKey) || !BUNDLE_KEY_PATTERN.test(definition.bundleKey)) {
    bundleContractFail('DUPLICATE_BUNDLE', `非法 bundleKey: ${String(definition.bundleKey)}`)
  }
  if (!isNonEmptyString(definition.bundleVersion) || !VERSION_PATTERN.test(definition.bundleVersion)) {
    bundleContractFail('DUPLICATE_BUNDLE', `非法 bundleVersion: ${String(definition.bundleVersion)}`)
  }
  if (!isNonEmptyString(definition.name) || !isNonEmptyString(definition.description)) {
    bundleContractFail('DUPLICATE_BUNDLE', 'Bundle name/description 不能为空')
  }
  if (!isNonEmptyString(definition.reportDefinitionKey) || !isNonEmptyString(definition.reportDefinitionVersion)) {
    bundleContractFail('ENGINE_REQUIRED', 'report definition key/version 必填')
  }
  assertEngineRef(definition.engine)
  assertRespondentPopulation(definition)
  assertSlots(definition)
  return definition
}

export const hashAssessmentBundleDefinition = (definition: AssessmentBundleDefinitionV1): string => {
  const validated = validateAssessmentBundleDefinition(definition)
  return canonicalHash({
    schema: 'AssessmentBundleDefinitionV1',
    definition: validated,
  })
}

export const cloneAssessmentBundleDefinition = (
  definition: AssessmentBundleDefinitionV1,
): AssessmentBundleDefinitionV1 => cloneJson(validateAssessmentBundleDefinition(definition))

export const assessmentBundleResourceId = (bundleKey: string, bundleVersion: string): string => (
  `${bundleKey}@${bundleVersion}`
)

export const validateAssessmentBundleCatalog = (
  definitions: AssessmentBundleDefinitionV1[],
): AssessmentBundleDefinitionV1[] => {
  const keys = new Set<string>()
  return definitions.map((definition) => {
    const validated = validateAssessmentBundleDefinition(definition)
    const resourceId = assessmentBundleResourceId(validated.bundleKey, validated.bundleVersion)
    if (keys.has(resourceId)) {
      bundleContractFail('DUPLICATE_BUNDLE', `重复 Bundle: ${resourceId}`)
    }
    keys.add(resourceId)
    return validated
  })
}

export const isBundleEngineKey = (value: string): value is BundleEngineKeyV1 => (
  (BUNDLE_ENGINE_KEYS as readonly string[]).includes(value)
)
