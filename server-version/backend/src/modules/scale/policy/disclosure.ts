import { audienceDisclosurePolicyV1Schema, effectiveDisclosurePolicySchema, scaleDataCeilingSchema, scaleReportVisibilitySchema } from './schema'
import type {
  AudienceDisclosurePolicyV1,
  DisclosureCapabilitiesV1,
  ScaleDisclosureAudience,
  ScaleDataCeilingV1,
  ScaleReportVisibilityV1,
} from './types'

const capabilityKeys: Array<Exclude<keyof DisclosureCapabilitiesV1, 'artwork'>> = [
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
  if (inputs.some((input) => input.artwork !== undefined)) {
    output.artwork = inputs.every((input) => input.artwork ?? (input.educationalContent || input.individualInterpretations))
  }
  return output
}

export const resolveAudienceDisclosure = (
  inputPolicy: AudienceDisclosurePolicyV1,
  audience: string,
): DisclosureCapabilitiesV1 => {
  const policy = effectiveDisclosurePolicySchema.parse(inputPolicy) as AudienceDisclosurePolicyV1
  if (!['respondent', 'subject', 'teacher', 'researcher'].includes(audience)) return none()
  return policy.audiences[audience as ScaleDisclosureAudience] ?? none()
}

export const denyAllDisclosureCapabilities = none

const audiences = ['respondent', 'subject', 'teacher', 'researcher'] as const

/** Compile only from the selected immutable axes. Legacy R keeps its original
 * source policy byte-for-byte. A report capability never supplies data access. */
export function compileEffectiveDisclosure(
  dataCeiling: ScaleDataCeilingV1 | undefined,
  reportVisibility: ScaleReportVisibilityV1 | undefined,
  legacyDisclosure: AudienceDisclosurePolicyV1 | undefined,
): AudienceDisclosurePolicyV1 {
  const legacy = legacyDisclosure === undefined ? undefined : audienceDisclosurePolicyV1Schema.parse(legacyDisclosure)
  if (!reportVisibility && !dataCeiling && legacy) return legacy
  const ceiling = dataCeiling === undefined ? undefined : scaleDataCeilingSchema.parse(dataCeiling)
  const report = reportVisibility === undefined ? undefined : scaleReportVisibilitySchema.parse(reportVisibility)
  const effective: AudienceDisclosurePolicyV1 = {
    schemaVersion: 1,
    policyVersion: [ceiling?.policyVersion ?? legacy?.policyVersion ?? 'none', report?.policyVersion ?? 'none'].join('/'),
    audiences: {},
    unknownAudience: 'DENY',
  }
  for (const audience of audiences) {
    const data = (ceiling ?? legacy)?.audiences[audience]
    const visible = report ? report.audiences[audience] : legacy?.audiences[audience]
    effective.audiences[audience] = {
      rawAnswers: data?.rawAnswers ?? false,
      itemScores: data?.itemScores ?? false,
      methods: data?.methods ?? false,
      resultQualityDetails: data?.resultQualityDetails ?? false,
      numericScores: visible?.numericScores ?? false,
      references: visible?.references ?? false,
      scoreDerivedLabels: visible?.scoreDerivedLabels ?? false,
      individualInterpretations: visible?.individualInterpretations ?? false,
      educationalContent: visible?.educationalContent ?? false,
      artwork: report
        ? report.audiences[audience]?.artwork ?? false
        : Boolean(visible?.educationalContent || visible?.individualInterpretations),
    }
  }
  return effective
}
