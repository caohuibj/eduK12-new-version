import { validateRelationalCohortPolicy, type RelationalCohortAnalysisPolicyV1 } from './analysis'
import { hashRelationalApplicability, validateRelationalApplicability } from './contracts'
import { relationalFail } from './errors'
import type { RelationalActorRoleV1, RelationalApplicabilityV1, RelationalResourceKindV1 } from './types'

export type RelationalProductReleaseStatusV1 = 'DRAFT' | 'PUBLISHED'
export type RelationalProductScienceMaturityV1 = 'PILOT' | 'RESEARCH_READY'

export interface RelationalCompositeLaunchTargetV1 {
  runtime: 'COMPOSITE'
  compositeAssessmentId: string
}

export interface RelationalProductEntryV1 {
  title: string
  description: string | null
  releaseStatus: RelationalProductReleaseStatusV1
  scienceMaturity: RelationalProductScienceMaturityV1
  applicability: RelationalApplicabilityV1
  cohortAnalysisPolicy: RelationalCohortAnalysisPolicyV1 | null
  launchTarget: RelationalCompositeLaunchTargetV1 | null
}

const identity = (input: Pick<RelationalApplicabilityV1, 'resourceKind' | 'resourceKey' | 'resourceVersion'>): string => (
  `${input.resourceKind}:${input.resourceKey}:${input.resourceVersion}`
)

const validateEntry = (entry: RelationalProductEntryV1): RelationalProductEntryV1 => {
  const applicability = validateRelationalApplicability(entry.applicability)
  if (!entry.title.trim()) relationalFail('RELATIONAL_PRODUCT_REGISTRY', 'product title is required')
  if (entry.releaseStatus !== 'DRAFT' && entry.releaseStatus !== 'PUBLISHED') {
    relationalFail('RELATIONAL_PRODUCT_REGISTRY', 'unsupported product release status')
  }
  if (entry.scienceMaturity !== 'PILOT' && entry.scienceMaturity !== 'RESEARCH_READY') {
    relationalFail('RELATIONAL_PRODUCT_REGISTRY', 'unsupported science maturity')
  }
  if (entry.releaseStatus === 'PUBLISHED' && !entry.launchTarget) {
    relationalFail('RELATIONAL_PRODUCT_REGISTRY', 'published relational product must declare an existing-runtime launch target')
  }
  if (entry.launchTarget && !entry.launchTarget.compositeAssessmentId.trim()) {
    relationalFail('RELATIONAL_PRODUCT_REGISTRY', 'composite launch target id is required')
  }
  const cohortAnalysisPolicy = entry.cohortAnalysisPolicy
    ? validateRelationalCohortPolicy(entry.cohortAnalysisPolicy)
    : null
  if (applicability.analysisMode === 'COHORT_AGGREGATE') {
    if (entry.releaseStatus === 'PUBLISHED' && !cohortAnalysisPolicy) {
      relationalFail('RELATIONAL_PRODUCT_REGISTRY', 'published cohort product must declare an authoritative cohort analysis policy')
    }
    if (cohortAnalysisPolicy && cohortAnalysisPolicy.minimumRespondents !== applicability.minimumRespondents) {
      relationalFail('RELATIONAL_PRODUCT_REGISTRY', 'cohort analysis policy minimum must equal applicability minimumRespondents')
    }
  } else if (cohortAnalysisPolicy) {
    relationalFail('RELATIONAL_PRODUCT_REGISTRY', 'individual relational product cannot declare a cohort analysis policy')
  }
  return { ...entry, applicability, cohortAnalysisPolicy }
}

export interface RelationalProductRegistryV1 {
  listReleasedForRespondent(role: RelationalActorRoleV1): RelationalProductEntryV1[]
  findExact(input: {
    resourceKind: RelationalResourceKindV1
    resourceKey: string
    resourceVersion: string
  }): RelationalProductEntryV1 | null
  applicabilityHash(entry: RelationalProductEntryV1): string
}

export const createRelationalProductRegistry = (
  entries: RelationalProductEntryV1[],
): RelationalProductRegistryV1 => {
  const byIdentity = new Map<string, RelationalProductEntryV1>()
  for (const raw of entries) {
    const entry = validateEntry(raw)
    const key = identity(entry.applicability)
    if (byIdentity.has(key)) relationalFail('RELATIONAL_PRODUCT_REGISTRY', `duplicate relational product: ${key}`)
    byIdentity.set(key, entry)
  }

  return {
    listReleasedForRespondent(role) {
      return [...byIdentity.values()].filter((entry) => (
        entry.releaseStatus === 'PUBLISHED'
        && entry.launchTarget !== null
        && entry.applicability.respondentRoles.includes(role)
      ))
    },
    findExact(input) {
      return byIdentity.get(identity(input)) ?? null
    },
    applicabilityHash(entry) {
      return hashRelationalApplicability(entry.applicability)
    },
  }
}

// Content release is deliberately separate from platform release. Current
// observer bundles/classroom-experience fixtures are not production-released,
// so RA-02 ships an empty production registry. A content PR must register an
// entry explicitly after its own release/scientific gate.
export const relationalProductRegistry = createRelationalProductRegistry([])
