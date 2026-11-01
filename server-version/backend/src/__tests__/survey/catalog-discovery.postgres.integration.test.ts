import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {Prisma,PrismaClient} from '@prisma/client'
import {catalogDiscoveryRecords,discoveryJoin,discoverySqlFilter,governedDiscoveryIdentity} from '../../modules/survey/catalog-discovery'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'

const databaseUrl=integrationDatabaseUrl('LIBRARY_DISCOVERY_TEST_DATABASE_URL')
let db:PrismaClient
beforeAll(async()=>{
 if(!databaseUrl)throw new Error('LIBRARY_DISCOVERY_TEST_DATABASE_URL must explicitly select an isolated test database')
 requireIsolatedReleaseDatabase(databaseUrl)
 db=new PrismaClient({datasources:{db:{url:databaseUrl}}});await db.$connect()
})
afterAll(async()=>{await db?.$disconnect()})

describe('actual PostgreSQL metadata filtering before pagination',()=>{
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
