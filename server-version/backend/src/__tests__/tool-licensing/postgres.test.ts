import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../config/database'
import type { ToolLicenseProduct } from '../../modules/tool-licensing/contracts'
import { listCurrentLicenseSet, listLicenseSubjects, listLicenseTools } from '../../modules/tool-licensing/directory'
import {
  createToolLicense, editToolLicense, listToolLicenses, readOwnToolLicense, readToolLicense, terminateToolLicense,
} from '../../modules/tool-licensing/management'
import { readPrivateToolTags, writePrivateToolTags } from '../../modules/tool-licensing/private-tags'
import { authorizeToolPublication } from '../../modules/tool-licensing/runtime'
import { captureToolLicenseSettlementFence, settleOneToolPublication } from '../../modules/tool-licensing/settlement'

import {
  listManagedToolLabels, listTaggedLicenseTools, listToolCatalogTags, updateToolCatalogTags,
} from '../../modules/tool-licensing/tags'

const testUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/no_database')
const isolatedDatabase = ['localhost', '127.0.0.1'].includes(testUrl.hostname)
  && testUrl.pathname === '/tool_licensing_test' && process.env.TOOL_LICENSING_TEST_DB === '1'
const relative = (minutes: number) => new Date(Date.now() + minutes * 60_000)
const actorId = randomUUID()
const teacherId = randomUUID()
const schoolId = randomUUID()
const prefix = 'license-fixture-' + randomUUID()
const code = prefix + '-one'
const reserveKey = 'SCALE:' + code
const actor = () => ({
  actorUserId: actorId,
  actorSession: { adminSessionId: randomUUID(), adminVerifiedAt: Math.floor(Date.now() / 1000),
    adminAuthenticationMethod: 'TOTP' as const, tokenVersion: 0 },
})
const grant = (product: ToolLicenseProduct, subjectId: string, limit: number | null) => ({
  requestId: randomUUID(), product, subjectId, reason: 'Synthesis exercise', startsAt: relative(-30).toISOString(),
  expiresAt: relative(30).toISOString(), tools: [{ key: reserveKey, limit }],
})
const publish = (product: ToolLicenseProduct, subjectId: string, publicationId = randomUUID(),
  education?: { closesAt: Date; maxResponses: number; frozenResponses: number }) =>
  prisma.$transaction(tx => authorizeToolPublication(tx, { product, subjectId, publicationId, toolKeys: [reserveKey], education }))

describe.skipIf(!isolatedDatabase)('tool licensing on isolated PostgreSQL', () => {
  beforeAll(async () => {
    for (const product of ['SCHOOL', 'TEACHER', 'TRAINING', 'SURVEY']) {
      vi.stubEnv(product + '_STANDARD_TOOL_LICENSING_ENABLED', 'true')
    }
    await prisma.user.create({ data: { id: actorId, username: prefix + '-admin', passwordHash: '-',
      role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' } })
    await prisma.user.create({ data: { id: teacherId, username: prefix + '-trainer', passwordHash: '-', role: 'TEACHER' } })
    await prisma.organization.create({ data: { id: schoolId, name: prefix, productDomain: 'SCHOOL', createdByUserId: actorId } })
    await prisma.$executeRaw`
      INSERT INTO education_product_entitlements (organization_id,product,granted_by_user_id)
      VALUES (${schoolId},'HUISCHOOL',${actorId}),(${schoolId},'HUITEACHER',${actorId})
    `
    const releaseId = randomUUID(), standardId = randomUUID(), trialRunId = randomUUID()
    const contentHash = 'b'.repeat(64), standardHash = randomUUID().replaceAll('-', '').repeat(2)
    await prisma.measurementContentRelease.create({ data: {
      id: releaseId, layer: 'MEASUREMENT', family: 'SCALE', key: code, version: '1.0.0', hashScheme: 'SHA256',
      contentHash, content: {}, scope: { kind: 'PLATFORM' }, assetRefs: [], publishedBy: actorId,
    } })
    await prisma.scale.create({ data: { code, name: prefix, creatorId: actorId, status: 'PUBLISHED',
      instrumentClass: 'STANDARD', instrumentVersion: '1.0.0', measurementReleaseId: releaseId } })
    await prisma.$executeRaw`
      INSERT INTO survey_standard_releases (id,tool_key,combination_hash,snapshot,reference,state,approved_by)
      VALUES (${standardId},${code},${standardHash},
        jsonb_build_object('instrumentVersion','1.0.0','title',${prefix}::text),'{}','APPROVED',${actorId})
    `
    await prisma.$executeRaw`
      INSERT INTO survey_standard_trials(id,release_id,run_id,case_index,answers,scores,report,record_hash)
      SELECT ${trialRunId}||case_index,${standardId},${trialRunId},case_index,'[]','{}','{}',${contentHash}
      FROM generate_series(0,2) case_index
    `
    await prisma.$executeRaw`
      UPDATE survey_standard_releases SET state='ONLINE',latest_trial=${trialRunId},
        measurement_release=jsonb_build_object('releaseId',${releaseId}::text,'contentHash',${contentHash}::text)
      WHERE id=${standardId}
    `
    for (const product of ['SCHOOL', 'TEACHER', 'TRAINING', 'SURVEY']) {
      await prisma.surveyToolPolicy.create({ data: {
        product, resourceKey: 'standard-release:' + standardId, fingerprint: standardHash,
        decision: 'APPROVED', reason: 'synthetic directory projection', reviewedBy: actorId,
      } })
    }
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    await prisma.$disconnect()
  })

  it('executes all four real subject and tool directory projections', async () => {
    for (const product of ['SCHOOL', 'TEACHER', 'TRAINING', 'SURVEY'] as const) {
      const tools = await listLicenseTools(prisma, product, { q: prefix })
      expect(tools.list).toEqual([{ key: reserveKey, name: prefix, family: 'SCALE' }])
      const subjects = await listLicenseSubjects(prisma, product, { q: prefix })
      expect(subjects.list.map(row => row.id)).toEqual(
        product === 'SURVEY' ? [] : [product === 'TRAINING' ? teacherId : schoolId],
      )
    }
  })

  it('maintains and selects approved tools by normalized labels for each product without crossing scope', async () => {
    const manager = await prisma.user.create({ data: {
      username: prefix + '-school-manager', passwordHash: 'synthetic-only', role: 'STUDENT',
      accountDomain: 'TRAINING', platformRole: 'STANDARD',
    } })
    await prisma.adminEntryGrant.create({ data: {
      id: randomUUID(), userId: manager.id, entry: 'HUISCHOOL', grantedBy: actorId,
    } })
    const system = { ...actor(), platformRole: 'SYSTEM_ADMIN' }
    const schoolManager = { ...actor(), actorUserId: manager.id, platformRole: 'STANDARD' }
    const labelSuffix = code.slice(-12)
    const selector = 'campus-'+labelSuffix
    for (const product of ['SCHOOL','TEACHER','TRAINING','SURVEY'] as const) {
      const before = await listToolCatalogTags({ product, key: reserveKey })
      expect(before).toEqual({ list: [{ key: reserveKey, name: prefix, family: 'SCALE', revision: 0, tags: [] }], hasMore: false })
      const input = { product, toolKey: reserveKey, expectedRevision: 0, tags: ['  Ｃａｍｐｕｓ-'+labelSuffix+'  ', selector, labelSuffix+'  '+product] }
      const updated = await updateToolCatalogTags(system, input)
      expect(updated).toMatchObject({ key: reserveKey, revision: 1, tags: [selector,labelSuffix+' '+product] })
      await expect(updateToolCatalogTags(system,input)).resolves.toEqual(updated)
      await expect(listTaggedLicenseTools({ product, tag: ' ＣＡＭＰＵＳ-'+labelSuffix+' ' })).resolves.toMatchObject({ list: [updated] })
      await expect(listToolCatalogTags({ product, tag: labelSuffix+' '+product, q: prefix })).resolves.toMatchObject({ list: [updated] })
      expect((await listManagedToolLabels({ product })).availableTags).toContain(labelSuffix+' '+product)
    }
    const remove = { product: 'SCHOOL', toolKey: reserveKey, expectedRevision: 1, tags: [] }
    await expect(updateToolCatalogTags(schoolManager, { ...remove, product: 'TEACHER' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateToolCatalogTags(schoolManager, { ...remove, expectedRevision: 0 })).rejects.toMatchObject({ statusCode: 409 })
    await expect(updateToolCatalogTags(schoolManager, { ...remove, toolKey: reserveKey+'-invalid' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateToolCatalogTags(schoolManager,remove)).resolves.toMatchObject({ revision: 2, tags: [] })
    await expect(listTaggedLicenseTools({ product: 'SCHOOL', tag: selector })).resolves.toEqual({ list: [] })
    await expect(listTaggedLicenseTools({ product: 'TEACHER', tag: selector })).resolves.toMatchObject({ list: [{ key: reserveKey, revision: 1 }] })
  })

  it('keeps private author labels outside the public catalog and scopes their revisions', async () => {
    const id = randomUUID()
    const label = '私有-' + id
    const first = { tags: [label], expectedRevision: 0 }
    const read = (product: ToolLicenseProduct) => readPrivateToolTags(prisma,product,id)
    await expect(read('SCHOOL')).resolves.toEqual({ tags: [], revision: 0 })
    await expect(prisma.$transaction(tx => writePrivateToolTags(tx,'SCHOOL',id,actorId,first)))
      .resolves.toEqual({ tags: [label], revision: 1 })
    await expect(read('TEACHER')).resolves.toEqual({ tags: [], revision: 0 })
    await expect(listTaggedLicenseTools({ product: 'SCHOOL', tag: label })).resolves.toEqual({ list: [] })
    expect((await listManagedToolLabels({ product: 'SCHOOL' })).availableTags).not.toContain(label)
    await expect(prisma.$transaction(tx => writePrivateToolTags(tx,'SCHOOL',id,actorId,{tags:[],expectedRevision:0})))
      .rejects.toMatchObject({statusCode:409})
    await expect(read('SCHOOL')).resolves.toEqual({ tags: [label], revision: 1 })
  })

  it('filters license records and catalog entries by exact tool identity', async () => {
    const subject = randomUUID(), period = randomUUID(), decoy = randomUUID()
    await prisma.$executeRaw`
      INSERT INTO tool_licenses (id,product,subject_type,subject_id,subject_label,starts_at,expires_at,request_digest)
      VALUES (${period},'SURVEY','USER',${subject},${prefix},${relative(-20)},${relative(20)},'fixture'),
             (${decoy},'SURVEY','USER',${randomUUID()},${prefix},${relative(-20)},${relative(20)},'fixture')
    `
    await prisma.$executeRaw`
      INSERT INTO tool_license_items (license_id,tool_key,name,family)
      VALUES (${period},${reserveKey},${prefix},'SCALE'),(${decoy},${reserveKey + '-another'},${prefix},'SCALE')
    `
    await prisma.$executeRaw`
      INSERT INTO tool_license_events (license_id,revision,actor_id,action,reason,snapshot)
      VALUES (${period},1,${actorId},'CREATED','Fixture','{}'),(${decoy},1,${actorId},'CREATED','Fixture','{}')
    `
    const result = await listToolLicenses({ product: 'SURVEY', toolKey: reserveKey })
    expect(result.list.map(row => row.id)).toEqual([period])
    expect((await listToolLicenses({ product: 'SURVEY', subjectId:subject, status:'EXPIRING',family:'SCALE' })).list).toHaveLength(1)
    expect((await listToolLicenses({ product: 'SURVEY', subjectId:subject, status:'EXPIRED' })).list).toHaveLength(0)
    expect((await listToolLicenses({ product: 'SURVEY', subjectId:subject, family:'FORM' })).list).toHaveLength(0)
    const own = await readOwnToolLicense('SURVEY',subject,subject)
    expect(own.license).toMatchObject({status:'ACTIVE',tools:[{key:reserveKey,assignment:'PENDING'}]})
    expect(Object.keys(own.license!).sort()).toEqual(['expiresAt','product','startsAt','status','subjectId','tools'])
    await expect(readOwnToolLicense('TRAINING',subject,subject)).resolves.toMatchObject({license:null})
    expect((await listCurrentLicenseSet(prisma,'SURVEY')).list.some(tool=>tool.key===reserveKey)).toBe(true)
    expect((await listLicenseTools(prisma, 'SURVEY', { key: reserveKey })).list.map(tool => tool.key)).toEqual([reserveKey])
    expect((await listLicenseTools(prisma, 'SURVEY', { key: reserveKey.slice(0, -1) })).list).toEqual([])
  })

  it('requires a system admin, enforces scope and preserves the original create receipt on replay', async () => {
    const input = grant('TRAINING', teacherId, 1)
    await expect(createToolLicense({ ...actor(), actorUserId: teacherId }, input)).rejects.toMatchObject({ statusCode: 403 })
    await expect(createToolLicense(actor(), { ...input, subjectId: schoolId })).rejects.toMatchObject({ statusCode: 403 })
    await expect(createToolLicense(actor(), input)).resolves.toMatchObject({ id: input.requestId, status: 'ACTIVE', revision: 1 })
    await expect(createToolLicense(actor(), input)).resolves.toMatchObject({ id: input.requestId, revision: 1 })
    await expect(createToolLicense(actor(), { ...input, reason: 'different' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(createToolLicense(actor(), { ...input, requestId: randomUUID() })).rejects.toMatchObject({ statusCode: 409 })
    const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => publish('TRAINING', teacherId)))
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter(result => result.status === 'rejected').map(result => result.reason.statusCode)).toEqual([409, 409, 409, 409])
    const [charged] = await prisma.$queryRaw<Array<{ publication_id: string }>>`
      SELECT publication_id FROM tool_license_charges WHERE license_id=${input.requestId}
    `
    await expect(publish('TRAINING', teacherId, charged.publication_id)).resolves.toBeUndefined()
    expect((await readToolLicense(input.requestId)).tools[0].used).toBe(1)
    await expect(editToolLicense(actor(), input.requestId, {
      expectedRevision: 9, reason: input.reason, tools: input.tools,
    })).rejects.toMatchObject({ statusCode: 409 })
    await terminateToolLicense(actor(), input.requestId, { expectedRevision: 1, reason: input.reason })
    await expect(publish('TRAINING', teacherId)).rejects.toMatchObject({ statusCode: 409 })
    const renewal = { ...grant('TRAINING', teacherId, 1), startsAt: new Date().toISOString() }
    await expect(createToolLicense(actor(), renewal)).resolves.toMatchObject({ id: renewal.requestId, tools: [{ used: 0 }] })
  })

  it('keeps legacy publishers untouched and rolls back the receipt with a failed publication', async () => {
    await expect(publish('SCHOOL', randomUUID())).resolves.toBeUndefined()
    const input = grant('TEACHER', schoolId, 4)
    await createToolLicense(actor(), input)
    const publicationId = randomUUID()
    const cap = { closesAt: relative(10), maxResponses: 2, frozenResponses: 2 }
    await expect(prisma.$transaction(async tx => {
      await authorizeToolPublication(tx, {
        product: 'TEACHER', subjectId: schoolId, publicationId, toolKeys: [reserveKey], education: cap,
      })
      throw new Error('native publication rolled back')
    })).rejects.toThrow('native publication rolled back')
    expect((await readToolLicense(input.requestId)).tools[0].used).toBe(0)
    await expect(publish('TEACHER', schoolId)).rejects.toThrow('冻结的名额')
    await expect(publish('TEACHER', schoolId, publicationId, { ...cap, frozenResponses: 3 })).rejects.toThrow('冻结的名额')
    await expect(publish('TEACHER', schoolId, publicationId, { ...cap, closesAt: relative(60) })).rejects.toThrow('授权到期时间')
    await publish('TEACHER', schoolId, publicationId, cap)
    await publish('TEACHER', schoolId, publicationId, cap)
    expect((await readToolLicense(input.requestId)).tools[0].used).toBe(2)
    await expect(publish('TEACHER', schoolId, randomUUID(), { ...cap, maxResponses: 3, frozenResponses: 3 }))
      .rejects.toThrow('剩余额度不足')
  })

  it('evaluates expiry after waiting for an administrator to release the period lock', async () => {
    const input = grant('SURVEY', randomUUID(), null)
    const expiresAt = new Date(Date.now() + 800)
    await prisma.$executeRaw`
      INSERT INTO tool_licenses (id,product,subject_type,subject_id,subject_label,starts_at,expires_at,request_digest)
      VALUES (${input.requestId},'SURVEY','USER',${input.subjectId},${prefix},
        ${new Date(input.startsAt)},${expiresAt},'fixture')
    `
    await prisma.$executeRaw`
      INSERT INTO tool_license_items (license_id,tool_key,name,family)
      VALUES (${input.requestId},${reserveKey},${prefix},'SCALE')
    `
    let announce = () => {}, release = () => {}
    const locked = new Promise<void>(resolve => { announce = resolve })
    const unlocked = new Promise<void>(resolve => { release = resolve })
    const holder = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tool_licenses WHERE id=${input.requestId} FOR UPDATE`
      announce()
      await unlocked
    })
    void holder.catch(announce)
    await locked
    const outcome = publish('SURVEY', input.subjectId).catch(cause => cause)
    try {
      await sleep(Math.max(0, expiresAt.getTime() - Date.now()) + 25)
    } finally {
      release()
      await holder
    }
    expect(await outcome).toMatchObject({ statusCode: 409, message: expect.stringContaining('尚未生效或已结束') })
  })

  it('settles an expired allocation once and protects a cutoff claim that was still committing', async () => {
    const input = grant('SCHOOL', schoolId, 5)
    await createToolLicense(actor(), input)
    const run = randomUUID(), track = randomUUID(), snapshot = randomUUID(), relationship = randomUUID(), execution = randomUUID()
    const membership = randomUUID(), close = relative(-10), started = relative(-11)
    const participantId = randomUUID()
    await prisma.user.create({ data: { id: participantId, username: prefix + '-student', passwordHash: '-',
      role: 'STUDENT', accountDomain: 'SCHOOL' } })
    await prisma.organizationMembership.create({ data: { id: membership, organizationId: schoolId, userId: participantId } })
    await prisma.$executeRaw`
      INSERT INTO assessment_runs (id,organization_id,name,created_by_user_id,intake_deadline,status)
      VALUES (${run},${schoolId},${prefix},${actorId},${close},'PUBLISHED')
    `
    await prisma.$executeRaw`
      INSERT INTO assessment_run_tracks(id,organization_id,run_id,resource_family,resource_key,resource_version,requested_policy)
      VALUES (${track},${schoolId},${run},'SCALE',${reserveKey},'1','{}')
    `
    await prisma.$executeRaw`
      INSERT INTO assessment_run_actor_snapshots(id,organization_id,run_id,provenance_kind,user_id,membership_id,
        actor_role,snapshot_payload,snapshot_hash)
      VALUES (${snapshot},${schoolId},${run},'ORG_MEMBER',${participantId},${membership},'STUDENT','{}','fixture')
    `
    await prisma.$executeRaw`
      INSERT INTO assessment_run_relationship_snapshots(id,organization_id,run_id,relationship_kind,
        subject_actor_snapshot_id,respondent_actor_snapshot_id,snapshot_payload,snapshot_hash)
      VALUES (${relationship},${schoolId},${run},'SELF',${snapshot},${snapshot},'{}','fixture')
    `
    await prisma.$executeRaw`
      INSERT INTO assessment_run_executions(id,organization_id,run_id,track_id,subject_actor_snapshot_id,
        respondent_actor_snapshot_id,relationship_snapshot_id)
      VALUES (${execution},${schoolId},${run},${track},${snapshot},${snapshot},${relationship})
    `
    await prisma.$executeRaw`UPDATE tool_license_items SET used=3 WHERE license_id=${input.requestId}`
    await prisma.$executeRaw`
      INSERT INTO tool_license_charges(license_id,tool_key,publication_id,quantity,settle_after)
      VALUES (${input.requestId},${reserveKey},${run},3,${close})
    `
    let announce = () => {}, release = () => {}
    const locked = new Promise<void>(resolve => { announce = resolve })
    const allowsCommit = new Promise<void>(resolve => { release = resolve })
    const writing = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM assessment_run_executions WHERE id=${execution} FOR UPDATE`
      await tx.$executeRaw`
        INSERT INTO assessment_run_execution_start_claims (id,organization_id,run_id,execution_id,operation_key,
          claim_generation,state,claimed_at,lease_until,admitted_attempt_identity)
        VALUES (${randomUUID()},${schoolId},${run},${execution},${randomUUID()},1,'CLAIMED',${started},${close},'{}')
      `
      announce()
      await allowsCommit
    })
    void writing.catch(announce)
    await locked
    let fence: Awaited<ReturnType<typeof captureToolLicenseSettlementFence>>
    try {
      fence = await captureToolLicenseSettlementFence()
      await expect(settleOneToolPublication(fence)).resolves.toBeUndefined()
    } finally {
      release()
      await writing
    }
    const settled = await Promise.all([settleOneToolPublication(fence), settleOneToolPublication(fence)])
    expect(settled.filter(value => value !== undefined)).toEqual([2])
    expect((await readToolLicense(input.requestId)).tools[0].used).toBe(1)
    await expect(settleOneToolPublication(fence)).resolves.toBeUndefined()
  })

  it('reserves and settles each tool only for the frozen tracks that use it', async () => {
    const organization = randomUUID(), license = randomUUID(), run = randomUUID(), actorSnapshot = randomUUID()
    const membership = randomUUID(), relationship = randomUUID(), tracks = [randomUUID(), randomUUID()]
    const close = relative(10), meteredForm = 'FORM:' + prefix, respondent = randomUUID()
    await prisma.organization.create({ data: { id: organization, name: prefix + '-scoped', productDomain: 'SCHOOL', createdByUserId: actorId } })
    await prisma.user.create({ data: { id: respondent, username: prefix + '-scoped-student', passwordHash: '-', role: 'STUDENT', accountDomain: 'SCHOOL' } })
    await prisma.organizationMembership.create({ data: { id: membership, organizationId: organization, userId: respondent } })
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO tool_licenses (id,product,subject_type,subject_id,subject_label,starts_at,expires_at,request_digest)
        VALUES (${license},'SCHOOL','ORGANIZATION',${organization},${prefix},${relative(-20)},${relative(20)},'fixture')
      `
      await tx.$executeRaw`
        INSERT INTO tool_license_items (license_id,tool_key,name,family,usage_limit)
        VALUES (${license},${reserveKey},${prefix},'SCALE',2),(${license},${meteredForm},${prefix},'FORM',1)
      `
      await tx.$executeRaw`
        INSERT INTO tool_license_events (license_id,revision,actor_id,action,reason,snapshot)
        VALUES (${license},1,${actorId},'CREATED','Fixture','{}')
      `
      await tx.$executeRaw`
        INSERT INTO assessment_runs (id,organization_id,name,created_by_user_id,intake_deadline,status)
        VALUES (${run},${organization},${prefix},${actorId},${close},'PUBLISHED')
      `
      await tx.$executeRaw`
        INSERT INTO assessment_run_actor_snapshots(id,organization_id,run_id,provenance_kind,user_id,membership_id,
          actor_role,snapshot_payload,snapshot_hash)
        VALUES (${actorSnapshot},${organization},${run},'ORG_MEMBER',${respondent},${membership},'STUDENT','{}','fixture')
      `
      await tx.$executeRaw`
        INSERT INTO assessment_run_relationship_snapshots(id,organization_id,run_id,relationship_kind,
          subject_actor_snapshot_id,respondent_actor_snapshot_id,snapshot_payload,snapshot_hash)
        VALUES (${relationship},${organization},${run},'SELF',${actorSnapshot},${actorSnapshot},'{}','fixture')
      `
      for (const track of tracks) {
        await tx.$executeRaw`
          INSERT INTO assessment_run_tracks(id,organization_id,run_id,resource_family,resource_key,resource_version,requested_policy)
          VALUES (${track},${organization},${run},'SCALE',${reserveKey},'1','{}')
        `
        await tx.$executeRaw`
          INSERT INTO assessment_run_executions(id,organization_id,run_id,track_id,subject_actor_snapshot_id,
            respondent_actor_snapshot_id,relationship_snapshot_id,started_at)
          VALUES (${randomUUID()},${organization},${run},${track},${actorSnapshot},${actorSnapshot},${relationship},
            ${track === tracks[0] ? relative(-11) : null})
        `
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        await authorizeToolPublication(tx, { product: 'SCHOOL', subjectId: organization, publicationId: run,
          toolKeys: [reserveKey, meteredForm], education: { closesAt: close, maxResponses: 2, frozenResponses: 2,
            allocations: [{ key: reserveKey, quantity: 2, trackIds: tracks }, { key: meteredForm, quantity: 1, trackIds: [tracks[1]] }] } })
      }
    })
    const counters = async () => Object.fromEntries((await readToolLicense(license)).tools.map(tool => [tool.key, tool.used]))
    expect(await counters()).toEqual({ [reserveKey]: 2, [meteredForm]: 1 })
    const elapsed = relative(-10)
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`UPDATE assessment_runs SET intake_deadline=${elapsed} WHERE id=${run}`
      await tx.$executeRaw`UPDATE tool_license_charges SET settle_after=${elapsed} WHERE publication_id=${run}`
    })
    const fence = await captureToolLicenseSettlementFence()
    expect(await settleOneToolPublication(fence)).toBe(1)
    expect(await settleOneToolPublication(fence)).toBe(1)
    expect(await settleOneToolPublication(fence)).toBeUndefined()
    expect(await counters()).toEqual({ [reserveKey]: 1, [meteredForm]: 0 })
  })
})
