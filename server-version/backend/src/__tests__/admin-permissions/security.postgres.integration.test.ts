import {createHash,generateKeyPairSync,randomBytes,randomUUID,sign} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {isoCBOR} from '@simplewebauthn/server/helpers'
import type {AuthenticationResponseJSON,RegistrationResponseJSON} from '@simplewebauthn/server'

const suite=process.env.ADMIN_PERMISSIONS_ISOLATED_TEST==='1'?describe:describe.skip
let db:typeof import('../../config/database')['prisma']
let security:typeof import('../../modules/admin-permissions/security')
const hash=(data:string|Buffer)=>createHash('sha256').update(data).digest()
const encoded=(data:Buffer|Uint8Array)=>Buffer.from(data).toString('base64url')
function key(){const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'})
  return {...pair,id:encoded(randomBytes(32)),cose:Buffer.from(isoCBOR.encode(new Map<number,unknown>([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x!,'base64url')],[-3,Buffer.from(jwk.y!,'base64url')]]) as never))}}
const counter=(value:number)=>{const data=Buffer.alloc(4);data.writeUInt32BE(value);return data}
function registration(k:ReturnType<typeof key>,challenge:string,{origin='http://localhost:5174',rp='localhost',flags=0x45}={}):RegistrationResponseJSON{
  const client=Buffer.from(JSON.stringify({type:'webauthn.create',challenge,origin,crossOrigin:false}))
  const credentialId=Buffer.from(k.id,'base64url'),length=Buffer.alloc(2);length.writeUInt16BE(credentialId.length)
  const authData=Buffer.concat([hash(rp),Buffer.from([flags]),counter(0),Buffer.alloc(16),length,credentialId,k.cose])
  return {id:k.id,rawId:k.id,type:'public-key',authenticatorAttachment:'cross-platform',clientExtensionResults:{},response:{clientDataJSON:encoded(client),
    attestationObject:encoded(isoCBOR.encode(new Map<string,unknown>([['fmt','none'],['authData',authData],['attStmt',new Map()]]) as never)),transports:['usb']}}
}
function assertion(k:ReturnType<typeof key>,challenge:string,{origin='http://localhost:5174',rp='localhost',flags=5,count=1}={}):AuthenticationResponseJSON{
  const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false}))
  const authData=Buffer.concat([hash(rp),Buffer.from([flags]),counter(count)])
  return {id:k.id,rawId:k.id,type:'public-key',authenticatorAttachment:'cross-platform',clientExtensionResults:{},response:{clientDataJSON:encoded(client),
    authenticatorData:encoded(authData),signature:encoded(sign('sha256',Buffer.concat([authData,hash(client)]),k.privateKey))}}
}
function context(){let cookie='';const req:any={secure:false,headers:{cookie:''}},res:any={
  append:(_name:string,value:string)=>{cookie=value.split(';')[0];req.headers.cookie=cookie},
  setHeader:()=>{},getHeader:()=>undefined,
};return {req,res}}
async function account(){return db.user.create({data:{username:'security-test-'+randomUUID(),passwordHash:'unusable-synthetic',role:'STUDENT',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING'}})}
async function enroll(userId:string,k=key()){
  const user=await db.user.findUniqueOrThrow({where:{id:userId}}),token=randomBytes(32).toString('base64url')
  await db.adminSecurityChallenge.create({data:{idHash:security.adminSecretHash(token),userId,purpose:'ENROLLMENT',tokenVersion:user.tokenVersion,challenge:'',expiresAt:new Date(Date.now()+60000)}})
  const ctx=context(),options=await security.beginAdminRegistration(ctx.req,ctx.res,userId,token)
  return {...ctx,options:options.options,token,k}
}
suite('WebAuthn cryptographic boundaries, real PostgreSQL (synthetic keys)',()=>{
  beforeAll(async()=>{
    if(!new URL(process.env.DATABASE_URL!).pathname.startsWith('/eduk12_admin_permissions_'))throw new Error('Disposable DB required')
    process.env.ADMIN_WEBAUTHN_RP_ID='localhost';process.env.ADMIN_WEBAUTHN_ORIGIN='http://localhost:5174';process.env.ADMIN_AUTH_ORIGIN='http://localhost:5174'
    db=(await import('../../config/database')).prisma;security=await import('../../modules/admin-permissions/security')
  })
  afterAll(()=>db?.$disconnect())
  it('registers only with a one-use operator ticket; registration issues no login session',async()=>{
    const u=await account(),c=await enroll(u.id)
    expect(await security.finishAdminRegistration(c.req,registration(c.k,c.options.challenge))).toEqual({registered:true})
    expect(await db.adminSecurityKey.count({where:{userId:u.id}})).toBe(1)
    await expect(security.finishAdminRegistration(c.req,registration(c.k,c.options.challenge))).rejects.toMatchObject({statusCode:403})
    await expect(security.beginAdminRegistration(c.req,c.res,u.id,c.token)).rejects.toMatchObject({statusCode:403})
    expect(c.req.headers.cookie.startsWith('eduk12_admin_challenge=')).toBe(true)
  })
  it.each([{origin:'https://attacker.invalid'},{rp:'attacker.invalid'},{flags:0x41},{flags:0x5d}])('rejects registration origin/RP/UV/backup changes: %j',async bad=>{
    const u=await account(),c=await enroll(u.id)
    await expect(security.finishAdminRegistration(c.req,registration(c.k,c.options.challenge,bad))).rejects.toMatchObject({statusCode:403})
    expect(await db.adminSecurityKey.count({where:{userId:u.id}})).toBe(0)
  })
  it('rejects expired challenge and expired ticket',async()=>{
    const u=await account(),c=await enroll(u.id)
    await db.adminSecurityChallenge.updateMany({where:{userId:u.id},data:{expiresAt:new Date(Date.now()-1000)}})
    await expect(security.finishAdminRegistration(c.req,registration(c.k,c.options.challenge))).rejects.toMatchObject({statusCode:403})
    await expect(security.beginAdminRegistration(c.req,c.res,u.id,c.token)).rejects.toMatchObject({statusCode:403})
  })
  it('only one racing signature verification succeeds; replay is rejected',async()=>{
    const u=await account(),c=await enroll(u.id)
    await security.finishAdminRegistration(c.req,registration(c.k,c.options.challenge))
    const options=await security.beginAdminLogin(c.req,c.res,u.id),response=assertion(c.k,options.options.challenge)
    const result=await Promise.allSettled([security.finishAdminAuthentication(c.req,c.res,response),security.finishAdminAuthentication(c.req,c.res,response)])
    expect(result.map(x=>x.status).sort()).toEqual(['fulfilled','rejected'])
    expect((result.find(x=>x.status==='rejected') as PromiseRejectedResult).reason).toMatchObject({statusCode:403})
    expect((await db.adminSecurityKey.findUniqueOrThrow({where:{id:c.k.id}})).counter).toBe(1n)
  })
  it.each([{origin:'https://attacker.invalid'},{rp:'attacker.invalid'},{flags:1},{flags:0x1d}])('rejects signed assertion origin/RP/UV/backup changes: %j',async bad=>{
    const u=await account(),c=await enroll(u.id)
    await security.finishAdminRegistration(c.req,registration(c.k,c.options.challenge))
    const options=await security.beginAdminLogin(c.req,c.res,u.id)
    await expect(security.finishAdminAuthentication(c.req,c.res,assertion(c.k,options.options.challenge,bad))).rejects.toMatchObject({statusCode:403})
  })
  it('credential ownership and post-challenge account version are authoritative',async()=>{
    const u=await account(),other=await account(),c=await enroll(u.id),d=await enroll(other.id)
    await security.finishAdminRegistration(c.req,registration(c.k,c.options.challenge));await security.finishAdminRegistration(d.req,registration(d.k,d.options.challenge))
    let options=await security.beginAdminLogin(c.req,c.res,u.id)
    await expect(security.finishAdminAuthentication(c.req,c.res,assertion(d.k,options.options.challenge))).rejects.toMatchObject({statusCode:403})
    options=await security.beginAdminLogin(c.req,c.res,u.id)
    await db.user.update({where:{id:u.id},data:{tokenVersion:{increment:1}}})
    await expect(security.finishAdminAuthentication(c.req,c.res,assertion(c.k,options.options.challenge))).rejects.toMatchObject({statusCode:403})
  })
  it('step-up is bound to the original authenticated account and session',async()=>{
    const u=await account(),c=await enroll(u.id)
    await security.finishAdminRegistration(c.req,registration(c.k,c.options.challenge))
    const options=await security.beginAdminLogin(c.req,c.res,u.id,'original-session')
    c.req.user={userId:u.id}
    await expect(security.finishAdminAuthentication(c.req,c.res,assertion(c.k,options.options.challenge),'other-session')).rejects.toMatchObject({statusCode:403})
  })
})
