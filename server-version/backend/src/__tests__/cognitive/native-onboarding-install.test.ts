import {describe,expect,it,vi} from 'vitest'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {nativeCognitiveConfigSeeds as registeredSeeds} from '../../modules/cognitive/content-candidates/native-registry/config-seeds'
import {nativeMotConfigSeed,nativeEnumerationConfigSeed} from '../../../prisma/seeds/native-cognitive'
import {planCognitiveConfigInstall} from '../../modules/cognitive/onboarding/install'

const nativeCognitiveConfigSeeds=registeredSeeds.filter(seed=>['mot','enumeration'].includes(seed.testType))
const identity=(seed:typeof nativeCognitiveConfigSeeds[number])=>({testType:seed.testType,configVersion:seed.configVersion,engineVersion:seed.engineVersion,scoringVersion:seed.scoringVersion})
describe('existing native configurations in selected installation',()=>{
 it('shares unchanged exact factories with Prisma and previews both real definitions without writes',async()=>{
  expect(nativeCognitiveConfigSeeds).toEqual([nativeMotConfigSeed(),nativeEnumerationConfigSeed()])
  expect(nativeCognitiveConfigSeeds.map(canonicalHash)).toEqual([
   'e3f78cf03550a3ff22e89892c5455f7027c37f11fa5e3bef5e9d67c57623b747',
   'e600658d04d1f3bdbbf193490031b0cbdbd62d79dc8261b21b2b878ed1ef57d6',
  ])
  const findUnique=vi.fn(async()=>null),db:any={user:{findUnique:async()=>({platformRole:'SYSTEM_ADMIN',isActive:true,isFrozen:false,expiresAt:null})},cognitiveTestConfig:{findUnique}}
  const plan=await planCognitiveConfigInstall(db,{schemaVersion:1,items:nativeCognitiveConfigSeeds.map(identity)},'synthetic-admin')
  expect(plan.hasBlocked).toBe(false)
  expect(plan.rows.map(row=>[row.testType,row.action])).toEqual([['mot','CREATE_DRAFT'],['enumeration','CREATE_DRAFT']])
  expect(findUnique).toHaveBeenCalledTimes(2)
 })
 it('never falls back to old or nearby native versions and rejects duplicate native selection',async()=>{
  const db:any={user:{findUnique:async()=>({platformRole:'SYSTEM_ADMIN',isActive:true,isFrozen:false,expiresAt:null})},cognitiveTestConfig:{findUnique:vi.fn()}}
  const current=identity(nativeEnumerationConfigSeed()),rows=(await planCognitiveConfigInstall(db,{schemaVersion:1,items:[
   {...current,configVersion:'0.2.0'},current,current,
  ]},'synthetic-admin')).rows
  expect(rows.map(row=>row.reasons)).toEqual([['CONFIG_SEED_NOT_REGISTERED'],['DUPLICATE_CONFIG_SELECTION'],['DUPLICATE_CONFIG_SELECTION']])
  const wrong=await planCognitiveConfigInstall(db,{schemaVersion:1,items:[{...current,engineVersion:'0.1.0'}]},'synthetic-admin')
  expect(wrong.rows[0].reasons).toEqual(['EXECUTION_IDENTITY_MISMATCH'])
  expect(db.cognitiveTestConfig.findUnique).not.toHaveBeenCalled()
 })
})
