import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {cognitiveSeeds} from '../../modules/cognitive/generated/seeds'
import {planCognitiveConfigInstall,installCognitiveConfigs} from '../../modules/cognitive/onboarding/install'

const url=integrationDatabaseUrl('COGNITIVE_INSTALL_TEST_DATABASE_URL'),suite=url?describe:describe.skip
suite('selected cognitive installation with isolated PostgreSQL',()=>{
  let db:PrismaClient
  beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
  afterAll(async()=>{await db?.$disconnect()})
  it('previews and installs a registered draft once without publishing, granting access or overwriting conflicts',async()=>{
    const seed=cognitiveSeeds.find(value=>value.testType==='reaction'&&value.configVersion==='1.1.0')!
    expect(seed).toBeDefined()
    const actor=await db.user.create({data:{username:'install-admin-'+randomUUID(),passwordHash:'synthetic-isolated-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
    const selector={testType:seed.testType,configVersion:seed.configVersion,engineVersion:seed.engineVersion,scoringVersion:seed.scoringVersion}
    const input={schemaVersion:1,items:[selector]},where={testType_configVersion:{testType:seed.testType,configVersion:seed.configVersion}}
    expect(await planCognitiveConfigInstall(db,input,actor.id)).toMatchObject({mode:'PREVIEW',rows:[{action:'CREATE_DRAFT'}]})
    expect(await db.cognitiveTestConfig.findUnique({where})).toBeNull()
    expect(await installCognitiveConfigs(db,input,actor.id)).toMatchObject({rows:[{action:'CREATED_DRAFT',status:'DRAFT'}]})
    const installed=await db.cognitiveTestConfig.findUniqueOrThrow({where})
    expect(installed).toMatchObject({status:'DRAFT',accessPolicy:'GRANT',publishedAt:null,engineVersion:seed.engineVersion,scoringVersion:seed.scoringVersion,config:seed.config})
    const pointer=await db.$queryRaw<Array<{measurement_release_id:string|null}>>`SELECT measurement_release_id FROM cognitive_test_configs WHERE id=${installed.id}`
    expect(pointer[0].measurement_release_id).toBeNull()
    expect(await installCognitiveConfigs(db,input,actor.id)).toMatchObject({rows:[{action:'ALREADY_PRESENT',configId:installed.id}]})
    expect(await db.assessmentManagementEvent.count({where:{resourceId:installed.id,action:'COGNITIVE_CONFIG_INSTALL'}})).toBe(1)
    await db.cognitiveTestConfig.update({where:{id:installed.id},data:{name:'Conflicting draft kept intact'}})
    expect(await installCognitiveConfigs(db,input,actor.id)).toMatchObject({hasBlocked:true,rows:[{action:'BLOCKED',reasons:['IMMUTABLE_CONFIG_CONFLICT']}]})
    expect((await db.cognitiveTestConfig.findUniqueOrThrow({where})).name).toBe('Conflicting draft kept intact')
    await db.user.update({where:{id:actor.id},data:{isFrozen:true}})
    await expect(installCognitiveConfigs(db,input,actor.id)).rejects.toThrow('ACTIVE_SYSTEM_ADMIN_REQUIRED')
    expect(await db.assessmentManagementEvent.count({where:{resourceId:installed.id,action:'COGNITIVE_CONFIG_INSTALL'}})).toBe(1)
  },30_000)
})
