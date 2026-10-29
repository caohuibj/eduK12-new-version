import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,it,expect,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {nativeCognitiveConfigSeeds} from '../../modules/cognitive/content-candidates/native-registry/config-seeds'
import {planCognitiveConfigInstall,installCognitiveConfigs} from '../../modules/cognitive/onboarding/install'
const url=integrationDatabaseUrl('COGNITIVE_REMAINING_INSTALL_TEST_DATABASE_URL'),suite=url?describe:describe.skip
suite('remaining selected native drafts with isolated PostgreSQL',()=>{
 let db:PrismaClient
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('previews and installs only the nine new selected source tuples as restricted drafts, retaining exact rows and audit count on repeat',async()=>{
  const actor=await db.user.create({data:{username:'remaining-cognitive-test-admin',passwordHash:'synthetic-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
  const seeds=nativeCognitiveConfigSeeds.filter(s=>!['mot','enumeration'].includes(s.testType))
  const input={schemaVersion:1,items:seeds.map(({testType,configVersion,engineVersion,scoringVersion})=>({testType,configVersion,engineVersion,scoringVersion}))}
  const plan=await planCognitiveConfigInstall(db,input,actor.id)
  expect(plan.hasBlocked).toBe(false);expect(plan.rows.map(r=>r.action)).toEqual(seeds.map(()=>'CREATE_DRAFT'))
  expect(await db.cognitiveTestConfig.count()).toBe(0)
  const apply=await installCognitiveConfigs(db,input,actor.id)
  expect(apply.rows.map(r=>r.action)).toEqual(seeds.map(()=>'CREATED_DRAFT'))
  const rows=await db.cognitiveTestConfig.findMany({orderBy:{testType:'asc'}})
  expect(rows).toHaveLength(9)
  for(const seed of seeds)expect(rows.find(r=>r.testType===seed.testType)).toMatchObject({...seed,status:'DRAFT',accessPolicy:'GRANT',publishedAt:null})
  expect((await installCognitiveConfigs(db,input,actor.id)).rows.map(r=>r.action)).toEqual(seeds.map(()=>'ALREADY_PRESENT'))
  expect(await db.cognitiveTestConfig.findMany({orderBy:{testType:'asc'}})).toEqual(rows)
  expect(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_CONFIG_INSTALL'}})).toBe(9)
  expect(await db.cognitiveAssignment.count()).toBe(0)
  const pins=await db.$queryRaw<Array<{measurement_release_id:string|null}>>`SELECT measurement_release_id FROM cognitive_test_configs`
  expect(pins.every(p=>p.measurement_release_id===null)).toBe(true)
 },30_000)
})
