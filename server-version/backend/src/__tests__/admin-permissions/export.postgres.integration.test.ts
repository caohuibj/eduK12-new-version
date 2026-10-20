import {randomUUID} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import {beforeAll,afterAll,describe,expect,it} from 'vitest'
const suite=process.env.ADMIN_PERMISSIONS_ISOLATED_TEST==='1'?describe:describe.skip
suite('entry revocation fences actual export generation, publication and download',()=>{
  let db:typeof import('../../config/database')['prisma'],jobs:typeof import('../../services/exportJobService'),artifacts:typeof import('../../services/exportArtifactService')
  let runner:typeof import('../../workers/exportBatchTask'),permission:typeof import('../../modules/admin-permissions/service'),principal:typeof import('../../modules/organization/principal')
  let actorId:string,systemId:string,resourceId:string,readyId:string,oldJobId:string,publishingId:string
  beforeAll(async()=>{
    if(!new URL(process.env.DATABASE_URL!).pathname.startsWith('/eduk12_admin_permissions_'))throw new Error('Dedicated DB required')
    db=(await import('../../config/database')).prisma;jobs=await import('../../services/exportJobService');artifacts=await import('../../services/exportArtifactService')
    runner=await import('../../workers/exportBatchTask');permission=await import('../../modules/admin-permissions/service');principal=await import('../../modules/organization/principal')
    const actor=await db.user.create({data:{username:'export-entry-'+randomUUID(),passwordHash:'unusable',role:'STUDENT'}});actorId=actor.id
    const system=await db.user.create({data:{username:'export-system-'+randomUUID(),passwordHash:'unusable',role:'STUDENT',platformRole:'SYSTEM_ADMIN'}});systemId=system.id
    const owner=await db.user.create({data:{username:'export-owner-'+randomUUID(),passwordHash:'unusable',role:'TEACHER'}})
    await db.adminEntryGrant.create({data:{id:randomUUID(),userId:actorId,entry:'TRAINING',grantedBy:systemId}})
    const questionnaire=await db.questionnaire.create({data:{code:'export_'+randomUUID(),name:'合成空白导出边界',type:'COURSE',status:'DRAFT',creatorId:owner.id}});resourceId=questionnaire.id
  })
  afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await db?.$disconnect()})
  const change=(active:boolean,expectedVersion:number)=>permission.changeEntryGrant({actorUserId:systemId,actorSession:{tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()},targetUserId:actorId,entry:'TRAINING',active,expectedVersion,reason:'synthetic export revocation'})
  async function batch(version:number|undefined){
    const id=randomUUID()
    await db.exportBatch.create({data:{id,resourceType:'QUESTIONNAIRE',resourceId,createdBy:actorId,anonymized:false,formats:['csv'],
      options:{anonymize:false,creatorRole:'ADMIN',...(version===undefined?{}:{authorityTokenVersion:version})},requestKey:randomUUID(),requestHash:randomUUID(),recordCount:0,expiresAt:new Date(Date.now()+60000)}})
    const artifact=await artifacts.createExportArtifact({resourceType:'QUESTIONNAIRE',resourceId,createdBy:actorId,format:'csv',anonymized:false,
      storageKey:'questionnaire_'+resourceId.slice(0,8)+'_'+id+'.csv',batchId:id,status:'PROCESSING'})
    return {id,artifact}
  }
  const run=(id:string)=>runner.runExportBatch({id:'synthetic-'+id,data:{batchId:id},opts:{attempts:1},attemptsMade:0})
  it('generates a real CSV and permits its currently authorized download',async()=>{
    const ready=await batch(0);readyId=ready.artifact.id
    expect(await run(ready.id)).toMatchObject({status:'READY'})
    const current=(await principal.loadCurrentPrincipal(actorId))!
    const download=await artifacts.resolveArtifactForDownload(readyId,current)
    expect(Boolean(download.filePath)).toBe(true);expect(existsSync(download.filePath!)).toBe(true)
    expect(readFileSync(download.filePath!,'utf8').length).toBeGreaterThan(0)
    oldJobId=(await batch(0)).id;publishingId=(await batch(0)).id
    await jobs.claimExportBatch(publishingId,'synthetic-already-generated')
  })
  it('revocation rejects generation and old sensitive downloads and prevents final publication',async()=>{
    await change(false,1)
    const current=(await principal.loadCurrentPrincipal(actorId))!
    expect(current.role).toBe('STUDENT')
    expect((await artifacts.resolveArtifactForDownload(readyId,current)).reason).toBe('forbidden')
    await expect(run(oldJobId)).rejects.toThrow('Export authority revoked')
    expect((await db.exportBatch.findUniqueOrThrow({where:{id:oldJobId}})).status).toBe('FAILED')
    expect(await jobs.publishExportBatch({batchId:publishingId,generation:1,fieldCount:1,storageKeys:[]})).toBe(false)
    expect((await db.exportBatch.findUniqueOrThrow({where:{id:publishingId}})).status).toBe('PROCESSING')
    expect(await db.exportArtifact.count({where:{batchId:publishingId,status:'READY'}})).toBe(0)
  })
  it('an explicit later regrant cannot revive an old task; a new matching intent works',async()=>{
    await change(true,2)
    const stale=await batch(0)
    await expect(run(stale.id)).rejects.toThrow('Export authority revoked')
    const fresh=await batch(2)
    expect(await run(fresh.id)).toMatchObject({status:'READY'})
  })
  it('legacy unversioned jobs fail closed instead of inheriting a new broad ADMIN role',async()=>{
    const old=await batch(undefined)
    await expect(run(old.id)).rejects.toThrow('Export authority revoked')
  })
})
