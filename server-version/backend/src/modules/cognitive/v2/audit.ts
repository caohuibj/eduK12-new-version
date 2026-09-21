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
  /** Compatibility-only counts retained for historical audit consumers. */
  publishedCount: number
  draftCount: number
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
  if (registryEntries.length !== 28) {
    issues.push({ path: 'registry', message: `expected 28 exact RegistryEntry identities (found ${registryEntries.length})`, severity: 'error' })
  }
  for (const registryEntry of registryEntries) {
    const key = registryKey(registryEntry)
    if (!definitionKeys.has(key)) issues.push({ path: `registry.${key}`, message: 'exact RegistryEntry is missing from the v2 audit', severity: 'error' })
  }
  const publishedCount = entries.filter((entry) => entry.status === 'PUBLISHED').length
  const draftCount = entries.filter((entry) => entry.status === 'DRAFT').length
  const retiredCount = entries.filter((entry) => entry.status === 'RETIRED').length
  const hasErrors = [...issues, ...entries.flatMap((entry) => entry.issues)].some((entry) => entry.severity === 'error')
  return {
    status: hasErrors ? 'FAIL' : 'PASS',
    generatedAt: new Date().toISOString(),
    registryCount: entries.length,
    publishedCount,
    draftCount,
    retiredCount,
    entries,
    issues,
  }
}
