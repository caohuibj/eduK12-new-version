import {assertEducationAssessmentExecutionSource} from './educationAssessmentExecution'
import {readPrivateFormExecutionSource} from './educationPrivateFormExecution'
import {readEducationScaleExecutionSource} from './educationScaleExecutionSource'
import { relationalEntryToRunPolicy, productionRunResourceAuthorityRegistry, type RunResourceAuthorityRegistry, type RunResourceFamily, type RunResourcePolicy } from './resourceAuthority'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'

export type RunScientificMaturity = 'PILOT' | 'RESEARCH_READY' | 'RESEARCH_GRADE'

type Tx = Prisma.TransactionClient

export interface FrozenRunScientificProvenanceV1 {
  schemaVersion: 1
  resourceFamily: string
  resourceKey: string
  resourceVersion: string
  resourcePolicyHash: string
  scientificMaturity: RunScientificMaturity
}

export interface FrozenRunScientificRecord {
  scientificMaturity: RunScientificMaturity
  scientificProvenance: FrozenRunScientificProvenanceV1
  scientificProvenanceHash: string
  scientificFrozenAt: Date
}

export class RunScientificProvenanceError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) {
    super(message)
    this.name = 'RunScientificProvenanceError'
  }
}

const MATURITIES = new Set<RunScientificMaturity>(['PILOT', 'RESEARCH_READY', 'RESEARCH_GRADE'])

export const freezeRunExecutionScientificProvenanceInTransaction = async (
  tx: Tx,
  executionId: string,
  registry: RunResourceAuthorityRegistry = productionRunResourceAuthorityRegistry,
): Promise<FrozenRunScientificRecord> => {
  const rows = await tx.$queryRaw<Array<{
    organizationId:string
    school:boolean
    teacher:boolean
    resourceFamily: string
    resourceKey: string
    resourceVersion: string
    resourcePolicyHash: string | null
    frozenResourcePolicy: unknown | null
    scientificMaturity: RunScientificMaturity | null
    scientificProvenance: FrozenRunScientificProvenanceV1 | null
    scientificProvenanceHash: string | null
    scientificFrozenAt: Date | null
  }>>`
    SELECT e."organization_id" AS "organizationId",
      EXISTS(SELECT 1 FROM campus_activity_runs school WHERE school.organization_id=e.organization_id AND school.run_id=e.run_id) AS school,
      EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links teacher WHERE teacher.organization_id=e.organization_id AND teacher.run_id=e.run_id) AS teacher,
      t."resource_family" AS "resourceFamily", t."resource_key" AS "resourceKey",
      t."resource_version" AS "resourceVersion", t."resource_policy_hash" AS "resourcePolicyHash",
      t."frozen_resource_policy" AS "frozenResourcePolicy", e."scientific_maturity" AS "scientificMaturity",
      e."scientific_provenance" AS "scientificProvenance",
      e."scientific_provenance_hash" AS "scientificProvenanceHash",
      e."scientific_frozen_at" AS "scientificFrozenAt"
    FROM "assessment_run_executions" e
    JOIN "assessment_run_tracks" t
      ON t."organization_id" = e."organization_id" AND t."run_id" = e."run_id" AND t."id" = e."track_id"
    WHERE e."id" = ${executionId}
    FOR UPDATE OF e
  `
  const row = rows[0]
  if (!row) throw new RunScientificProvenanceError('RUN_EXECUTION_NOT_FOUND', 'Run execution not found', 404)
  if (row.scientificMaturity && row.scientificProvenance && row.scientificProvenanceHash && row.scientificFrozenAt) {
    return {
      scientificMaturity: row.scientificMaturity,
      scientificProvenance: row.scientificProvenance,
      scientificProvenanceHash: row.scientificProvenanceHash,
      scientificFrozenAt: row.scientificFrozenAt,
    }
  }
  if (!row.resourcePolicyHash || !row.frozenResourcePolicy || typeof row.frozenResourcePolicy !== 'object') {
    throw new RunScientificProvenanceError('RUN_RESOURCE_POLICY_NOT_FROZEN', 'Run resource policy must be frozen before START', 409)
  }
  // Private resources intentionally cannot enter the generic registry. Derive
  // their baseline only from the exact immutable version bound to this real
  // product execution, not author roles or a caller-supplied trusted flag.
  const current = row.resourceKey.startsWith('private-form:')
    ? relationalEntryToRunPolicy((await readPrivateFormExecutionSource(tx,{executionId})).resourceEntry)
    : row.resourceKey.startsWith('private-scale:') ? await (async () => {
    if(row.resourceFamily!=='SCALE'||row.school===row.teacher)
      throw new RunScientificProvenanceError('RUN_PRIVATE_SOURCE_CONTEXT_INVALID','Private Scale requires its actual education workflow')
    const source=await readEducationScaleExecutionSource(tx,{product:row.school?'SCHOOL':'TEACHER',
      organizationId:row.organizationId,resourceKey:row.resourceKey,resourceVersion:row.resourceVersion,purpose:'EXISTING_EXECUTION'})
    const policy=relationalEntryToRunPolicy(source.resourceEntry)
    if(source.sourceKind!=='AUTHOR_PRIVATE'||canonicalHash(row.frozenResourcePolicy)!==row.resourcePolicyHash
      ||canonicalHash(policy)!==row.resourcePolicyHash)
      throw new RunScientificProvenanceError('RUN_PRIVATE_SOURCE_POLICY_MISMATCH','Private Scale source differs from the published frozen policy')
    return policy
  })() : row.resourceKey.startsWith('education-assessment:') ? await (async()=>{
    const frozen=row.frozenResourcePolicy as RunResourcePolicy
    if(frozen.runtimeLaunchTarget?.kind!=='COMPOSITE')throw new RunScientificProvenanceError('RUN_RESOURCE_RUNTIME_UNAVAILABLE','Missing frozen runtime')
    const source=await assertEducationAssessmentExecutionSource(tx,{executionId,compositeId:frozen.runtimeLaunchTarget.ref,purpose:'NEW_START'})
    return relationalEntryToRunPolicy(source.entry)
  })() : await registry.resolveExact({ family: row.resourceFamily as RunResourceFamily, key: row.resourceKey, version: row.resourceVersion })
  const maturity = current.scientificMaturity
  if (typeof maturity !== 'string' || !MATURITIES.has(maturity as RunScientificMaturity)) {
    throw new RunScientificProvenanceError('RUN_SCIENCE_MATURITY_INVALID', 'frozen resource policy has no valid scientific maturity', 409)
  }
  const provenance: FrozenRunScientificProvenanceV1 = {
    schemaVersion: 1,
    resourceFamily: row.resourceFamily,
    resourceKey: row.resourceKey,
    resourceVersion: row.resourceVersion,
    resourcePolicyHash: row.resourcePolicyHash,
    scientificMaturity: maturity as RunScientificMaturity,
  }
  const hash = canonicalHash(provenance)
  const nowRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS "now"`
  const frozenAt = nowRows[0].now
  const payload = JSON.stringify(provenance)
  const updated = await tx.$queryRaw<FrozenRunScientificRecord[]>`
    UPDATE "assessment_run_executions"
    SET "scientific_maturity" = ${provenance.scientificMaturity},
        "scientific_provenance" = ${payload}::jsonb,
        "scientific_provenance_hash" = ${hash},
        "scientific_frozen_at" = ${frozenAt},
        "updated_at" = ${frozenAt}
    WHERE "id" = ${executionId} AND "scientific_provenance_hash" IS NULL
    RETURNING "scientific_maturity" AS "scientificMaturity",
      "scientific_provenance" AS "scientificProvenance",
      "scientific_provenance_hash" AS "scientificProvenanceHash",
      "scientific_frozen_at" AS "scientificFrozenAt"
  `
  if (!updated[0]) {
    throw new RunScientificProvenanceError('RUN_SCIENCE_FREEZE_CONFLICT', 'scientific provenance changed concurrently', 409)
  }
  return updated[0]
}

export const freezeRunExecutionScientificProvenance = (
  executionId: string,
  registry: RunResourceAuthorityRegistry = productionRunResourceAuthorityRegistry,
): Promise<FrozenRunScientificRecord> => prisma.$transaction((tx) => (
  freezeRunExecutionScientificProvenanceInTransaction(tx, executionId, registry)
))
