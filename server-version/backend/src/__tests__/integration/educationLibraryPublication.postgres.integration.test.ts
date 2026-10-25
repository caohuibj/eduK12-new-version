import {grantLibraryUseFixture} from '../fixtures/library-distribution'
import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import {listEducationLibraryResourcePage} from '../../modules/scale-library-governance/education-catalog'
import {readEducationLibraryRegisteredSource} from '../../modules/scale-library-governance/education-runtime-resources'
import {grantUse,revokeUse} from '../../modules/scale-library-governance/distribution'
import {quarantineCampusStudent} from '../../modules/campus/admission.service'
import {publishAssessmentRun} from '../../modules/assessment-run/publish'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
async function waitForBlocked(fragment:string,blockerPid:number|number[],requiredCount=1){
 const deadline=Date.now()+4000
 while(Date.now()<deadline){
  const rows=await db.$queryRaw<Array<{pid:number}>>(Prisma.sql`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
   AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND lower(query) LIKE ${'%'+fragment+'%'}
   AND pg_blocking_pids(pid) && ${Array.isArray(blockerPid)?blockerPid:[blockerPid]}::int[]`)
  if(rows.length>=requiredCount)return rows
  await new Promise(resolve=>setTimeout(resolve,10))
 }
 throw new Error('Synthetic lock barrier was not reached: '+fragment)
}
suite('Education public library actual publication / isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='57'.repeat(32)
  process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
 })
 afterAll(async()=>{await db?.$disconnect()})
 for(const product of ['SCHOOL','TEACHER'] as const)it(`${product}: actual approved grant, catalog, two tracks, preview and publish preserve exact source`,async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product,publish:false,trackCount:2})
  const preview=await f.preview()
  expect(preview.tracks).toHaveLength(2)
  expect(preview.tracks.every(track=>track.executionCount===1)).toBe(true)
  await f.open()
  const published=await f.publish()
  expect(published.executionCount).toBe(2)
  const [counts]=await db.$queryRaw<Array<{executions:number;relationships:number}>>(Prisma.sql`SELECT count(*)::int AS executions,
   count(DISTINCT e.relationship_snapshot_id)::int AS relationships FROM assessment_run_executions e WHERE e.run_id=${f.runId}`)
  expect(counts).toEqual({executions:2,relationships:1})
  const source=await db.$transaction(tx=>readEducationLibraryRegisteredSource(tx,{product,resourceKey:f.resource.key,resourceVersion:f.resource.version,purpose:'HISTORY'}))
  expect(source.entryId).toBe(f.entryId)
  expect(source.sourceDefinitionHash).toMatch(/^[a-f0-9]{64}$/)
  expect(source.identityOnly).toBe(true)
 },120000)
 it('revoked distribution blocks new preview/publication, but immutable history remains addressable',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'SCHOOL',publish:false})
  await f.open()
  await grantLibraryUseFixture(db,f.libraryAdminUserId,f.entryId,{requestId:randomUUID(),product:'TRAINING',scopeKind:'USER',userId:f.authorUserId})
  const [grant]=await db.$queryRaw<Array<{id:string;issuer_id:string;version:number}>>(Prisma.sql`SELECT id,issuer_id,version FROM scale_library_use_grants
   WHERE entry_id=${f.entryId} AND product='SCHOOL' AND organization_id=${f.organizationId} AND status='ACTIVE'`)
  expect(grant).toBeTruthy()
  await revokeUse(grant.issuer_id,grant.id,{expectedVersion:grant.version,reason:'Synthetic future-use revocation'})
  const page=await db.$transaction(tx=>listEducationLibraryResourcePage(tx,{product:'SCHOOL',organizationId:f.organizationId,actorId:f.managerUserId,workflow:f.workflow}))
  expect(page.entries.some(entry=>entry.applicability.resourceKey===f.resource.key)).toBe(false)
  await expect(f.preview()).rejects.toThrow()
  await expect(f.publish()).rejects.toThrow()
  const [run]=await db.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT status FROM assessment_runs WHERE id=${f.runId}`)
  expect(run.status).toBe('DRAFT')
  const source=await db.$transaction(tx=>readEducationLibraryRegisteredSource(tx,{product:'SCHOOL',resourceKey:f.resource.key,resourceVersion:f.resource.version,purpose:'HISTORY'}))
  expect(source.entryId).toBe(f.entryId)
 },120000)
 it('another organization cannot publish the fixed source run',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',publish:false})
  const other=await db.organization.create({data:{id:randomUUID(),name:'Synthetic wrong education scope',productDomain:'SCHOOL',createdByUserId:f.managerUserId}})
  await expect(publishAssessmentRun({organizationId:other.id,runId:f.runId,actorUserId:f.managerUserId,expectedVersion:f.expectedVersion})).rejects.toThrow()
 },120000)
 it('selected class revocation committed while fact locking waits cannot freeze the stale selection',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'SCHOOL',publish:false,trackCount:2})
  await f.open()
  let release!:()=>void,ready!:()=>void,revokerPid=0
  const gate=new Promise<void>(resolve=>{release=resolve}),locked=new Promise<void>(resolve=>{ready=resolve})
  const revoker=db.$transaction(async tx=>{
   revokerPid=(await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`)[0].pid
   await tx.$executeRaw(Prisma.sql`UPDATE organization_student_class_assignments SET valid_until=statement_timestamp()
    WHERE id=${f.studentClassAssignmentId} AND valid_until IS NULL`)
   ready();await gate
  },{timeout:20000})
  await locked
  // Real publication services and PostgreSQL rows. Only the synthetic revoker's
  // commit is gated; no registry, population, publication or FINAL is mocked.
  const result=f.publish().then(value=>({value,error:null}),error=>({value:null,error}))
  try{await waitForBlocked('organization_student_class_assignments',revokerPid)}finally{release();await revoker}
  const outcome=await result
  expect(outcome.error).toBeTruthy()
  expect(outcome.error).toMatchObject({code:'ACTIVITY_PUBLISH_CLASS_SCOPE'})
  const [counts]=await db.$queryRaw<Array<{count:number}>>(Prisma.sql`SELECT count(*)::int AS count FROM assessment_run_executions WHERE run_id=${f.runId}`)
  expect(counts.count).toBe(0)
 },120000)
 it('real admission quarantine ahead of publication does not invert admission→org locking or publish an ineligible student',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'SCHOOL',publish:false})
  await f.open()
  if(!f.classUnitId||!f.studentNumber)throw new Error('School fixture admission identity missing')
  const classUnitId=f.classUnitId,studentNumber=f.studentNumber
  let release!:()=>void,ready!:()=>void,blockerPid=0
  const gate=new Promise<void>(resolve=>{release=resolve}),locked=new Promise<void>(resolve=>{ready=resolve})
  const locker=db.$transaction(async tx=>{
   blockerPid=(await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`)[0].pid
   await tx.$queryRaw(Prisma.sql`SELECT class_unit_id FROM campus_class_admissions WHERE class_unit_id=${classUnitId} FOR UPDATE`)
   ready();await gate
  },{timeout:20000})
  await locked
  const quarantine=quarantineCampusStudent({actor:f.manager,organizationId:f.organizationId,classUnitId,studentNumber}).then(value=>({value,error:null}),error=>({value:null,error}))
  let result:Promise<{error:unknown}>|undefined
  try{
   const quarantineWaiters=await waitForBlocked('campus_class_admissions',blockerPid)
   result=f.publish().then(()=>({error:null}),error=>({error}))
   // PostgreSQL can report a waiter ahead in the row-lock queue as the
   // publisher's soft blocker, rather than the original row owner.
   await waitForBlocked('campus_class_admissions',[blockerPid,quarantineWaiters[0].pid],2)
  }finally{release();await locker;await quarantine}
  expect((await quarantine).error).toBeNull()
  expect((await result!)?.error).toMatchObject({code:'ACTIVITY_PUBLISH_CLASS_SCOPE'})
  const [counts]=await db.$queryRaw<Array<{count:number}>>(Prisma.sql`SELECT count(*)::int AS count FROM assessment_run_executions WHERE run_id=${f.runId}`)
  expect(counts.count).toBe(0)
 },120000)

})
