import {PrismaClient} from '@prisma/client'
import {describe,expect,it} from 'vitest'
import {assertLibraryUseGrantsCurrent,assertLibraryUseGrantCurrent} from '../../modules/scale-library-governance/usage'

/** Real-PG counterexample for set-based library use-grant admission.
 * Gated: LIBRARY_BATCH_PG_TEST=1 and DATABASE_URL (or LIBRARY_BATCH_PG_TEST_DATABASE_URL)
 * pointing at an isolated local DB. Uses TEMP tables only; never touches shared perf DBs. */
const raw=process.env.LIBRARY_BATCH_PG_TEST_DATABASE_URL||process.env.DATABASE_URL
const enabled=process.env.LIBRARY_BATCH_PG_TEST==='1'&&raw
const url=enabled?raw:undefined
const suite=url?describe:describe.skip

suite('batch library use grants (real PG)',()=>{
 it('admits many entries together and fails closed when one grant is revoked',async()=>{
  const u=new URL(url!)
  if(process.env.NODE_ENV!=='test'||!['localhost','127.0.0.1'].includes(u.hostname))throw new Error('local isolated DB required')
  const db=new PrismaClient({datasources:{db:{url}}}),rollback=new Error('ROLLBACK_BATCH_LIBRARY_ONLY')
  try{
   await expect(db.$transaction(async tx=>{
    const tables=[
     'CREATE TEMP TABLE content_capability_grants(id text PRIMARY KEY,ancestry text[],revoked_at timestamp(3),valid_from timestamp(3),expires_at timestamp(3)) ON COMMIT DROP',
     'CREATE TEMP TABLE scale_library_use_grants(id text PRIMARY KEY,entry_id text,user_id text,product text,scope_kind text,organization_id text,status text,authority_grant_id text,survey_tool_grant_id text,material_grant_id text) ON COMMIT DROP',
     'CREATE TEMP TABLE scale_library_entries(id text PRIMARY KEY,release_id text,status text) ON COMMIT DROP',
     'CREATE TEMP TABLE measurement_content_releases(id text PRIMARY KEY,content_hash text,provenance jsonb,source_release_id text) ON COMMIT DROP',
     'CREATE TEMP TABLE scale_library_emergency_stops(target_kind text,target_id text) ON COMMIT DROP',
     'CREATE TEMP TABLE survey_tool_policies(product text,resource_key text,fingerprint text,decision text,paused boolean,version int,reason text) ON COMMIT DROP',
     'CREATE TEMP TABLE survey_tool_grants(id text PRIMARY KEY,status text) ON COMMIT DROP',
    ]
    for(const statement of tables)await tx.$executeRawUnsafe(statement)
    await tx.$executeRaw`INSERT INTO measurement_content_releases VALUES ('rel-a','hash-a','{}',NULL),('rel-b','hash-b','{}',NULL)`
    await tx.$executeRaw`INSERT INTO scale_library_entries VALUES ('entry-a','rel-a','ACTIVE'),('entry-b','rel-b','ACTIVE')`
    await tx.$executeRaw`INSERT INTO scale_library_use_grants(id,entry_id,user_id,product,scope_kind,organization_id,status,authority_grant_id,survey_tool_grant_id,material_grant_id)
      VALUES ('use-a','entry-a','owner','SURVEY','USER',NULL,'ACTIVE',NULL,'tool-a',NULL),('use-b','entry-b','owner','SURVEY','USER',NULL,'ACTIVE',NULL,'tool-b',NULL)`
    await tx.$executeRaw`INSERT INTO survey_tool_policies VALUES ('SURVEY','release:rel-a','hash-a','APPROVED',false,1,'batch'),('SURVEY','release:rel-b','hash-b','APPROVED',false,1,'batch')`
    await tx.$executeRaw`INSERT INTO survey_tool_grants VALUES ('tool-a','ACTIVE'),('tool-b','ACTIVE')`
    const admit=()=>assertLibraryUseGrantsCurrent(tx,{entryIds:['entry-b','entry-a','entry-a'],userId:'owner',product:'SURVEY'})
    const got=await admit()
    expect([...got.keys()].sort()).toEqual(['entry-a','entry-b'])
    expect(got.get('entry-a')!.id).toBe('use-a')
    // Singular wrapper still works against the same rows.
    await expect(assertLibraryUseGrantCurrent(tx,{entryId:'entry-a',userId:'owner',product:'SURVEY'})).resolves.toMatchObject({id:'use-a'})
    await tx.$executeRaw`UPDATE scale_library_use_grants SET status='REVOKED' WHERE id='use-b'`
    await expect(admit()).rejects.toThrow('共用库使用授权已撤销')
    // Surviving entry still admits alone.
    await expect(assertLibraryUseGrantCurrent(tx,{entryId:'entry-a',userId:'owner',product:'SURVEY'})).resolves.toMatchObject({id:'use-a'})
    throw rollback
   },{timeout:20000})).rejects.toBe(rollback)
  }finally{await db.$disconnect()}
 },30000)
})
