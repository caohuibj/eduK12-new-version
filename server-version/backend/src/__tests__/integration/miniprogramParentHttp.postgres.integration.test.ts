import {randomUUID} from 'node:crypto'
import {createRequire} from 'node:module'
import type {Server} from 'node:http'
import express from 'express'
import bcrypt from 'bcryptjs'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {UserRole} from '@prisma/client'
import {config} from '../../config'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl} from './integration-env'
import authRoutes from '../../routes/auth'
import capabilitiesRoutes from '../../routes/capabilities'
import {parentLinksRouter,parentsRouter} from '../../modules/parent-portal/routes'
import {csrfProtection} from '../../middleware/csrf'
const require=createRequire(import.meta.url)
const {createRuntime}=require('../../../../miniprogram-v2/app/bootstrap/index.js')
const {createParentService}=require('../../../../miniprogram-v2/domains/parents/service.js')
const url=integrationDatabaseUrl('PARENT_PORTAL_TEST_DB_URL','RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let server:Server,baseUrl:string,passwordHash:string,previousFlag:boolean
const password='Synthetic-parent-test-2026'
async function account(role:UserRole){return prisma.user.create({data:{username:'mini-http-'+randomUUID(),passwordHash,role,teacherApproved:true}})}
function client(){
 const stored=new Map(),calls:any[]=[]
 const platform={
  canIUse:()=>true,
  request(options:any){
   calls.push(options)
   const path=new URL(options.url).pathname+new URL(options.url).search
   void fetch(baseUrl+path,{method:options.method,headers:{...options.header,'Content-Type':'application/json'},body:['GET','HEAD'].includes(options.method)?undefined:JSON.stringify(options.data)})
    .then(async res=>options.success({statusCode:res.status,header:Object.fromEntries(res.headers),cookies:res.headers.getSetCookie(),data:await res.json()})).catch(options.fail)
  },
  getNetworkType(o:any){o.success({networkType:'wifi'})},onNetworkStatusChange(){},
  setStorage(o:any){expect(o.encrypt).toBe(true);stored.set(o.key,structuredClone(o.data));o.success({})},
  getStorage(o:any){expect(o.encrypt).toBe(true);if(stored.has(o.key))o.success({data:structuredClone(stored.get(o.key))});else o.fail({})},
  removeStorage(o:any){stored.delete(o.key);o.success({})},
 }
 // HTTPS configuration stays enforced; only this test platform maps transport to its loopback listener.
 const runtime=createRuntime(platform,'https://mini-http-fixture.example')
 runtime.parents=createParentService(runtime.api,runtime.session)
 return {runtime,stored,calls}
}
// Real Cookie/CSRF/auth/DB/API contracts; no native renderer or timing claims.
suite('Mini runtime against actual parent HTTP and database contracts',()=>{
 beforeAll(async()=>{
  const fixture=new URL(url!),actual=new URL(process.env.DATABASE_URL??'')
  if(fixture.host!==actual.host||fixture.pathname!==actual.pathname)throw new Error('HTTP fixture requires the explicitly selected test datasource')
  const releaseFixture=process.env.RELEASE_VERIFY_LOCAL==='true'&&['localhost','127.0.0.1'].includes(fixture.hostname)&&fixture.pathname==='/eduk12_release'
  const hosted=process.env.CI==='true'&&['localhost','127.0.0.1'].includes(fixture.hostname)&&fixture.pathname==='/ptool'
  if(!/test|ci/i.test(fixture.pathname)&&!hosted&&!releaseFixture)throw new Error('requires a test database')
  previousFlag=config.parentPortalEnabled;config.parentPortalEnabled=true
  passwordHash=await bcrypt.hash(password,4)
  const app=express();app.use(express.json());app.use('/api',csrfProtection);app.use('/api/auth',authRoutes);app.use('/api/capabilities',capabilitiesRoutes);app.use('/api/parent-links',parentLinksRouter);app.use('/api/parents',parentsRouter)
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(500).json({code:'FIXTURE_ERROR',data:null,message:'fixture failure'}))
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('listener missing');baseUrl='http://127.0.0.1:'+address.port
 })
 afterAll(async()=>{config.parentPortalEnabled=previousFlag;if(server){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}await prisma.$disconnect()})
 it.each([UserRole.STUDENT,UserRole.PARENT,UserRole.TEACHER,UserRole.ADMIN])('%s logs in through real Cookie/CSRF and current DB discovery, then clears local session',async role=>{
  const user=await account(role),c=client();await c.runtime.session.login({username:user.username,password})
  expect(c.runtime.session.get().activeRole).toBe(role);expect(c.runtime.session.get().capabilities.canReadChildren).toBe(role===UserRole.PARENT)
  expect(c.calls.some(o=>o.url.endsWith('/auth/login')&&o.header['X-CSRF-Token'])).toBe(true)
  if(role===UserRole.TEACHER||role===UserRole.ADMIN)await expect(c.runtime.api.get('/parents/me/children')).rejects.toMatchObject({kind:'notFound'})
  await c.runtime.session.logout();expect(c.runtime.session.get().user).toBe(null);expect(c.stored.size).toBe(0)
 })
 it('student invite → parent claim → student confirms → scoped overview → unlink',async()=>{
  const child=await account(UserRole.STUDENT),parent=await account(UserRole.PARENT),stranger=await account(UserRole.PARENT),teacher=await account(UserRole.TEACHER)
  const course=await prisma.course.create({data:{title:'HTTP synthetic course',creatorId:teacher.id,courseCode:randomUUID().slice(0,12)}})
  await prisma.courseStudent.create({data:{courseId:course.id,studentId:child.id,status:'ACTIVE'}})
  const s=client(),p=client(),other=client()
  await s.runtime.session.login({username:child.username,password});await p.runtime.session.login({username:parent.username,password});await other.runtime.session.login({username:stranger.username,password})
  const invite=await s.runtime.parents.invite(course.id);const relation=await p.runtime.parents.claim(invite.inviteCode)
  expect((await p.runtime.parents.view({view:'children'})).list).toEqual([])
  const links=await s.runtime.parents.view({view:'links'});expect(links.links[0].canApprove).toBe(true)
  await s.runtime.parents.approve(relation.id,links.consent.version)
  expect((await p.runtime.parents.view({view:'children'})).list[0].id).toBe(child.id)
  expect((await p.runtime.parents.view({view:'child',childId:child.id})).courses).toEqual([{id:course.id,title:course.title}])
  await expect(other.runtime.parents.view({view:'child',childId:child.id})).rejects.toMatchObject({kind:'notFound'})
  await expect(p.runtime.parents.view({view:'report',childId:child.id,artifactId:randomUUID()})).rejects.toMatchObject({kind:'notFound'})
  await p.runtime.parents.revoke(relation.id)
  expect((await p.runtime.parents.view({view:'children'})).list).toEqual([])
  await expect(p.runtime.parents.view({view:'child',childId:child.id})).rejects.toMatchObject({kind:'notFound'})
  await Promise.all([s.runtime.session.logout(),p.runtime.session.logout(),other.runtime.session.logout()])
 })
 it('current database account freeze invalidates Mini session and encrypted credentials',async()=>{
  const parent=await account(UserRole.PARENT),c=client();await c.runtime.session.login({username:parent.username,password})
  await prisma.user.update({where:{id:parent.id},data:{isFrozen:true}})
  await expect(c.runtime.parents.view({view:'children'})).rejects.toMatchObject({kind:'unauthorized'})
  expect(c.runtime.session.get().user).toBe(null);expect(c.stored.size).toBe(0)
 })
})
