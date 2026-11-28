import {lstatSync, readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'
import {canonicalHash} from '../../assessment-runtime/canonical'
import {gitReleaseManifestFields, gitReleaseSelectionFields} from '../../measurement-content/git-release-manifest'
import {assetReference} from '../../measurement-content/release'
import {reportTemplateSchema} from '../../measurement-content/report-template'
import {composeTriplet, registeredParts, sourceParts, type Axis, type Part, type Triplet} from '../../survey/standard-triplet.model'
import {toolReference} from '../../survey/tool-reference'
import {parameterPayloadSchema} from '../component-import/contract'
import {listScaleInstrumentSources} from '../onboarding/instrument-registry'
import {scaleReportVisibilitySchema} from '../policy/schema'
import {scaleReportDefinitionSchema, type ScaleDefinitionV2} from '../scale-definition'
import {activeScaleDeclarations} from './replacement'

const toolKeySchema = z.string().max(120).regex(/^[a-z][a-z0-9_]*$/)
const contentVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/)
const versionSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
const assetVersionSchema = versionSchema.refine(value => value !== 'default', 'default is reserved for the original source')
const parameterSchema = z.object({
  toolKey: toolKeySchema, contentVersion: contentVersionSchema, scoringVersion: z.string().min(1).max(120),
  version: assetVersionSchema, ...parameterPayloadSchema.shape,
}).strict()
const reportSchema = z.object({
  toolKey: toolKeySchema, contentVersion: contentVersionSchema, parameterVersion: versionSchema, version: assetVersionSchema,
  title: z.string().trim().min(1).max(120).optional(), report: scaleReportDefinitionSchema,
  reportVisibility: scaleReportVisibilitySchema, template: reportTemplateSchema.optional(),
  assetRefs: z.array(assetReference).max(100).optional(),
}).strict()
const releaseSchema = z.object({
  ...gitReleaseSelectionFields,
  releaseKey: assetVersionSchema, contentVersion: contentVersionSchema, parameterVersion: versionSchema, reportVersion: versionSchema,
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  replaces: z.union([versionSchema, z.string().regex(/^\d+\.\d+\.\d+\/default$/)]).optional(),
  reviewNote: z.string().trim().min(1).max(2000).optional(),
}).strict()
const manifestSchema = z.object({
  ...gitReleaseManifestFields,
  // Accept Scale controls from before the shared envelope.
  schemaVersion: gitReleaseManifestFields.schemaVersion.optional(),
  toolKey: toolKeySchema,
  readiness: z.enum(['READY', 'NEEDS_TRANSLATION', 'NEEDS_LICENSE']).optional(),
  releases: z.array(releaseSchema),
}).strict()

export type DeclaredScaleRelease = z.infer<typeof releaseSchema> & {toolKey: string; triplet: Triplet}
type DeclaredTool = {releases: DeclaredScaleRelease[]; candidates: Triplet[]}
type SourceParts = Record<Axis, Part>

function stat(path: string) {
  try {
    return lstatSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function readJson<T>(path: string, schema: z.ZodType<T>): T {
  try {
    if (!stat(path)?.isFile()) throw new Error('Expected a regular JSON file')
    return schema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function readVersions<T extends {version: string; toolKey: string}>(root: string, toolKey: string, schema: z.ZodType<T>) {
  const location = stat(root)
  if (!location) return []
  if (!location.isDirectory()) throw new Error(`${root}: expected a directory`)
  return readdirSync(root).sort().map(name => {
    const value = readJson(join(root, name), schema)
    if (name !== value.version + '.json' || value.toolKey !== toolKey) {
      throw new Error(`${join(root, name)}: filename or toolKey does not match the declared identity`)
    }
    return value
  })
}

function resolveTool(root: string, toolKey: string): DeclaredTool {
  const directory = join(root, toolKey)
  const location = stat(directory)
  if (location && !location.isDirectory()) throw new Error(`${directory}: expected a tool directory`)
  const manifestPath = join(directory, 'releases.json')
  const parameters = readVersions(join(directory, 'parameters'), toolKey, parameterSchema)
  const reports = readVersions(join(directory, 'reports'), toolKey, reportSchema)
  const manifest = stat(manifestPath) ? readJson(manifestPath, manifestSchema) : undefined
  if (manifest && manifest.toolKey !== toolKey) throw new Error(`${manifestPath}: toolKey does not match the directory`)
  if (!parameters.length && !reports.length && !manifest?.releases.length) return {releases: [], candidates: []}

  const sourceByVersion = new Map<string, SourceParts>()
  const source = (version: string) => {
    const cached = sourceByVersion.get(version)
    if (cached) return cached
    const parts = sourceParts(toolKey, version)
    if (parts.length !== 3) throw new Error(`${toolKey}: C ${version} is not a registered executable source`)
    const value = Object.fromEntries(parts.map(part => [part.axis, part])) as SourceParts
    sourceByVersion.set(version, value)
    return value
  }
  const partsByVersion = new Map<string, Part>(), partsByHash = new Map<string, Part>()
  for (const part of registeredParts(toolKey)) {
    if (part.axis === 'CONTENT' || part.payload === null) continue
    partsByVersion.set(`${part.axis}:${part.version}`, part)
    partsByHash.set(`${part.axis}:${part.hash}`, part)
  }
  const makePart = (axis: 'PARAMETERS' | 'REPORT', version: string, sourceVersion: string, payload: unknown, metadata: object): Part => {
    const hash = canonicalHash(payload)
    const versionKey = `${axis}:${version}`, hashKey = `${axis}:${hash}`
    const existingVersion = partsByVersion.get(versionKey)
    const existingContent = partsByHash.get(hashKey)
    if (existingVersion && existingVersion.hash !== hash) {
      throw new Error(`${toolKey}: ${axis} ${version} already names different content`)
    }
    if (existingContent && existingContent.version !== version) {
      throw new Error(`${toolKey}: ${axis} ${version} has identical content to ${existingContent.version}; select the existing version`)
    }
    const part = {axis, version, sourceVersion, payload, hash, reference: toolReference('SCALE', toolKey, {gitAsset: true, ...metadata})}
    partsByVersion.set(versionKey, part)
    partsByHash.set(hashKey, part)
    return part
  }
  const parameterParts = new Map(parameters.map(({version, contentVersion, scoringVersion, referencePolicy, references}) => {
    const original = source(contentVersion).CONTENT.payload as Pick<ScaleDefinitionV2, 'scoring'>
    if (original.scoring.scoringVersion !== scoringVersion) {
      throw new Error(`${toolKey}: P ${version} is bound to the wrong scoring version for C ${contentVersion}`)
    }
    const payload = parameterPayloadSchema.parse({referencePolicy, references})
    if (new Set(references.map(reference => reference.referenceVersion)).size !== references.length) {
      throw new Error(`${toolKey}: P ${version} repeats a reference version`)
    }
    return [version, makePart('PARAMETERS', version, contentVersion, payload, {scoringVersion, path: `${toolKey}/parameters/${version}.json`})]
  }))
  const parameterFor = (contentVersion: string, parameterVersion: string): Part => {
    if (parameterVersion === 'default') return source(contentVersion).PARAMETERS
    const parameter = parameterParts.get(parameterVersion)
    if (!parameter || parameter.sourceVersion !== contentVersion) {
      throw new Error(`${toolKey}: P ${parameterVersion} is missing or does not belong to C ${contentVersion}`)
    }
    return parameter
  }
  const compose = (CONTENT: Part, PARAMETERS: Part, REPORT: Part) => {
    const triplet = composeTriplet(toolKey, {CONTENT, PARAMETERS, REPORT})
    if (triplet.blockers.length) {
      throw new Error(`${toolKey} ${CONTENT.version} / ${PARAMETERS.version} / ${REPORT.version}: ${triplet.blockers.join('；')}`)
    }
    return triplet
  }
  const candidates = new Map<string, Triplet>()
  const reportCandidates = new Map(reports.map(({version, contentVersion, parameterVersion, title, report, reportVisibility, template, assetRefs}) => {
    if (report.reportVersion !== version) throw new Error(`${toolKey}: R ${version} does not match report.reportVersion`)
    const linkedParameters = parameterFor(contentVersion, parameterVersion)
    const reportPart = makePart('REPORT', version, contentVersion, {
      definition: report, reportVisibility, parameterVersion: linkedParameters.version,
      ...(title ? {title} : {}), ...(template ? {template} : {}), ...(assetRefs ? {assetRefs} : {}),
    }, {path: `${toolKey}/reports/${version}.json`})
    const triplet = compose(source(contentVersion).CONTENT, linkedParameters, reportPart)
    candidates.set(triplet.combinationHash, triplet)
    return [version, {contentVersion, parameterVersion, triplet}]
  }))
  for (const [version, parameter] of parameterParts) {
    if (reports.some(report => report.parameterVersion === version)) continue
    const noReport: Part = {
      axis: 'REPORT', version: 'none-v1', sourceVersion: parameter.sourceVersion, payload: null, hash: canonicalHash(null),
      reference: toolReference('SCALE', toolKey, {explicitlyUnconfigured: true, axis: 'REPORT'}),
    }
    const triplet = compose(source(parameter.sourceVersion).CONTENT, parameter, noReport)
    candidates.set(triplet.combinationHash, triplet)
  }

  const releases: DeclaredScaleRelease[] = []
  const releaseKeys = new Set<string>()
  const combinationHashes = new Set<string>()
  for (const release of manifest?.releases ?? []) {
    const {releaseKey, contentVersion, parameterVersion, reportVersion, replaces} = release
    if (source(contentVersion).CONTENT.hash !== release.contentHash) {
      throw new Error(`${manifestPath}: C ${contentVersion} does not match the approved contentHash`)
    }
    if (replaces === releaseKey || releaseKeys.has(releaseKey)) throw new Error(`${manifestPath}: conflicting release key ${releaseKey}`)
    if (replaces?.endsWith('/default')) source(replaces.split('/')[0])
    const report = reportCandidates.get(reportVersion)
    const triplet = reportVersion === 'default'
      ? compose(source(contentVersion).CONTENT, parameterFor(contentVersion, parameterVersion), source(contentVersion).REPORT)
      : report?.contentVersion === contentVersion && report.parameterVersion === parameterVersion ? report.triplet : undefined
    if (!triplet) throw new Error(`${manifestPath}: R ${reportVersion} is missing or bound to another C/P`)
    if (combinationHashes.has(triplet.combinationHash)) throw new Error(`${manifestPath}: duplicate combination ${triplet.combinationHash}`)
    releaseKeys.add(releaseKey)
    combinationHashes.add(triplet.combinationHash)
    candidates.set(triplet.combinationHash, triplet)
    releases.push({...release, toolKey, triplet})
  }
  try {
    activeScaleDeclarations(releases)
  } catch (error) {
    throw new Error(`${manifestPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return {releases, candidates: [...candidates.values()]}
}

/** Read only files selected from the checked-out or deployment-mounted Git tree. */
export function loadDeclaredScaleAssets(root: string, toolKeys?: readonly string[]): DeclaredTool {
  if (!stat(root)?.isDirectory()) throw new Error(`${root}: expected the Scale instruments directory`)
  const keys = toolKeys ?? readdirSync(root, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && toolKeySchema.safeParse(entry.name).success)
    .map(entry => entry.name)
  const knownKeys = toolKeys ? new Set(listScaleInstrumentSources().map(source => source.identity.instrumentKey)) : undefined
  const tools = [...new Set(keys)].sort().map(key => {
    toolKeySchema.parse(key)
    if (knownKeys && !knownKeys.has(key)) throw new Error(`${key}: unknown Scale tool`)
    return resolveTool(root, key)
  })
  return {releases: tools.flatMap(tool => tool.releases), candidates: tools.flatMap(tool => tool.candidates)}
}

export function loadDeclaredScaleReleases(root: string, toolKeys?: readonly string[]): DeclaredScaleRelease[] {
  return loadDeclaredScaleAssets(root, toolKeys).releases
}
