import { canonicalHash } from '../assessment-runtime/canonical'
import { bundleContractFail } from './errors'
import { assessmentBundleDefinitionSchema, parseContract } from './schema'
import {
  BUNDLE_ENGINE_KEYS,
  type AssessmentBundleDefinitionV1,
  type BundleEngineKeyV1,
} from './types'

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const assertRespondentPopulation = (definition: AssessmentBundleDefinitionV1) => {
  const respondents = new Set(definition.respondentTypes)
  const modes = new Set(definition.initiationModes)

  if (definition.category === 'observer') {
    if (respondents.has('SELF') || (!respondents.has('PARENT') && !respondents.has('TEACHER'))) {
      bundleContractFail('INVALID_RESPONDENT_POPULATION', 'observer Bundle 只能使用 PARENT 和/或 TEACHER')
    }
  } else if (respondents.size !== 1 || !respondents.has('SELF')) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', `${definition.category} Bundle 只能使用 SELF respondent`)
  }

  if (modes.has('PARENT_SELF_SERVE') && !respondents.has('PARENT')) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'PARENT_SELF_SERVE 需要 PARENT respondentType')
  }
  if (modes.has('ANONYMOUS_SELF') && !respondents.has('SELF')) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'ANONYMOUS_SELF 需要 SELF respondentType')
  }

  const minAge = definition.population.subjectMinAgeYears
  const maxAge = definition.population.subjectMaxAgeYears
  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
    bundleContractFail('INVALID_RESPONDENT_POPULATION', 'subjectMinAgeYears 不能大于 subjectMaxAgeYears')
  }
}

const assertSlotsAndRights = (definition: AssessmentBundleDefinitionV1) => {
  const slotKeys = new Set<string>()
  const positions = new Set<number>()
  const respondents = new Set(definition.respondentTypes)
  const instrumentKeys = new Set<string>()
  for (const slot of definition.slots) {
    if (slotKeys.has(slot.slotKey)) {
      bundleContractFail('DUPLICATE_SLOT_KEY', `重复 slotKey: ${slot.slotKey}`)
    }
    slotKeys.add(slot.slotKey)
    if (positions.has(slot.position)) {
      bundleContractFail('DUPLICATE_SLOT_KEY', `slot position 无效或重复: ${slot.slotKey}`)
    }
    positions.add(slot.position)
    instrumentKeys.add(slot.instrumentKey)
    if (!respondents.has(slot.respondentType)) {
      bundleContractFail('INVALID_RESPONDENT_POPULATION', `slot ${slot.slotKey} respondentType 不在 Bundle respondentTypes 中`)
    }
    if (slot.unitType === 'FORM' && slot.valueSelectors && slot.valueSelectors.length > 0) {
      bundleContractFail('UNKNOWN_SLOT_TYPE', `FORM slot 不得携带 valueSelectors: ${slot.slotKey}`)
    }
    if (slot.valueSelectors) {
      const seenSelectors = new Set<string>()
      for (const selector of slot.valueSelectors) {
        if (seenSelectors.has(selector)) {
          bundleContractFail(
            'SOURCE_VALUE_SELECTOR_DUPLICATE',
            `valueSelector 重复: ${slot.slotKey}/${selector}`,
          )
        }
        seenSelectors.add(selector)
      }
    }
  }

  if (definition.rightsRequirements.required && definition.rightsRequirements.instrumentKeys.length === 0) {
    bundleContractFail('INVALID_DEFINITION', 'rightsRequirements.required 时必须列出 instrumentKeys')
  }
  for (const instrumentKey of definition.rightsRequirements.instrumentKeys) {
    if (!instrumentKeys.has(instrumentKey)) {
      bundleContractFail('INVALID_DEFINITION', `rights instrument 不在 Bundle slots 中: ${instrumentKey}`)
    }
  }
  if (definition.safetyCapability.productionTriggerEnabled && !definition.safetyCapability.safetyCapable) {
    bundleContractFail('INVALID_DEFINITION', 'productionTriggerEnabled 要求 safetyCapable')
  }
}

export const parseAssessmentBundleDefinition = (value: unknown): AssessmentBundleDefinitionV1 => {
  const parsed = parseContract(assessmentBundleDefinitionSchema, value, 'INVALID_DEFINITION')
  assertRespondentPopulation(parsed)
  assertSlotsAndRights(parsed)
  return parsed
}

export const validateAssessmentBundleDefinition = (
  definition: AssessmentBundleDefinitionV1 | unknown,
): AssessmentBundleDefinitionV1 => parseAssessmentBundleDefinition(definition)

export const hashAssessmentBundleDefinition = (definition: AssessmentBundleDefinitionV1): string => {
  const validated = parseAssessmentBundleDefinition(definition)
  return canonicalHash({
    schema: 'AssessmentBundleDefinitionV1',
    definition: validated,
  })
}

export const cloneAssessmentBundleDefinition = (
  definition: AssessmentBundleDefinitionV1,
): AssessmentBundleDefinitionV1 => cloneJson(parseAssessmentBundleDefinition(definition))

export const assessmentBundleResourceId = (bundleKey: string, bundleVersion: string): string => (
  `${bundleKey}@${bundleVersion}`
)

export const validateAssessmentBundleCatalog = (
  definitions: AssessmentBundleDefinitionV1[],
): AssessmentBundleDefinitionV1[] => {
  const keys = new Set<string>()
  return definitions.map((definition) => {
    const validated = parseAssessmentBundleDefinition(definition)
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
