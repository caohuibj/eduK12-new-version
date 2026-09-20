import { canonicalHash } from '../../assessment-runtime/canonical'
import {
  audienceDisclosurePolicyV1Schema,
  educationalFeedbackDefinitionV1Schema,
  instrumentApplicabilityV1Schema,
  instrumentUsageRequirementsV1Schema,
} from './schema'
import type {
  AudienceDisclosurePolicyV1,
  EducationalFeedbackDefinitionV1,
  InstrumentApplicabilityV1,
  InstrumentUsageRequirementsV1,
} from './types'
import type { ScaleInstrumentSourceV1 } from '../onboarding/types'

export const SCALE_POLICY_COMPILER_VERSION = 'scale-policy-compiler-v1' as const

export interface CompiledScalePolicyV1 {
  schemaVersion: 1
  compilerVersion: typeof SCALE_POLICY_COMPILER_VERSION
  instrumentKey: string
  instrumentVersion: string
  contentLocale: string
  applicability: InstrumentApplicabilityV1
  disclosure: AudienceDisclosurePolicyV1
  usageRequirements?: InstrumentUsageRequirementsV1
  educationalFeedback?: EducationalFeedbackDefinitionV1
  referenceBindings: Array<{ referenceVersion: string; referenceHash: string }>
  runtimePolicyHash: string
}

const unsignedCompiledPolicy = (policy: Omit<CompiledScalePolicyV1, 'runtimePolicyHash'>) => ({
  schemaVersion: policy.schemaVersion,
  compilerVersion: policy.compilerVersion,
  instrumentKey: policy.instrumentKey,
  instrumentVersion: policy.instrumentVersion,
  contentLocale: policy.contentLocale,
  applicability: policy.applicability,
  disclosure: policy.disclosure,
  ...(policy.usageRequirements ? { usageRequirements: policy.usageRequirements } : {}),
  ...(policy.educationalFeedback ? { educationalFeedback: policy.educationalFeedback } : {}),
  referenceBindings: policy.referenceBindings,
})

export const compileScalePolicy = (source: ScaleInstrumentSourceV1): CompiledScalePolicyV1 => {
  if (!source.executable) throw new Error('Catalog-only ScaleInstrumentSource cannot compile a runtime policy')
  if (!source.applicability) throw new Error('Executable ScaleInstrumentSource requires applicability')
  if (!source.disclosure) throw new Error('Executable ScaleInstrumentSource requires disclosure')

  const applicability = instrumentApplicabilityV1Schema.parse(source.applicability) as InstrumentApplicabilityV1
  const disclosure = audienceDisclosurePolicyV1Schema.parse(source.disclosure) as AudienceDisclosurePolicyV1
  const usageRequirements = source.usageRequirements
    ? instrumentUsageRequirementsV1Schema.parse(source.usageRequirements) as InstrumentUsageRequirementsV1
    : undefined
  const educationalFeedback = source.educationalFeedback
    ? educationalFeedbackDefinitionV1Schema.parse(source.educationalFeedback) as EducationalFeedbackDefinitionV1
    : undefined
  const referenceBindings = source.executable.references
    .map((reference) => ({
      referenceVersion: reference.referenceVersion,
      referenceHash: canonicalHash(reference),
    }))
    .sort((left, right) => left.referenceVersion.localeCompare(right.referenceVersion) || left.referenceHash.localeCompare(right.referenceHash))

  const unsigned: Omit<CompiledScalePolicyV1, 'runtimePolicyHash'> = {
    schemaVersion: 1,
    compilerVersion: SCALE_POLICY_COMPILER_VERSION,
    instrumentKey: source.identity.instrumentKey,
    instrumentVersion: source.identity.instrumentVersion,
    contentLocale: source.executable.contentLocale,
    applicability,
    disclosure,
    ...(usageRequirements ? { usageRequirements } : {}),
    ...(educationalFeedback ? { educationalFeedback } : {}),
    referenceBindings,
  }
  return { ...unsigned, runtimePolicyHash: canonicalHash(unsignedCompiledPolicy(unsigned)) }
}

export const hashCompiledScalePolicy = (policy: CompiledScalePolicyV1): string => (
  canonicalHash(unsignedCompiledPolicy(policy))
)
