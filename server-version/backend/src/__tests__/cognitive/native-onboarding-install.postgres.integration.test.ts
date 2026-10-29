import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {nativeCognitiveConfigSeeds as registeredSeeds} from '../../modules/cognitive/content-candidates/native-registry/config-seeds'
import {planCognitiveConfigInstall,installCognitiveConfigs} from '../../modules/cognitive/onboarding/install'
import {freezeNativeAssignmentProfile,readFrozenReport} from '../../modules/cognitive/profile-freeze'
import {getCognitiveTaskResource} from '../../modules/cognitive/task-resource'
import {decryptCognitivePayload} from '../../modules/cognitive/cognitive.security'

const nativeCognitiveConfigSeeds=registeredSeeds.filter(seed=>['mot','enumeration'].includes(seed.testType))
const url=integrationDatabaseUrl('COGNITIVE_NATIVE_INSTALL_TEST_DATABASE_URL'),suite=url?describe:describe.skip
suite('selected native configurations with isolated PostgreSQL',()=>{
 let db:PrismaClient
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('installs only two restricted drafts, freezes both profiles and preserves exact rows and audit identity on repeat or conflict',async()=>{
  const actor=await db.user.create({data:{username:'native-install-admin-'+randomUUID(),passwordHash:'synthetic-isolated-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
  const input={schemaVersion:1,items:nativeCognitiveConfigSeeds.map(({testType,configVersion,engineVersion,scoringVersion})=>({testType,configVersion,engineVersion,scoringVersion}))}
  const preview=await planCognitiveConfigInstall(db,input,actor.id)
  expect(preview.rows.map(r=>r.action)).toEqual(['CREATE_DRAFT','CREATE_DRAFT'])
  expect(await db.cognitiveTestConfig.count()).toBe(0)
  expect((await installCognitiveConfigs(db,input,actor.id)).rows.map(r=>r.action)).toEqual(['CREATED_DRAFT','CREATED_DRAFT'])
  const rows=await db.cognitiveTestConfig.findMany({orderBy:{testType:'asc'}})
  expect(rows).toHaveLength(2)
  for(const seed of nativeCognitiveConfigSeeds){
   const row=rows.find(r=>r.testType===seed.testType)!
   expect(row).toMatchObject({...seed,config:seed.config,status:'DRAFT',accessPolicy:'GRANT',publishedAt:null})
   const resource=getCognitiveTaskResource(row.testType,row.engineVersion,row.scoringVersion)!
   if(resource.kind!=='native')throw Error('native resource expected')
   const snapshots=(['experience','research'] as const).map(profile=>freezeNativeAssignmentProfile({resource,baseConfig:row.config,profile}))
   expect(snapshots[0].resolvedConfigHash).not.toBe(snapshots[1].resolvedConfigHash)
   for(const [index,frozen] of snapshots.entries()){
    const report=readFrozenReport(frozen.resolvedReportSnapshotEncrypted)!
    expect(report).toMatchObject({profile:index===0?'experience':'research',nativeIdentity:input.items.find(item=>item.testType===row.testType)})
    const decoded=decryptCognitivePayload<any>(frozen.resolvedConfigSnapshotEncrypted)
    expect(decoded.profile).toBe(report.profile)
    // A caller's later edits to a returned decoded value cannot alter the stored encrypted snapshot.
    decoded.profile='changed-after-freeze'
    expect(decryptCognitivePayload<any>(frozen.resolvedConfigSnapshotEncrypted).profile).toBe(report.profile)
   }
  }
  const repeat=await installCognitiveConfigs(db,input,actor.id)
  expect(repeat.rows.map(r=>r.action)).toEqual(['ALREADY_PRESENT','ALREADY_PRESENT'])
  expect(await db.cognitiveTestConfig.findMany({orderBy:{testType:'asc'}})).toEqual(rows)
  expect(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_CONFIG_INSTALL'}})).toBe(2)
  const pointer=await db.$queryRaw<Array<{measurement_release_id:string|null}>>`SELECT measurement_release_id FROM cognitive_test_configs`
  expect(pointer.every(p=>p.measurement_release_id===null)).toBe(true)
  expect(await db.cognitiveAssignment.count()).toBe(0)
  await db.cognitiveTestConfig.update({where:{id:rows[0].id},data:{status:'RETIRED',name:'Conflict retained in isolated fixture'}})
  const conflict=await installCognitiveConfigs(db,input,actor.id)
  expect(conflict.hasBlocked).toBe(true)
  expect(conflict.rows.find(r=>r.configId===rows[0].id)).toMatchObject({action:'BLOCKED',status:'RETIRED',reasons:['IMMUTABLE_CONFIG_CONFLICT']})
  expect((await db.cognitiveTestConfig.findUniqueOrThrow({where:{id:rows[0].id}})).name).toBe('Conflict retained in isolated fixture')
  expect(await db.assessmentManagementEvent.count({where:{action:'COGNITIVE_CONFIG_INSTALL'}})).toBe(2)
 },30_000)
})
