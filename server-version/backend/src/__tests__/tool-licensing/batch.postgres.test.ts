import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../config/database'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createToolLicenseBatch, previewToolLicenseBatch } from '../../modules/tool-licensing/batch'
import { authorizeToolPublication } from '../../modules/tool-licensing/runtime'
import { listToolLicenses, readOwnToolLicense, createToolLicense, editToolLicense, readToolLicense, terminateToolLicense } from '../../modules/tool-licensing/management'

const db = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/no_database')
const isolated = ['localhost', '127.0.0.1'].includes(db.hostname)
  && db.pathname === '/tool_licensing_batch_test_20261127' && process.env.TOOL_LICENSING_TEST_DB === '1'
const prefix = 'batch-license-fixture-' + randomUUID()
const toolKey = 'SCALE:' + prefix
const adminIds = [randomUUID(), randomUUID()]
const measurements:string[]=[]
const schoolIds = Array.from({ length: 71 }, () => randomUUID())
const actor = (index = 0) => ({
  actorUserId: adminIds[index],
  actorSession: { adminSessionId: randomUUID(), adminVerifiedAt: Math.floor(Date.now() / 1000),
    adminAuthenticationMethod: 'TOTP' as const, tokenVersion: 0 },
})
const draft = (subjectIds: string[]) => ({
  requestId: randomUUID(), product: 'SCHOOL', subjectIds,
  startsAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  reason: '合成批量许可验收', tools: [{ key: toolKey, limit: 6 }],
})
const singleDraft = (batch: ReturnType<typeof draft>, subjectId: string, requestId: string = randomUUID()) => {
  const { subjectIds: _subjectIds, ...rest } = batch
  return { ...rest, requestId, subjectId }
}
const countIssued = async (subjectIds: string[]) =>
  prisma.toolLicense.count({ where: { product: 'SCHOOL', subjectId: { in: subjectIds } } })

describe.skipIf(!isolated)('bulk tool licensing on isolated PostgreSQL', () => {
  beforeAll(async () => {
    if (process.env.PERF_SQL_EVENT_COUNT === '1') {
      const events = prisma as unknown as { $on(type:'query', cb:(event:{query:string})=>void):void }
      events.$on('query', event => measurements.push(event.query))
    }
    await prisma.user.createMany({ data: adminIds.map((id, index) => ({
      id, username: prefix + '-admin-' + index, passwordHash: '-', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN',
    })) })
    for (const [index, id] of schoolIds.entries()) {
      await prisma.organization.create({
        data: { id, name: prefix + '-school-' + index, productDomain: 'SCHOOL', createdByUserId: adminIds[0] },
      })
      await prisma.$executeRaw`
        INSERT INTO education_product_entitlements (organization_id,product,granted_by_user_id)
        VALUES (${id},'HUISCHOOL',${adminIds[0]})
      `
    }
    const measurement = randomUUID()
    const standard = randomUUID()
    const trial = randomUUID()
    const contentHash = 'b'.repeat(64)
    const combinationHash = randomUUID().replace(/-/g, '').repeat(2)
    await prisma.measurementContentRelease.create({ data: {
      id: measurement, layer: 'MEASUREMENT', family: 'SCALE', key: prefix, version: '1.0.0', hashScheme: 'SHA256',
      contentHash, content: {}, scope: { kind: 'PLATFORM' }, assetRefs: [], publishedBy: adminIds[0],
    } })
    await prisma.scale.create({ data: { code: prefix, name: prefix, creatorId: adminIds[0], status: 'PUBLISHED',
      instrumentClass: 'STANDARD', instrumentVersion: '1.0.0', measurementReleaseId: measurement } })
    await prisma.$executeRaw`
      INSERT INTO survey_standard_releases (id,tool_key,combination_hash,snapshot,reference,state,approved_by)
      VALUES (${standard},${prefix},${combinationHash},
        jsonb_build_object('instrumentVersion','1.0.0','title',${prefix}::text),'{}','APPROVED',${adminIds[0]})
    `
    await prisma.$executeRaw`
      INSERT INTO survey_standard_trials(id,release_id,run_id,case_index,answers,scores,report,record_hash)
      SELECT ${trial}||case_index,${standard},${trial},case_index,'[]','{}','{}',${contentHash}
      FROM generate_series(0,2) case_index
    `
    await prisma.$executeRaw`
      UPDATE survey_standard_releases SET state='ONLINE',latest_trial=${trial},
        measurement_release=jsonb_build_object('releaseId',${measurement}::text,'contentHash',${contentHash}::text)
      WHERE id=${standard}
    `
    await prisma.surveyToolPolicy.create({ data: {
      product: 'SCHOOL', resourceKey: 'standard-release:' + standard, fingerprint: combinationHash,
      decision: 'APPROVED', reason: '合成目录', reviewedBy: adminIds[0],
    } })
  })

  afterAll(() => prisma.$disconnect())

  it('previews named recipients and exact products, issues both, and replays the original audited receipts after edits', async () => {
    const request = draft(schoolIds.slice(0, 2))
    const review = await previewToolLicenseBatch(actor(), request)
    expect(review.conflicts).toEqual([])
    expect(review.previewDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(review.subjects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: schoolIds[0], label: prefix + '-school-0' }),
      expect.objectContaining({ id: schoolIds[1], label: prefix + '-school-1' }),
    ]))
    expect(review.tools).toEqual([{ key: toolKey, name: prefix, family: 'SCALE', limit: 6 }])
    const issue = { ...request, previewDigest: review.previewDigest }
    const first = await createToolLicenseBatch(actor(), issue)
    expect(first.licenses).toHaveLength(2)
    expect(await countIssued(request.subjectIds)).toBe(2)
    expect(first.licenses.every(license => license.status === 'ACTIVE' && license.revision === 1
      && license.tools[0].limit === 6 && license.tools[0].used === 0)).toBe(true)

    await editToolLicense(actor(), first.licenses[0].id, {
      expectedRevision: 1, reason: '合成调整', tools: [{ key: toolKey, limit: 2 }],
    })
    await terminateToolLicense(actor(), first.licenses[1].id, { expectedRevision: 1, reason: '合成终止' })
    expect((await readToolLicense(first.licenses[0].id)).tools[0].limit).toBe(2)
    expect((await readToolLicense(first.licenses[1].id)).status).toBe('TERMINATED')
    await expect(createToolLicenseBatch(actor(), { ...issue, subjectIds: [...request.subjectIds].reverse() }))
      .resolves.toEqual(first)
    await expect(createToolLicenseBatch(actor(), { ...issue, reason: '申请内容已改变' }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(await countIssued(request.subjectIds)).toBe(2)
  })

  it('rejects a stale preview if a subject name changes and previews an ineligible recipient without disclosing its name', async () => {
    const request = draft(schoolIds.slice(2, 4))
    const review = await previewToolLicenseBatch(actor(), request)
    await prisma.organization.update({ where: { id: schoolIds[2] }, data: { name: prefix + '-renamed' } })
    await expect(createToolLicenseBatch(actor(), { ...request, previewDigest: review.previewDigest }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(await countIssued(request.subjectIds)).toBe(0)

    const otherId = randomUUID()
    const unavailable = draft([schoolIds[2], otherId])
    const unavailableReview = await previewToolLicenseBatch(actor(), unavailable)
    expect(unavailableReview.subjects).toMatchObject([{ id: schoolIds[2], label: prefix + '-renamed' }])
    expect(unavailableReview.conflicts).toMatchObject([{ subjectId: otherId, label: '待核对对象' }])
    await expect(createToolLicenseBatch(actor(), { ...unavailable, previewDigest: unavailableReview.previewDigest }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(await countIssued(unavailable.subjectIds)).toBe(0)
  })

  it('coordinates a racing single issue and batch for one recipient without issuing a partial batch', async () => {
    const request = draft(schoolIds.slice(4, 6))
    const review = await previewToolLicenseBatch(actor(), request)
    const [batch, single] = await Promise.allSettled([
      createToolLicenseBatch(actor(), { ...request, previewDigest: review.previewDigest }),
      createToolLicense(actor(1), singleDraft(request, schoolIds[5])),
    ])
    expect([batch, single].filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect([batch, single].filter(result => result.status === 'rejected').map(result => result.reason.statusCode)).toEqual([409])
    expect(await countIssued(request.subjectIds)).toBe(batch.status === 'fulfilled' ? 2 : 1)
    const newReview = await previewToolLicenseBatch(actor(), draft(request.subjectIds))
    expect(newReview.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ subjectId: schoolIds[5], label: prefix + '-school-5', reason: expect.stringContaining('重叠') }),
    ]))
  })

  it('rolls back the first receipt when a later deterministic receipt ID conflicts', async () => {
    const request = draft(schoolIds.slice(6, 8))
    const later = [...request.subjectIds].sort()[1]
    const hash = canonicalHash({ scope: 'tool-license-batch-receipt', requestId: request.requestId, subjectId: later })
    const collisionId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
    await createToolLicense(actor(1), singleDraft(request, schoolIds[8], collisionId))
    const review = await previewToolLicenseBatch(actor(), request)
    expect(review.conflicts).toEqual([])
    await expect(createToolLicenseBatch(actor(), { ...request, previewDigest: review.previewDigest }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(await countIssued(request.subjectIds)).toBe(0)
    expect(await prisma.toolLicense.findUnique({ where: { id: request.requestId } })).toBeNull()
    expect((await readToolLicense(collisionId)).subjectId).toBe(schoolIds[8])
  })

  it.each([[2,9],[10,11],[50,21]])('issues %i recipients and measures the reviewed batch', async (size,offset) => {
    const request = draft(schoolIds.slice(offset,offset+size))
    measurements.length=0
    const start=performance.now()
    const preview=await previewToolLicenseBatch(actor(),request)
    const confirm=performance.now()
    const issued=await createToolLicenseBatch(actor(),{...request,previewDigest:preview.previewDigest})
    const end=performance.now()
    expect(issued.licenses).toHaveLength(size)
    if (process.env.PERF_SQL_EVENT_COUNT === '1') {
      const reads=measurements.filter(sql=>/FROM organizations o WHERE o.product_domain/.test(sql)).length
      const writes=measurements.filter(sql=>/INSERT INTO tool_license(?:s|_items|_events)\s*\(/i.test(sql)).length
      console.info('LICENSE_BATCH_MEASURE',JSON.stringify({size,reads,writes,previewMs:confirm-start,issueMs:end-confirm}))
      expect(reads).toBe(2)
      expect(writes).toBe(3)
    }
  })

  it('shows reservations, identifies quota conflicts, and distinguishes continuous renewals from gaps',async()=>{
    const ids=schoolIds.slice(9,11)
    const licenses=await prisma.toolLicense.findMany({where:{subjectId:{in:ids}}})
    const license=licenses[0]
    const close=new Date(Date.now()+60_000)
    const previous=process.env.SCHOOL_TOOL_LICENSING_ENABLED
    process.env.SCHOOL_TOOL_LICENSING_ENABLED='true'
    try {
      const publish=(quantity:number)=>prisma.$transaction(tx=>authorizeToolPublication(tx,{
        product:'SCHOOL',subjectId:license.subjectId,toolKeys:[toolKey],publicationId:randomUUID(),
        education:{closesAt:close,maxResponses:quantity,frozenResponses:quantity},
      }))
      await publish(4)
      await expect(publish(3)).rejects.toThrow('本次需要预留 3 份，可用 2 份')
      const own=await readOwnToolLicense('SCHOOL',license.subjectId,adminIds[0])
      expect(own.license?.tools[0]).toMatchObject({limit:6,used:4,reserved:4})
      for(const [index,current] of licenses.entries()){
        const next={...singleDraft(draft(ids),current.subjectId),
          startsAt:new Date(current.expiresAt.getTime()+index*86400000).toISOString(),
          expiresAt:new Date(current.expiresAt.getTime()+7*86400000).toISOString()}
        const issued=await createToolLicense(actor(),next)
        const list=await listToolLicenses({product:'SCHOOL',subjectId:current.subjectId,status:'EXPIRING'})
        expect(list.list[0]).toMatchObject({nextLicenseId:index===0?issued.id:null,missingTools:[]})
      }
    } finally {
      if(previous===undefined)delete process.env.SCHOOL_TOOL_LICENSING_ENABLED
      else process.env.SCHOOL_TOOL_LICENSING_ENABLED=previous
    }
  })

  it('invalidates an uncommitted batch when its only native scale is stopped after preview', async () => {
    const request = draft(schoolIds.slice(2, 4))
    const review = await previewToolLicenseBatch(actor(), request)
    expect(review.conflicts).toEqual([])
    const scale = await prisma.scale.findUniqueOrThrow({ where: { code: prefix } })
    await prisma.$executeRaw`
      INSERT INTO scale_library_emergency_stops(target_kind,target_id,actor_id,reason)
      VALUES ('TRAINING_SCALE',${scale.id},${adminIds[0]},'合成停用回归')
    `
    await expect(createToolLicenseBatch(actor(), { ...request, previewDigest: review.previewDigest }))
      .rejects.toMatchObject({ statusCode: 409 })
    await expect(previewToolLicenseBatch(actor(), request)).rejects.toMatchObject({ statusCode: 403 })
    expect(await countIssued(request.subjectIds)).toBe(0)
  })
})
