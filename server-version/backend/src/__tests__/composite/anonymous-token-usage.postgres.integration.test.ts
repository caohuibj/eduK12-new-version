import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { claimAnonymousTokenUsage, withAnonymousTokenUsage } from '../../modules/composite/anonymous-token-usage'
import { integrationDatabaseUrl, requireIsolatedReleaseDatabase } from '../integration/integration-env'

const url = integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite = url ? describe : describe.skip
suite('durable anonymous token quota shards / isolated PostgreSQL', () => {
  let db: typeof import('../../config/database')['prisma']
  let runtime: typeof import('../../modules/composite/composite.service')
  let ownerId: string, compositeId: string
  beforeAll(async () => {
    requireIsolatedReleaseDatabase(url!)
    ;({prisma:db}=await import('../../config/database'))
    runtime=await import('../../modules/composite/composite.service')
    const owner=await db.user.create({data:{username:'token-shards-'+randomUUID(),passwordHash:'SYNTHETIC NONLOGIN',role:'TEACHER'}})
    ownerId=owner.id
    const parent=await db.compositeAssessment.create({data:{code:randomUUID(),name:'Synthetic anonymous quota',createdBy:ownerId,
      productKind:'QUESTIONNAIRE',questionnaireType:'GENERAL',status:'DRAFT',publicEnabled:true,maxAttempts:0,
      formSections:{create:{title:'Synthetic input',position:0,contextSection:false}}},include:{formSections:true}})
    compositeId=parent.id
    await db.compositeAssessmentItem.create({data:{compositeAssessmentId:compositeId,type:'FORM',required:true,position:0,
      formSectionId:parent.formSections[0].id,formSectionPosition:0,formType:'text_input',formLabel:'Synthetic input'}})
    await db.compositeAssessment.update({where:{id:compositeId},data:{status:'PUBLISHED',publishedAt:new Date()}})
  },60000)
  afterAll(async()=>{
    if(!db)return
    await (await import('../../config/queue')).closeQueues(true)
    await db.$disconnect()
  })
  const token=async(maxUses=0)=>runtime.createAccessTokenForComposite(ownerId,'TEACHER',compositeId,new Date(Date.now()+3600000).toISOString(),maxUses)
  const count=async(id:string)=>{
    const row=await db.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id}})
    return (await withAnonymousTokenUsage(db,[row]))[0].usedCount
  }
  const claims=(t:{id:string;maxUses:number},n:number)=>Promise.allSettled(Array.from({length:n},()=>db.$transaction(tx=>claimAnonymousTokenUsage(tx,t,randomUUID()),{maxWait:15000,timeout:15000})))

  it('counts 200 concurrent unlimited claims across shards, preserving legacy usage and rollback',async()=>{
    const t=await token()
    await db.compositeAssessmentAccessToken.update({where:{id:t.id},data:{usedCount:7}})
    expect((await claims(t,200)).filter(r=>r.status==='fulfilled')).toHaveLength(200)
    expect(await count(t.id)).toBe(207)
    expect((await db.compositeAssessmentAccessToken.findUniqueOrThrow({where:{id:t.id}})).usedCount).toBe(7)
    const rows=await db.$queryRaw<Array<{buckets:bigint}>>`SELECT COUNT(*) AS buckets FROM composite_access_token_usage_shards WHERE token_id=${t.id}`
    expect(Number(rows[0].buckets)).toBeGreaterThan(40)
    await expect(db.$transaction(async tx=>{await claimAnonymousTokenUsage(tx,t,randomUUID());throw new Error('rollback')})).rejects.toThrow('rollback')
    expect(await count(t.id)).toBe(207)
  },30000)

  it('never exceeds a finite quota and includes shards when an unlimited token becomes finite',async()=>{
    const t=await token()
    await claims(t,2)
    await db.compositeAssessmentAccessToken.update({where:{id:t.id},data:{maxUses:5}})
    const finite={id:t.id,maxUses:5}
    expect((await claims(finite,30)).filter(r=>r.status==='fulfilled')).toHaveLength(3)
    expect(await count(t.id)).toBe(5)
    await expect(db.$executeRaw`UPDATE composite_assessment_access_tokens SET used_count=used_count+1 WHERE id=${t.id}`).rejects.toThrow()
    expect(await count(t.id)).toBe(5)
    await expect(db.$transaction(tx=>claimAnonymousTokenUsage(tx,t,randomUUID()))).rejects.toMatchObject({statusCode:409})
  },30000)

  it.each(['revoked','expired'])('fails closed after %s and keeps the count unchanged',async state=>{
    const t=await token()
    await db.compositeAssessmentAccessToken.update({where:{id:t.id},data:state==='revoked'?{isActive:false}:{expiresAt:new Date(Date.now()-1000)}})
    expect((await claims(t,8)).filter(r=>r.status==='fulfilled')).toHaveLength(0)
    expect(await count(t.id)).toBe(0)
  })

  it('keeps revocation behind an admitted claim and cascades durable counts only with its token',async()=>{
    const t=await token()
    let entered!:()=>void,release!:()=>void
    const ready=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r)
    const held=db.$transaction(async tx=>{await claimAnonymousTokenUsage(tx,t,randomUUID());entered();await wait},{timeout:15000})
    await ready
    let revoked=false
    const revoke=db.compositeAssessmentAccessToken.update({where:{id:t.id},data:{isActive:false}}).then(()=>{revoked=true})
    try {
      await db.$queryRaw`SELECT 1 AS tick FROM pg_sleep(0.03)`
      expect(revoked).toBe(false)
    } finally {release();await held;await revoke}
    expect(await count(t.id)).toBe(1)
    await expect(db.$executeRaw`DELETE FROM composite_access_token_usage_shards WHERE token_id=${t.id}`).rejects.toThrow()
    await db.compositeAssessmentAccessToken.delete({where:{id:t.id}})
    expect(await db.$queryRaw`SELECT 1 FROM composite_access_token_usage_shards WHERE token_id=${t.id}`).toEqual([])
  })

  it('rechecks expiry after a shard-row wait and rolls back with a conflict',async()=>{
    const t=await token(),credential='same-shard-expiry'
    await db.$transaction(tx=>claimAnonymousTokenUsage(tx,t,credential))
    await db.compositeAssessmentAccessToken.update({where:{id:t.id},data:{expiresAt:new Date(Date.now()+700)}})
    let entered!:()=>void,release!:()=>void
    const ready=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r)
    const held=db.$transaction(async tx=>{await tx.$queryRaw`SELECT shard FROM composite_access_token_usage_shards WHERE token_id=${t.id} FOR UPDATE`;entered();await wait},{timeout:5000})
    await ready
    const pending=db.$transaction(tx=>claimAnonymousTokenUsage(tx,t,credential)).then(()=>null,error=>error)
    try {
      let waiting=false
      for(let i=0;i<30;i++){
        const rows=await db.$queryRaw<Array<{waiting:boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%INSERT INTO composite_access_token_usage_shards%') AS waiting`
        if(rows[0]?.waiting){waiting=true;break}
        await new Promise(r=>setTimeout(r,10))
      }
      expect(waiting).toBe(true)
      await db.$queryRaw`SELECT 1 AS tick FROM pg_sleep(0.8)`
    } finally {release();await held}
    expect(await pending).toMatchObject({statusCode:409})
    expect(await count(t.id)).toBe(1)
  })

  it('claims finite quota concurrently with actual parent FK checks and never retries a deadlock',async()=>{
    const t=await token(5)
    const results=await Promise.allSettled(Array.from({length:20},()=>runtime.startPublicAttempt(t.token)))
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(5)
    const rejected=results.filter(r=>r.status==='rejected') as PromiseRejectedResult[]
    expect(rejected).toHaveLength(15)
    expect(rejected.every(r=>r.reason?.statusCode===409)).toBe(true)
    expect(await count(t.id)).toBe(5)
    expect(await db.compositeAssessmentAttempt.count({where:{accessTokenId:t.id}})).toBe(5)
  },15000)

  it('admits 200 actual anonymous STARTs and resumes without claiming again',async()=>{
    const t=await token(),began=performance.now()
    const starts=await Promise.all(Array.from({length:200},async()=>{const start=performance.now();const result=await runtime.startPublicAttempt(t.token);return {result,ms:performance.now()-start}}))
    const times=starts.map(s=>s.ms).sort((a,b)=>a-b)
    const result={count:starts.length,p50:times[99],p95:times[189],p99:times[197],wallMs:performance.now()-began}
    if(process.env.ANONYMOUS_START_EVIDENCE)writeFileSync(process.env.ANONYMOUS_START_EVIDENCE,JSON.stringify(result,null,2))
    expect(new Set(starts.map(s=>s.result.attempt.id)).size).toBe(200)
    expect(await count(t.id)).toBe(200)
    const first=starts[0].result
    const resumed=await runtime.startPublicAttempt(t.token,first.recoveryToken!)
    expect(resumed.attempt.id).toBe(first.attempt.id)
    expect(await count(t.id)).toBe(200)
    const listed=await runtime.listAccessTokens(ownerId,'TEACHER',compositeId)
    expect(listed.find((row:any)=>row.id===t.id)?.usedCount).toBe(200)
    expect((await runtime.revealAccessToken(ownerId,'TEACHER',compositeId,t.id)).usedCount).toBe(200)
    expect((await runtime.getPublicCompositeInfo(t.token)).usedCount).toBe(200)
  },120000)
})
