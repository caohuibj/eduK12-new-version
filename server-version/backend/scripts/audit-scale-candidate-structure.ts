/** Read immutable Git objects; never imports candidate code or touches a database. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { scaleInstrumentSourceV1Schema } from '../src/modules/scale/onboarding/schema'
import { validateScaleInstrumentSource } from '../src/modules/scale/onboarding/validate-instrument'
import { compileScaleRuntime } from '../src/modules/assessment-runtime/compiler'
import { hashScaleDefinition, scaleDefinitionSchema } from '../src/modules/scale/scale-definition'
import { evaluateScaleSourceScientificQualification } from '../src/modules/scale/library/scientific-qualification'
import { scaleLocalizationManualIssues } from '../src/modules/scale/policy/localization'
import type { ScaleInstrumentSourceV1 } from '../src/modules/scale/onboarding/types'

const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const gitRaw = (...args: string[]) => execFileSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
const git = (...args: string[]) => gitRaw(...args).trimEnd()
const root = 'server-version/backend/src/modules/scale/instruments/'
const manifest = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8')) as { base: string; sources: Array<{ ref: string; sha: string; ancestorOfMain: boolean }> }
const paths = (sha: string) => git('ls-tree', '-r', '--name-only', sha, '--', root).split('\n').filter(path => path.endsWith('/instrument.ts'))
const pathIdentity = (path: string) => path.slice(root.length).replace('/instrument.ts', '')
const baseline = new Set(paths(manifest.base).map(pathIdentity))
const inventory = new Map<string, { key: string; version: string; variants: Array<{ ref: string; sha: string; path: string; blob: string; sha256: string }>; source?: unknown }>()
const branchStates: unknown[] = []
const oldGateText = git('show', `${manifest.base}:server-version/backend/src/modules/scale/library/audience-report-gate.ts`)
const exports = {} as { validateAudienceReport: (definition: any) => Array<{ path: string; message: string; severity: string }> }
// Execute only the trusted main validator, with all TypeScript type imports erased.
new Function('exports', ts.transpileModule(oldGateText, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports)
for (const sourceRef of manifest.sources) {
  const instrumentPaths = paths(sourceRef.sha)
  const novel = instrumentPaths.filter(path => !baseline.has(pathIdentity(path)))
  const unsupported: string[] = []
  for (const path of novel) {
    const jsonPath = path.replace('/instrument.ts', '/source.json')
    const fileList = git('ls-tree', '--name-only', sourceRef.sha, '--', jsonPath)
    if (!fileList) { unsupported.push(path); continue }
    const raw = gitRaw('show', `${sourceRef.sha}:${jsonPath}`)
    const source = JSON.parse(raw)
    const { instrumentKey: key, instrumentVersion: version } = source.identity
    if (pathIdentity(path) !== `${key}/${version}`) throw new Error(`IDENTITY_PATH_MISMATCH:${sourceRef.sha}:${path}`)
    const id = `${key}:${version}`
    const entry = inventory.get(id) ?? { key, version, variants: [], source }
    entry.variants.push({ ref: sourceRef.ref, sha: sourceRef.sha, path: jsonPath, blob: git('rev-parse', `${sourceRef.sha}:${jsonPath}`), sha256: createHash('sha256').update(raw).digest('hex') })
    inventory.set(id, entry)
  }
  branchStates.push({ ...sourceRef, sourceVersions: instrumentPaths.length, novelVersions: novel.length, unsupported, status: sourceRef.ancestorOfMain ? 'ALREADY_ANCESTOR_OF_MAIN' : novel.length ? 'CANDIDATE_IDENTITIES' : 'NO_NEW_IDENTITY_LEGACY_BRANCH' })
}
const latest = new Map<string, string>()
const compareVersions = (left: string, right: string) => {
  const a = left.split('.').map(Number), b = right.split('.').map(Number)
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}
for (const entry of inventory.values()) if (!latest.has(entry.key) || compareVersions(entry.version, latest.get(entry.key)!) > 0) latest.set(entry.key, entry.version)
const rows = [...inventory.values()].sort((a, b) => a.key.localeCompare(b.key) || compareVersions(a.version, b.version)).map(entry => {
  const selectedLatest = entry.version === latest.get(entry.key)
  const conflict = new Set(entry.variants.map(variant => variant.blob)).size > 1
  const parsed = scaleInstrumentSourceV1Schema.safeParse(entry.source)
  const source = (parsed.success ? parsed.data : entry.source) as ScaleInstrumentSourceV1
  const result: any = { instrumentKey: entry.key, instrumentVersion: entry.version, selectedLatest, variants: entry.variants, sameIdentityConflict: conflict, itemCount: source.executable?.definition.items.length ?? null, packageReleaseStatus: source.executable?.releaseStatus ?? 'CATALOG_ONLY', database: { queried: false, registeredOnCurrentBranch: false, installed: 'NOTRUN', published: 'NOTRUN', publicLibraryVisible: 'NOTRUN', assignable: 'NOTRUN', production: 'NOT_QUERIED_NOT_MODIFIED' } }
  if (!selectedLatest) return { ...result, checkStatus: 'NOT_EXECUTED_SUPERSEDED', threeParts: { instrument: 'NOT_EXECUTED', scoringParameters: 'NOT_EXECUTED', report: 'NOT_EXECUTED' } }
  const issues = parsed.success ? validateScaleInstrumentSource(parsed.data as unknown as ScaleInstrumentSourceV1, { requireInstruction: true }).issues : parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message, severity: 'error' }))
  let runtime = source.executable ? 'NOT_EXECUTED_STRUCTURE_INVALID' : 'NOT_BUILT'
  if (parsed.success && source.executable && !issues.some(issue => issue.severity === 'error')) {
    try {
      const compiled = compileScaleRuntime({ instrumentKey: entry.key, instrumentVersion: entry.version, definition: source.executable.definition, sourceDefinitionHash: hashScaleDefinition(source.executable.definition) })
      runtime = compiled.runtimeCapabilities.supported ? 'SUPPORTED' : 'UNSUPPORTED'
    } catch (error) { runtime = 'COMPILE_ERROR'; issues.push({ path: 'runtime', message: error instanceof Error ? error.message : String(error), severity: 'error' }) }
  }
  const errors = issues.filter(issue => issue.severity === 'error')
  const reportDefinition = source.executable ? scaleDefinitionSchema.safeParse(source.executable.definition) : null
  const originalAudienceIssues = reportDefinition?.success ? exports.validateAudienceReport(reportDefinition.data) : []
  const audienceMissing = Boolean(source.executable && !source.executable.definition.report.audienceContract)
  const candidatePluginNotLoaded = source.executable?.definition.scoring.scorerKey === 'spane12.balance.v1'
  const part = (pattern: RegExp) => !source.executable ? 'NOT_BUILT' : !parsed.success ? 'NOT_EXECUTED_SOURCE_SCHEMA_ERROR' : errors.some(issue => pattern.test(issue.path)) ? 'INCOMPLETE' : 'STRUCTURE_VALID'
  return { ...result, checkStatus: conflict ? 'CONFLICT_REQUIRES_RECONCILIATION' : parsed.success ? 'EXECUTED_CURRENT_STRUCTURE_VALIDATOR' : 'SCHEMA_ERROR', threeParts: { instrument: part(/^(instruction|catalog|localization|applicability|disclosure)|definition\.(items|responseSets|respondentType|versionAxes|display)/), scoringParameters: candidatePluginNotLoaded ? 'NOT_EXECUTED_CANDIDATE_PLUGIN_NOT_LOADED' : part(/(scoring|references|goldenCases|runtime)/), report: audienceMissing ? 'INCOMPLETE' : part(/(^report|definition\.report)/) }, runtime, issues, audienceMissing, evaluatedVariant: entry.variants[0], pluginNote: candidatePluginNotLoaded ? 'Candidate wrapper declares spane12BalanceScorer; candidate code was not imported. Current-engine errors are retained, not a claim that the remote plugin is absent.' : null, originalMainAudienceIssues: originalAudienceIssues, manual: { localization: scaleLocalizationManualIssues(source), scientificMaturityDeclared: source.catalog.scientificMaturity, qualification: evaluateScaleSourceScientificQualification(source), rights: source.executable?.definition.license ?? 'NOT_DECLARED', reportQc: source.executable?.definition.report.audienceContract?.qcReview ?? 'NOT_RECORDED' } }
})
const report = { schemaVersion: 1, base: manifest.base, generatedAt: new Date().toISOString(), boundaries: { databaseAccess: false, candidateCodeImported: false, originalContentChanged: false, scientificOrRightsApprovalGranted: false }, branchStates, counts: { currentMainSourceVersions: baseline.size, primaryBranchVersions: rows.filter(row => row.variants.some(variant => variant.ref === 'origin/content/dot-local-scales-20261025')).length, primaryBranchTools: new Set(rows.filter(row => row.variants.some(variant => variant.ref === 'origin/content/dot-local-scales-20261025')).map(row => row.instrumentKey)).size, candidateVersionIdentities: rows.length, candidateInstrumentsLatest: latest.size, latestMissingAudienceContract: rows.filter(row => row.selectedLatest && (row as any).audienceMissing).length }, rows }
writeFileSync(resolve(process.argv[3]), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report.counts))
