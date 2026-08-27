import { computeProtocolSignature } from './canonical'
import { listCognitiveV2TaskDefinitions } from './registry'
import { validateTaskDefinition, type PublicationIssue } from './publication-gate'
import type { TaskDefinition } from './types'

export interface CognitiveAuditEntry {
  key: string
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
  publishedCount: number
  draftCount: number
  retiredCount: number
  entries: CognitiveAuditEntry[]
  issues: PublicationIssue[]
}

const taskKey = (definition: TaskDefinition): string => (
  `${definition.testType}/${definition.engineVersion}/${definition.scoringVersion}`
)

export const auditCognitiveV2Registry = (
  definitions = listCognitiveV2TaskDefinitions(),
): CognitiveAuditReport => {
  const issues: PublicationIssue[] = []
  const seen = new Set<string>()
  const entries = definitions.map((definition) => {
    const key = taskKey(definition)
    const entryIssues = validateTaskDefinition(definition)
    if (seen.has(key)) issues.push({ path: `registry.${key}`, message: 'duplicate task definition key', severity: 'error' })
    seen.add(key)
    const signature = computeProtocolSignature(definition.protocol)
    const attachedSignature = (definition as TaskDefinition & { protocolSignature?: string }).protocolSignature
    if (attachedSignature) {
      // Task definitions do not persist a signature; this branch is reserved
      // for consumers that attach one while auditing a frozen catalog.
      if (attachedSignature !== signature) entryIssues.push({ path: 'protocolSignature', message: 'protocol signature does not match protocol', severity: 'error' })
    }
    if (typeof definition.scorer !== 'function') entryIssues.push({ path: 'scorer', message: 'authoritative scorer is not callable', severity: 'error' })
    if (definition.publication.status === 'PUBLISHED' && definition.references.length === 0) {
      entryIssues.push({ path: 'references', message: 'published task has no metric-specific reference mapping; publication remains allowed but report must remain non-normative', severity: 'warning' })
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
