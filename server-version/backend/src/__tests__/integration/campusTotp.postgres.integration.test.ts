import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integrationDatabaseUrl } from './integration-env'
import {
  beginSchoolMfaChallenge, schoolAccountNeedsMfa, startSchoolMfaEnrollment,
  completeSchoolMfa, totpAt, verifySchoolTotpStepUp,
} from '../../modules/campus/mfa.service'

const URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL','COGNITIVE_INTEGRATION_DB_URL')
const suite=URL?describe:describe.skip
let db:PrismaClient
function secretFromBase32(value:string):Buffer {
  const alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits=0,acc=0
  const bytes:number[]=[]
  for(const character of value){
    acc=(acc<<5)|alpha.indexOf(character);bits+=5
    if(bits>=8){bits-=8;bytes.push((acc>>>bits)&255)}
  }
  return Buffer.from(bytes)
}
function reqRes() {
  const cookies:string[]=[]
  const req={secure:false} as Request
  const res={append:(_key:string,value:string)=>{cookies.push(value);return res}} as unknown as Response
  return {req,res,cookies}
}
function challengeCookie(cookies:string[]):string {
  const current=cookies.filter(value=>value.startsWith('huischool_mfa_pending=')).at(-1)!
  return decodeURIComponent(current.split(';')[0].split('=')[1])
}
suite('Huischool TOTP challenge and recovery replay — isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    process.env.CAMPUS_MFA_ENCRYPTION_KEY='34'.repeat(32)
    db=new PrismaClient({datasources:{db:{url:URL!}}})
    await db.$connect()
  })
  afterAll(async()=>{await db?.$disconnect()})
  it('does not issue credential before MFA and rejects replayed TOTP/recovery codes',async()=>{
    const user=await db.user.create({data:{
      username:'campus_mfa_test_'+randomUUID().replace(/-/g,''),
      passwordHash:'synthetic-only',role:'ADMIN',accountDomain:'SCHOOL',
    }})
    const loginName='mfatest_'+randomUUID().slice(0,8)
    await db.campusAccount.create({data:{
      userId:user.id,loginName,normalizedLogin:loginName.toLowerCase(),
    }})
    expect(await schoolAccountNeedsMfa(user.id)).toBe(true)
    const req1=reqRes()
    const pending=await beginSchoolMfaChallenge(req1.req,req1.res,user.id,user.tokenVersion)
    expect(pending).toEqual({mfaRequired:true,enrolled:false})
    const raw=challengeCookie(req1.cookies)
    const setup=await startSchoolMfaEnrollment(raw)
    expect(setup?.otpauthUri).toContain('otpauth://totp/')
    const secret=secretFromBase32(new URL(setup!.otpauthUri).searchParams.get('secret')!)
    const code=totpAt(secret,Math.floor(Date.now()/30000))
    const completed=await completeSchoolMfa(raw,code,'ENROLL')
    expect(completed?.recoveryCodes).toHaveLength(10)
    const stored=await db.campusMfaCredential.findUniqueOrThrow({where:{userId:user.id}})
    expect(stored.enabled).toBe(true)
    expect(stored.secretCipher).not.toContain(new URL(setup!.otpauthUri).searchParams.get('secret')!)
    expect(await verifySchoolTotpStepUp(user.id,code)).toBe(false)
    const req2=reqRes()
    await beginSchoolMfaChallenge(req2.req,req2.res,user.id,user.tokenVersion)
    const second=challengeCookie(req2.cookies)
    await expect(completeSchoolMfa(second,code,'VERIFY')).resolves.toBeNull()
    const recovery=completed!.recoveryCodes[0]
    await expect(completeSchoolMfa(second,recovery,'RECOVERY')).resolves.toMatchObject({user:{id:user.id}})
    const req3=reqRes()
    await beginSchoolMfaChallenge(req3.req,req3.res,user.id,user.tokenVersion)
    await expect(completeSchoolMfa(challengeCookie(req3.cookies),recovery,'RECOVERY')).resolves.toBeNull()
    const used=await db.campusMfaRecoveryCode.findMany({where:{userId:user.id,usedAt:{not:null}}})
    expect(used).toHaveLength(1)
  })
})
