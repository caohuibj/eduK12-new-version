import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

const enabled = process.env.ADMIN_PERMISSIONS_ISOLATED_TEST === '1'
const suite = enabled ? describe : describe.skip
let db: typeof import('../../config/database')['prisma']
let service: typeof import('../../modules/admin-permissions/service')
let systemId: string, legacyId: string, teacherId: string
suite('explicit entry grants, real PostgreSQL', () => {
  beforeAll(async () => {
    if (!/eduk12_admin_permissions_/.test(new URL(process.env.DATABASE_URL!).pathname))
      throw new Error('Dedicated disposable admin-permissions database required')
    db = (await import('../../config/database')).prisma
    service = await import('../../modules/admin-permissions/service')
    for (const kind of ['system', 'legacy', 'teacher']) {
      const u = await db.user.create({ data: { username: 'admin-test-' + randomUUID(), passwordHash: 'unusable-synthetic-hash',
        role: kind === 'teacher' ? 'TEACHER' : 'ADMIN', platformRole: kind === 'system' ? 'SYSTEM_ADMIN' : 'STANDARD' } })
      if (kind === 'system') systemId = u.id
      if (kind === 'legacy') legacyId = u.id
      if (kind === 'teacher') teacherId = u.id
    }
  })
  afterAll(async () => { await db?.$disconnect() })
  const change = (entry: 'TRAINING' | 'SURVEY', active: boolean, expectedVersion: number, actorUserId = systemId) =>
    service.changeEntryGrant({ actorUserId, actorSession:{tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()},targetUserId: teacherId, entry, active, expectedVersion, reason: 'synthetic integration fixture' })
  it('default deny: old ADMIN is not system or entry administrator', async () => {
    await expect(service.assertEntryAdmin(db, legacyId, 'TRAINING')).rejects.toMatchObject({ statusCode: 403 })
    await expect(change('TRAINING', true, 0, legacyId)).rejects.toMatchObject({ statusCode: 403 })
    expect(await db.adminEntryGrant.count({ where: { userId: legacyId } })).toBe(0)
  })
  it('one entry does not confer another entry or alter business identity', async () => {
    expect(await change('TRAINING', true, 0)).toMatchObject({ version: 1, changed: true })
    await service.assertEntryAdmin(db, teacherId, 'TRAINING')
    await expect(service.assertEntryAdmin(db, teacherId, 'SURVEY')).rejects.toMatchObject({ statusCode: 403 })
    expect(await db.user.findUniqueOrThrow({ where: { id: teacherId } })).toMatchObject({ role: 'TEACHER', platformRole: 'STANDARD', tokenVersion: 1 })
  })
  it('a retry is idempotent; conflicting stale state is rejected', async () => {
    expect(await change('TRAINING', true, 0)).toMatchObject({ version: 1, changed: false })
    await expect(change('TRAINING', false, 0)).rejects.toMatchObject({ statusCode: 409 })
    expect(await db.adminAuthorizationAudit.count({ where: { targetUserId: teacherId } })).toBe(1)
  })
  it('multi-entry authority is explicit; revoke preserves the other grant', async () => {
    await change('SURVEY', true, 0)
    await change('TRAINING', false, 1)
    await expect(service.assertEntryAdmin(db, teacherId, 'TRAINING')).rejects.toMatchObject({ statusCode: 403 })
    await service.assertEntryAdmin(db, teacherId, 'SURVEY')
    expect(await db.user.findUniqueOrThrow({ where: { id: teacherId } })).toMatchObject({ tokenVersion: 3 })
  })
  async function invitationAfterEntryLock(expireWhileWaiting: boolean) {
    const { inviteResearcher } = await import('../../modules/survey/governance.service')
    const actor = await db.user.create({ data: { username: 'admin-expiry-' + randomUUID(),
      passwordHash: 'unusable-synthetic-hash', role: 'TEACHER' } })
    await service.changeEntryGrant({ actorUserId: systemId, actorSession: { tokenVersion: 0,
      adminVerifiedAt: Math.floor(Date.now()/1000), adminSessionId: randomUUID() },
      targetUserId: actor.id, entry: 'SURVEY', active: true, expectedVersion: 0, reason: 'synthetic expiry race' })
    const [{ expiresAt }] = await db.$queryRaw<Array<{ expiresAt: Date }>>`
      UPDATE "users" SET "expires_at"=clock_timestamp()+
        CASE WHEN ${expireWhileWaiting} THEN interval '2 seconds' ELSE interval '60 seconds' END
      WHERE "id"=${actor.id} RETURNING "expires_at" AS "expiresAt"`
    let pending: Promise<PromiseSettledResult<Awaited<ReturnType<typeof inviteResearcher>>>> | undefined
    let outcome: Awaited<typeof pending>
    try {
      await db.$transaction(async holder => {
        const [{ pid }] = await holder.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
        await holder.$queryRaw`SELECT "id" FROM "users" WHERE "id"=${actor.id} FOR UPDATE`
        pending = inviteResearcher(actor.id).then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }))
        let observed = false
        for (let attempt=0; attempt<100; attempt++) {
          // Refresh activity within this same holder connection, not a third actor.
          await holder.$queryRaw`SELECT pg_stat_clear_snapshot()::text`
          const [waiting] = await holder.$queryRaw<Array<{ startedWhileValid: boolean }>>`
            SELECT a.query_start < ${expiresAt}::timestamptz AS "startedWhileValid"
            FROM pg_stat_activity a WHERE a.datname=current_database()
              AND ${pid}=ANY(pg_blocking_pids(a.pid)) AND a.query LIKE '%admin_entry_grants%'`
          if (waiting) { expect(waiting.startedWhileValid).toBe(true); observed=true; break }
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        expect(observed, 'entry authorization must actually wait on the other PostgreSQL connection').toBe(true)
        if (expireWhileWaiting) await holder.$queryRaw`
          SELECT pg_sleep((GREATEST(0, EXTRACT(EPOCH FROM (${expiresAt}::timestamptz-clock_timestamp())))+0.05)::double precision)::text`
        const [{ expired }] = await holder.$queryRaw<Array<{ expired: boolean }>>`
          SELECT clock_timestamp() >= ${expiresAt}::timestamptz AS expired`
        expect(expired).toBe(expireWhileWaiting)
      }, { timeout: 10000 })
    } finally { if (pending) outcome = await pending }
    return { outcome: outcome!,
      invitations: await db.surveyInvitation.count({ where: { createdBy: actor.id } }),
      events: await db.surveyEvent.count({ where: { actorUserId: actor.id } }) }
  }
  it('denies a Survey invitation after the actor expires during the actual entry lock wait', async () => {
    const result = await invitationAfterEntryLock(true)
    expect({ status: result.outcome.status, invitations: result.invitations, events: result.events })
      .toEqual({ status: 'rejected', invitations: 0, events: 0 })
    if (result.outcome.status === 'rejected') expect(result.outcome.reason).toMatchObject({ statusCode: 403 })
  }, 10000)
  it('allows the same Survey invitation while the actor remains valid after an actual lock wait', async () => {
    const result = await invitationAfterEntryLock(false)
    expect({ status: result.outcome.status, invitations: result.invitations, events: result.events })
      .toEqual({ status: 'fulfilled', invitations: 1, events: 1 })
    if (result.outcome.status === 'fulfilled') expect(result.outcome.value.kind).toBe('INVITE')
  }, 10000)
  it('stale racing re-grants cannot undo committed revocation', async () => {
    let revoke!:ReturnType<typeof change>,stale!:ReturnType<typeof change>
    const blocked=async(count:number)=>{
      for(let attempt=0;attempt<100;attempt++){
        const [row]=await db.$queryRaw<Array<{count:number}>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%"platform_role"::text AS "platformRole"%'`
        if(row.count>=count)return
        await new Promise(resolve=>setTimeout(resolve,10))
      }
      throw new Error('Expected permission mutation did not reach its actual row lock')
    }
    await db.$transaction(async blocker=>{
      await blocker.$queryRaw`SELECT "id" FROM "users" WHERE "id"=${systemId} FOR UPDATE`
      revoke=change('SURVEY',false,1);await blocked(1)
      stale=change('SURVEY',true,0);await blocked(2)
    })
    const result = await Promise.allSettled([revoke,stale])
    expect(result[0].status).toBe('fulfilled')
    expect(result[1].status).toBe('rejected')
    expect((result[1] as PromiseRejectedResult).reason).toMatchObject({statusCode:409})
    await expect(service.assertEntryAdmin(db, teacherId, 'SURVEY')).rejects.toMatchObject({ statusCode: 403 })
    expect((await db.adminEntryGrant.findUniqueOrThrow({ where: { userId_entry: { userId: teacherId, entry: 'SURVEY' } } })).version).toBe(2)
  })
  it('ordinary admins cannot grant themselves system authority; audits are immutable', async () => {
    await expect(change('TRAINING', true, 2, teacherId)).rejects.toMatchObject({ statusCode: 403 })
    const event = await db.adminAuthorizationAudit.findFirstOrThrow({ where: { targetUserId: teacherId } })
    await expect(db.adminAuthorizationAudit.update({ where: { id: event.id }, data: { reason: 'tampered' } })).rejects.toThrow()
    await expect(db.adminAuthorizationAudit.delete({ where: { id: event.id } })).rejects.toThrow()
    await expect(db.$executeRawUnsafe('TRUNCATE TABLE "admin_authorization_audits"')).rejects.toThrow()
  })
  it('an audit insertion failure rolls back the grant and token version',async()=>{
    const before=await db.user.findUniqueOrThrow({where:{id:teacherId}})
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION admin_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='synthetic audit failure' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`)
    await db.$executeRawUnsafe('CREATE TRIGGER admin_test_reject_audit BEFORE INSERT ON admin_authorization_audits FOR EACH ROW EXECUTE FUNCTION admin_test_reject_audit()')
    try{
      await expect(service.changeEntryGrant({actorUserId:systemId,actorSession:{tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()},targetUserId:teacherId,entry:'TRAINING',active:true,expectedVersion:2,reason:'synthetic audit failure'})).rejects.toThrow()
      expect((await db.user.findUniqueOrThrow({where:{id:teacherId}})).tokenVersion).toBe(before.tokenVersion)
      await expect(service.assertEntryAdmin(db,teacherId,'TRAINING')).rejects.toMatchObject({statusCode:403})
      expect((await db.adminEntryGrant.findUniqueOrThrow({where:{userId_entry:{userId:teacherId,entry:'TRAINING'}}})).version).toBe(2)
    }finally{
      await db.$executeRawUnsafe('DROP TRIGGER admin_test_reject_audit ON admin_authorization_audits')
      await db.$executeRawUnsafe('DROP FUNCTION admin_test_reject_audit()')
    }
  })
  it('requires recent key proof and current system status together',async()=>{
    const input={actorUserId:systemId,targetUserId:teacherId,entry:'TRAINING' as const,active:true,expectedVersion:2,reason:'synthetic strong auth'}
    await expect(service.changeEntryGrant({...input,actorSession:{tokenVersion:0}})).rejects.toMatchObject({statusCode:403})
    await db.user.update({where:{id:systemId},data:{platformRole:'STANDARD'}})
    await expect(change('TRAINING',true,2)).rejects.toMatchObject({statusCode:403})
    expect(await db.adminEntryGrant.count({where:{userId:teacherId,revokedAt:null}})).toBe(0)
  })
})
