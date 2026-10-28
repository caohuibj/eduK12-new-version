import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import * as librarySources from '../../modules/education-tools/library-source.scale'
import {compilePrivateComposition} from '../../modules/education-tools/private-tool.composition-compiler'
import {sealPrivateComposition} from '../../modules/education-tools/private-tool.composition-runtime'
import {revokeUse} from '../../modules/scale-library-governance/distribution'
import {addPrivateCompositionRunTrack} from '../../modules/education-tools/private-tool.run-adapter'
import {assertAccountUsabilityMutationSafe} from '../../services/accountAuthorityService'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
type Fixture=Awaited<ReturnType<typeof setupEducationLibraryRuntimeFixture>>
async function draft(f:Fixture){
 const c:PrivateToolContext={entry:f.product,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL'}}
 const [entry]=await db.$queryRaw<Array<{hash:string}>>(Prisma.sql`SELECT s.snapshot_hash AS hash FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id WHERE e.id=${f.entryId}`)
 const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:f.product==='SCHOOL'?'STUDENT':'TEACHER',responseMode:'SELF'},
  instruction:'One ordinary questionnaire',blocks:[0,1].map(index=>({blockId:randomUUID(),instruction:'Independent block '+index,
   source:{provider:'LIBRARY_SCALE',kind:'SCALE',versionId:f.entryId,contentHash:entry.hash}}))}
 const tool=await tools.createPrivateTool(c,{kind:'COMPOSITION',title:'Original approved library questionnaire'})
 const saved=await tools.updatePrivateTool(c,tool.id,{expectedRevision:1,title:tool.title,definition})
 return {c,tool,saved,definition,command:{expectedRevision:saved.revision,expectedContentHash:saved.contentHash}}
}
suite('Original approved library / ordinary composition sealing',()=>{
 beforeAll(()=>requireIsolatedReleaseDatabase(url!))
 afterAll(async()=>{vi.restoreAllMocks();await db.$disconnect()})
 it('seals the original C/native R and independent blocks once, creates no per-leaf Composite, and rejects new freeze after U withdrawal',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false}),x=await draft(f)
  const before={scales:await db.scale.count(),composites:await db.compositeAssessment.count()}
  const version=await tools.freezePrivateTool(x.c,x.tool.id,x.command)
  if(!('runtime'in version)||!version.runtime)throw new Error('Missing sealed composition')
  const parent=await db.compositeAssessment.findUniqueOrThrow({where:{id:version.runtime.compositeId},include:{items:true}}),snapshot=parent.trainingContentSnapshot as any
  expect(parent.status).toBe('DRAFT');expect(snapshot.units).toHaveLength(2)
  for(const unit of snapshot.units){
   expect(unit.source).toMatchObject({libraryEntryId:f.entryId,ownerId:f.authorUserId,educationLibrary:{entryId:f.entryId,approvedSnapshotHash:x.definition.blocks[0].source.contentHash,reportMode:'NATIVE'}})
   expect(unit.measurement).toMatchObject({releaseId:f.release.releaseId,contentHash:f.release.contentHash})
   const scale=await db.scale.findUniqueOrThrow({where:{id:unit.source.id}})
   expect(scale.definition).toEqual(f.definition);expect(scale.creatorId).toBe(f.authorUserId)
  }
  expect(snapshot.units[0].source.id).toBe(snapshot.units[1].source.id)
  expect(snapshot.units[0].itemId).not.toBe(snapshot.units[1].itemId)
  expect(await db.scale.count()).toBe(before.scales);expect(await db.compositeAssessment.count()).toBe(before.composites+1)
  // A sealed source is attached through the existing real workflow/CAS writer.
  expect(await addPrivateCompositionRunTrack({organizationId:f.organizationId,runId:f.runId,actorUserId:f.managerUserId,parent:{kind:'TEACHER_EVENT',id:f.workflow.id}},
   {expectedVersion:f.expectedVersion,privateComposition:{versionId:version.id,contentHash:version.contentHash},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]}})).toMatchObject({resourceKey:version.runtime.resourceKey})
  await revokeUse(f.libraryAdminUserId,f.grantId,{expectedVersion:1,reason:'Synthetic future-use withdrawal'})
  const read=vi.spyOn(librarySources,'readEducationLibrarySources')
  expect(await tools.freezePrivateTool(x.c,x.tool.id,x.command)).toMatchObject({id:version.id,created:false})
  expect(read).not.toHaveBeenCalled();read.mockRestore()
  const next=await draft(f)
  await expect(tools.freezePrivateTool(next.c,next.tool.id,next.command)).rejects.toMatchObject({code:'LIBRARY_SOURCE_USE_REQUIRED',statusCode:403})
  expect(await db.educationPrivateToolVersion.count({where:{toolId:next.tool.id}})).toBe(0)
 },60000)
 it('rejects a forged approved-source descriptor in the actual DB seal even when its parent hash is recomputed',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false}),x=await draft(f)
  await expect(db.$transaction(async tx=>{
   const compiled=await compilePrivateComposition(tx,x.c,x.definition)
   const leaf=compiled.leaves.get('LIBRARY_SCALE:'+f.entryId)!
   if(leaf.provider!=='LIBRARY_SCALE')throw new Error('Wrong source')
   leaf.library.descriptor={...leaf.library.descriptor,approvedSnapshotHash:'a'.repeat(64)}
   const version=await tx.educationPrivateToolVersion.create({data:{id:randomUUID(),toolId:x.tool.id,entry:x.c.entry,organizationId:x.c.organizationId,
    ownerUserId:x.c.principal.userId,kind:'COMPOSITION',sourceRevision:x.saved.revision,title:x.tool.title,definition:x.definition,contentHash:x.saved.contentHash}})
   await sealPrivateComposition(tx,x.c,version,compiled)
  })).rejects.toThrow('EDUCATION_COMPOSITION_CHILDREN_INVALID')
  expect(await db.educationPrivateToolVersion.count({where:{toolId:x.tool.id}})).toBe(0)
 },60000)
 it('waits on issuer User before taking school SHARE, preserves the real account lifecycle writer, and denies the waiting new use after its freeze',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false}),x=await draft(f)
  // Platform issuers cannot join a School organization. Keep that DB guard:
  // the real account writer governs this separate platform-domain org, while
  // the receiver-school NOWAIT probe observes the consumer's lock order.
  const issuerOrg=await db.organization.create({data:{id:randomUUID(),name:'Synthetic issuer organization',createdByUserId:f.libraryAdminUserId}})
  const alternative=await db.user.create({data:{username:'alternative_'+randomUUID(),passwordHash:'synthetic',accountDomain:'LEGACY',role:'ADMIN'}})
  for(const userId of [f.libraryAdminUserId,alternative.id])await db.organizationMembership.create({data:{id:randomUUID(),organizationId:issuerOrg.id,userId,orgRole:'ORG_ADMIN'}})
  let pending:Promise<unknown>|undefined
  try{
   await db.$transaction(async tx=>{
    await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id=${f.libraryAdminUserId} FOR UPDATE`)
    const [holder]=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`
    pending=tools.freezePrivateTool(x.c,x.tool.id,x.command).then(value=>value,error=>error)
    let waiting=false
    for(let attempt=0;attempt<100&&!waiting;attempt++){
     const [row]=await db.$queryRaw<Array<{waiting:boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${holder.pid}=ANY(pg_blocking_pids(pid))) AS waiting`
     waiting=row.waiting;if(!waiting)await new Promise(resolve=>setTimeout(resolve,20))
    }
    expect(waiting).toBe(true)
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout='500ms'")
    await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations WHERE id=${f.organizationId} FOR UPDATE NOWAIT`)
    await assertAccountUsabilityMutationSafe(tx,f.libraryAdminUserId)
    await tx.user.update({where:{id:f.libraryAdminUserId},data:{isFrozen:true}})
   },{timeout:10000})
   expect(await pending).toMatchObject({code:'LIBRARY_SOURCE_USE_REQUIRED',statusCode:403})
   expect(await db.educationPrivateToolVersion.count({where:{toolId:x.tool.id}})).toBe(0)
  }finally{await pending}
 },60000)
})
