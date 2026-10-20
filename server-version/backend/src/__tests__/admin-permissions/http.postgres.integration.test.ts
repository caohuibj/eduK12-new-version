import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import express from 'express'

const suite=process.env.ADMIN_PERMISSIONS_ISOLATED_TEST==='1'?describe:describe.skip
suite('real HTTP middleware, routes and current PostgreSQL authority',()=>{
  let db:typeof import('../../config/database')['prisma'],sign:typeof import('../../utils/jwt')['generateToken']
  let server:Server,base:string,systemId:string,trainingId:string
  const users=new Map<string,{id:string;username:string;role:any;accountDomain:any;tokenVersion:number}>()
  beforeAll(async()=>{
    if(!new URL(process.env.DATABASE_URL!).pathname.startsWith('/eduk12_admin_permissions_'))throw new Error('Disposable database required')
    db=(await import('../../config/database')).prisma;sign=(await import('../../utils/jwt')).generateToken
    process.env.ADMIN_WEBAUTHN_ORIGIN='http://localhost:5174';process.env.ADMIN_WEBAUTHN_RP_ID='localhost'
    for(const name of ['system','training','legacy','school','survey']){
      const u=await db.user.create({data:{username:'http-admin-'+randomUUID(),passwordHash:'unusable-synthetic',role:name==='training'?'TEACHER':'ADMIN',
        platformRole:name==='system'?'SYSTEM_ADMIN':'STANDARD',accountDomain:name==='school'?'SCHOOL':name==='survey'?'SURVEY':'TRAINING'}})
      users.set(name,u);if(name==='system')systemId=u.id;if(name==='training')trainingId=u.id
    }
    await db.adminEntryGrant.create({data:{id:randomUUID(),userId:trainingId,entry:'TRAINING',grantedBy:systemId}})
    const app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
    app.use('/api/users',(await import('../../routes/users')).default)
    app.use('/api/auth',(await import('../../routes/auth')).default)
    app.use('/api/admin/permissions',(await import('../../modules/admin-permissions/routes')).adminPermissionsRouter)
    app.use((await import('../../middleware/errorHandler')).errorHandler)
    server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
    base='http://127.0.0.1:'+(server.address() as {port:number}).port
  },30000)
  afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await (await import('../../config/queue')).closeQueues(true);await db?.$disconnect()})
  function token(name:string,proof=true,extra:Record<string,unknown>={}){const u=users.get(name)!;return sign({userId:u.id,username:u.username,role:u.role,accountDomain:u.accountDomain,tokenVersion:u.tokenVersion,
    ...(proof?{adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}:{}),...extra})}
  async function call(name:string,path:string,method='GET',body?:unknown,proof=true,extra:Record<string,unknown>={}){
    const response=await fetch(base+'/api'+path,{method,headers:{Cookie:'ptool_session='+token(name,proof,extra)+'; ptool_csrf=synthetic-csrf',Origin:'http://localhost:5174',
      'Content-Type':'application/json','X-CSRF-Token':'synthetic-csrf'},...(body===undefined?{}:{body:JSON.stringify(body)})})
    return {status:response.status,body:await response.json() as any}
  }
  it('old ADMIN and system role do not imply Training entry; entry admin does not imply system',async()=>{
    expect((await call('legacy','/users')).status).toBe(403)
    expect((await call('system','/users')).status).toBe(403)
    expect((await call('training','/users')).status).toBe(200)
    expect((await call('training','/admin/permissions/accounts')).status).toBe(403)
    expect((await call('system','/admin/permissions/accounts')).status).toBe(200)
  })
  it('password-only, future and expired key proofs cannot create admin authority',async()=>{
    expect((await call('training','/users','GET',undefined,false)).status).toBe(401)
    expect((await call('system','/admin/permissions/accounts','GET',undefined,false)).status).toBe(401)
    for(const age of [-30,8*3600+1])expect((await call('training','/users','GET',undefined,true,{adminVerifiedAt:Math.floor(Date.now()/1000)-age})).status).toBe(401)
  })
  it('different account realms cannot substitute even correctly signed ADMIN tokens',async()=>{
    for(const name of ['school','survey'])expect((await call(name,'/users')).status).toBe(401)
  })
  it.each([{isActive:false},{isFrozen:true},{expiresAt:new Date(Date.now()-1000)}])('current unusable state denies a previously valid session: %j',async state=>{
    await db.user.update({where:{id:trainingId},data:state})
    try{expect((await call('training','/users')).status).toBe(401)}finally{await db.user.update({where:{id:trainingId},data:{isActive:true,isFrozen:false,expiresAt:null}})}
  })
  it('forced password change restricts business writes while keeping the repair endpoint reachable',async()=>{
    await db.user.update({where:{id:trainingId},data:{mustChangePassword:true}})
    try{expect((await call('training','/users')).status).toBe(403);expect((await call('training','/auth/me')).status).toBe(200)}
    finally{await db.user.update({where:{id:trainingId},data:{mustChangePassword:false}})}
  })
  it('public registration and generic create/edit reject attempted privilege fields',async()=>{
    const target=users.get('legacy')!
    const create=await call('training','/users','POST',{username:'denied-'+randomUUID(),password:'SyntheticOnly7',role:'ADMIN',platformRole:'SYSTEM_ADMIN',entryGrants:['SURVEY']})
    expect(create.body.code).not.toBe(0)
    const edit=await call('training','/users/'+target.id,'PUT',{platformRole:'SYSTEM_ADMIN',role:'ADMIN',entryGrants:['SURVEY']})
    expect(edit.body.code).not.toBe(0)
    const registration=await call('legacy','/auth/student-register','POST',{username:'synthetic-student',password:'SyntheticOnly7',nickname:'合成账号',courseCode:'invalid',platformRole:'SYSTEM_ADMIN'})
    expect(registration.body.code).not.toBe(0)
    expect((await db.user.findUniqueOrThrow({where:{id:target.id}})).platformRole).toBe('STANDARD')
  })
  it('sensitive grant changes need recent key proof, current system role and strict input',async()=>{
    const path='/admin/permissions/accounts/'+users.get('legacy')!.id+'/entries/SURVEY'
    const body={active:true,expectedVersion:0,reason:'synthetic HTTP check'}
    expect((await call('system',path,'PUT',body,true,{adminVerifiedAt:Math.floor(Date.now()/1000)-301})).status).toBe(403)
    expect((await call('system',path,'PUT',{...body,platformRole:'SYSTEM_ADMIN'})).status).toBe(400)
    await db.user.update({where:{id:systemId},data:{platformRole:'STANDARD'}})
    try{expect((await call('system',path,'PUT',body)).status).toBe(403)}finally{await db.user.update({where:{id:systemId},data:{platformRole:'SYSTEM_ADMIN'}})}
    expect(await db.adminEntryGrant.count({where:{userId:users.get('legacy')!.id}})).toBe(0)
  })
  it('self profile endpoints expose the same current entry authority, never the raw legacy role',async()=>{
    for(const endpoint of ['/auth/me','/users/me']){
      const response=await call('training',endpoint)
      expect(response.status).toBe(200);expect(response.body.data.role).toBe('ADMIN')
      expect(response.body.data.businessRole).toBe('TEACHER')
      expect(response.body.data.entryGrants).toEqual([{entry:'TRAINING',version:1}])
    }
  })
  it('committed revocation denies the old session; new login principal has no revoked privilege',async()=>{
    const path='/admin/permissions/accounts/'+trainingId+'/entries/TRAINING'
    expect((await call('system',path,'PUT',{active:false,expectedVersion:1,reason:'synthetic HTTP revoke'})).status).toBe(200)
    expect((await call('training','/users')).status).toBe(401)
    users.get('training')!.tokenVersion++
    expect((await call('training','/users','GET',undefined,false)).status).toBe(403)
    expect((await call('training','/auth/me','GET',undefined,false)).body.data.role).toBe('TEACHER')
  })
})
