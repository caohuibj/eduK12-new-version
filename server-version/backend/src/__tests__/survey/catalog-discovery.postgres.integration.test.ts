import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {Prisma,PrismaClient} from '@prisma/client'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {catalogDiscoveryRecords,discoveryJoin,discoverySqlFilter,governedDiscoveryIdentity,sjtMetadataTagIds,respondentTagIds} from '../../modules/survey/catalog-discovery'

const databaseUrl=integrationDatabaseUrl('LIBRARY_DISCOVERY_TEST_DATABASE_URL')
let db:PrismaClient
beforeAll(async()=>{
 if(!databaseUrl)throw new Error('LIBRARY_DISCOVERY_TEST_DATABASE_URL must explicitly select an isolated test database')
 requireIsolatedReleaseDatabase(databaseUrl)
 db=new PrismaClient({datasources:{db:{url:databaseUrl}}});await db.$connect()
})
afterAll(async()=>{await db?.$disconnect()})

describe('actual PostgreSQL metadata filtering before pagination',()=>{
 it('finds existing free tags and source-owned SJT constructs beyond page one; unclassified Form stays visible',async()=>{
  await db.$transaction(async tx=>{
   await tx.$executeRaw`CREATE TEMP TABLE source_tags_fixture(id text,kind text,tags jsonb,definition jsonb) ON COMMIT DROP`
   await tx.$executeRaw`INSERT INTO source_tags_fixture SELECT lpad(i::text,2,'0'),'FORM',CASE WHEN i=31 THEN '["population:teacher","domain:mental_health"]'::jsonb ELSE '[]'::jsonb END,'{}'::jsonb FROM generate_series(1,32) i`
   await tx.$executeRaw`INSERT INTO source_tags_fixture VALUES('sjt','SJT','[]'::jsonb,'{"scoring":{"publishedMetrics":[{"construct":"协作决策"},{"construct":"协作决策"}]}}'::jsonb)`
   await tx.$executeRaw`INSERT INTO source_tags_fixture VALUES('bundle','BUNDLE','["age:18-"]'::jsonb,'{"respondentTypes":["SELF"],"components":[{"scoring":{"publishedMetrics":[{"construct":"子构念"}]}}]}'::jsonb)`
   const select=(filters:{keyword?:string;tags?:string[]},page=1)=>tx.$queryRaw<Array<{id:string;tags:Array<{id:string;label:string;facet:string}>}>>(Prisma.sql`
    SELECT source.id,discovery.tags FROM source_tags_fixture source
    ${discoveryJoin([],{kind:Prisma.sql`source.kind`,key:Prisma.sql`source.id`,version:Prisma.sql`NULL`,engine:Prisma.sql`NULL`,scoring:Prisma.sql`NULL`},Prisma.sql`source.tags||${sjtMetadataTagIds(Prisma.sql`source.definition`)}||${respondentTagIds(Prisma.sql`source.definition->'respondentTypes'`)}`)}
    WHERE ${discoverySqlFilter([Prisma.sql`source.id`],filters)} ORDER BY source.id LIMIT 25 OFFSET ${(page-1)*25}`)
   expect((await select({tags:['population:teacher','domain:mental_health']})).map(row=>row.id)).toEqual(['31'])
   const sjt=await select({keyword:'协作决策'})
   expect(sjt).toEqual([{id:'sjt',tags:[{id:'sjt-construct:协作决策',label:'协作决策',facet:'construct'}]}])
   expect((await select({tags:['not-declared']}))).toEqual([])
   expect((await select({keyword:'本人自评'}))).toEqual([{id:'bundle',tags:[{id:'age:18-',label:'18岁及以上',facet:'population'},{id:'respondent:SELF',label:'本人自评',facet:'population'}]}])
   expect((await select({keyword:'18岁及以上'})).map(row=>row.id)).toEqual(['bundle'])
   expect((await select({keyword:'子构念'}))).toEqual([])
   const first=await select({}),second=await select({},2)
   expect(first).toHaveLength(25);expect(second).toHaveLength(9)
   expect(new Set([...first,...second].map(row=>row.id)).size).toBe(34)
   expect(first[0].tags).toEqual([])
  })
 })
 it('finds cognitive row 31 by Chinese domain, ANDs facets and never labels an unknown engine',async()=>{
  await db.$transaction(async tx=>{
   await tx.$executeRaw`CREATE TEMP TABLE discovery_fixture(id text,title text,tool_key text,snapshot_hash text,family text,state text,snapshot jsonb) ON COMMIT DROP`
   for(let i=0;i<32;i++)await tx.$executeRaw`INSERT INTO discovery_fixture VALUES(${String(i).padStart(2,'0')},${'synthetic '+i},${'task-'+i},${'hash-'+i},'COGNITIVE','ONLINE',${JSON.stringify({unit:{compiledDefinition:{sessionSnapshot:{testType:i===30||i===31?'gonogo':'memory',engineVersion:i===31?'99.0.0':'1.0.0',scoringVersion:i===30||i===31?'1.0.0':'1.1.0'}}}})}::jsonb)`
   const records=catalogDiscoveryRecords(),select=async(page:number,keyword:string,tags:string[])=>tx.$queryRaw<Array<{id:string;tags:unknown}>>(Prisma.sql`SELECT t.id,COALESCE(discovery.tags,'[]'::jsonb) AS tags FROM discovery_fixture t ${discoveryJoin(records,governedDiscoveryIdentity)} WHERE t.state='ONLINE' AND ${discoverySqlFilter([Prisma.sql`t.title`],{keyword,tags})} ORDER BY t.id LIMIT 26 OFFSET ${(page-1)*25}`)
   const inhibition=await select(1,'反应抑制',['cognitive-facet:response_inhibition/action_withholding'])
   expect(inhibition.map(row=>row.id)).toEqual(['30'])
   expect((await select(1,'',['PUBLIC']))).toEqual([])
   expect((await select(1,'',['cognitive-domain:working_memory','cognitive-domain:response_inhibition']))).toEqual([])
   expect((await select(1,'99.0.0',[]))).toEqual([])
   const unfiltered=await select(2,'',[])
   expect(unfiltered.find(row=>row.id==='31')?.tags).toEqual([])
   const first=await select(1,'工作记忆',[]),second=await select(2,'工作记忆',[])
   expect(first).toHaveLength(26);expect(second).toHaveLength(5)
   expect(new Set([...first.slice(0,25),...second].map(row=>row.id)).size).toBe(30)
  },{timeout:15000})
 })
 it('joins a standard exact version to student, subject and actual language metadata before LIMIT',async()=>{
  await db.$transaction(async tx=>{
   await tx.$executeRaw`CREATE TEMP TABLE standard_discovery_fixture(id text,tool_key text,snapshot jsonb) ON COMMIT DROP`
   await tx.$executeRaw`INSERT INTO standard_discovery_fixture VALUES('correct','value_cost_mathematics_zh_cn','{"instrumentVersion":"1.0.0"}'::jsonb),('future','value_cost_mathematics_zh_cn','{"instrumentVersion":"9.0.0"}'::jsonb)`
   const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT t.id FROM standard_discovery_fixture t ${discoveryJoin(catalogDiscoveryRecords(),{kind:Prisma.sql`'SCALE'`,key:Prisma.sql`t.tool_key`,version:Prisma.sql`t.snapshot->>'instrumentVersion'`,engine:Prisma.sql`NULL`,scoring:Prisma.sql`NULL`})} WHERE ${discoverySqlFilter([Prisma.sql`t.tool_key`],{keyword:'学生 数学',tags:['language:zh-CN','value_cost']})} ORDER BY t.id LIMIT 25`)
   expect(rows.map(row=>row.id)).toEqual(['correct'])
  })
 })
})
