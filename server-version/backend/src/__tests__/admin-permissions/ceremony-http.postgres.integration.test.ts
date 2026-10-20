import {createHash,generateKeyPairSync,randomBytes,randomUUID,sign as signBytes} from 'node:crypto'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {isoCBOR} from '@simplewebauthn/server/helpers'
const suite=process.env.ADMIN_PERMISSIONS_ISOLATED_TEST==='1'?describe:describe.skip
const origin='http://localhost:5174',base='http://127.0.0.1:3100'
const b64=(value:Buffer|Uint8Array)=>Buffer.from(value).toString('base64url')
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest()
function key(){const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'})
  return {...pair,id:b64(randomBytes(32)),publicKey:Buffer.from(isoCBOR.encode(new Map<number,unknown>([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x!,'base64url')],[-3,Buffer.from(jwk.y!,'base64url')]]) as never))}}
function assertion(k:ReturnType<typeof key>,challenge:string,count:number){
  const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false})),counter=Buffer.alloc(4);counter.writeUInt32BE(count)
  const auth=Buffer.concat([hash('localhost'),Buffer.from([5]),counter])
  return {id:k.id,rawId:k.id,type:'public-key',authenticatorAttachment:'cross-platform',clientExtensionResults:{},response:{clientDataJSON:b64(client),authenticatorData:b64(auth),signature:b64(signBytes('sha256',Buffer.concat([auth,hash(client)]),k.privateKey))}}
}
function client(){const cookies=new Map<string,string>();return {cookies,async call(url:string,method='GET',body?:unknown){
  const response=await fetch(base+url,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),
    ...(cookies.has('ptool_csrf')?{'X-CSRF-Token':decodeURIComponent(cookies.get('ptool_csrf')!)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
  for(const item of response.headers.getSetCookie()){const pair=item.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1))}
  return {status:response.status,body:await response.json() as any}
}}}
suite('actual API password/key/step-up/recovery ceremonies (synthetic crypto)',()=>{
  let db:typeof import('../../config/database')['prisma'],hashPassword:typeof import('../../utils/password')['hashPassword']
  let jwt:typeof import('../../utils/jwt'),service:typeof import('../../modules/admin-permissions/service')
  const privateDir=mkdtempSync(path.join(tmpdir(),'admin-recovery-test-'))
  beforeAll(async()=>{
    if(!new URL(process.env.DATABASE_URL!).pathname.startsWith('/eduk12_admin_permissions_'))throw new Error('Dedicated DB required')
    db=(await import('../../config/database')).prisma;hashPassword=(await import('../../utils/password')).hashPassword;jwt=await import('../../utils/jwt');service=await import('../../modules/admin-permissions/service')
    expect((await fetch(base+'/ready')).status).toBe(200)
  })
  afterAll(async()=>{await db?.$disconnect();rmSync(privateDir,{recursive:true,force:true})})
  async function fixture(system=false){const password=randomBytes(24).toString('base64url')+'7a',k=key()
    const user=await db.user.create({data:{username:'ceremony-'+randomUUID(),passwordHash:await hashPassword(password),role:'STUDENT',accountDomain:'TRAINING',platformRole:system?'SYSTEM_ADMIN':'STANDARD'}})
    if(!system)await db.adminEntryGrant.create({data:{id:randomUUID(),userId:user.id,entry:'TRAINING',grantedBy:user.id}})
    await db.adminSecurityKey.create({data:{id:k.id,userId:user.id,publicKey:k.publicKey,transports:['usb']}})
    return {user,password,k,client:client()}}
  async function login(f:Awaited<ReturnType<typeof fixture>>){
    await f.client.call('/api/auth/csrf')
    const begin=await f.client.call('/api/auth/login','POST',{username:f.user.username,password:f.password})
    expect(begin.status).toBe(200);expect(begin.body.data.adminKeyRequired).toBe(true)
    expect(f.client.cookies.has('ptool_session')).toBe(false)
    expect((await f.client.call('/api/users')).status).toBe(401)
    const finish=await f.client.call('/api/admin/security/authentication/verify','POST',{response:assertion(f.k,begin.body.data.options.challenge,1)})
    expect(finish.status).toBe(200);expect(Boolean(f.client.cookies.get('ptool_session'))).toBe(true)
  }
  it('password challenge cannot access management until key verification; fresh and expired step-up are enforced over HTTP',async()=>{
    const f=await fixture();await login(f)
    expect((await f.client.call('/api/users')).status).toBe(200)
    const claims=jwt.verifyToken(decodeURIComponent(f.client.cookies.get('ptool_session')!))!
    f.client.cookies.set('ptool_session',encodeURIComponent(jwt.generateToken({userId:claims.userId,username:claims.username,role:claims.role,accountDomain:claims.accountDomain,
      tokenVersion:claims.tokenVersion,adminSessionId:claims.adminSessionId,adminVerifiedAt:Math.floor(Date.now()/1000)-301})))
    const body={username:'synthetic-create-'+randomUUID(),password:randomBytes(24).toString('base64url')+'7a',role:'STUDENT'}
    expect((await f.client.call('/api/users','POST',body)).status).toBe(403)
    let options=await f.client.call('/api/admin/security/step-up/options','POST',{})
    const response=assertion(f.k,options.body.data.options.challenge,2)
    expect((await f.client.call('/api/admin/security/step-up/verify','POST',{response})).status).toBe(200)
    expect((await f.client.call('/api/users','POST',body)).body.code).toBe(0)
    expect((await f.client.call('/api/admin/security/step-up/verify','POST',{response})).status).toBe(403)
    options=await f.client.call('/api/admin/security/step-up/options','POST',{})
    await db.adminSecurityChallenge.updateMany({where:{userId:f.user.id,purpose:'STEP_UP'},data:{expiresAt:new Date(Date.now()-1000)}})
    expect((await f.client.call('/api/admin/security/step-up/verify','POST',{response:assertion(f.k,options.body.data.options.challenge,3)})).status).toBe(403)
    const actor=await fixture(true)
    await service.changeEntryGrant({actorUserId:actor.user.id,actorSession:{tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()},targetUserId:f.user.id,entry:'TRAINING',active:false,expectedVersion:1,reason:'synthetic HTTP ceremony revoke'})
    expect((await f.client.call('/api/users')).status).toBe(401)
    f.client.cookies.delete('ptool_session')
    expect((await f.client.call('/api/auth/login','POST',{username:f.user.username,password:f.password})).body.data.user.role).toBe('STUDENT')
    expect((await f.client.call('/api/users')).status).toBe(403)
  })
  it('operator recovery destroys old keys/challenges, invalidates old sessions and never issues a session',async()=>{
    const f=await fixture(true);await login(f)
    expect((await f.client.call('/api/admin/permissions/accounts')).status).toBe(200)
    const pending=await f.client.call('/api/admin/security/step-up/options','POST',{})
    const oldResponse=assertion(f.k,pending.body.data.options.challenge,2),handoff=path.join(privateDir,'recovery.json')
    const result=spawnSync(process.execPath,['--import','tsx','src/scripts/admin-security-bootstrap.ts'],{cwd:process.cwd(),encoding:'utf8',
      env:{...process.env,ADMIN_SECURITY_BOOTSTRAP_ENABLED:'true',ADMIN_SECURITY_HANDOFF_FILE:handoff},
      input:JSON.stringify({action:'RECOVER',username:f.user.username,reason:'synthetic controlled recovery validation'})})
    expect(result.status).toBe(0)
    const report=JSON.parse(result.stdout.trim().split('\n').at(-1)!)
    expect(report).toMatchObject({action:'RECOVER',loginRequiresSecurityKey:true,privateHandoffCreated:true})
    expect(report).not.toHaveProperty('enrollmentToken');expect(report).not.toHaveProperty('session')
    expect(await db.adminSecurityKey.count({where:{userId:f.user.id}})).toBe(0)
    expect((await f.client.call('/api/admin/permissions/accounts')).status).toBe(401)
    expect((await f.client.call('/api/admin/security/authentication/verify','POST',{response:oldResponse})).status).toBe(403)
    f.client.cookies.delete('ptool_session')
    expect((await f.client.call('/api/auth/login','POST',{username:f.user.username,password:f.password})).status).toBe(403)
    expect(f.client.cookies.has('ptool_session')).toBe(false)
    const token=JSON.parse(readFileSync(handoff,'utf8')).enrollmentToken
    expect((await f.client.call('/api/admin/security/registration/options','POST',{username:f.user.username,password:f.password,enrollmentToken:token})).status).toBe(200)
    expect(f.client.cookies.has('ptool_session')).toBe(false)
  })
  it('mandatory password change invalidates the old admin session and requires password plus key again',async()=>{
    const f=await fixture()
    await db.user.update({where:{id:f.user.id},data:{mustChangePassword:true}})
    await login(f)
    expect((await f.client.call('/api/users')).status).toBe(403)
    expect((await f.client.call('/api/auth/me')).body.data.mustChangePassword).toBe(true)
    const oldCookie=f.client.cookies.get('ptool_session')!,newPassword=randomBytes(24).toString('base64url')+'9a'
    expect((await f.client.call('/api/auth/change-password','POST',{oldPassword:f.password,newPassword})).body.code).toBe(0)
    expect(Boolean(f.client.cookies.get('ptool_session'))).toBe(false)
    f.client.cookies.set('ptool_session',oldCookie)
    expect((await f.client.call('/api/users')).status).toBe(401)
    f.client.cookies.delete('ptool_session')
    const begin=await f.client.call('/api/auth/login','POST',{username:f.user.username,password:newPassword})
    expect(begin.body.data.adminKeyRequired).toBe(true);expect(f.client.cookies.has('ptool_session')).toBe(false)
    expect((await f.client.call('/api/admin/security/authentication/verify','POST',{response:assertion(f.k,begin.body.data.options.challenge,2)})).status).toBe(200)
    expect((await f.client.call('/api/users')).status).toBe(200)
    expect((await f.client.call('/api/auth/me')).body.data.mustChangePassword).toBe(false)
  })
})
