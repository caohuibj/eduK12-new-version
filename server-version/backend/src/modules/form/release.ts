import { z } from 'zod'
import { formDraftSchema, validateFormDefinition } from '../assessment-core/form/definition'
import { parseAnswerMap } from '../assessment-core/form/answers'
import registeredTags from '../scale/library/catalog-tag-labels.json'
import { normalizeFormAnswers } from '../assessment-core/form/runtime'
import { canonicalHash } from '../assessment-runtime/canonical'
import { reportTemplateSchema } from '../measurement-content/report-template'
import { compileEffectiveDisclosure } from '../scale/policy/disclosure'
import { effectiveDisclosurePolicySchema, scaleDataCeilingSchema, scaleReportVisibilitySchema } from '../scale/policy/schema'

export const formReleaseToolKey = z.string().regex(/^[a-z][a-z0-9_-]{0,100}$/)
export const formReleaseVersion = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9_-]*)*$/).max(120)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const formTitle = z.string().trim().min(1).max(200)

export const formTemplateContentSchema = z.object({
  schemaVersion: z.literal(1),
  toolKey: formReleaseToolKey,
  version: formReleaseVersion,
  title: formTitle,
  definition: formDraftSchema,
  dataCeiling: scaleDataCeilingSchema,
  statement: z.string().trim().min(1).max(2000),
  classificationTags: z.array(z.string().refine(id => Object.prototype.hasOwnProperty.call(registeredTags, id), 'Unknown Form classification tag')).max(50).default([]),
  reference: z.record(z.string(), z.unknown()).refine(value => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 65536),
}).strict()

export const formTemplateReportSchema = z.object({
  schemaVersion: z.literal(1),
  toolKey: formReleaseToolKey,
  version: formReleaseVersion,
  contentVersion: formReleaseVersion,
  contentHash: hash,
  reportVisibility: scaleReportVisibilitySchema,
  template: reportTemplateSchema.refine(template => template.blocks.every(block => block.type === 'TEXT'),
    'Form completion reports only support non-scoring text blocks'),
}).strict()

const formSample = z.object({
  synthetic: z.literal(true),
  answers: z.record(z.string(), z.unknown()).refine(answers => Object.keys(answers).length > 0, 'Provide representative Form answers'),
  expected: z.object({
    rawAnswers: z.record(z.string(), z.unknown()),
    missing: z.array(z.object({ itemKey: z.string(), reason: z.enum(['REFUSED', 'NOT_SHOWN', 'SHOWN_MISSING', 'UNABLE_TO_JUDGE']) }).strict()),
  }).strict(),
}).strict()

export const formGitContentSchema = formTemplateContentSchema.extend({ representativeCase: formSample }).strict()
export const formReleaseProvenanceSchema = z.object({
  schemaVersion: z.literal(1),
  contentVersion: formReleaseVersion,
  contentHash: hash,
  reportVersion: formReleaseVersion,
  reportHash: hash,
  dataCeiling: scaleDataCeilingSchema,
  reportVisibility: scaleReportVisibilitySchema,
  effectiveDisclosure: effectiveDisclosurePolicySchema,
}).strict()
export type FormReleaseProvenance = z.infer<typeof formReleaseProvenanceSchema>
export type FormTemplateContent = z.infer<typeof formTemplateContentSchema>
export type FormTemplateReport = z.infer<typeof formTemplateReportSchema>

export function prepareFormRelease(content: FormTemplateContent, report: FormTemplateReport, contentHash: string, reportHash: string) {
  if (report.toolKey !== content.toolKey || report.contentVersion !== content.version || report.contentHash !== contentHash)
    throw new Error('FORM_RELEASE_REPORT_CONTENT_MISMATCH')
  for (const ceiling of Object.values(content.dataCeiling.audiences)) {
    if (ceiling?.itemScores || ceiling?.resultQualityDetails)
      throw new Error('FORM_RELEASE_CEILING_REQUIRES_NON_SCORING_CAPABILITIES')
  }
  for (const visibility of Object.values(report.reportVisibility.audiences)) {
    if (visibility?.numericScores || visibility?.references || visibility?.scoreDerivedLabels || visibility?.individualInterpretations)
      throw new Error('FORM_RELEASE_VISIBILITY_REQUIRES_NON_SCORING_CAPABILITIES')
  }
  const checked = validateFormDefinition(content.definition, { forPreview: true })
  if (!checked.definition || checked.issues.length)
    throw new Error('FORM_RELEASE_DEFINITION_INVALID: ' + checked.issues.map(issue => issue.path + ' ' + issue.message).join('; '))
  const effectiveDisclosure = compileEffectiveDisclosure(content.dataCeiling, report.reportVisibility, undefined)
  const provenance: FormReleaseProvenance = {
    schemaVersion: 1, contentVersion: content.version, contentHash, reportVersion: report.version, reportHash,
    dataCeiling: content.dataCeiling, reportVisibility: report.reportVisibility, effectiveDisclosure,
  }
  return { definition: checked.definition, provenance }
}

export function verifyFormRepresentativeCase(definition: FormTemplateContent['definition'], sample: z.infer<typeof formSample>) {
  const result = normalizeFormAnswers(definition, parseAnswerMap(sample.answers, 'representativeCase.answers'))
  if (canonicalHash(result) !== canonicalHash(sample.expected)) throw new Error('FORM_RELEASE_REPRESENTATIVE_CASE_MISMATCH')
}
