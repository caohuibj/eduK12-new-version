import { audienceDisclosurePolicyV1Schema } from './schema'
import type {
  AudienceDisclosurePolicyV1,
  DisclosureCapabilitiesV1,
  ScaleDisclosureAudience,
} from './types'

const capabilityKeys: Array<keyof DisclosureCapabilitiesV1> = [
  'numericScores',
  'references',
  'individualInterpretations',
  'scoreDerivedLabels',
  'resultQualityDetails',
  'rawAnswers',
  'itemScores',
  'methods',
  'educationalContent',
]

const none = (): DisclosureCapabilitiesV1 => ({
  numericScores: false,
  references: false,
  individualInterpretations: false,
  scoreDerivedLabels: false,
  resultQualityDetails: false,
  rawAnswers: false,
  itemScores: false,
  methods: false,
  educationalContent: false,
})

export const DISCLOSURE_PRESETS = {
  FULL_REPORT: (): DisclosureCapabilitiesV1 => ({
    numericScores: true,
    references: true,
    individualInterpretations: true,
    scoreDerivedLabels: true,
    resultQualityDetails: true,
    rawAnswers: false,
    itemScores: true,
    methods: true,
    educationalContent: true,
  }),
  SCORES: (): DisclosureCapabilitiesV1 => ({ ...none(), numericScores: true }),
  EDUCATIONAL_ONLY: (): DisclosureCapabilitiesV1 => ({ ...none(), educationalContent: true }),
  COMPLETION_ONLY: none,
  NONE: none,
} as const

export const intersectDisclosureCapabilities = (
  ...inputs: DisclosureCapabilitiesV1[]
): DisclosureCapabilitiesV1 => {
  if (inputs.length === 0) return none()
  const output = none()
  capabilityKeys.forEach((key) => {
    output[key] = inputs.every((input) => input[key])
  })
  return output
}

export const resolveAudienceDisclosure = (
  inputPolicy: AudienceDisclosurePolicyV1,
  audience: string,
): DisclosureCapabilitiesV1 => {
  const policy = audienceDisclosurePolicyV1Schema.parse(inputPolicy) as AudienceDisclosurePolicyV1
  if (!['respondent', 'subject', 'teacher', 'researcher'].includes(audience)) return none()
  return policy.audiences[audience as ScaleDisclosureAudience] ?? none()
}

export const denyAllDisclosureCapabilities = none
