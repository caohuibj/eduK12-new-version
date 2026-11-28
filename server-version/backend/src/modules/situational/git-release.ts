import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { assetReference } from '../measurement-content/release'
import { assessmentAssetIdSchema } from '../assessment-media/assessment-asset-identity'
import { reportTemplateSchema, validateReportTemplateBindings } from '../measurement-content/report-template'
import { validateReferenceSetDefinition } from '../assessment-reference/reference'
import { gitReleaseManifestFields, gitReleaseSelectionFields, resolveGitReleaseStates } from '../measurement-content/git-release-manifest'
import { compileEffectiveDisclosure } from '../scale/policy/disclosure'
import { scaleDataCeilingSchema, scaleReportVisibilitySchema } from '../scale/policy/schema'
import { situationDefinitionV2Schema } from './situation-branching'
import { situationDefinitionSchema, situationalAssetReferences } from './situation-definition'
import { evaluateSituationalPublicationGate } from './onboarding/publication-gate'
import { scientificSchema } from './onboarding/scientific-schema'
import { evaluateSituationalScientificGovernance } from './onboarding/scientific-governance'
import { instrumentContentSchema, instrumentSourceSchema, projectSituationPackage, sourceIdentitySchema } from './onboarding/schema'
import { validateSituationPackage } from './situation-package'
import { assertSurveyNativeSituationalDefinition } from '../survey/situational-native.definition'

const toolKeySchema = sourceIdentitySchema.shape.instrumentKey.max(100)
const versionSchema = sourceIdentitySchema.shape.instrumentVersion.max(40)
const releaseKeySchema = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)
const axes = { scoring: true, report: true, referencePolicy: true } as const
const runtimeScoring = situationDefinitionSchema.shape.scoring
const modelIdentity = runtimeScoring.shape.model.unwrap().pick({ modelKey: true, modelVersion: true }).strict()

export const sjtGitContentSchema = z.object({
  schemaVersion: z.literal(1),
  identity: sourceIdentitySchema,
  definition: z.union([situationDefinitionSchema.omit(axes).strict(), situationDefinitionV2Schema.omit(axes).strict()]),
  scorer: z.object({ scoringVersion: z.string().min(1).max(120), model: modelIdentity.optional() }).strict(),
  dataCeiling: scaleDataCeilingSchema,
}).strict()

const goldenCases = instrumentContentSchema.shape.goldenCases.min(1).max(512)
export const sjtGitParameterSchema = z.object({
  schemaVersion: z.literal(1),
  contentVersion: versionSchema,
  version: versionSchema,
  scoring: runtimeScoring.omit({ scoringVersion: true }).strict(),
  references: z.record(z.string(), z.unknown()).optional(),
  goldenCases,
  scientific: scientificSchema,
}).strict()

export const sjtGitReportSchema = z.object({
  schemaVersion: z.literal(1),
  contentVersion: versionSchema,
  parameterVersion: versionSchema,
  version: versionSchema,
  report: situationDefinitionSchema.shape.report.strict(),
  reportVisibility: scaleReportVisibilitySchema,
  template: reportTemplateSchema.optional(),
  assetRefs: z.array(assetReference.extend({ assetId: assessmentAssetIdSchema })).max(100).default([]),
}).strict()

export const sjtReleaseSelectionSchema = z.object({
  ...gitReleaseSelectionFields,
  releaseKey: releaseKeySchema,
  contentVersion: versionSchema,
  parameterVersion: versionSchema,
  reportVersion: versionSchema,
  replaces: releaseKeySchema.optional(),
}).strict()
export const sjtGitReleasesSchema = z.object({
  ...gitReleaseManifestFields,
  toolKey: toolKeySchema,
  releases: z.array(sjtReleaseSelectionSchema).max(200),
}).strict()

const maxJsonBytes = 8 * 1024 * 1024

function fileStat(path: string) {
  try { return lstatSync(path) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function directory(path: string) {
  if (!fileStat(path)?.isDirectory()) throw new Error('SJT_GIT_DIRECTORY_REQUIRED:' + path)
  return path
}

function json(root: string, parts: readonly string[]): unknown {
  const base = parts.slice(0, -1).reduce((path, part) => directory(join(path, part)), root)
  const path = join(base, parts[parts.length - 1])
  const stat = fileStat(path)
  if (!stat?.isFile() || stat.size > maxJsonBytes) throw new Error('SJT_GIT_JSON_FILE_REQUIRED:' + path)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function checkPackage(source: z.infer<typeof instrumentSourceSchema>, requireAllPaths: boolean) {
  const pkg = projectSituationPackage(source)
  const mechanical = validateSituationPackage(pkg)
  if (!mechanical.valid) {
    const first = mechanical.issues.find(issue => issue.severity === 'error')
    throw new Error('SJT_GIT_PACKAGE_INVALID:' + (first ? first.path + ':' + first.message : pkg.key))
  }
  const publication = evaluateSituationalPublicationGate(source)
  if (requireAllPaths && !publication.eligibleToPublish) {
    const issue = publication.errors[0]
    throw new Error('SJT_GIT_PUBLICATION_GATE:' + issue.code + ':' + issue.path)
  }
  const science = evaluateSituationalScientificGovernance(source)
  if (!science.valid) throw new Error('SJT_GIT_SCIENCE_INVALID:' + science.errors.join(','))
  return { pkg, publication, science }
}

export function prepareSjtReleaseAxes(toolKey: string, release: z.infer<typeof sjtReleaseSelectionSchema>, axesInput: {
  content: unknown; parameters: unknown; report: unknown
}) {
  const { contentVersion, parameterVersion, reportVersion } = release
  const content = sjtGitContentSchema.parse(axesInput.content)
  const parameters = sjtGitParameterSchema.parse(axesInput.parameters)
  const report = sjtGitReportSchema.parse(axesInput.report)
  if (content.identity.instrumentKey !== toolKey || content.identity.instrumentVersion !== contentVersion ||
      parameters.contentVersion !== contentVersion || parameters.version !== parameterVersion ||
      report.contentVersion !== contentVersion || report.parameterVersion !== parameterVersion || report.version !== reportVersion) {
    throw new Error('SJT_GIT_AXIS_IDENTITY_MISMATCH:' + release.releaseKey)
  }
  const scoring = { ...parameters.scoring, scoringVersion: content.scorer.scoringVersion }
  const model = scoring.model && { modelKey: scoring.model.modelKey, modelVersion: scoring.model.modelVersion }
  if (canonicalHash(model ?? null) !== canonicalHash(content.scorer.model ?? null)) throw new Error('SJT_GIT_SCORER_CHANGE_REQUIRES_CONTENT_VERSION')
  if (report.report.reportVersion !== reportVersion) throw new Error('SJT_GIT_REPORT_VERSION_MISMATCH')
  const definition = { ...content.definition, scoring, report: report.report, referencePolicy: { type: 'none' } }
  const source = instrumentSourceSchema.parse({
    content: { schemaVersion: 1, identity: content.identity, definition, goldenCases: parameters.goldenCases },
    publication: { releaseStatus: release.state === 'ONLINE' ? 'PUBLISHED' : 'DRAFT' },
    scientific: parameters.scientific,
  })
  const { pkg, science } = checkPackage(source, true)
  const metricKeys = pkg.definition.scoring.publishedMetrics.map(metric => metric.key)
  const set = parameters.references ? validateReferenceSetDefinition(parameters.references) : undefined
  if (set) {
    if (!set.definition || set.issues.some(issue => issue.severity === 'error') ||
        set.definition.instrumentType !== 'sjt' || set.definition.instrumentKey !== toolKey ||
        set.definition.referenceVersion !== parameterVersion || set.definition.status !== 'ACTIVE' ||
        set.definition.entries.some(entry => entry.instrumentVersion !== contentVersion ||
          entry.scoringVersion !== scoring.scoringVersion || !metricKeys.includes(entry.scoreKey))) {
      throw new Error('SJT_GIT_REFERENCE_BINDING_MISMATCH')
    }
  }
  const references = pkg.definition.scenes.flatMap(scene => situationalAssetReferences(scene.stimulus))
  const assets = new Map<string, { assetId: string; sha256: string; mediaType: string }>()
  for (const ref of [...references.map(x => ({ assetId: x.assetId, sha256: x.contentHash, mediaType: x.mimeType })), ...report.assetRefs]) {
    const prior = assets.get(ref.assetId)
    if (prior && canonicalHash(prior) !== canonicalHash(ref)) throw new Error('SJT_GIT_ASSET_IDENTITY_CONFLICT')
    assets.set(ref.assetId, ref)
  }
  if (report.template) validateReportTemplateBindings(report.template, metricKeys, report.assetRefs.map(ref => ref.assetId))
  const disclosure = compileEffectiveDisclosure(content.dataCeiling, report.reportVisibility, undefined)
  return {
    release,
    content,
    parameters,
    report,
    pkg,
    science,
    referenceSet: set?.definition,
    effectiveDisclosure: disclosure,
    assetRefs: [...assets.values()].sort((a, b) => a.assetId.localeCompare(b.assetId)),
    axes: { content: canonicalHash(content), parameters: canonicalHash(parameters), report: canonicalHash(report) },
  }
}

/** Resolve only explicit releases. The presence of a historical directory cannot authorize publication. */
export function readSjtGitReleasePlan(root: string, key: string) {
  const toolKey = toolKeySchema.parse(key)
  const toolRoot = directory(join(directory(root), toolKey))
  const manifestPath = join(toolRoot, 'releases.json')
  if (!fileStat(manifestPath)) return null
  const manifest = sjtGitReleasesSchema.parse(json(toolRoot, ['releases.json']))
  if (manifest.toolKey !== toolKey) throw new Error('SJT_GIT_MANIFEST_IDENTITY_MISMATCH')
  const states = resolveGitReleaseStates(manifest.releases, { errorPrefix: 'SJT_GIT' })
  const declarations = manifest.releases.map(release => prepareSjtReleaseAxes(toolKey, release, {
    content: json(toolRoot, [release.contentVersion, 'content.json']),
    parameters: json(toolRoot, ['parameters', release.parameterVersion + '.json']),
    report: json(toolRoot, ['reports', release.reportVersion + '.json']),
  }))
  const combinations = new Set(declarations.map(item => canonicalHash(item.axes)))
  if (combinations.size !== declarations.length) throw new Error('SJT_GIT_DUPLICATE_COMBINATION')
  return { toolKey, declarations: declarations.map(item => ({ ...item, effectiveState: states.get(item.release.releaseKey)! })) }
}

/** CI-compatible structural and scientific check. Actual StoredAsset existence is
 * checked in the publishing transaction, where the storage catalog is available. */
export function checkSjtGitRelease(root: string, key: string) {
  const toolKey = toolKeySchema.parse(key)
  const plan = readSjtGitReleasePlan(root, toolKey)
  if (plan) {
    for (const item of plan.declarations.filter(item => item.effectiveState === 'ONLINE')) assertSjtSurveyPublicationSupported(item)
    return {
      toolKey,
      releases: plan.declarations.map(({ release, axes, effectiveState, assetRefs }) => ({
        releaseKey: release.releaseKey, axes, state: release.state, effectiveState, assetReferences: assetRefs.length,
      })),
      historical: [],
    }
  }
  const toolRoot = directory(join(directory(root), toolKey))
  const historical = readdirSync(toolRoot).filter(name => versionSchema.safeParse(name).success).sort().map(version => {
    const source = instrumentSourceSchema.parse({
      content: json(toolRoot, [version, 'instrument.json']),
      publication: json(toolRoot, [version, 'publication.json']),
      scientific: json(toolRoot, [version, 'scientific.json']),
    })
    if (source.content.identity.instrumentKey !== toolKey || source.content.identity.instrumentVersion !== version) {
      throw new Error('SJT_GIT_LEGACY_IDENTITY_MISMATCH')
    }
    const { publication } = checkPackage(source, source.publication.releaseStatus === 'PUBLISHED')
    return { version, state: source.publication.releaseStatus, publicationReady: publication.eligibleToPublish }
  })
  if (!historical.length) throw new Error('SJT_GIT_CONTENT_NOT_FOUND:' + toolKey)
  return { toolKey, releases: [], historical }
}

export type SjtGitDeclaration = NonNullable<ReturnType<typeof readSjtGitReleasePlan>>['declarations'][number]

/** Fail closed on exposure or entry capabilities the native Survey consumer does
 * not implement. Other declared inputs can remain WITHDRAWN for authoring. */
export function assertSjtSurveyPublicationSupported(item: SjtGitDeclaration) {
  const { effectiveDisclosure, parameters, pkg, report, release } = item
  if (release.allowedEntries.length !== 1 || release.allowedEntries[0] !== 'SURVEY') {
    throw new Error('SJT_GIT_ONLY_NATIVE_SURVEY_ENTRY_SUPPORTED')
  }
  // The existing researcher export is a separate authorized surface. It can
  // expose these four data capabilities even if report rendering hides them.
  const researcher = effectiveDisclosure.audiences.researcher
  if (!researcher?.rawAnswers || !researcher.itemScores || !researcher.resultQualityDetails || !researcher.methods ||
      Object.entries(effectiveDisclosure.audiences).some(([key, value]) => key !== 'researcher' &&
        Object.values(value).some(capability => capability === true))) {
    throw new Error('SJT_GIT_SURVEY_DISCLOSURE_NOT_SUPPORTED')
  }
  if (!report.template || report.assetRefs.length || report.template.blocks.some(block => block.type === 'ASSET')) {
    throw new Error('SJT_GIT_SURVEY_REQUIRES_A_SUPPORTED_REPORT_TEMPLATE')
  }
  if (pkg.definition.license.status === 'unknown' || pkg.definition.license.redistribution !== 'allowed') {
    throw new Error('SJT_GIT_REDISTRIBUTION_NOT_AUTHORIZED')
  }
  if (parameters.scientific.scientificMaturity !== 'PILOT' || parameters.scientific.review || !item.science.valid) {
    throw new Error('SJT_GIT_SCIENTIFIC_APPROVAL_NOT_SUPPORTED')
  }
  assertSurveyNativeSituationalDefinition(pkg.definition)
  return report.template
}
