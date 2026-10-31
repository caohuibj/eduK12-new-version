import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import * as tools from '../../modules/education-tools/private-tool.service'
import type { PrivateToolContext } from '../../modules/education-tools/private-tool.contracts'
import { addPrivateScaleRunTrack } from '../../modules/education-tools/private-tool.run-adapter'
import { addTeacherPrivateRunTrack, previewTeacherRun, publishTeacherRun } from '../../modules/huiteacher/run.service'
import { revokeUse } from '../../modules/scale-library-governance/distribution'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'), suite = url ? describe : describe.skip
let db: PrismaClient
async function fixture(product: 'SCHOOL' | 'TEACHER', mixed = false) {
  const f = await setupEducationLibraryRuntimeFixture({ db, product, trackCount: mixed ? 1 : 0, publish: false })
  if (product === 'TEACHER') {
    const member = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: f.organizationId, userId: f.managerUserId, validUntil: null } })
    await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      membershipId: member.id, persona: 'COUNSELOR', grantedByUserId: f.managerUserId } })
    await db.organizationCapabilityGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      membershipId: member.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: f.managerUserId } })
  }
  const context: PrivateToolContext = { entry: product, organizationId: f.organizationId,
    principal: { userId: f.managerUserId, accountDomain: 'SCHOOL' } }
  const draft = await tools.createPrivateTool(context, { kind: 'SCALE', title: 'Synthetic private publication' })
  const definition = compileResearchScale('Synthetic private publication', { schemaVersion: 1, presentationMode: 'ONE_BY_ONE',
    respondentType: 'participant_self_report', aggregation: 'mean', responseOptions: [{ optionKey: 'a', label: 'A', score: 1 }, { optionKey: 'b', label: 'B', score: 2 }],
    dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
    items: [{ itemKey: 'q', prompt: 'Synthetic question', required: true, reverse: false, dimensionKeys: ['total'] }] })
  const saved = await tools.updatePrivateTool(context, draft.id, { expectedRevision: draft.revision, title: draft.title, definition })
  const version = await tools.freezePrivateTool(context, draft.id, { expectedRevision: saved.revision, expectedContentHash: saved.contentHash })
  const body = { expectedVersion: f.expectedVersion, privateScale: { versionId: version.id, contentHash: version.contentHash,
    administration: { population: product === 'SCHOOL' ? 'STUDENT' : 'TEACHER', responseMode: 'SELF' } },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [f.subjectMembershipId] },
    respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [f.subjectMembershipId] } }
  const teacher = { organizationId: f.organizationId, eventId: f.workflow.id, actorUserId: f.managerUserId }
  const track = product === 'TEACHER' ? await addTeacherPrivateRunTrack(teacher, body)
    : await addPrivateScaleRunTrack({ organizationId: f.organizationId, runId: f.runId, actorUserId: f.managerUserId,
      parent: { kind: 'SCHOOL_ACTIVITY', id: f.workflow.id } }, body)
  const preview = () => product === 'TEACHER' ? previewTeacherRun({ ...teacher, expectedVersion: f.expectedVersion + 1 }) : f.preview()
  const publish = () => product === 'TEACHER' ? publishTeacherRun({ ...teacher, expectedVersion: f.expectedVersion + 1 }) : f.publish()
  return { f, track, version, preview, publish }
}
async function state(runId: string) {
  const [row] = await db.$queryRaw<Array<{ status: string; executions: bigint; relationships: bigint }>>`
    SELECT status, (SELECT count(*) FROM assessment_run_executions WHERE run_id=${runId}) AS executions,
      (SELECT count(*) FROM assessment_run_relationship_snapshots WHERE run_id=${runId}) AS relationships
    FROM assessment_runs WHERE id=${runId}`
  return row
}
async function assertPrivateExecutionPublished(f: Awaited<ReturnType<typeof fixture>>['f'], trackId: string) {
  const rows = await db.$queryRaw<Array<{ status: string; runtimeBindingRef: string | null }>>`
    SELECT status, runtime_binding_ref AS "runtimeBindingRef" FROM assessment_run_executions
    WHERE run_id=${f.runId} AND track_id=${trackId}`
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ status: 'ASSIGNED', runtimeBindingRef: null })
}
suite('Private fixed-version education publication and pre-start task state', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    process.env.DATA_PSEUDONYM_KEY ||= '56'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY ||= '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
  })
  afterAll(async () => { await db?.$disconnect() })
  it('publishes a School author-private frozen scale through real activity lifecycle, with a separate unstarted task', async () => {
    const { f, track, preview, publish } = await fixture('SCHOOL')
    await f.open(); await preview(); await publish()
    expect(await state(f.runId)).toMatchObject({ status: 'PUBLISHED', executions: 1n, relationships: 1n })
    await assertPrivateExecutionPublished(f, track.id)
  }, 60_000)
  it('requires current Teacher product administration before real product preview/publication', async () => {
    const { f, track, preview, publish } = await fixture('TEACHER')
    await f.open()
    const member = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: f.organizationId, userId: f.managerUserId, validUntil: null } })
    const author = await db.organizationPersonaGrant.findFirstOrThrow({ where: { membershipId: member.id, persona: 'COUNSELOR', revokedAt: null } })
    await db.organizationPersonaGrant.update({ where: { id: author.id }, data: { revokedAt: new Date() } })
    // School professional withdrawal does not remove Teacher product authority.
    await preview()
    const productAdmin = await db.educationProductRoleGrant.findFirstOrThrow({ where: {
      membershipId: member.id, product: 'HUITEACHER', role: 'PRODUCT_ADMIN', revokedAt: null,
    } })
    await db.educationProductRoleGrant.update({ where: { id: productAdmin.id }, data: { revokedAt: new Date(), revokedByUserId: f.managerUserId } })
    await expect(preview()).rejects.toMatchObject({ code: 'HUITEACHER_RUN_ADMIN_REQUIRED', statusCode: 403 })
    await expect(publish()).rejects.toMatchObject({ code: 'HUITEACHER_RUN_ADMIN_REQUIRED', statusCode: 403 })
    expect(await state(f.runId)).toMatchObject({ status: 'DRAFT', executions: 0n, relationships: 0n })
    expect(await db.educationProductRoleGrant.count({ where: { membershipId: member.id, product: 'HUITEACHER', role: 'PRODUCT_ADMIN', revokedAt: null } })).toBe(0)
    await db.educationProductRoleGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      membershipId: member.id, product: 'HUITEACHER', role: 'PRODUCT_ADMIN', grantedByUserId: f.managerUserId } })
    await preview(); await publish()
    expect(await state(f.runId)).toMatchObject({ status: 'PUBLISHED', executions: 1n, relationships: 1n })
    await assertPrivateExecutionPublished(f, track.id)
  }, 60_000)
  it('publishes mixed public/private tracks with one relationship, and public grant revocation rejects the entire next mixed run', async () => {
    const good = await fixture('SCHOOL', true)
    await good.f.open(); await good.preview(); await good.publish()
    expect(await state(good.f.runId)).toMatchObject({ status: 'PUBLISHED', executions: 2n, relationships: 1n })
    await assertPrivateExecutionPublished(good.f, good.track.id)
    const blocked = await fixture('SCHOOL', true)
    await blocked.f.open()
    const [grant] = await db.$queryRaw<Array<{ id: string; issuer_id: string; version: number }>>`
      SELECT id, issuer_id, version FROM scale_library_use_grants WHERE id=${blocked.f.grantId}`
    await revokeUse(grant.issuer_id, grant.id, { expectedVersion: grant.version, reason: 'Synthetic mixed publication revocation' })
    await expect(blocked.preview()).rejects.toThrow(); await expect(blocked.publish()).rejects.toThrow()
    expect(await state(blocked.f.runId)).toMatchObject({ status: 'DRAFT', executions: 0n, relationships: 0n })
  }, 120_000)
})
