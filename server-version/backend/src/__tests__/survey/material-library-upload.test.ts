import express from 'express'
import sharp from 'sharp'
import type {Server} from 'node:http'
import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({authorize:vi.fn(),store:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:(fn:(tx:unknown)=>unknown)=>fn({})}}))
vi.mock('../../middleware/auth',()=>({authenticateSurvey:(req:any,res:any,next:any)=>{if(req.header('X-Fixture-User')!=='synthetic')return res.status(401).json({code:-1});req.user={userId:'synthetic-owner'};next()}}))
vi.mock('../../modules/survey/tool-library.service',()=>({authorizeToolOwner:mocks.authorize}))
vi.mock('../../services/assetStorage',()=>({storeAsset:mocks.store,serveStoredAssetContent:vi.fn()}))
vi.mock('../../middleware/uploadAdmission',async original=>{const actual=await original<typeof import('../../middleware/uploadAdmission')>();return {...actual,uploadPrincipalRateLimit:(_req:unknown,_res:unknown,next:()=>void)=>next()}})
import {surveyMaterialLibraryRouter} from '../../modules/survey/material-library.routes'
let server:Server,origin:string
let png:Buffer
beforeAll(async()=>{png=await sharp({create:{width:1,height:1,channels:3,background:'#dff0e8'}}).png().toBuffer();const app=express();app.use('/library',surveyMaterialLibraryRouter);app.use((cause:any,_req:any,res:any,_next:any)=>res.status(cause.statusCode||500).json({code:-1,message:'failed'}));await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',resolve)});origin='http://127.0.0.1:'+((server.address() as {port:number}).port)})
afterAll(async()=>{if(server)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))})
beforeEach(()=>{vi.clearAllMocks();mocks.authorize.mockResolvedValue(undefined);mocks.store.mockResolvedValue({id:'stored',originalName:'image.png'})})
async function upload(kind:string,buffer:Buffer,type:string,authenticated=true){const data=new FormData();data.append('file',new Blob([new Uint8Array(buffer)],{type}),'synthetic.'+(type==='application/pdf'?'pdf':'png'));return fetch(origin+'/library/upload/'+kind,{method:'POST',headers:authenticated?{'X-Fixture-User':'synthetic'}:{},body:data})}
describe('Survey material multipart admission uses existing bounded validation',()=>{
 it('rejects unauthenticated uploads before parsing or storage',async()=>{expect((await upload('image',png,'image/png',false)).status).toBe(401);expect(mocks.authorize).not.toHaveBeenCalled();expect(mocks.store).not.toHaveBeenCalled()})
 it('stores decoded image bytes privately with an independent owner retention reference',async()=>{
  const result=await upload('image',png,'image/png');expect(result.status).toBe(200)
  expect(mocks.store).toHaveBeenCalledWith(expect.objectContaining({ownerId:'synthetic-owner',mimeType:'image/png',accessScope:'PRIVATE',scopeId:'survey-library:synthetic-owner',initialReference:{entityType:'SurveyResearcherMedia',entityId:'synthetic-owner',field:'library'}}))
  expect(mocks.authorize).toHaveBeenCalledTimes(2)
 })
 it('does not trust the supplied MIME or allow image bytes through the document endpoint',async()=>{expect((await upload('image',Buffer.from('<svg></svg>'),'image/png')).status).toBe(400);expect((await upload('document',png,'application/pdf')).status).toBe(400);expect(mocks.store).not.toHaveBeenCalled()})
 it('admits a PDF through the document policy without any video processing',async()=>{expect((await upload('document',Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'),'application/pdf')).status).toBe(200);expect(mocks.store).toHaveBeenCalledWith(expect.objectContaining({mimeType:'application/pdf',accessScope:'PRIVATE'}))})
})
