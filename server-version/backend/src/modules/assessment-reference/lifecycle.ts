import { Prisma, type PrismaClient } from '@prisma/client'
import { referenceSetHash } from '../assessment-runtime/reference-binding'
import { validateReferenceSetDefinition, type AssessmentReferenceSetDefinition } from './reference'

/** Explicit publication operation. Caller must supply a previously reviewed candidate. */
export async function activateReviewedReference(db: PrismaClient, candidate: AssessmentReferenceSetDefinition) {
  const checked = validateReferenceSetDefinition(candidate)
  if (candidate.status !== 'DRAFT' || !candidate.entries.every(e => e.governance) || !checked.definition || checked.issues.some(i => i.severity === 'error')) throw new Error('REFERENCE_CANDIDATE_INVALID')
  return db.$transaction(async tx => {
    const instrumentType = candidate.instrumentType === 'scale' ? 'SCALE' as const : 'COGNITIVE' as const
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${instrumentType + ':' + candidate.instrumentKey}))`)
    const key = { instrumentType, instrumentKey: candidate.instrumentKey, referenceVersion: candidate.referenceVersion }
    const existing = await tx.assessmentReferenceSet.findUnique({ where: { instrumentType_instrumentKey_referenceVersion: key } })
    if (existing && referenceSetHash(existing.definition as unknown as AssessmentReferenceSetDefinition) !== referenceSetHash(candidate)) throw new Error('REFERENCE_VERSION_IMMUTABLE')
    if (existing?.status === 'ACTIVE') return existing
    if (existing && existing.status !== 'DRAFT') throw new Error('REFERENCE_LIFECYCLE_INVALID')
    // Only replace references for the exact same measurement/population scope.
    const scope = (d: AssessmentReferenceSetDefinition) => JSON.stringify(d.entries.map(e => [e.scoreKey,e.instrumentVersion,e.scoringVersion,e.governance?.subjectKey,e.governance?.schoolStage,e.governance?.locale,e.governance?.populationKey]).sort())
    const active = await tx.assessmentReferenceSet.findMany({ where: { instrumentType, instrumentKey: candidate.instrumentKey, status: 'ACTIVE' } })
    for (const row of active) if (scope(row.definition as unknown as AssessmentReferenceSetDefinition) === scope(candidate)) {
      const old=row.definition as unknown as AssessmentReferenceSetDefinition
      if(candidate.entries.some(e=>Date.parse(e.governance!.effectiveFrom)<=Math.max(...old.entries.filter(x=>x.scoreKey===e.scoreKey && x.governance?.populationKey===e.governance!.populationKey).map(x=>Date.parse(x.governance!.effectiveFrom)))))throw new Error('REFERENCE_EFFECTIVE_DATE_NOT_LATER')
      await tx.assessmentReferenceSet.update({ where: { id: row.id }, data: { status: 'SUPERSEDED' } })
    }
    return tx.assessmentReferenceSet.upsert({ where: { instrumentType_instrumentKey_referenceVersion: key }, create: { ...key, status: 'ACTIVE', definition: { ...candidate, status: 'ACTIVE' } as unknown as Prisma.InputJsonValue }, update: { status: 'ACTIVE' } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}
