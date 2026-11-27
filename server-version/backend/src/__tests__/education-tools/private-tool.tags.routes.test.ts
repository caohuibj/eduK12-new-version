import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedPrincipal } from '../../types'

const deps=vi.hoisted(()=>({find:vi.fn(),findForm:vi.fn(),query:vi.fn(),authorize:vi.fn(),read:vi.fn(),write:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{
 $transaction: async (run:(tx:unknown)=>Promise<unknown>)=>run({
  educationPrivateTool:{findFirst:deps.find},huiteacherFormInstrument:{findFirst:deps.findForm},$queryRaw:deps.query,
 }),
}}))
vi.mock('../../modules/education-tools/access',async importOriginal=>({
 ...(await importOriginal<object>()),resolveEducationToolAuthoringContext:deps.authorize,
}))
vi.mock('../../modules/tool-licensing/private-tags',()=>({
 readPrivateToolTags:deps.read,writePrivateToolTags:deps.write,
}))
import { huiteacherFormTags } from '../../modules/huiteacher/forms.service'
import { educationPrivateToolRouter } from '../../modules/education-tools/private-tool.routes'

const id=(suffix:number)=>'00000000-0000-4000-8000-'+String(suffix).padStart(12,'0')
const tool=id(1),owner=id(2),school=id(3),other=id(4)
let origin:string,server:Server
const request=(entry:'SCHOOL'|'TEACHER',method='GET',actor=owner,organization=school)=>{
 const headers={'x-test-actor':actor,'content-type':'application/json'}
 return fetch(origin+'/'+entry+'/organizations/'+organization+'/private-tools/'+tool+'/tags',{
  method,headers,...(method==='PUT'?{body:JSON.stringify({tags:['合成工具'],expectedRevision:0})}:{}),
 })
}
describe('author-only education tool labels',()=>{
 beforeAll(async()=>{
  const app=express()
  app.use(express.json(),(req,_res,next)=>{
   req.user={userId:String(req.headers['x-test-actor']),accountDomain:'SCHOOL'} as AuthenticatedPrincipal
   next()
  })
  for(const entry of ['SCHOOL','TEACHER'] as const)
   app.use('/'+entry+'/organizations/:organizationId/private-tools',educationPrivateToolRouter(entry))
  server=app.listen(0,'127.0.0.1')
  await new Promise<void>(resolve=>server.once('listening',resolve))
  const address=server.address()
  if(!address||typeof address==='string')throw Error('missing test port')
  origin='http://127.0.0.1:'+address.port
 })
 beforeEach(()=>{
  vi.clearAllMocks()
  deps.query.mockResolvedValue([])
  deps.authorize.mockResolvedValue({organizationId:school,ownerUserId:owner})
  deps.read.mockResolvedValue({tags:[],revision:0})
  deps.write.mockResolvedValue({tags:['合成工具'],revision:1})
  deps.find.mockImplementation(async({where})=>
   where.id===tool&&where.organizationId===school&&where.ownerUserId===owner?{id:tool}:null)
 })
 afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))})
 it.each(['SCHOOL','TEACHER'] as const)('uses the authenticated %s route scope and owner for reads and writes',async entry=>{
  const read=await request(entry),write=await request(entry,'PUT')
  expect(read.headers.get('cache-control')).toBe('no-store')
  expect(await read.json()).toMatchObject({code:0,data:{tags:[],revision:0}})
  expect(await write.json()).toMatchObject({code:0,data:{tags:['合成工具'],revision:1}})
  expect(deps.find).toHaveBeenCalledWith({where:{id:tool,entry,organizationId:school,ownerUserId:owner},select:{id:true}})
  expect(deps.read).toHaveBeenCalledWith(expect.any(Object),entry,tool)
  expect(deps.write).toHaveBeenCalledWith(expect.any(Object),entry,tool,owner,{tags:['合成工具'],expectedRevision:0})
 })
 it('denies another author, another school, and a caller whose author capability was withdrawn',async()=>{
  expect((await request('SCHOOL','GET',other)).status).toBe(404)
  expect((await request('TEACHER','PUT',owner,other)).status).toBe(404)
  deps.authorize.mockResolvedValue(null)
  expect((await request('SCHOOL','PUT')).status).toBe(403)
  expect(deps.read).not.toHaveBeenCalled()
  expect(deps.write).not.toHaveBeenCalled()
 })
 it('uses the Teacher school form scope and a distinct identity for organization-owned form labels',async()=>{
  const input={organizationId:school,formId:tool,actorUserId:owner}
  deps.query.mockResolvedValue([{organizationId:school,productAdmin:true}])
  deps.findForm.mockResolvedValueOnce({id:tool}).mockResolvedValueOnce(null)
  const body={tags:['合成工具'],expectedRevision:0}
  await expect(huiteacherFormTags(input,{body})).resolves.toEqual({tags:['合成工具'],revision:1})
  expect(deps.findForm).toHaveBeenCalledWith({where:{id:tool,organizationId:school},select:{id:true}})
  expect(deps.write).toHaveBeenCalledWith(expect.any(Object),'TEACHER','organization-form:'+tool,owner,body)
  await expect(huiteacherFormTags({...input,organizationId:other})).rejects.toMatchObject({statusCode:404})
  expect(deps.read).not.toHaveBeenCalled()
 })

})
