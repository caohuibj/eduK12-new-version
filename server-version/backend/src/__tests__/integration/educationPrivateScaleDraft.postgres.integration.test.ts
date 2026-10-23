import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from './integration-env'
import { setupEducationLibraryRuntimeFixture } from './educationLibraryRuntimeFixture'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import * as tools from '../../modules/education-tools/private-tool.service'
import type { PrivateToolContext } from '../../modules/education-tools/private-tool.contracts'
import { addPrivateScaleRunTrack } from '../../modules/education-tools/private-tool.run-adapter'
import { addTeacherPrivateRunTrack } from '../../modules/huiteacher/run.service'
const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'), suite = url ? describe : describe.skip
let db: PrismaClient
const definition = () => compileResearchScale('Synthetic private draft', { schemaVersion: 1, presentationMode: 'ONE_BY_ONE',
  respondentType: 'participant_self_report', aggregation: 'mean', responseOptions: [{ optionKey: 'a', label: 'A', score: 1 }, { optionKey: 'b', label: 'B', score: 2 }],
  dimensions: [{ dimensionKey: 'total', label: 'Total', direction: 'descriptive' }],
  items: [{ itemKey: 'q', prompt: 'Synthetic question', required: true, reverse: false, dimensionKeys: ['total'] }] })
async function frozen(c: PrivateToolContext) {
  const draft = await tools.createPrivateTool(c, { kind: 'SCALE', title: 'Private draft source' })
  const saved = await tools.updatePrivateTool(c, draft.id, { expectedRevision: draft.revision, title: draft.title, definition: definition() })
  const version = await tools.freezePrivateTool(c, draft.id, { expectedRevision: saved.revision, expectedContentHash: saved.contentHash })
  return { draft: saved, version }
}
async function fixture(product: 'SCHOOL' | 'TEACHER') {
  const f = await setupEducationLibraryRuntimeFixture({ db, product, trackCount: 0, publish: false })
  const context: PrivateToolContext = { entry: product, organizationId: f.organizationId, principal: { userId: f.managerUserId, accountDomain: 'SCHOOL' } }
  if (product === 'TEACHER') {
    // Event management and private authorship are independent qualifications.
    await expect(tools.createPrivateTool(context, { kind: 'SCALE', title: 'Not yet an author' })).rejects.toThrow('PRIVATE_TOOL_AUTHOR_REQUIRED')
    const member = await db.organizationMembership.findFirstOrThrow({ where: { organizationId: f.organizationId, userId: f.managerUserId, validUntil: null } })
    await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      membershipId: member.id, persona: 'COUNSELOR', grantedByUserId: f.managerUserId } })
    await db.organizationCapabilityGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId,
      membershipId: member.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: f.managerUserId } })
  }
  const source = await frozen(context)
  const target = { organizationId: f.organizationId, runId: f.runId, actorUserId: f.managerUserId,
    parent: { kind: product === 'SCHOOL' ? 'SCHOOL_ACTIVITY' as const : 'TEACHER_EVENT' as const, id: f.workflow.id } }
  const teacherTarget = { organizationId: f.organizationId, eventId: f.workflow.id, actorUserId: f.managerUserId }
  const attach = (raw: unknown) => product === 'TEACHER' ? addTeacherPrivateRunTrack(teacherTarget, raw) : addPrivateScaleRunTrack(target, raw)
  const payload = { expectedVersion: f.expectedVersion, privateScale: { versionId: source.version.id, contentHash: source.version.contentHash,
    administration: { population: product === 'SCHOOL' ? 'STUDENT' : 'TEACHER', responseMode: 'SELF' } },
    subjectSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [f.subjectMembershipId] },
    respondentSelector: { kind: 'MEMBERSHIP_IDS', membershipIds: [f.subjectMembershipId] } }
  return { f, context, source, target, teacherTarget, attach, payload }
}
async function effects(versionId: string, runId: string, ownerId: string) {
  const [counts] = await db.$queryRaw<Array<{ releases: bigint; registry: bigint; tracks: bigint; composites: bigint; runVersion: number }>>`
    SELECT (SELECT count(*) FROM measurement_content_releases WHERE provenance->>'versionId'=${versionId}) AS releases,
      (SELECT count(*) FROM registered_assessment_resources WHERE entry->'privateOrigin'->>'versionId'=${versionId}) AS registry,
      (SELECT count(*) FROM assessment_run_tracks WHERE run_id=${runId}) AS tracks,
      (SELECT count(*) FROM composite_assessments WHERE created_by=${ownerId}) AS composites,
      (SELECT version FROM assessment_runs WHERE id=${runId}) AS "runVersion"`
  return { ...counts, scale: await db.scale.findUnique({ where: { code: 'education-private-scale:' + versionId }, select: { id: true } }) }
}
suite('Private fixed-version attachment to existing education drafts only', () => {
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    process.env.DATA_ENCRYPTION_KEY ||= '55'.repeat(32)
    process.env.DATA_PSEUDONYM_KEY ||= '56'.repeat(32)
    process.env.CAMPUS_ELIGIBILITY_HMAC_KEY ||= '57'.repeat(32)
    db = new PrismaClient({ datasources: { db: { url: url! } } }); await db.$connect()
  })
  afterAll(async () => { await db?.$disconnect() })
  it.each(['SCHOOL', 'TEACHER'] as const)('attaches %s author-selected frozen version with CAS and no hidden publication', async product => {
    const { f, context, source, target, teacherTarget, attach, payload } = await fixture(product)
    const updated = await tools.updatePrivateTool(context, source.draft.id, { expectedRevision: source.draft.revision,
      title: 'New private draft title', definition: definition() })
    const newer = await tools.freezePrivateTool(context, source.draft.id, { expectedRevision: updated.revision, expectedContentHash: updated.contentHash })
    const candidates = await tools.listPrivateScaleRuntimeCandidates(context)
    expect(candidates.list.map(row => row.versionId)).toEqual(expect.arrayContaining([source.version.id, newer.id]))
    const before = await effects(source.version.id, f.runId, f.managerUserId)
    expect(before).toMatchObject({ releases: 0n, registry: 0n, tracks: 0n, scale: null })
    await expect(addPrivateScaleRunTrack({ ...target, parent: { ...target.parent, id: randomUUID() } }, payload))
      .rejects.toThrow('PRIVATE_TOOL_RUN_PARENT_MISMATCH')
    expect(await effects(source.version.id, f.runId, f.managerUserId)).toEqual(before)
    if (product === 'TEACHER') {
      await expect(addTeacherPrivateRunTrack({ ...teacherTarget, eventId: randomUUID() }, payload)).rejects.toThrow()
      expect(await effects(source.version.id, f.runId, f.managerUserId)).toEqual(before)
    }
    await expect(attach({ ...payload, expectedVersion: payload.expectedVersion + 1 })).rejects.toThrow('PRIVATE_TOOL_RUN_VERSION_CONFLICT')
    expect(await effects(source.version.id, f.runId, f.managerUserId)).toEqual(before)
    const first = await attach(payload)
    const second = await attach({ ...payload, expectedVersion: payload.expectedVersion + 1 })
    expect(first.resourceKey).toBe(second.resourceKey)
    const [resource] = await db.$queryRaw<Array<{ entry: any }>>`SELECT entry FROM registered_assessment_resources WHERE resource_key=${first.resourceKey} AND resource_version=${first.resourceVersion}`
    expect(resource.entry.privateOrigin).toMatchObject({ versionId: source.version.id, contentHash: source.version.contentHash, ownerUserId: f.managerUserId, entry: product })
    const after = await effects(source.version.id, f.runId, f.managerUserId)
    expect(after).toMatchObject({ releases: 1n, registry: 1n, tracks: 2n, runVersion: payload.expectedVersion + 2 })
    const [run] = await db.$queryRaw<Array<{ status: string; executions: bigint }>>`SELECT status,
      (SELECT count(*) FROM assessment_run_executions WHERE run_id=${f.runId}) AS executions FROM assessment_runs WHERE id=${f.runId}`
    expect(run).toEqual({ status: 'DRAFT', executions: 0n })
    expect((await effects(newer.id, f.runId, f.managerUserId)).scale).toBeNull()
  }, 60_000)
  it('rejects foreign author, foreign entry and foreign organization without creating derived source or track', async () => {
    const { f, context, source, target, payload } = await fixture('SCHOOL')
    const other = await db.user.create({ data: { username: 'privateother' + randomUUID(), passwordHash: 'synthetic-only', accountDomain: 'SCHOOL', role: 'TEACHER', teacherApproved: true } })
    const member = await db.organizationMembership.create({ data: { id: randomUUID(), organizationId: f.organizationId, userId: other.id } })
    await db.organizationPersonaGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId, membershipId: member.id, persona: 'COUNSELOR', grantedByUserId: f.managerUserId } })
    await db.organizationCapabilityGrant.create({ data: { id: randomUUID(), organizationId: f.organizationId, membershipId: member.id, capability: 'PSYCHOLOGY_STAFF', grantedByUserId: f.managerUserId } })
    const foreign = await frozen({ ...context, principal: { userId: other.id, accountDomain: 'SCHOOL' } })
    await db.educationProductEntitlement.create({ data: { organizationId: f.organizationId, product: 'HUITEACHER', grantedByUserId: f.managerUserId } })
    const otherEntry = await frozen({ ...context, entry: 'TEACHER' })
    for (const version of [foreign.version, otherEntry.version]) {
      const before = await effects(version.id, f.runId, version.ownerUserId)
      await expect(addPrivateScaleRunTrack(target, { ...payload, privateScale: { ...payload.privateScale, versionId: version.id, contentHash: version.contentHash } })).rejects.toThrow('PRIVATE_TOOL_VERSION_NOT_FOUND')
      expect(await effects(version.id, f.runId, version.ownerUserId)).toEqual(before)
    }
    const before = await effects(source.version.id, f.runId, f.managerUserId)
    await expect(addPrivateScaleRunTrack({ ...target, organizationId: randomUUID() }, payload)).rejects.toThrow()
    expect(await effects(source.version.id, f.runId, f.managerUserId)).toEqual(before)
  }, 60_000)
  it('rolls back actual derived release, wrapper, registry and track when a downstream database write fails', async () => {
    const { f, source, target, payload } = await fixture('SCHOOL')
    const before = await effects(source.version.id, f.runId, f.managerUserId)
    const name = 'test_private_track_' + randomUUID().replaceAll('-', '')
    // Isolated test DB only. Force failure at the real SQL write after source
    // preparation, without mocking preparation, authority or transaction calls.
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.run_id=TG_ARGV[0] THEN RAISE EXCEPTION 'synthetic private track failure'; END IF; RETURN NEW; END $$`)
    try {
      await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT ON assessment_run_tracks FOR EACH ROW EXECUTE FUNCTION ${name}('${f.runId}')`)
      await expect(addPrivateScaleRunTrack(target, payload)).rejects.toThrow('synthetic private track failure')
      expect(await effects(source.version.id, f.runId, f.managerUserId)).toEqual(before)
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON assessment_run_tracks`)
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`)
    }
  }, 60_000)
})
