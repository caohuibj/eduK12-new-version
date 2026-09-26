import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { integrationDatabaseUrl } from './integration-env'
import { buildReportingFixture } from './reporting-fixture'
import { freezeRunTrackCohort, readReportingCohort } from '../../modules/reporting/cohort'
import { normalizeCohortSelector } from '../../modules/reporting/cohort-selector'
import { resolveAuthoritativeRunResults } from '../../modules/reporting/resultSource'
import { buildReportingArtifact } from '../../modules/reporting/engine'
import type { ReportingCohortSelectorInputV2, ReportingAnalysisSpecRecord, ReportingGroupSpecV1 } from '../../modules/reporting/types'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
if (!url) throw new Error('Reporting V2 cohort acceptance requires an isolated PostgreSQL database')
const selector = (membershipIds: string[]): ReportingCohortSelectorInputV2 => ({ schemaVersion: 2, combine: 'ALL', clauses: [{ kind: 'MEMBERSHIP_IDS', membershipIds }] })
afterAll(() => prisma.$disconnect())

describe('historical filtered cohorts (real PostgreSQL)', () => {
  it('preserves V1, canonicalizes V2, isolates exact results, and suppresses a small subgroup', async () => {
    const f = await buildReportingFixture(prisma, 12)
    const base = { ...f, generatedByUserId: f.ownerId }
    const old = await freezeRunTrackCohort(base)
    const ids = f.members.slice(0, 2).map(m => m.membershipId)
    const cohort = await freezeRunTrackCohort({ ...base, cohortSelector: selector(ids) })
    expect(cohort.eligibleN).toBe(2)
    const retry = await freezeRunTrackCohort({ ...base, cohortSelector: selector([...ids].reverse().concat(ids[0])) })
    expect(retry.id).toBe(cohort.id)
    expect((await readReportingCohort(old.id)).snapshotHash).toBe(old.snapshotHash)
    const batch = await resolveAuthoritativeRunResults(cohort)
    expect(batch.resolved.map(m => m.executionId).sort()).toEqual(f.members.slice(0, 2).map(m => m.executionId).sort())
    const definition = { schemaVersion: 1, analysisKind: 'GROUP', engineKey: 'ORG_GROUP_V1', engineVersion: '1.0.0', privacyUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT', minimumCohortN: 3, minimumContributorN: 3, reportEvidenceCeiling: 'PILOT', metricRules: [{ metricId: 'score', sourceMetricKey: 'score', acceptedResultQuality: ['interpretable'], acceptedMetricQuality: 'IGNORE_METRIC_QUALITY', aggregations: ['MEAN'], missingnessRule: 'EXCLUDE', minimumMetricN: 3, observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT' }] } as const
    const spec = { id: randomUUID(), status: 'PUBLISHED', specKey: 'test', version: 1, definition, specHash: 'a'.repeat(64) } as unknown as ReportingAnalysisSpecRecord<ReportingGroupSpecV1>
    const result = buildReportingArtifact({ artifactId: randomUUID(), generatedByUserId: f.ownerId, generatedAt: new Date().toISOString(), spec, cohort, batch, options: {} })
    expect(result.payload.projection.state).toBe('suppressed')
    await expect(prisma.$executeRaw`UPDATE reporting_cohort_snapshots SET eligible_n=3 WHERE id=${cohort.id}`).rejects.toThrow()
    await expect(prisma.$executeRaw`DELETE FROM reporting_cohort_snapshots WHERE id=${cohort.id}`).rejects.toThrow()
    await expect(freezeRunTrackCohort({ ...base, cohortSelector: selector([randomUUID()]) })).rejects.toMatchObject({ statusCode: 404 })
    const tampered = { ...cohort, members: [{ ...cohort.members[0], executionId: randomUUID() }] }
    await expect(resolveAuthoritativeRunResults(tampered)).rejects.toMatchObject({ code: 'REPORT_RESULT_INTEGRITY' })
  })

  it('uses half-open historical label intervals, ANY/ALL and intersections', async () => {
    const f = await buildReportingFixture(prisma, 4)
    const dimension = randomUUID(), male = randomUUID(), intervention = randomUUID()
    await prisma.$executeRaw`INSERT INTO organization_classification_dimensions (id,organization_id,key,name,cardinality) VALUES (${dimension},${f.organizationId},'group','Group','MULTI')`
    for (const id of [male, intervention]) await prisma.$executeRaw`INSERT INTO organization_labels (id,organization_id,dimension_id,name) VALUES (${id},${f.organizationId},${dimension},${id})`
    for (const [index, labelId] of [male, male, intervention].entries()) {
      const member = f.members[index === 2 ? 0 : index]
      await prisma.$executeRaw`INSERT INTO organization_label_assignments (id,organization_id,membership_id,dimension_id,dimension_cardinality,label_id,valid_from,valid_until)
        VALUES (${randomUUID()},${f.organizationId},${member.membershipId},${dimension},'MULTI',${labelId},'2026-09-01'::timestamptz,'2026-09-20'::timestamptz)`
    }
    const base = { ...f, generatedByUserId: f.ownerId }
    const filter: ReportingCohortSelectorInputV2 = { schemaVersion: 2, combine: 'ALL', clauses: [{ kind: 'LABELS', labelIds: [male, intervention], match: 'ALL' }] }
    const all = await freezeRunTrackCohort({ ...base, cohortSelector: filter })
    expect(all.members.map(m => m.userId)).toEqual([f.members[0].userId])
    const any = await freezeRunTrackCohort({ ...base, cohortSelector: { ...filter, clauses: [{ kind: 'LABELS', labelIds: [male, intervention], match: 'ANY' }] } })
    expect(any.eligibleN).toBe(2)
    const intersect = await freezeRunTrackCohort({ ...base, cohortSelector: { ...filter, clauses: [...filter.clauses, ...selector([f.members[0].membershipId]).clauses] } })
    expect(intersect.eligibleN).toBe(1)
    await prisma.$executeRaw`UPDATE organization_label_assignments SET valid_until='2026-09-19'::timestamptz WHERE organization_id=${f.organizationId} AND label_id=${intervention}`
    await expect(freezeRunTrackCohort({ ...base, cohortSelector: filter })).rejects.toMatchObject({ code: 'REPORT_COHORT_EMPTY' })
    expect((await readReportingCohort(all.id)).members).toEqual(all.members)
    expect(() => normalizeCohortSelector({ ...filter, outcome: { score: 60 } })).toThrow()
    const tooMany = Array.from({ length: 2501 }, () => randomUUID())
    expect(() => normalizeCohortSelector({
      schemaVersion: 2,
      combine: 'ALL',
      clauses: [
        { kind: 'MEMBERSHIP_IDS', membershipIds: tooMany },
        { kind: 'CLASS_UNITS', classUnitIds: Array.from({ length: 2500 }, () => randomUUID()) },
      ],
    })).toThrow()
  })

  it('keeps the historical class after a transfer and combines class with labels', async () => {
    const f = await buildReportingFixture(prisma, 3)
    const grade = randomUUID(), class1 = randomUUID(), class2 = randomUUID(), dimension = randomUUID(), label = randomUUID()
    await prisma.$executeRaw`INSERT INTO organization_units (id, organization_id, unit_kind, name) VALUES (${grade},${f.organizationId},'GRADE','Grade')`
    for (const id of [class1, class2]) await prisma.$executeRaw`INSERT INTO organization_units (id,organization_id,unit_kind,name,parent_unit_id) VALUES (${id},${f.organizationId},'CLASS',${id},${grade})`
    const member = f.members[0]
    await prisma.$executeRaw`INSERT INTO organization_persona_grants (id,organization_id,membership_id,persona,granted_by_user_id) VALUES (${randomUUID()},${f.organizationId},${member.membershipId},'STUDENT',${f.ownerId})`
    await prisma.$executeRaw`INSERT INTO organization_student_class_assignments (id,organization_id,membership_id,class_unit_id,valid_from,valid_until) VALUES (${randomUUID()},${f.organizationId},${member.membershipId},${class1},'2026-09-01'::timestamptz,'2026-09-20'::timestamptz)`
    await prisma.$executeRaw`INSERT INTO organization_student_class_assignments (id,organization_id,membership_id,class_unit_id,valid_from) VALUES (${randomUUID()},${f.organizationId},${member.membershipId},${class2},'2026-09-20'::timestamptz)`
    await prisma.$executeRaw`INSERT INTO organization_classification_dimensions (id,organization_id,key,name,cardinality) VALUES (${dimension},${f.organizationId},'sex','Sex','SINGLE')`
    await prisma.$executeRaw`INSERT INTO organization_labels (id,organization_id,dimension_id,name) VALUES (${label},${f.organizationId},${dimension},'Male')`
    await prisma.$executeRaw`INSERT INTO organization_label_assignments (id,organization_id,membership_id,dimension_id,dimension_cardinality,label_id,valid_from) VALUES (${randomUUID()},${f.organizationId},${member.membershipId},${dimension},'SINGLE',${label},'2026-09-01'::timestamptz)`
    const cohortSelector: ReportingCohortSelectorInputV2 = { schemaVersion: 2, combine: 'ALL', clauses: [{ kind: 'CLASS_UNITS', classUnitIds: [class1] }, { kind: 'LABELS', labelIds: [label], match: 'ALL' }] }
    const cohort = await freezeRunTrackCohort({ ...f, generatedByUserId: f.ownerId, cohortSelector })
    expect(cohort.members.map(m => m.userId)).toEqual([member.userId])
    await expect(freezeRunTrackCohort({ ...f, generatedByUserId: f.ownerId, cohortSelector: { ...cohortSelector, clauses: [{ kind: 'CLASS_UNITS', classUnitIds: [class2] }] } })).rejects.toMatchObject({ code: 'REPORT_COHORT_EMPTY' })
  })

  it('keeps selection query count constant as population grows', async () => {
    let count = 0
    prisma.$use(async (params, next) => { count++; return next(params) })
    const counts: number[] = []
    for (const n of [100, 1000, 5000]) {
      const f = await buildReportingFixture(prisma, n)
      count = 0
      await freezeRunTrackCohort({ ...f, generatedByUserId: f.ownerId, cohortSelector: selector(f.members.slice(0, 5).map(m => m.membershipId)) })
      counts.push(count)
    }
    expect(new Set(counts).size).toBe(1)
    expect(counts[0]).toBeLessThanOrEqual(6)
  }, 180000)
})
