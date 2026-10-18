import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { scaleDefinitionFor } from '../integration/mini-scale-definition'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
const url = integrationDatabaseUrl('INSTRUMENT_FINAL_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
let db: typeof import('../../config/database')['prisma']
let run: typeof import('../../modules/scale/scale-import.service')['importScaleCsv']
let copy: typeof import('../../modules/scale/scale-copy.service')['copyScaleToDraft']
const users: string[] = []
const content = 'item_code,prompt,reverse,score_keys,response_set_key\nQ2,Imported,true,total,default'
async function fixture(patch: any = {}) {
  const user = await db.user.create({ data: { username: 'c08-' + randomUUID(), passwordHash: 'synthetic-only', role: 'TEACHER' } }); users.push(user.id)
  const definition = scaleDefinitionFor(1, 'Q')
  const scale = await db.scale.create({ data: { code: randomUUID(), name: 'Import fixture', creatorId: user.id, status: 'DRAFT', instrumentClass: 'CUSTOM_DESCRIPTIVE', definition: definition as any, definitionHash: hashScaleDefinition(definition), ...patch } })
  const actor = { userId: user.id, role: 'TEACHER' }, input = { content, expectedUpdatedAt: scale.updatedAt.toISOString() }
  return { scale, actor, input }
}
suite('Scale import PostgreSQL atomicity and governance', () => {
  beforeAll(async () => { process.env.DATABASE_URL = url!; db = (await import('../../config/database')).prisma; run = (await import('../../modules/scale/scale-import.service')).importScaleCsv; copy = (await import('../../modules/scale/scale-copy.service')).copyScaleToDraft })
  afterAll(async () => { if (!db) return; const ids = (await db.scale.findMany({ where: { creatorId: { in: users } }, select: { id: true } })).map(x => x.id); await db.assetReference.deleteMany({ where: { entityType: 'ScaleCopyDraft', entityId: { in: ids } } }); await db.assessmentManagementEvent.deleteMany({ where: { resourceId: { in: ids } } }); await db.scale.deleteMany({ where: { id: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect() })
  it('previews read-only, atomically appends and audits hashes/count without storing source CSV', async () => {
    const { scale, actor, input } = await fixture()
    const pre: any = await run(scale.id, actor, input, false)
    expect(await db.scale.findUnique({ where: { id: scale.id } })).toEqual(scale)
    expect(await db.assessmentManagementEvent.count({ where: { resourceId: scale.id } })).toBe(0)
    const saved: any = await run(scale.id, actor, { ...input, digest: pre.digest, previewToken: pre.previewToken, previewExpiresAt: pre.previewExpiresAt }, true)
    expect(saved.definition.items.map((i: any) => i.itemCode)).toEqual(['Q-1', 'Q2'])
    expect(saved.updatedAt.getTime()).toBeGreaterThan(scale.updatedAt.getTime())
    const events = await db.assessmentManagementEvent.findMany({ where: { resourceId: scale.id } })
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ action: 'SCALE_IMPORT', actorId: actor.userId })
    expect(events[0].metadata).toMatchObject({ count: 1, sourceBytes: Buffer.byteLength(content), digest: pre.digest })
    expect(JSON.stringify(events)).not.toContain('Imported'); expect(JSON.stringify(events)).not.toContain('item_code')
    await expect(run(scale.id, actor, { ...input, digest: pre.digest, previewToken: pre.previewToken, previewExpiresAt: pre.previewExpiresAt }, true)).rejects.toMatchObject({ status: 409 })
    expect(await db.assessmentManagementEvent.count({ where: { resourceId: scale.id } })).toBe(1)
  })
  it('rejects raw-content changes even when parsed rows are identical, altered digest and stale revisions', async () => {
    const { scale, actor, input } = await fixture(); const pre: any = await run(scale.id, actor, input, false)
    for (const body of [{ ...input, content: content + '\n', digest: pre.digest, previewToken: pre.previewToken, previewExpiresAt: pre.previewExpiresAt }, { ...input, digest: '0'.repeat(64), previewToken: pre.previewToken, previewExpiresAt: pre.previewExpiresAt }, { ...input, expectedUpdatedAt: new Date(0).toISOString(), digest: pre.digest, previewToken: pre.previewToken, previewExpiresAt: pre.previewExpiresAt }])
      await expect(run(scale.id, actor, body, true)).rejects.toMatchObject({ status: 409 })
    expect(await db.scale.findUnique({ where: { id: scale.id } })).toEqual(scale)
    expect(await db.assessmentManagementEvent.count({ where: { resourceId: scale.id } })).toBe(0)
  })
  it('rejects forged, cross-actor, expired proofs and a changed base even with an unchanged timestamp', async () => {
    const { scale, actor, input } = await fixture(); const pre: any = await run(scale.id, actor, input, false)
    const confirmation = { ...input, digest: pre.digest, previewToken: pre.previewToken, previewExpiresAt: pre.previewExpiresAt }
    await expect(run(scale.id, actor, { ...confirmation, previewToken: '0'.repeat(64) }, true)).rejects.toMatchObject({ status: 409 })
    await expect(run(scale.id, { userId: randomUUID(), role: 'ADMIN' }, confirmation, true)).rejects.toMatchObject({ status: 409 })
    const now = vi.spyOn(Date, 'now').mockReturnValue(pre.previewExpiresAt + 1)
    try { await expect(run(scale.id, actor, confirmation, true)).rejects.toMatchObject({ status: 409 }) } finally { now.mockRestore() }
    await db.scale.update({ where: { id: scale.id }, data: { definition: { ...(scale.definition as any), source: { title: 'Changed source' } }, updatedAt: scale.updatedAt } })
    await expect(run(scale.id, actor, confirmation, true)).rejects.toMatchObject({ status: 409 })
    expect(await db.assessmentManagementEvent.count({ where: { resourceId: scale.id } })).toBe(0)
  })
  it('concurrent confirmations accept exactly once and reject the loser without partial writes', async () => {
    const { scale, actor, input } = await fixture(); const pre: any = await run(scale.id, actor, input, false)
    const results = await Promise.allSettled([run(scale.id, actor, { ...input, digest: pre.digest, previewToken: pre.previewToken, previewExpiresAt: pre.previewExpiresAt }, true), run(scale.id, actor, { ...input, digest: pre.digest, previewToken: pre.previewToken, previewExpiresAt: pre.previewExpiresAt }, true)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
    expect(await db.assessmentManagementEvent.count({ where: { resourceId: scale.id } })).toBe(1)
    expect((await db.scale.findUniqueOrThrow({ where: { id: scale.id } })).itemCount).toBe(2)
  })
  it('rejects non-owner use, STANDARD, published and revoked copied-source licenses', async () => {
    const { scale, actor, input } = await fixture()
    await expect(run(scale.id, { userId: randomUUID(), role: 'TEACHER' }, input, false)).rejects.toMatchObject({ status: 403 })
    for (const patch of [{ instrumentClass: 'STANDARD' }, { status: 'PUBLISHED' }]) {
      const f = await fixture(patch); await expect(run(f.scale.id, f.actor, f.input, false)).rejects.toMatchObject({ status: 409 })
    }
    await db.scale.update({ where: { id: scale.id }, data: { status: 'PUBLISHED' } }); const draft = await copy(scale.id, actor.userId)
    await db.scale.update({ where: { id: scale.id }, data: { definition: { ...(scale.definition as any), license: { status: 'self_authored', redistribution: 'restricted' } } } })
    await expect(run(draft.id, actor, { ...input, expectedUpdatedAt: draft.updatedAt.toISOString() }, false)).rejects.toMatchObject({ status: 409 })
  })
  it('rolls back the definition when the required audit insertion fails', async () => {
    const { scale, input } = await fixture(); const actor = { userId: randomUUID(), role: 'ADMIN' }
    const pre: any = await run(scale.id, actor, input, false)
    await expect(run(scale.id, actor, { ...input, digest: pre.digest, previewToken: pre.previewToken, previewExpiresAt: pre.previewExpiresAt }, true)).rejects.toMatchObject({ code: 'P2003' })
    expect(await db.scale.findUnique({ where: { id: scale.id } })).toEqual(scale)
  })
})
