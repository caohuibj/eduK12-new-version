import {Prisma} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {canonicalHash,canonicalJsonString} from '../../modules/assessment-runtime/canonical'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip

suite('Education scientific source hash / structural binding separation',()=>{
 beforeAll(()=>requireIsolatedReleaseDatabase(url!))
 afterAll(async()=>{await db.$disconnect()})

 it('matches the existing JS publisher bytes for fractional, signed, exponent and map-key boundaries without rounding',async()=>{
  const inputs:unknown[]=[
   {scores:[0.5,1.5,-0.5,-1.5,0,-0,0.1+0.2,1.0000000000000002,10000,-10000]},
   {weights:[1e-7,1e-6,1e-5,1e20,1e21,1e22,-1e-7,-1e21,Number.MIN_VALUE,Number.MAX_VALUE]},
   {values:{'10':0.5,'2':-1.5,'0':1e-7,'01':1.5,'4294967294':0.5,'4294967295':-0.5}},
   {values:{'𐀀':0.5,'\ue000':1.5,'é':-0.5,'a\u0301':1e-7,'a':1e-6}},
   {text:'科学 "/ \\ \b \f \n \r \t 𐀀',nested:[null,true,false,[],{},'0.5'],map:{'\n':0.5}},
  ]
  for(const input of inputs){
   const [actual]=await db.$queryRaw<Array<{json:string;hash:string}>>(Prisma.sql`
    SELECT education_composition_scientific_json(${JSON.stringify(input)}::jsonb) AS json,
     education_composition_scientific_hash(${JSON.stringify(input)}::jsonb) AS hash`)
   expect(actual.json).toBe(canonicalJsonString(input))
   expect(actual.hash).toBe(canonicalHash(input))
  }
 })

 it('keeps structural positions integer-only and continues rejecting forged numeric bindings',async()=>{
  for(const position of [0.5,-1])await expect(db.$queryRaw(Prisma.sql`
   SELECT education_composition_binding_hash(${JSON.stringify({schemaVersion:1,position})}::jsonb)`))
    .rejects.toThrow('EDUCATION_BINDING_INTEGER_REQUIRED')
  const input={schemaVersion:1,position:0}
  const [actual]=await db.$queryRaw<Array<{hash:string}>>(Prisma.sql`
   SELECT education_composition_binding_hash(${JSON.stringify(input)}::jsonb) AS hash`)
  expect(actual.hash).toBe(canonicalHash(input))
 })
})
