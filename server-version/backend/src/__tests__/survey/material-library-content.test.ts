import express from 'express'
import type {Server} from 'node:http'
import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({own:vi.fn(),serve:vi.fn(),list:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:(fn:(tx:unknown)=>unknown)=>fn({})}}))
vi.mock('../../middleware/auth',()=>({authenticateSurvey:(req:any,res:any,next:any)=>{if(req.header('X-Fixture-User')!=='synthetic')return res.status(401).json({code:-1});req.user={userId:'synthetic-owner'};next()}}))
vi.mock('../../middleware/uploadAdmission',()=>({boundedUpload:vi.fn(),uploadPrincipalRateLimit:vi.fn()}))
vi.mock('../../modules/survey/tool-library.service',()=>({authorizeToolOwner:vi.fn()}))
vi.mock('../../services/assetStorage',()=>({storeAsset:vi.fn()}))
vi.mock('../../modules/survey/material.delivery',()=>({serveSurveyMaterial:mocks.serve}))
vi.mock('../../modules/survey/material-library.service',async()=>({materialKinds:{},materialQuery:(await import('zod')).z.object({}),listSurveyMaterials:mocks.list,ownSurveyMaterial:mocks.own,renameSurveyMaterial:vi.fn()}))
vi.mock('../../modules/survey/builder.service',()=>({SurveyBuilderError:class extends Error{constructor(readonly statusCode:number,message:string){super(message)}}}))
import {SurveyBuilderError} from '../../modules/survey/builder.service'
import {surveyMaterialLibraryRouter} from '../../modules/survey/material-library.routes'
let server:Server,origin:string
const id='7504a52a-983c-43f8-af08-910111979e58',bytes=Buffer.from([137,80,78,71,13,10,26,10,0,1,2,3])
beforeAll(async()=>{
 const app=express();app.use('/library',surveyMaterialLibraryRouter)
 app.use((cause:any,_req:any,res:any,_next:any)=>res.status(cause.statusCode||500).json({code:-1,message:'failed'}))
 await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',resolve)})
 origin='http://127.0.0.1:'+((server.address() as {port:number}).port)
})
afterAll(async()=>{if(server)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))})
beforeEach(()=>{
 vi.resetAllMocks();mocks.own.mockResolvedValue({id,sha256:'a'.repeat(64),mimeType:'image/png'})
 mocks.list.mockResolvedValue({list:[],total:0})
 mocks.serve.mockImplementation((_ref,res)=>{
  res.setHeader('Content-Type','image/png');res.setHeader('Cache-Control','private, no-store')
  // A real pipe can return the response before the first bytes flush headers.
  setTimeout(()=>{if(!res.destroyed&&!res.writableEnded)res.end(bytes)},10)
  return res
 })
})
const request=(path='/'+id+'/content',authenticated=true)=>fetch(origin+'/library'+path,{headers:authenticated?{'X-Fixture-User':'synthetic'}:{}})
describe('Survey material route owns binary responses',()=>{
 it('preserves delayed raw image bytes instead of serializing the response object',async()=>{
  const res=await request();expect(res.status).toBe(200);expect(res.headers.get('content-type')).toBe('image/png')
  expect(res.headers.get('cache-control')).toBe('private, no-store')
  expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes)
  expect(mocks.own).toHaveBeenCalledWith(expect.anything(),'synthetic-owner',id)
  expect(mocks.serve).toHaveBeenCalledWith({assetId:id,contentHash:'a'.repeat(64),mimeType:'image/png'},expect.anything())
 })
 it('preserves a handled missing-file response without wrapping it again',async()=>{
  mocks.serve.mockImplementation((_ref,res)=>res.status(404).json({code:-1,message:'文件不存在'}))
  const res=await request();expect(res.status).toBe(404);expect(await res.json()).toEqual({code:-1,message:'文件不存在'})
 })
 it('rejects unauthenticated content requests before any ownership read or delivery',async()=>{
  expect((await request(undefined,false)).status).toBe(401);expect(mocks.own).not.toHaveBeenCalled();expect(mocks.serve).not.toHaveBeenCalled()
 })
 it('preserves ownership rejection and never starts delivery',async()=>{
  mocks.own.mockRejectedValue(new SurveyBuilderError(403,'素材不可用'))
  const res=await request();expect(res.status).toBe(403);expect((await res.json()).code).toBe(-1);expect(mocks.serve).not.toHaveBeenCalled()
 })
 it('continues to envelope ordinary JSON list results',async()=>{
  const res=await request('/');expect(res.status).toBe(200);expect(await res.json()).toMatchObject({code:0,data:{list:[],total:0}})
 })
})
