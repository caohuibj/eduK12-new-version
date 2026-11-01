import {randomUUID} from 'node:crypto'
import {afterAll,describe,expect,it,vi} from 'vitest'
import {PrismaClient,type Prisma} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
const connection=vi.hoisted(()=>({tx:undefined as Prisma.TransactionClient|undefined}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:(query:Prisma.Sql)=>connection.tx!.$queryRaw(query)}}))
vi.mock('../../modules/organization/access',()=>({resolveOrganizationAccessContext:async()=>({membershipId:'manager',productDomain:'SCHOOL',organizationStatus:'ACTIVE',orgRole:'ORG_ADMIN',personas:[],capabilities:[],explicitDenies:[]}),contextHasCapability:vi.fn()}))
import {listCampusGroupReportHistory} from '../../modules/campus/group-reports'
const url=integrationDatabaseUrl('REPORT_POINTER_DATABASE_URL','RELEASE_INTEGRATION_DATABASE_URL')
const db=url?new PrismaClient({datasources:{db:{url}}}):undefined
afterAll(async()=>{await db?.$disconnect()})
;(url?describe:describe.skip)('School history pointer SQL on a disposable PostgreSQL fixture',()=>{
 it('keeps 26 same-time pointers reachable and scopes organization/run/track/kind/schema without decoding facts',async()=>{
  requireIsolatedReleaseDatabase(url!)
  // One connection keeps these temporary metadata tables separate from the
  // existing CI application schema; no user, result or FINAL is created.
  await db!.$transaction(async tx=>{
  connection.tx=tx
  try{
  await tx.$executeRawUnsafe('CREATE TEMP TABLE reporting_analysis_artifacts(id text PRIMARY KEY, organization_id text, analysis_kind text, artifact_payload jsonb, generated_at timestamp(6)) ON COMMIT DROP')
  await tx.$executeRawUnsafe('CREATE TEMP TABLE campus_activity_runs(organization_id text, run_id text) ON COMMIT DROP')
  const org=randomUUID(),run=randomUUID(),track=randomUUID()
  await tx.$executeRaw`INSERT INTO campus_activity_runs VALUES(${org},${run})`
  const ids=Array.from({length:26},()=>randomUUID()).sort().reverse()
  async function insert(id:string,organizationId=org,runId=run,trackId=track,kind='GROUP',schemaVersion=2){
   const payload=JSON.stringify({schemaVersion,source:{runId,trackId}})
   await tx.$executeRaw`INSERT INTO reporting_analysis_artifacts VALUES(${id},${organizationId},${kind},${payload}::jsonb,timestamp '2026-10-31 00:00:00.123456')`
  }
  for(const id of ids)await insert(id)
  await insert(randomUUID(),randomUUID());await insert(randomUUID(),org,randomUUID());await insert(randomUUID(),org,run,randomUUID())
  await insert(randomUUID(),org,run,track,'REPEATED_COHORT');await insert(randomUUID(),org,run,track,'GROUP',1)
  const input={actor:{userId:'manager',role:'ADMIN',accountDomain:'SCHOOL'} as any,organizationId:org,runId:run,trackId:track}
  const first=await listCampusGroupReportHistory(input),second=await listCampusGroupReportHistory({...input,before:first.nextCursor!})
  expect(first.artifacts.map(p=>p.artifactId)).toEqual(ids.slice(0,25))
  expect(second.artifacts.map(p=>p.artifactId)).toEqual(ids.slice(25));expect(second.nextCursor).toBeNull()
  expect(first.nextCursor?.generatedAt).toBe('2026-10-31T00:00:00.123456Z')
  const above=await listCampusGroupReportHistory({...input,before:{generatedAt:'2026-10-31T00:00:00.123457Z',artifactId:ids.at(-1)!}})
  expect(above.artifacts).toEqual(first.artifacts)
  console.info(JSON.stringify({kind:'School group-history SQL',pages:[25,1],sourceScoped:true,sameTimeIdOrder:true,microsecondCursor:true,newFinals:0,reportGeneration:0,authorization:'existing manager context mocked; actual PostgreSQL metadata query'}))
  }finally{connection.tx=undefined}
  },{timeout:30000})
 },30000)
})
