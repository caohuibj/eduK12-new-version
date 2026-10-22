import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import example from '../../modules/situational/authoring/examples/teacher-demonstration.json'
import { compileSjtTemplate } from '../../modules/situational/authoring/template'
const { db, media } = vi.hoisted(() => ({
  db: { $transaction: vi.fn(), $queryRaw: vi.fn(),
    user: { findUnique: vi.fn() }, course: { findUnique: vi.fn() },
    sjtAuthorRelease: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    sjtReleaseGrant: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    sjtReleaseGrantAudit: { create: vi.fn() },
    sjtAuthorDraft: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    sjtAuthorAudit: { create: vi.fn() },
  }, media: { assertSjtAuthorMedia: vi.fn(), retainSjtAuthorReleaseMedia: vi.fn() },
}))
vi.mock('../../config/database', () => ({ prisma: db }))
vi.mock('../../modules/situational/authoring/media', () => media)
import { assertSjtCourseGrants, createSjtReleaseGrant, revokeSjtReleaseGrant,
  listSjtControlledReleases, listSjtReleaseGrants, sjtGrantListQuerySchema, sjtCourseGrantReceiptSchema } from '../../modules/situational/authoring/grants'
import { adaptSjtRelease, getSjtDraft, setSjtDraftPolicy, requestSjtReview,
  listUploadedSjtPackages } from '../../modules/situational/authoring/service'

const sqlText = (value: any) => (value.strings ?? value).join('')
const now = new Date('2026-10-18T12:00:00.000Z')
const teacher = { role: 'TEACHER', isActive: true, isFrozen: false, teacherApproved: true, expiresAt: null }
const scope = { teacherId: 'teacher', courseId: 'course', purpose: 'TRAINING_COURSE' as const }
const template = { ...example, instrumentKey: 'controlled-sjt-test' }
const compiled = compileSjtTemplate(template)
const release = { id: 'release', instrumentKey: template.instrumentKey, instrumentVersion: template.instrumentVersion,
  definitionHash: compiled.definitionHash, contentDigest: compiled.contentDigest,
  authorizationPolicy: 'COURSE_GRANT_V1', status: 'PUBLISHED', sourceDraftId: 'source-draft', authorId: 'author' }
const sourceDraft = { id: 'source-draft', ownerId: 'author', revision: 1, status: 'PUBLISHED',
  template, contentDigest: compiled.contentDigest, authorizationPolicy: 'COURSE_GRANT_V1', adaptationSource: null }
const grant = { id: 'grant', releaseId: release.id, instrumentKey: release.instrumentKey,
  instrumentVersion: release.instrumentVersion, definitionHash: release.definitionHash, contentDigest: release.contentDigest,
  granteeTeacherId: scope.teacherId, courseId: scope.courseId, purpose: scope.purpose, permission: 'DISTRIBUTE',
  validFrom: new Date(now.getTime() - 1000), expiresAt: new Date(now.getTime() + 1000), status: 'ACTIVE',
  version: 1, grantorId: 'admin', note: 'synthetic exact grant', createdAt: now,
  revokedAt: null, revokedBy: null, revokeNote: null }
const actor = { userId: 'teacher', admin: false }
const admin = { userId: 'admin', admin: true }
const exactInput = { instrumentKey: release.instrumentKey, instrumentVersion: release.instrumentVersion,
  definitionHash: release.definitionHash, contentDigest: release.contentDigest }
const adaptInput = { ...exactInput, courseId: scope.courseId, grantId: grant.id, grantVersion: grant.version,
  newInstrumentKey: release.instrumentKey, newInstrumentVersion: '2.0.0' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
  db.$transaction.mockImplementation(fn => fn(db))
  db.$queryRaw.mockResolvedValue([])
  db.user.findUnique.mockResolvedValue(teacher)
  db.course.findUnique.mockResolvedValue({ creatorId: scope.teacherId, courseType: scope.purpose, isLibrary: false })
  db.sjtAuthorRelease.findMany.mockResolvedValue([release])
  db.sjtAuthorRelease.findUnique.mockResolvedValue(release)
  db.sjtReleaseGrant.findMany.mockResolvedValue([grant])
  db.sjtAuthorDraft.findUnique.mockResolvedValue(sourceDraft)
  db.sjtAuthorDraft.create.mockImplementation(({ data }) => ({ id: 'adapted-draft', revision: 1, status: 'DRAFT', ...data }))
  media.assertSjtAuthorMedia.mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

describe('C13 exact course permission gate', () => {
  it('preserves explicit null policy without querying roles, courses or grants', async () => {
    expect((await assertSjtCourseGrants(db as any, [{ ...release, authorizationPolicy: null }], null)).get('release')).toBeNull()
    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(db.sjtReleaseGrant.findMany).not.toHaveBeenCalled()
  })
  it('fails closed for missing scope and unknown or omitted policy', async () => {
    await expect(assertSjtCourseGrants(db as any, [release], null)).rejects.toMatchObject({ statusCode: 403 })
    for (const authorizationPolicy of ['UNKNOWN', undefined])
      await expect(assertSjtCourseGrants(db as any, [{ ...release, authorizationPolicy } as any], scope)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('deduplicates one batch and locks releases then grants before current authorization', async () => {
    const result = await assertSjtCourseGrants(db as any, Array(20).fill(release), scope, 'DISTRIBUTE', { lock: true })
    expect(result.size).toBe(1)
    expect(result.get('release')).toMatchObject({ grantId: 'grant', grantVersion: 1,
      permission: 'DISTRIBUTE', ...exactInput, courseId: 'course', granteeTeacherId: 'teacher', admittedAt: now.toISOString() })
    expect(db.sjtAuthorRelease.findMany).toHaveBeenCalledTimes(1)
    expect(db.sjtReleaseGrant.findMany).toHaveBeenCalledTimes(1)
    expect(db.$queryRaw).toHaveBeenCalledTimes(4)
    expect(sqlText(db.$queryRaw.mock.calls[0][0])).toContain('FROM users')
    expect(sqlText(db.$queryRaw.mock.calls[1][0])).toContain('FROM courses')
    expect(sqlText(db.$queryRaw.mock.calls[2][0])).toContain('sjt_author_releases')
    expect(sqlText(db.$queryRaw.mock.calls[3][0])).toContain('sjt_release_grants')
    expect(sqlText(db.$queryRaw.mock.calls[3][0])).toContain('ORDER BY id FOR SHARE')
    expect(db.$queryRaw.mock.invocationCallOrder[3]).toBeLessThan(db.sjtReleaseGrant.findMany.mock.invocationCallOrder[0])
    expect(db.$queryRaw.mock.invocationCallOrder[3]).toBeLessThan(db.user.findUnique.mock.invocationCallOrder[0])
    expect(db.$queryRaw.mock.invocationCallOrder[3]).toBeLessThan(db.course.findUnique.mock.invocationCallOrder[0])
    expect(db.user.findUnique).toHaveBeenCalledTimes(1)
    expect(db.course.findUnique).toHaveBeenCalledTimes(1)
    expect(db.sjtAuthorRelease.findMany.mock.calls[0][0].select).not.toHaveProperty('package')
  })
  it('reuses already-locked exact release facts without redundant release reads or locks', async () => {
    await assertSjtCourseGrants(db as any, [release], scope, 'DISTRIBUTE', { lock: true, releaseLocked: true })
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    expect(db.sjtAuthorRelease.findMany).not.toHaveBeenCalled()
  })
  it.each(['instrumentKey', 'instrumentVersion', 'definitionHash', 'contentDigest', 'releaseId'])('rejects grant %s mismatch', async field => {
    db.sjtReleaseGrant.findMany.mockResolvedValue([{ ...grant, [field]: 'mismatch' }])
    await expect(assertSjtCourseGrants(db as any, [release], scope)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    { permission: 'ADAPT' }, { status: 'REVOKED' }, { granteeTeacherId: 'other' }, { courseId: 'other' },
    { purpose: 'RESEARCH' }, { validFrom: new Date(now.getTime() + 1) }, { expiresAt: now },
  ])('rejects wrong permission, recipient, purpose, status and time %j', async defect => {
    db.sjtReleaseGrant.findMany.mockResolvedValue([{ ...grant, ...defect }])
    await expect(assertSjtCourseGrants(db as any, [release], scope)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('never derives ADAPT from DISTRIBUTE or redistribution metadata', async () => {
    await expect(assertSjtCourseGrants(db as any, [{ ...release, redistribution: 'allowed' } as any], scope, 'ADAPT')).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    { creatorId: 'other', courseType: 'TRAINING_COURSE', isLibrary: false },
    { creatorId: 'teacher', courseType: 'LEGACY_COURSE', isLibrary: false },
    { creatorId: 'teacher', courseType: 'TRAINING_COURSE', isLibrary: true },
  ])('requires actual ownership of a non-library Training course %j', async course => {
    db.course.findUnique.mockResolvedValue(course)
    await expect(assertSjtCourseGrants(db as any, [release], scope)).rejects.toMatchObject({ statusCode: 403 })
    expect(db.sjtReleaseGrant.findMany).not.toHaveBeenCalled()
  })
  it.each([{ role: 'STUDENT' }, { isFrozen: true }, { isActive: false }, { teacherApproved: false }, { expiresAt: now }])('rejects invalid real teacher %j', async defect => {
    db.user.findUnique.mockResolvedValue({ ...teacher, ...defect })
    await expect(assertSjtCourseGrants(db as any, [release], scope)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('samples permission time after lock waits, rejecting an expiry crossed while blocked', async () => {
    db.$queryRaw.mockImplementation(async (query) => {
      if (sqlText(query).includes('sjt_release_grants')) vi.setSystemTime(new Date(now.getTime() + 2000))
      return []
    })
    await expect(assertSjtCourseGrants(db as any, [release], scope, 'DISTRIBUTE', { lock: true })).rejects.toMatchObject({ statusCode: 403 })
    expect(db.sjtReleaseGrant.findMany.mock.calls[0][0].where.expiresAt.gt).toEqual(new Date(now.getTime() + 2000))
  })
  it.each(['frozen', 'expired', 'owner', 'library'])('rechecks real scope once after lock wait: %s', async defect => {
    db.sjtReleaseGrant.findMany.mockResolvedValue([{ ...grant, expiresAt: new Date(now.getTime() + 10000) }])
    db.$queryRaw.mockImplementation(async query => {
      if (sqlText(query).includes('sjt_release_grants')) {
        if (defect === 'frozen') db.user.findUnique.mockResolvedValue({ ...teacher, isFrozen: true })
        if (defect === 'expired') {
          db.user.findUnique.mockResolvedValue({ ...teacher, expiresAt: new Date(now.getTime() + 1000) })
          vi.setSystemTime(new Date(now.getTime() + 2000))
        }
        if (defect === 'owner') db.course.findUnique.mockResolvedValue({ creatorId: 'other', courseType: 'TRAINING_COURSE', isLibrary: false })
        if (defect === 'library') db.course.findUnique.mockResolvedValue({ creatorId: 'teacher', courseType: 'TRAINING_COURSE', isLibrary: true })
      }
      return []
    })
    await expect(assertSjtCourseGrants(db as any, [release], scope, 'DISTRIBUTE', { lock: true })).rejects.toMatchObject({ statusCode: 403 })
    expect(db.user.findUnique).toHaveBeenCalledTimes(1)
    expect(db.course.findUnique).toHaveBeenCalledTimes(1)
    expect(db.sjtReleaseGrant.findMany).not.toHaveBeenCalled()
  })
  it('frozen receipts remain readable later but cannot claim admission outside their original interval', async () => {
    const receipt = (await assertSjtCourseGrants(db as any, [release], scope)).get('release')!
    vi.setSystemTime(new Date(now.getTime() + 100000))
    expect(sjtCourseGrantReceiptSchema.parse(receipt)).toEqual(receipt)
    expect(sjtCourseGrantReceiptSchema.safeParse({ ...receipt, admittedAt: grant.expiresAt.toISOString() }).success).toBe(false)
  })
})

describe('C13 grant administration and adaptation', () => {
  it('rechecks current ADMIN authority rather than trusting a stale actor flag', async () => {
    await expect(createSjtReleaseGrant(admin, release.id, { ...exactInput, ...scope,
      granteeTeacherId: 'teacher', permission: 'DISTRIBUTE', validFrom: grant.validFrom,
      expiresAt: grant.expiresAt, note: 'exact grant' })).rejects.toMatchObject({ statusCode: 403 })
    expect(db.sjtReleaseGrant.create).not.toHaveBeenCalled()
  })
  it('creates one explicit permission and records full immutable scope in the audit', async () => {
    db.user.findUnique.mockResolvedValueOnce({ ...teacher, role: 'ADMIN' })
    db.sjtReleaseGrant.create.mockResolvedValue(grant)
    await createSjtReleaseGrant(admin, release.id, { ...exactInput, granteeTeacherId: 'teacher',
      courseId: scope.courseId, purpose: scope.purpose, permission: 'DISTRIBUTE',
      validFrom: grant.validFrom, expiresAt: grant.expiresAt, note: grant.note })
    expect(db.sjtReleaseGrant.create).toHaveBeenCalledTimes(1)
    expect(db.sjtReleaseGrant.create.mock.calls[0][0].data).toMatchObject({ ...exactInput,
      releaseId: release.id, permission: 'DISTRIBUTE', grantorId: 'admin', courseId: 'course' })
    expect(db.sjtReleaseGrantAudit.create.mock.calls[0][0].data).toMatchObject({ action: 'CREATE', version: 1,
      snapshot: { definitionHash: release.definitionHash, permission: 'DISTRIBUTE', expiresAt: grant.expiresAt.toISOString() } })
  })
  it('revokes with CAS and never overwrites a stale grant revision', async () => {
    db.user.findUnique.mockResolvedValue({ ...teacher, role: 'ADMIN' })
    db.sjtReleaseGrant.findUnique.mockResolvedValue({ releaseId: 'release' })
    db.sjtReleaseGrant.updateMany.mockResolvedValue({ count: 0 })
    await expect(revokeSjtReleaseGrant(admin, 'grant', 9, 'withdraw')).rejects.toMatchObject({ statusCode: 409 })
    expect(db.sjtReleaseGrant.updateMany.mock.calls[0][0].where).toEqual({ id: 'grant', version: 9, status: 'ACTIVE' })
    expect(db.sjtReleaseGrantAudit.create).not.toHaveBeenCalled()
    expect(db.$queryRaw.mock.calls[0][0].join('')).toContain('sjt_author_releases')
    expect(db.$queryRaw.mock.calls[1][0].join('')).toContain('sjt_release_grants')
  })
  it('keeps catalogs scalar and standalone uploads limited to null policy', async () => {
    db.sjtAuthorRelease.findMany.mockResolvedValue([])
    await listSjtControlledReleases(actor)
    expect(db.sjtAuthorRelease.findMany.mock.calls[0][0].select).not.toHaveProperty('package')
    expect(db.sjtAuthorRelease.findMany.mock.calls[0][0].select).not.toHaveProperty('sourceDraft')
    await listUploadedSjtPackages()
    expect(db.sjtAuthorRelease.findMany.mock.calls[1][0].where).toEqual({ status: 'PUBLISHED', authorizationPolicy: null })
  })
  it('paginates release metadata with an opaque actor-bound cursor and no nested grant expansion', async () => {
    db.sjtAuthorRelease.findMany.mockResolvedValueOnce([{ ...release, id: 'newer' }, { ...release, id: 'older' }])
    const first = await listSjtControlledReleases(actor, { pageSize: 1 })
    expect(first.items).toHaveLength(1)
    expect(first.nextCursor).toEqual(expect.any(String))
    expect(db.sjtAuthorRelease.findMany.mock.calls[0][0]).toMatchObject({ take: 2,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    expect(db.sjtAuthorRelease.findMany.mock.calls[0][0].select).not.toHaveProperty('grants')
    db.sjtAuthorRelease.findMany.mockResolvedValueOnce([{ ...release, id: 'older' }])
    const second = await listSjtControlledReleases(actor, { pageSize: 1, cursor: first.nextCursor! })
    expect(second.items[0].id).toBe('older'); expect(second.nextCursor).toBeNull()
    expect(db.sjtAuthorRelease.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 'newer' }, skip: 1,
      where: { grants: { some: { granteeTeacherId: 'teacher' } } } })
    await expect(listSjtControlledReleases({ userId: 'other', admin: false }, { cursor: first.nextCursor! })).rejects.toMatchObject({ statusCode: 400 })
    await expect(listSjtReleaseGrants(actor, 'release', { cursor: first.nextCursor! })).rejects.toMatchObject({ statusCode: 400 })
    expect(db.sjtAuthorRelease.findMany).toHaveBeenCalledTimes(2)
  })
  it('paginates grants within one exact release and retains recipient filtering on every page', async () => {
    db.sjtReleaseGrant.findMany.mockResolvedValueOnce([{ ...grant, id: 'first-grant' }, { ...grant, id: 'next-grant' }])
    const first = await listSjtReleaseGrants(actor, 'release', { pageSize: 1 })
    expect(first.items).toHaveLength(1)
    const selection = db.sjtReleaseGrant.findMany.mock.calls[0][0].select
    expect(selection).not.toHaveProperty('audits'); expect(selection).not.toHaveProperty('snapshot')
    expect(selection).not.toHaveProperty('release')
    db.sjtReleaseGrant.findMany.mockResolvedValueOnce([{ ...grant, id: 'next-grant' }])
    const second = await listSjtReleaseGrants(actor, 'release', { pageSize: 1, cursor: first.nextCursor! })
    expect(second.nextCursor).toBeNull()
    expect(db.sjtReleaseGrant.findMany.mock.calls[1][0]).toMatchObject({
      where: { releaseId: 'release', granteeTeacherId: 'teacher' }, cursor: { id: 'first-grant' }, skip: 1,
    })
    await expect(listSjtReleaseGrants(actor, 'other-release', { cursor: first.nextCursor! })).rejects.toMatchObject({ statusCode: 400 })
  })
  it('strictly rejects unknown, malformed or unbounded pagination input before DB work', async () => {
    expect(sjtGrantListQuerySchema.parse({ pageSize: '100' })).toEqual({ pageSize: 100 })
    for (const query of [{ pageSize: '101' }, { pageSize: ['1'] }, { pageSize: 0 }, { all: 'true' }, { cursor: 'bad=' }])
      expect(sjtGrantListQuerySchema.safeParse(query).success).toBe(false)
    await expect(listSjtControlledReleases(actor, { cursor: 'not_json' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(listSjtControlledReleases(actor, { pageSize: 1000 })).rejects.toMatchObject({ statusCode: 400 })
    expect(db.sjtAuthorRelease.findMany).not.toHaveBeenCalled()
  })
  it('does not let a distribution grantee read an author template or create an adaptation', async () => {
    await expect(getSjtDraft(actor, sourceDraft.id)).rejects.toMatchObject({ statusCode: 403 })
    await expect(adaptSjtRelease(actor, release.id, adaptInput)).rejects.toMatchObject({ statusCode: 403 })
    expect(db.sjtAuthorDraft.create).not.toHaveBeenCalled()
  })
  it('requires a new version and exact grant CAS before creating a new source-bound draft', async () => {
    await expect(adaptSjtRelease(actor, release.id, { ...adaptInput, newInstrumentVersion: release.instrumentVersion })).rejects.toMatchObject({ statusCode: 409 })
    db.sjtReleaseGrant.findMany.mockResolvedValue([{ ...grant, permission: 'ADAPT' }])
    await expect(adaptSjtRelease(actor, release.id, { ...adaptInput, grantVersion: 8 })).rejects.toMatchObject({ statusCode: 409 })
    expect(db.sjtAuthorDraft.create).not.toHaveBeenCalled()
  })
  it('clears copied golden cases, freezes exact source and never writes the original release', async () => {
    db.sjtReleaseGrant.findMany.mockResolvedValue([{ ...grant, permission: 'ADAPT' }])
    db.sjtAuthorRelease.findUnique.mockResolvedValueOnce(release).mockResolvedValueOnce(null)
    const adapted = await adaptSjtRelease(actor, release.id, adaptInput)
    expect(adapted.id).toBe('adapted-draft')
    expect(adapted.authorizationPolicy).toBe('COURSE_GRANT_V1')
    expect((adapted.template as any).instrumentVersion).toBe('2.0.0')
    expect((adapted.template as any).cases).toEqual([])
    expect(adapted.adaptationSource).toMatchObject({ sourceDraftId: sourceDraft.id, sourceAuthorId: 'author',
      receipt: { grantId: grant.id, grantVersion: 1, permission: 'ADAPT', ...exactInput } })
    expect(db.sjtAuthorRelease.create).not.toHaveBeenCalled()
    expect(media.assertSjtAuthorMedia.mock.calls[0][3].adaptSource).toMatchObject({ sourceOwnerId: 'author', grantId: 'grant' })
    db.sjtAuthorDraft.findUnique.mockResolvedValue(adapted)
    await expect(requestSjtReview(actor, adapted.id, adapted.revision, adapted.contentDigest)).rejects.toThrow()
  })
  it('prevents policy downgrades and rejects stale policy CAS', async () => {
    db.sjtAuthorDraft.findUnique.mockResolvedValue({ ...sourceDraft, ownerId: 'teacher', status: 'DRAFT' })
    await expect(setSjtDraftPolicy(actor, 'draft', 1, null)).rejects.toMatchObject({ statusCode: 403 })
    await expect(setSjtDraftPolicy(actor, 'draft', 9, 'COURSE_GRANT_V1')).rejects.toMatchObject({ statusCode: 409 })
    expect(db.sjtAuthorDraft.updateMany).not.toHaveBeenCalled()
  })
})

describe('version copy retains current ADAPT authorization through commit', () => {
  it('locks the exact source grant and rejects a revocation observed under that lock before writing a copy', async () => {
    const receipt = { policy: 'COURSE_GRANT_V1', grantId: grant.id, grantVersion: grant.version,
      permission: 'ADAPT', releaseId: release.id, ...exactInput, courseId: scope.courseId, granteeTeacherId: scope.teacherId,
      purpose: scope.purpose, validFrom: grant.validFrom.toISOString(), expiresAt: grant.expiresAt.toISOString(), admittedAt: now.toISOString() }
    const adapted = { ...sourceDraft, id: 'adapted-published', ownerId: actor.userId,
      template: { ...template, instrumentVersion: '2.0.0' },
      adaptationSource: { protocol: 'sjt-adaptation-v1', receipt, sourceDraftId: sourceDraft.id, sourceAuthorId: 'author' } }
    db.sjtAuthorDraft.findUnique.mockImplementation(({where}) => where.id === adapted.id ? adapted : sourceDraft)
    db.sjtReleaseGrant.findMany.mockResolvedValue([{ ...grant, permission: 'ADAPT' }])
    db.$queryRaw.mockImplementation(async (sql: any) => {
      if (sqlText(sql).includes('sjt_release_grants')) {
        db.sjtReleaseGrant.findMany.mockResolvedValue([{ ...grant, permission: 'ADAPT', status: 'REVOKED' }])
      }
      return []
    })
    const {forkSjtDraftVersion} = await import('../../modules/situational/authoring/service')
    await expect(forkSjtDraftVersion(actor, adapted.id)).rejects.toMatchObject({statusCode: 403})
    expect(db.$queryRaw.mock.calls.some(([sql]) => sqlText(sql).includes('sjt_release_grants'))).toBe(true)
    expect(db.sjtAuthorDraft.create).not.toHaveBeenCalled()
    expect(db.sjtAuthorAudit.create).not.toHaveBeenCalled()
  })
})
