import { computeProtocolSignature } from './canonical'
import {
  listCognitiveV2TaskDefinitions,
  validateRegistryReferenceEligibility,
} from './registry'
import { listCognitiveRegistryEntries } from '../cognitive.registry'
import { validateTaskDefinition, type PublicationIssue } from './publication-gate'
import type { TaskDefinition } from './types'

export interface CognitiveAuditEntry {
  key: string
  /** Deprecated compatibility projection; never use as product availability truth. */
  compatibilityStatus: TaskDefinition['publication']['status']
  /** @deprecated Use compatibilityStatus. */
  status: TaskDefinition['publication']['status']
  protocolSignature: string
  scorerCovered: boolean
  referenceMappingCount: number
  reportMetricCount: number
  issues: PublicationIssue[]
}

export interface CognitiveAuditReport {
  status: 'PASS' | 'FAIL'
  generatedAt: string
  registryCount: number
  /** Compatibility-only counts; these are not DB product lifecycle counts. */
  compatibilityPublishedCount: number
  compatibilityDraftCount: number
  compatibilityRetiredCount: number
  /** @deprecated Compatibility aliases retained for historical audit consumers. */
  publishedCount: number
  /** @deprecated Compatibility aliases retained for historical audit consumers. */
  draftCount: number
  /** @deprecated Compatibility aliases retained for historical audit consumers. */
  retiredCount: number
  entries: CognitiveAuditEntry[]
  issues: PublicationIssue[]
}

const taskKey = (definition: TaskDefinition): string => `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`
const registryKey = (entry: { testType: string; engineVersion: string; scoringVersion: string }): string =>
  `${entry.testType}/${entry.engineVersion}/${entry.scoringVersion}`

/** Audit executable contracts. Lifecycle fields in this report are compatibility diagnostics only. */
export const auditCognitiveV2Registry = (
  definitions = listCognitiveV2TaskDefinitions(),
): CognitiveAuditReport => {
  const issues: PublicationIssue[] = []
  const seen = new Set<string>()
  const registryEntries = listCognitiveRegistryEntries()
  const entries = definitions.map((definition) => {
    const key = taskKey(definition)
    const entryIssues = validateTaskDefinition(definition)
    const registryEntry = registryEntries.find((candidate) => registryKey(candidate) === key)
    if (!registryEntry) {
      entryIssues.push({ path: `registry.${key}`, message: 'task definition is not backed by an exact RegistryEntry', severity: 'error' })
    } else {
      entryIssues.push(...validateRegistryReferenceEligibility(registryEntry).map((candidate) => ({
        path: `registry.${key}.${candidate.path}`,
        message: candidate.message,
        severity: 'error' as const,
      })))
    }
    if (seen.has(key)) issues.push({ path: `registry.${key}`, message: 'duplicate task definition key', severity: 'error' })
    seen.add(key)
    const signature = computeProtocolSignature(definition.protocol)
    const attachedSignature = (definition as TaskDefinition & { protocolSignature?: string }).protocolSignature
    if (attachedSignature && attachedSignature !== signature) {
      entryIssues.push({ path: 'protocolSignature', message: 'protocol signature does not match protocol', severity: 'error' })
    }
    if (typeof definition.scorer !== 'function') entryIssues.push({ path: 'scorer', message: 'authoritative scorer is not callable', severity: 'error' })
    if (definition.publication.status === 'PUBLISHED' && definition.references.length === 0) {
      entryIssues.push({
        path: 'references',
        message: 'compatibility status is PUBLISHED but task has no metric-specific reference mapping; product release remains independent and report must remain non-normative',
        severity: 'warning',
      })
    }
    return {
      key,
      compatibilityStatus: definition.publication.status,
      status: definition.publication.status,
      protocolSignature: signature,
      scorerCovered: typeof definition.scorer === 'function',
      referenceMappingCount: definition.references.length,
      reportMetricCount: new Set([
        ...definition.report.headlineMetrics,
        ...definition.report.userMetrics,
        ...definition.report.detailMetrics,
      ]).size,
      issues: entryIssues,
    }
  })

  const definitionKeys = new Set(definitions.map(taskKey))
  if (definitions.length !== registryEntries.length) {
    issues.push({
      path: 'registry',
      message: `registry/definition cardinality mismatch: ${registryEntries.length} RegistryEntry identities vs ${definitions.length} task definitions`,
      severity: 'error',
    })
  }
  for (const registryEntry of registryEntries) {
    const key = registryKey(registryEntry)
    if (!definitionKeys.has(key)) issues.push({ path: `registry.${key}`, message: 'exact RegistryEntry is missing from the v2 audit', severity: 'error' })
  }

  const compatibilityPublishedCount = entries.filter((entry) => entry.compatibilityStatus === 'PUBLISHED').length
  const compatibilityDraftCount = entries.filter((entry) => entry.compatibilityStatus === 'DRAFT').length
  const compatibilityRetiredCount = entries.filter((entry) => entry.compatibilityStatus === 'RETIRED').length
  const hasErrors = [...issues, ...entries.flatMap((entry) => entry.issues)].some((entry) => entry.severity === 'error')
  return {
    status: hasErrors ? 'FAIL' : 'PASS',
    generatedAt: new Date().toISOString(),
    registryCount: entries.length,
    compatibilityPublishedCount,
    compatibilityDraftCount,
    compatibilityRetiredCount,
    publishedCount: compatibilityPublishedCount,
    draftCount: compatibilityDraftCount,
    retiredCount: compatibilityRetiredCount,
    entries,
    issues,
  }
}
