import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest'

const m=vi.hoisted(()=>({query:vi.fn(),find:vi.fn(),images:vi.fn()}))
// Exercise the real private router, service, definition validator and native
// scorer. Only database infrastructure and the unrelated media pipeline are stubbed.
vi.mock('../../config/database',()=>({prisma:{
 $transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn({$queryRaw:m.query,educationPrivateTool:{findFirst:m.find}}),
}}))
vi.mock('../../modules/education-tools/private-tool.media',()=>({assertPrivateToolImages:m.images,syncPrivateToolDraftImages:vi.fn(),retainPrivateToolVersionImages:vi.fn()}))
vi.mock('../../modules/education-tools/private-tool.media.routes',async()=>{
 const {Router}=await import('express');return {educationPrivateToolMediaRouter:()=>Router()}
})

import {educationPrivateToolRouter} from '../../modules/education-tools/private-tool.routes'
import {previewPrivateTool} from '../../modules/education-tools/private-tool.service'
import {privateToolContentHash} from '../../modules/education-tools/private-tool.definition'
import {ScaleAnswerValidationError} from '../../modules/scale/scale-scoring'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import type {AuthenticatedPrincipal} from '../../types'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'

const org='00000000-0000-4000-8000-000000000001',tool='00000000-0000-4000-8000-000000000002'
const owner='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004'
const definition=(option='a')=>compileResearchScale('Private synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',
 responseOptions:[{optionKey:option,label:'First',score:1},{optionKey:'b',label:'Second',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
 items:[{itemKey:'q',prompt:'Private prompt must not leak',required:true,reverse:false,dimensionKeys:['total']}]})
let stored:ReturnType<typeof row>,server:Server,origin:string
function row(entry:'SCHOOL'|'TEACHER',option='a'){
 const def=definition(option)
 return {id:tool,entry,organizationId:org,ownerUserId:owner,kind:'SCALE',title:'Private synthetic',revision:1,definition:def,contentHash:privateToolContentHash('SCALE','Private synthetic',def)}
}
const context=(entry:'SCHOOL'|'TEACHER'):PrivateToolContext=>({principal:{userId:owner,accountDomain:'SCHOOL'},entry,organizationId:org})
const request=(entry:'SCHOOL'|'TEACHER',actor=owner)=>fetch(`${origin}/${entry}/organizations/${org}/private-tools/${tool}/preview`,{
 method:'POST',headers:{'content-type':'application/json','x-test-actor':actor},body:JSON.stringify({answers:[{itemCode:'q',responseValue:'a'}]}),
})
describe('Private scale preview answer error boundary',()=>{
 beforeAll(async()=>{
  const app=express();app.use(express.json())
  app.use((req,_res,next)=>{req.user={userId:String(req.headers['x-test-actor']??owner),accountDomain:'SCHOOL'} as AuthenticatedPrincipal;next()})
  for(const entry of ['SCHOOL','TEACHER'] as const)app.use(`/${entry}/organizations/:organizationId/private-tools`,educationPrivateToolRouter(entry))
  app.use((_error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(500).json({code:'INTERNAL_ERROR',data:null})})
  server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
  const address=server.address();if(!address||typeof address==='string')throw new Error('missing test port')
  origin='http://127.0.0.1:'+address.port
 })
 beforeEach(()=>{
  vi.clearAllMocks()
  m.query.mockImplementation(async(query:{sql:string;values:unknown[]})=>{
   if(query.sql.includes("SELECT b#>>'{source,versionId}' AS id FROM education_private_tools d")
    &&query.sql.includes("d.kind='COMPOSITION' AND b#>>'{source,provider}'='SJT_RELEASE'")){
    expect(query.values).toEqual([tool,expect.stringMatching(/^(SCHOOL|TEACHER)$/),org,expect.stringMatching(new RegExp(`^(${owner}|${other})$`))])
    return []
   }
   if(query.sql.includes('FROM "organizations" o')&&query.sql.includes('JOIN "education_product_entitlements" e')
    &&query.sql.includes('AS "productAdmin"'))return [{organizationId:org,organizationName:'Synthetic',membershipId:'member',orgRole:'MEMBER',productAdmin:true}]
   throw new Error('Unexpected private preview query')
  })
  m.images.mockResolvedValue([])
  m.find.mockImplementation(async({where}:{where:Record<string,string>})=>Object.entries(where).every(([key,value])=>stored[key as keyof typeof stored]===value)?stored:null)
 })
 afterAll(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))})
 it('returns native service issues as 400 after a previously selected option is replaced in either entry',async()=>{
  for(const entry of ['SCHOOL','TEACHER'] as const){
   stored=row(entry)
   expect((await request(entry)).status).toBe(200)
   stored=row(entry,'replacement')
   // Prove the actual service/scorer throws the exact exception, not a mocked error.
   await expect(previewPrivateTool(context(entry),tool,{answers:[{itemCode:'q',responseValue:'a'}]})).rejects.toBeInstanceOf(ScaleAnswerValidationError)
   const response=await request(entry),body=await response.json()
   expect(response.status).toBe(400)
   expect(response.headers.get('cache-control')).toBe('no-store')
   expect(body).toMatchObject({code:'PRIVATE_TOOL_PREVIEW_INPUT_INVALID',data:{issues:[{path:'answers.0.responseValue'}]}})
   expect(body.data.issues[0].message).toBe('响应值不属于题目 q 的响应集')
   expect(JSON.stringify(body)).not.toContain('Private prompt must not leak')
  }
 })
 it('does not expose definition-derived issues for a different author',async()=>{
  stored=row('SCHOOL','replacement')
  const response=await request('SCHOOL',other),body=await response.json()
  expect(response.status).toBe(404)
  expect(body).toMatchObject({code:'PRIVATE_TOOL_NOT_FOUND',data:{issues:[]}})
  expect(m.images).not.toHaveBeenCalled()
  expect(JSON.stringify(body)).not.toMatch(/responseValue|Private prompt|replacement/)
 })
 it('does not misclassify unexpected infrastructure failures as answer errors',async()=>{
  stored=row('SCHOOL');m.find.mockRejectedValueOnce(new Error('Synthetic database unavailable'))
  const response=await request('SCHOOL')
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({code:'INTERNAL_ERROR',data:null})
 })
})
