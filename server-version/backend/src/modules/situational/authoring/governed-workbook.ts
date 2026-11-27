import { z } from 'zod'
import { reportTemplateSchema } from '../../measurement-content/report-template'
import { scaleDataCeilingSchema, scaleReportVisibilitySchema } from '../../scale/policy/schema'
import { prepareSjtReleaseAxes } from '../git-release'
import { sourceIdentitySchema } from '../onboarding/schema'
import { prepareSjtSurveyPublication, sjtStandardMeasurementInput } from '../standard-release.artifact'
import type { CatalogSourceSnapshot } from '../../survey/catalog.sources'
import { artifactReference } from '../../survey/governed-tool.model'
import { assertSjtReleaseReady, compileSjtTemplate } from './template'

const version = sourceIdentitySchema.shape.instrumentVersion.max(40)
const digest = z.string().regex(/^[a-f0-9]{64}$/)

export const governedSjtWorkbookSubmissionSchema = z.object({
  requestId: z.string().uuid(),
  releaseVersion: version,
  reportVersion: version,
  template: z.record(z.string(), z.unknown()),
  reportTemplate: reportTemplateSchema,
  reportVisibility: scaleReportVisibilitySchema,
  statement: z.string().trim().min(1).max(2000),
}).strict()

const sjtWorkbookBindingSchema = z.object({
  contentHash: digest, parameterHash: digest, contentVersion: version, dataCeiling: scaleDataCeilingSchema,
}).strict()

/** Survey researcher exports retain the existing supervised data capabilities.
 * Workbooks cannot add participant reports or omit this known collection scope. */
const workbookCeiling = scaleDataCeilingSchema.parse({
  schemaVersion: 1, policyVersion: 'sjt-workbook-survey-v1', unknownAudience: 'DENY',
  audiences: { researcher: { rawAnswers: true, itemScores: true, methods: true, resultQualityDetails: true } },
})

export function prepareGovernedSjtWorkbook(raw: unknown) {
  const input = governedSjtWorkbookSubmissionSchema.parse(raw)
  const compiled = compileSjtTemplate(input.template)
  assertSjtReleaseReady(compiled)
  const { instrumentKey, instrumentVersion } = compiled.template
  const { report, scoring, referencePolicy: _references, ...definition } = compiled.package.definition
  const { scoringVersion, ...scoreParameters } = scoring
  const model = scoring.model && { modelKey: scoring.model.modelKey, modelVersion: scoring.model.modelVersion }
  const release = { releaseKey: input.releaseVersion, contentVersion: instrumentVersion, parameterVersion: instrumentVersion,
    reportVersion: input.reportVersion, state: 'ONLINE' as const, allowedEntries: ['SURVEY' as const] }
  const axes = prepareSjtReleaseAxes(instrumentKey, release, {
    content: { schemaVersion: 1, identity: { instrumentKey, instrumentVersion }, definition,
      scorer: { scoringVersion, ...(model ? { model } : {}) }, dataCeiling: workbookCeiling },
    parameters: { schemaVersion: 1, contentVersion: instrumentVersion, version: instrumentVersion, scoring: scoreParameters,
      goldenCases: compiled.package.goldenCases, scientific: { schemaVersion: 1, scientificMaturity: 'PILOT', governanceRevision: 1 } },
    report: { schemaVersion: 1, contentVersion: instrumentVersion, parameterVersion: instrumentVersion, version: input.reportVersion,
      report: { ...report, reportVersion: input.reportVersion }, reportVisibility: input.reportVisibility, template: input.reportTemplate },
  })
  const { artifact, unit } = prepareSjtSurveyPublication({ ...axes, online: true }, 'ADMIN_WORKBOOK')
  artifact.unit = {
    ...unit,
    provenance: { ...unit.provenance, sjtWorkbookRelease: { contentHash: axes.axes.content,
      parameterHash: axes.axes.parameters, contentVersion: instrumentVersion, dataCeiling: workbookCeiling } },
  }
  artifact.report!.effectiveDisclosure = axes.effectiveDisclosure
  artifact.reference = artifactReference('SJT', instrumentKey, { ...artifact.reference.metadata, submissionStatement: input.statement })
  return { artifact, template: compiled.template, requestId: input.requestId,
    preview: { title: artifact.title, contentVersion: instrumentVersion, releaseVersion: input.releaseVersion,
      reportVersion: input.reportVersion, metricKeys: compiled.package.definition.scoring.publishedMetrics.map(metric => metric.key),
      effectiveDisclosure: axes.effectiveDisclosure } }
}

/** Use the same content projection as Git. Different workbooks must use a new
 * content version, but adding a separate report alone does not republish C. */
export function governedSjtWorkbookMeasurementInput(unit: CatalogSourceSnapshot) {
  const binding = sjtWorkbookBindingSchema.parse(unit.provenance.sjtWorkbookRelease)
  return sjtStandardMeasurementInput(unit, {
    localId: unit.ref.sourceId.replace(/^sjt-git:/, 'workbook-sjt:'), version: binding.contentVersion,
    contentHash: binding.contentHash, parameterHash: binding.parameterHash, dataCeiling: binding.dataCeiling,
  })
}
