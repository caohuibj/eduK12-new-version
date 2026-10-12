import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'

export const PRIVACY_SCHEMA_VERSION = 1 as const
export const products = ['HUISCHOOL', 'HUITEACHER'] as const
export const scenarios = [
  'TEACHER_STUDENT_EVALUATION',
  'TEACHER_ADULT_FORM_GROUP',
  'SCHOOL_GENERAL_EDUCATION_GROUP',
  'SCHOOL_SENSITIVE_WELLBEING_GROUP',
] as const
export type EducationProduct = (typeof products)[number]
export type PrivacyScenario = (typeof scenarios)[number]
export type PrivacyPreset = 'STANDARD' | 'ENHANCED' | 'CUSTOM'
export type PreferenceScope = 'MY' | 'SCHOOL_DEFAULT' | 'SCHOOL_MINIMUM'
export const privacyProductSchema = z.enum(products)
export const privacyScenarioSchema = z.enum(scenarios)

export const privacyOptionsSchema = z.object({
  minRespondentsProfile: z.enum(['BASELINE', 'N10']),
  requireAllCompleted: z.boolean(),
  withholdSmallCells: z.boolean(),
  protectSmallNonrespondentComplement: z.boolean(),
  crossReleaseOverlapGuard: z.boolean(),
  restrictedStatisticsProjection: z.boolean(),
  restrictItemDistributions: z.boolean(),
  releaseDelayHours: z.union([z.literal(0), z.literal(24)]),
}).strict()
export type PrivacyOptions = z.infer<typeof privacyOptionsSchema>

export const schoolMinimumSchema = z.object({
  minRespondentsProfile: z.literal('N10').optional(),
  requireAllCompleted: z.literal(true).optional(),
  withholdSmallCells: z.literal(true).optional(),
  protectSmallNonrespondentComplement: z.literal(true).optional(),
  crossReleaseOverlapGuard: z.literal(true).optional(),
  restrictedStatisticsProjection: z.literal(true).optional(),
  restrictItemDistributions: z.literal(true).optional(),
  releaseDelayHours: z.literal(24).optional(),
}).strict()
export type SchoolMinimum = z.infer<typeof schoolMinimumSchema>

export const savePreferenceSchema = z.object({
  scope: z.enum(['MY', 'SCHOOL_DEFAULT', 'SCHOOL_MINIMUM']),
  expectedRevision: z.number().int().min(0),
  preset: z.enum(['STANDARD', 'ENHANCED', 'CUSTOM']).optional(),
  options: z.unknown().optional(),
  requestKey: z.string().uuid(),
}).strict()
export type SavePreferenceRequest = z.infer<typeof savePreferenceSchema>

export function requireScenarioProduct(product: EducationProduct, scenario: PrivacyScenario): void {
  if ((product === 'HUITEACHER') !== scenario.startsWith('TEACHER_')) {
    throw new Error('PRIVACY_SCENARIO_PRODUCT_MISMATCH')
  }
}

export function policyFingerprint(payload: unknown): string {
  return canonicalHash({type:'EDUK12_REPORT_PRIVACY_V1', payload})
}
