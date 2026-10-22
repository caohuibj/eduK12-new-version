import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import type { PrivateToolContext } from '../../modules/education-tools/private-tool.contracts'
import type { FormDraft } from '../../modules/assessment-core/form/definition'
import { addPrivateFormRunTrack } from '../../modules/education-tools/private-tool.run-adapter'
import { addTeacherPrivateFormRunTrack, previewTeacherRun, publishTeacherRun } from '../../modules/huiteacher/run.service'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { previewAssessmentRun, publishAssessmentRun } from '../../modules/assessment-run/publish'
import { preparePrivateFormRuntimeResource } from '../../modules/education-tools/private-tool.form-runtime-resources'
import { startAssessmentRunExecution } from '../../modules/assessment-run/startExecution'
import { loadRunExecutionStartAdmission } from '../../modules/assessment-run/startAdmission'
import { revokeUse } from '../../modules/scale-library-governance/distribution'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'), suite = url ? describe : describe.skip
let db: PrismaClient
const definition = (): FormDraft => ({ schemaVersion: 2, pages: [
  { pageKey: 'first', title: 'First', description: 'First instructions', questions: [
    { itemKey: 'choice', type: 'SINGLE', prompt: 'Choose', required: true, allowRefusal: false,
      options: [{ optionKey: 'a', label: 'A' }, { optionKey: 'b', label: 'B' }], rows: [] },
    { itemKey: 'explain', type: 'SHORT_TEXT', prompt: 'Explain', required: true, allowRefusal: true,
      options: [], rows: [], displayIf: { itemKey: 'choice', operator: 'EQUALS', optionKey: 'a' } },
  ] }, { pageKey: 'last', title: 'Last', description: 'Last instructions', questions: [
    { itemKey: 'comment', type: 'LONG_TEXT', prompt: 'Comment', required: false, options: [], rows: [], maxLength: 150 },
  ] },
] })
async function frozen(context: PrivateToolContext, content: FormDraft = definition()) {
  const draft = await tools.createPrivateTool(context, { kind: 'FORM', title: 'Synthetic private draft form' })
  const saved = await tools.updatePrivateTool(context, draft.id, { expectedRevision: draft.revision, title: draft.title, definition: content })
  const version = await tools.freezePrivateTool(context, draft.id, { expectedRevision: saved.revision, expectedContentHash: saved.contentHash })
  return { draft: saved, version }
}
async function fixture(product: 'SCHOOL' | 'TEACHER', mixed = false) {
  const f = await setupEducationLibraryRuntimeFixture({ db, product, trackCount: mixed ? 1 : 0, publish: false })
  const context: PrivateToolContext = { entry: product, organizationId: f.organizationId,
    principal: { userId: f.managerUserId, accountDomain: 'SCHOOL' } }
  if (product === 'TEACHER') {
    // Event admin is not an implicit private-tool author.
    await expect(tools.createPrivateTool(context, { kind: 'FORM', title: 'Not an author' })).rejects.toThrow('PRIVATE_TOOL_AUTHOR_REQUIRED')
    const member = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: f.organizationId, userId: f.managerUserId, validUntil: null } })
    await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      membershipId: member.id, persona: 'COUNSELOR', grantedByUserId: f.managerUserId } })
    await db.organizationCapabilityGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      membershipId: member.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: f.managerUserId } })
  }
  const source = await frozen(context)
  const target = { organizationId: f.organizationId, runId: f.runId, actorUserId: f.managerUserId,
    parent: { kind: product === 'SCHOOL' ? 'SCHOOL_ACTIVITY' as const : 'TEACHER_EVENT' as const, id: f.workflow.id } }
  const teacher = { organizationId: f.organizationId, eventId: f.workflow.id, actorUserId: f.managerUserId }
  const attach = (raw: unknown) => product === 'TEACHER' ? addTeacherPrivateFormRunTrack(teacher, raw) : addPrivateFormRunTrack(target, raw)
  const body = { expectedVersion: f.expectedVersion, privateForm: { versionId: source.version.id, contentHash: source.version.contentHash,
    administration: { population: product === 'SCHOOL' ? 'STUDENT' : 'TEACHER', responseMode: 'SELF' } },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [f.subjectMembershipId] },
    respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [f.subjectMembershipId] } }
  const track = await attach(body)
  const key = { organizationId: f.organizationId, runId: f.runId, actorUserId: f.managerUserId, expectedVersion: f.expectedVersion + 1 }
  const preview = () => product === 'TEACHER' ? previewTeacherRun({ ...teacher, expectedVersion: key.expectedVersion }) : f.preview()
  const publish = () => product === 'TEACHER' ? publishTeacherRun({ ...teacher, expectedVersion: key.expectedVersion }) : f.publish()
  return { f, context, source, target, teacher, attach, body, track, key, preview, publish }
}
async function state(runId: string) {
  return (await db.$queryRaw<Array<{ status: string; version: number; executions: bigint; relationships: bigint; actors: bigint }>>`
    SELECT status, version, (SELECT count(*) FROM assessment_run_executions WHERE run_id=${runId}) AS executions,
      (SELECT count(*) FROM assessment_run_relationship_snapshots WHERE run_id=${runId}) AS relationships,
      (SELECT count(*) FROM assessment_run_actor_snapshots WHERE run_id=${runId}) AS actors
    FROM assessment_runs WHERE id=${runId}`)[0]
}
const parent = (key: string) => db.compositeAssessment.findUniqueOrThrow({ where: { creationKey: key },
  include: { items: { orderBy: { position: 'asc' } }, formSections: { orderBy: { position: 'asc' } } } })
function content(value: Awaited<ReturnType<typeof parent>>) {
  const { status: _status, publishedAt: _publishedAt, updatedAt: _updatedAt, ...fixed } = value
  return fixed
}
async function unchanged(x: Awaited<ReturnType<typeof fixture>>, baseline: Awaited<ReturnType<typeof parent>>) {
  expect(await parent(x.track.resourceKey)).toEqual(baseline)
  expect(await state(x.f.runId)).toMatchObject({ status: 'DRAFT', version: x.key.expectedVersion, executions: 0n, relationships: 0n, actors: 0n })
  expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: baseline.id } })).toBe(0)
}
async function closedStart(x: Awaited<ReturnType<typeof fixture>>, parentId: string) {
  const [execution] = await db.$queryRaw<Array<{ id: string; binding: string | null }>>`
    SELECT id, runtime_binding_ref AS binding FROM assessment_run_executions WHERE run_id=${x.f.runId} AND track_id=${x.track.id}`
  expect(execution.binding).toBeNull()
  await expect(startAssessmentRunExecution({ executionId: execution.id, actorUserId: x.f.participantUserId })).rejects.toMatchObject({
    code: 'PRIVATE_FORM_ACTIVITY_RUNTIME_NOT_READY' })
  await expect(loadRunExecutionStartAdmission({ executionId: execution.id, actorUserId: x.f.participantUserId }))
    .rejects.toMatchObject({ code: 'PRIVATE_FORM_ACTIVITY_RUNTIME_NOT_READY' })
  expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: parentId } })).toBe(0)
  expect((await db.$queryRaw<Array<{ binding: string | null }>>`SELECT runtime_binding_ref AS binding FROM assessment_run_executions WHERE id=${execution.id}`)[0].binding).toBeNull()
}
suite('Private Form real preview and atomic fixed-version publication, before runtime activation', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    process.env.DATA_PSEUDONYM_KEY ||= '56'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY ||= '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
  })
  afterAll(async () => { await db?.$disconnect() })
  it.each(['SCHOOL', 'TEACHER'] as const)('%s previews without mutation, publishes immutable content once, and reuses the sealed identity', async product => {
    const x = await fixture(product), before = await parent(x.track.resourceKey)
    expect(before.status).toBe('DRAFT')
    await x.preview(); await unchanged(x, before)
    await x.f.open()
    await expect(previewAssessmentRun({ ...x.key, expectedVersion: x.key.expectedVersion - 1 })).rejects.toMatchObject({ code: 'RUN_STATE_CONFLICT' })
    await expect(publishAssessmentRun({ ...x.key, expectedVersion: x.key.expectedVersion - 1 })).rejects.toMatchObject({ code: 'RUN_STATE_CONFLICT' })
    await unchanged(x, before)
    if (product === 'TEACHER') {
      const member = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: x.f.organizationId, userId: x.f.managerUserId, validUntil: null } })
      const author = await db.organizationPersonaGrant.findFirstOrThrow({ where: { membershipId: member.id, persona: 'COUNSELOR', revokedAt: null } })
      await db.organizationPersonaGrant.update({ where: { id: author.id }, data: { revokedAt: new Date() } })
      await expect(x.preview()).rejects.toThrow('PRIVATE_TOOL_AUTHOR_REQUIRED')
      await expect(x.publish()).rejects.toThrow('PRIVATE_TOOL_AUTHOR_REQUIRED')
      await unchanged(x, before)
      expect(await db.educationProductRoleGrant.count({ where: { membershipId: member.id, product: 'HUITEACHER', role: 'PRODUCT_ADMIN', revokedAt: null } })).toBe(1)
      await db.organizationPersonaGrant.update({ where: { id: author.id }, data: { revokedAt: null } })
    }
    await x.preview(); await unchanged(x, before); await x.publish()
    const sealed = await parent(x.track.resourceKey)
    expect(sealed.status).toBe('PUBLISHED'); expect(sealed.publishedAt).not.toBeNull()
    expect(content(sealed)).toEqual(content(before))
    expect(sealed.items.map(item => item.formDefinition)).toEqual(definition().pages.flatMap(page => page.questions))
    expect(canonicalHash((await db.educationPrivateToolVersion.findUniqueOrThrow({ where: { id: x.source.version.id } })).definition)).toBe(canonicalHash(definition()))
    const [track] = await db.$queryRaw<Array<{ policy: { runtimeLaunchTarget: { kind: string; ref: string } }; hash: string }>>`
      SELECT frozen_resource_policy AS policy, resource_policy_hash AS hash FROM assessment_run_tracks WHERE id=${x.track.id}`
    expect(track.policy.runtimeLaunchTarget).toEqual({ kind: 'COMPOSITE', ref: sealed.id })
    expect(track.hash).toBe(canonicalHash(track.policy))
    expect(await state(x.f.runId)).toMatchObject({ status: 'PUBLISHED', executions: 1n, relationships: 1n })
    const preparedAgain = await db.$transaction(tx => preparePrivateFormRuntimeResource(tx, x.context, x.body.privateForm),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
    expect(preparedAgain.compositeId).toBe(sealed.id)
    expect(await parent(x.track.resourceKey)).toEqual(sealed)
    expect(await db.$queryRaw`SELECT id FROM registered_assessment_resources WHERE composite_id=${sealed.id}`).toEqual([])
    await closedStart(x, sealed.id)
  }, 90_000)
  it('publishes public/private Form together, while revoking the public grant rejects the whole next mixed publication without sealing', async () => {
    const good = await fixture('SCHOOL', true), before = await parent(good.track.resourceKey)
    await good.f.open(); await good.preview(); await unchanged(good, before); await good.publish()
    expect(await state(good.f.runId)).toMatchObject({ status: 'PUBLISHED', executions: 2n, relationships: 1n })
    expect((await parent(good.track.resourceKey)).status).toBe('PUBLISHED')
    const blocked = await fixture('SCHOOL', true), draftParent = await parent(blocked.track.resourceKey)
    await blocked.f.open()
    const [grant] = await db.$queryRaw<Array<{ id: string; issuer_id: string; version: number }>>`
      SELECT id, issuer_id, version FROM scale_library_use_grants WHERE id=${blocked.f.grantId}`
    await revokeUse(grant.issuer_id, grant.id, { expectedVersion: grant.version, reason: 'Synthetic Form mixed grant revocation' })
    await expect(blocked.preview()).rejects.toThrow('EDUCATION_LIBRARY_USE_GRANT_REQUIRED')
    await expect(blocked.publish()).rejects.toThrow('EDUCATION_LIBRARY_USE_GRANT_REQUIRED')
    await unchanged(blocked, draftParent)
  }, 120_000)
  it('rolls back the Form seal, frozen policy, actors and relationships after a real post-seal Run publication UPDATE failure', async () => {
    const x = await fixture('SCHOOL'), before = await parent(x.track.resourceKey)
    await x.f.open(); await x.preview()
    const frozenBefore = await db.$queryRaw`SELECT frozen_resource_policy, resource_policy_hash FROM assessment_run_tracks WHERE id=${x.track.id}`
    const name = 'test_private_form_publish_' + randomUUID().replaceAll('-', '')
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=TG_ARGV[0] AND NEW.status='PUBLISHED' THEN IF NOT EXISTS (SELECT 1 FROM composite_assessments WHERE id=TG_ARGV[1] AND status='PUBLISHED' AND published_at IS NOT NULL) THEN RAISE EXCEPTION 'form seal was not reached'; END IF; RAISE EXCEPTION 'synthetic private form publication failure'; END IF; RETURN NEW; END $$`)
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE UPDATE OF status ON assessment_runs FOR EACH ROW EXECUTE FUNCTION ${name}('${x.f.runId}','${before.id}')`)
      await expect(x.publish()).rejects.toThrow('synthetic private form publication failure')
      await unchanged(x, before)
      expect(await db.$queryRaw`SELECT frozen_resource_policy, resource_policy_hash FROM assessment_run_tracks WHERE id=${x.track.id}`).toEqual(frozenBefore)
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON assessment_runs`)
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`)
    }
  }, 90_000)
})
