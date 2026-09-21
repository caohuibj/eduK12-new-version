import type { SituationPackage } from '../situation-package'
import { instrumentSourceSchema, projectSituationPackage, publicationContentDigest, type SituationalInstrumentSourceV1 } from './schema'
import { evaluateSituationalPublicationGate } from './publication-gate'
import migrationReleases from './migration-releases.json'

export const identityKey = (key: string, version: string): string => JSON.stringify([key, version])
export function publicationReviewIssues(source: SituationalInstrumentSourceV1): string[] {
  if (source.publication.releaseStatus === 'DRAFT') return []
  const review = source.publication.review
  if (!review || review.contentDigest !== publicationContentDigest(source.content)) return ['PUBLICATION_REVIEW_MISSING_OR_STALE']
  if (review.kind === 'migration' && !migrationReleases.some(r => r.key === source.content.identity.instrumentKey && r.version === source.content.identity.instrumentVersion && r.contentDigest === review.contentDigest && r.baselineCommit === review.baselineCommit)) return ['UNRECOGNIZED_MIGRATION_RELEASE']
  // GitHub authority is verified by CI, not by trusting a self-declared reviewer field.
  return []
}
export function createSituationalInstrumentRegistry(values: readonly unknown[]) {
  const sources = values.map(v => instrumentSourceSchema.parse(v))
  const byIdentity = new Map<string, SituationPackage>()
  for (const source of sources.sort((a, b) => a.content.catalogOrder - b.content.catalogOrder || a.content.identity.instrumentKey.localeCompare(b.content.identity.instrumentKey, 'en'))) {
    const pkg = projectSituationPackage(source), key = identityKey(pkg.key, pkg.instrumentVersion)
    if (byIdentity.has(key)) throw new Error(`Duplicate situation package identity: ${key}`)
    const gate = evaluateSituationalPublicationGate(source)
    const reviewIssues = publicationReviewIssues(source)
    if (source.publication.releaseStatus === 'PUBLISHED' && (!gate.eligibleToPublish || reviewIssues.length)) throw new Error(`Invalid PUBLISHED situation package ${key}: ${JSON.stringify([...gate.errors, ...reviewIssues])}`)
    if (source.publication.releaseStatus === 'RETIRED' && reviewIssues.length) throw new Error(`Invalid retired release: ${key}`)
    byIdentity.set(key, pkg)
  }
  return { sources, packages: [...byIdentity.values()], get: (key: string, version: string) => byIdentity.get(identityKey(key, version)) }
}
export function immutableReleaseIssues(previous: readonly SituationalInstrumentSourceV1[], next: readonly SituationalInstrumentSourceV1[]): string[] {
  const issues: string[] = []
  for (const old of previous.filter(s => s.publication.releaseStatus !== 'DRAFT')) {
    const id = old.content.identity
    const current = next.find(s => s.content.identity.instrumentKey === id.instrumentKey && s.content.identity.instrumentVersion === id.instrumentVersion)
    if (!current) issues.push(`PUBLISHED_IDENTITY_REMOVED:${id.instrumentKey}@${id.instrumentVersion}`)
    else {
      if (publicationContentDigest(old.content) !== publicationContentDigest(current.content)) issues.push(`PUBLISHED_CONTENT_CHANGED:${id.instrumentKey}@${id.instrumentVersion}`)
      if (current.publication.releaseStatus === 'DRAFT') issues.push(`PUBLISHED_IDENTITY_REVERTED_TO_DRAFT:${id.instrumentKey}@${id.instrumentVersion}`)
    }
  }
  return issues
}
