import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import type { PrivateToolContext } from '../../modules/education-tools/private-tool.contracts'
import type { FormDraft } from '../../modules/assessment-core/form/definition'
import { addPrivateFormRunTrack } from '../../modules/education-tools/private-tool.run-adapter'
import { addTeacherPrivateFormRunTrack, previewTeacherRun } from '../../modules/huiteacher/run.service'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
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
async function fixture(product: 'SCHOOL' | 'TEACHER') {
  const f = await setupEducationLibraryRuntimeFixture({ db, product, trackCount: 0, publish: false })
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
  return { f, context, source, target, teacher, attach, body }
}
async function effects(runId: string, ownerId: string) {
  const [row] = await db.$queryRaw<Array<{ composites: bigint; sections: bigint; items: bigint; registry: bigint; tracks: bigint; runVersion: number }>>`
    SELECT (SELECT count(*) FROM composite_assessments WHERE created_by=${ownerId}) AS composites,
      (SELECT count(*) FROM composite_form_sections p JOIN composite_assessments c ON c.id=p.composite_assessment_id WHERE c.created_by=${ownerId}) AS sections,
      (SELECT count(*) FROM composite_assessment_items i JOIN composite_assessments c ON c.id=i.composite_assessment_id WHERE c.created_by=${ownerId}) AS items,
      (SELECT count(*) FROM registered_assessment_resources WHERE created_by_user_id=${ownerId}) AS registry,
      (SELECT count(*) FROM assessment_run_tracks WHERE run_id=${runId}) AS tracks,
      (SELECT version FROM assessment_runs WHERE id=${runId}) AS "runVersion"`
  return row
}
suite('Private Form fixed-version draft attachment and read-only preview, preserving source content', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    process.env.DATA_PSEUDONYM_KEY ||= '56'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY ||= '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
  })
  afterAll(async () => { await db?.$disconnect() })
  it.each(['SCHOOL', 'TEACHER'] as const)('%s uses the real product draft parent and CAS, rejects incompatible versions without changing source, and leaves the activity unpublished', async product => {
    const { f, context, source, target, teacher, attach, body } = await fixture(product)
    const unsupported = definition()
    unsupported.pages[1].questions.push(unsupported.pages[0].questions.pop()!)
    const bad = await frozen(context, unsupported)
    const candidates = await tools.listPrivateFormRuntimeCandidates(context)
    expect(candidates.list.find(row => row.versionId === source.version.id)?.compatibility.compatible).toBe(true)
    expect(candidates.list.find(row => row.versionId === bad.version.id)?.compatibility).toMatchObject({ compatible: false,
      code: 'PRIVATE_FORM_RUNTIME_UNSUPPORTED', issues: expect.arrayContaining([expect.objectContaining({ itemKey: 'explain', reason: 'CONDITION_SCOPE_UNSUPPORTED' })]) })
    const before = await effects(f.runId, f.managerUserId)
    await expect(attach({ ...body, expectedVersion: f.expectedVersion + 1 })).rejects.toThrow('PRIVATE_TOOL_RUN_VERSION_CONFLICT')
    await expect(addPrivateFormRunTrack({ ...target, parent: { ...target.parent, id: randomUUID() } }, body))
      .rejects.toThrow('PRIVATE_TOOL_RUN_PARENT_MISMATCH')
    if (product === 'TEACHER') await expect(addTeacherPrivateFormRunTrack({ ...teacher, eventId: randomUUID() }, body)).rejects.toThrow()
    await expect(attach({ ...body, privateForm: { ...body.privateForm, versionId: bad.version.id, contentHash: bad.version.contentHash } }))
      .rejects.toMatchObject({ code: 'PRIVATE_FORM_RUNTIME_UNSUPPORTED' })
    expect(await effects(f.runId, f.managerUserId)).toEqual(before)
    expect(canonicalHash((await db.educationPrivateToolVersion.findUniqueOrThrow({ where: { id: bad.version.id } })).definition)).toBe(canonicalHash(unsupported))
    const newerDraft = await tools.updatePrivateTool(context, source.draft.id, { expectedRevision: source.draft.revision, title: 'Newer form', definition: definition() })
    const newer = await tools.freezePrivateTool(context, source.draft.id, { expectedRevision: newerDraft.revision, expectedContentHash: newerDraft.contentHash })
    const first = await attach(body), second = await attach({ ...body, expectedVersion: f.expectedVersion + 1 })
    expect(first.resourceFamily).toBe('FORM'); expect(second.resourceKey).toBe(first.resourceKey)
    expect(first.resourceKey).toContain(source.version.id); expect(first.resourceKey).not.toContain(newer.id)
    const composite = await db.compositeAssessment.findUniqueOrThrow({ where: { creationKey: first.resourceKey }, include: { items: { orderBy: { position: 'asc' } }, formSections: { orderBy: { position: 'asc' } } } })
    expect(composite).toMatchObject({ status: 'DRAFT', publishedAt: null, publicEnabled: false, copyable: false })
    expect(composite.items.map(item => item.formDefinition)).toEqual(definition().pages.flatMap(page => page.questions))
    expect(composite.formSections.map(page => [page.title, page.description])).toEqual([['First', 'First instructions'], ['Last', 'Last instructions']])
    expect(await db.$queryRaw`SELECT id FROM registered_assessment_resources WHERE composite_id=${composite.id}`).toEqual([])
    expect(await db.scale.findUnique({ where: { code: 'education-private-scale:' + source.version.id } })).toBeNull()
    expect((await effects(f.runId, f.managerUserId))).toMatchObject({ tracks: 2n, runVersion: f.expectedVersion + 2 })
    const preview = () => product === 'TEACHER' ? previewTeacherRun({ ...teacher, expectedVersion: f.expectedVersion + 2 }) : f.preview()
    await preview()
    expect(await db.compositeAssessment.findUniqueOrThrow({ where: { id: composite.id } })).toMatchObject({ status: 'DRAFT', publishedAt: null })
    expect(await db.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: composite.id } })).toBe(0)
    expect(await db.$queryRaw`SELECT id FROM assessment_run_executions WHERE run_id=${f.runId}`).toEqual([])
    expect((await db.$queryRaw<Array<{ status: string }>>`SELECT status FROM assessment_runs WHERE id=${f.runId}`)[0].status).toBe('DRAFT')
  }, 90_000)
  it('rejects foreign owner, entry and organization without creating a derived form or track', async () => {
    const { f, context, source, target, body } = await fixture('SCHOOL')
    const other = await db.user.create({ data: { username: 'privateformother' + randomUUID(), passwordHash: 'synthetic-only', accountDomain: 'SCHOOL', role: 'TEACHER', teacherApproved: true } })
    const member = await db.organizationMembership.create({ data: { id: randomUUID(), organizationId: f.organizationId, userId: other.id } })
    await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId, membershipId: member.id, persona: 'COUNSELOR', grantedByUserId: f.managerUserId } })
    await db.organizationCapabilityGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId, membershipId: member.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: f.managerUserId } })
    const foreign = await frozen({ ...context, principal: { userId: other.id, accountDomain: 'SCHOOL' } })
    await db.educationProductEntitlement.create({ data: { organizationId: f.organizationId, product: 'HUITEACHER', grantedByUserId: f.managerUserId } })
    const teacherMember = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: f.organizationId, userId: f.managerUserId, validUntil: null } })
    await db.educationProductRoleGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId, membershipId: teacherMember.id, product: 'HUITEACHER', role: 'PRODUCT_ADMIN', grantedByUserId: f.managerUserId } })
    const entry = await frozen({ ...context, entry: 'TEACHER' })
    for (const version of [foreign.version, entry.version]) {
      const before = await effects(f.runId, version.ownerUserId)
      await expect(addPrivateFormRunTrack(target, { ...body, privateForm: { ...body.privateForm, versionId: version.id, contentHash: version.contentHash } }))
        .rejects.toThrow('PRIVATE_TOOL_VERSION_NOT_FOUND')
      expect(await effects(f.runId, version.ownerUserId)).toEqual(before)
    }
    const before = await effects(f.runId, source.version.ownerUserId)
    await expect(addPrivateFormRunTrack({ ...target, organizationId: randomUUID() }, body)).rejects.toThrow()
    expect(await effects(f.runId, source.version.ownerUserId)).toEqual(before)
  }, 90_000)
  it('rolls back derived sections, typed form items and the parent version after a real downstream track INSERT failure', async () => {
    const { f, target, body } = await fixture('SCHOOL')
    const before = await effects(f.runId, f.managerUserId), name = 'test_private_form_track_' + randomUUID().replaceAll('-', '')
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id=TG_ARGV[0] THEN RAISE EXCEPTION 'synthetic private form track failure'; END IF; RETURN NEW; END $$`)
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON assessment_run_tracks FOR EACH ROW EXECUTE FUNCTION ${name}('${f.runId}')`)
      await expect(addPrivateFormRunTrack(target, body)).rejects.toThrow('synthetic private form track failure')
      expect(await effects(f.runId, f.managerUserId)).toEqual(before)
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON assessment_run_tracks`)
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`)
    }
  }, 90_000)
})
