import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest'
import express from 'express'
import {createServer,type Server} from 'node:http'
const mock=vi.hoisted(()=>({principal:{} as any,course:vi.fn(),list:vi.fn(),scale:vi.fn(),cognitive:vi.fn(),find:vi.fn()}))
vi.mock('../middleware/auth',()=>({authenticate:(req:any,_res:any,next:any)=>{req.user=mock.principal;next()}}))
vi.mock('../config/database',()=>({prisma:{course:{findFirst:mock.find}}}))
vi.mock('../controllers/courseController',()=>({courseController:{list:mock.list,getStudents:mock.course,update:mock.course,stopRecruiting:mock.course,resumeRecruiting:mock.course,endCourse:mock.course}}))
vi.mock('../controllers/scaleController',()=>({scaleController:{list:mock.scale}}))
vi.mock('../modules/cognitive/cognitive.controller',()=>({cognitiveController:{listConfigs:mock.cognitive}}))
vi.mock('../modules/bundle-product/service',()=>({bundleProductService:{catalog:vi.fn()},bundleDefinitionProvider:{}}))
vi.mock('../modules/bundle-product/admin-authoring',()=>({refreshPublishedPackages:vi.fn()}))
import router from '../routes/trainingAdmin'
let server:Server,base:string
beforeAll(async()=>{const app=express();app.use(express.json());app.use('/api/admin/training',router);server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as any).port})
afterAll(()=>new Promise<void>(resolve=>server.close(()=>resolve())))
beforeEach(()=>{
 vi.clearAllMocks()
 mock.principal={userId:'training-admin',role:'STUDENT',businessRole:'STUDENT',accountDomain:'TRAINING',platformRole:'STANDARD',entryGrants:[{entry:'TRAINING'}],adminVerifiedAt:Date.now()/1000}
 mock.find.mockResolvedValue({id:'training-course'})
 const result=(req:any,res:any)=>res.json({role:req.user.role,view:req.query.view,body:req.body,oversight:res.locals.trainingOversight})
 for(const handler of [mock.list,mock.course,mock.scale,mock.cognitive])handler.mockImplementation(result)
})
const request=(path:string,method='GET',body?:unknown)=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
it.each([
 {platformRole:'STANDARD',entryGrants:[]},
 {platformRole:'STANDARD',entryGrants:[{entry:'SURVEY'}]},
 {platformRole:'SYSTEM_ADMIN',entryGrants:[{entry:'TRAINING'}]},
])('does not substitute business/system authority for the Training entry grant: %j',async authority=>{
 Object.assign(mock.principal,authority)
 expect((await request('/api/admin/training/courses')).status).toBe(403)
 expect((await request('/api/admin/training/resources/scales')).status).toBe(403)
 expect(mock.list).not.toHaveBeenCalled();expect(mock.scale).not.toHaveBeenCalled()
})
it('uses a local admin projection only after entry authorization',async()=>{
 const response=await request('/api/admin/training/courses')
 expect(await response.json()).toMatchObject({role:'ADMIN',oversight:true})
 expect(mock.principal.role).toBe('STUDENT')
})
it.each(['scales','cognitive-configs'])('forces the safe directory DTO for %s',async kind=>{
 const response=await request('/api/admin/training/resources/'+kind+'?view=full-authoring')
 expect(await response.json()).toMatchObject({view:'training-catalog',oversight:true})
})
it('checks course realm/type before roster and mutation access',async()=>{
 mock.find.mockResolvedValue(null)
 expect((await request('/api/admin/training/courses/private-survey/students')).status).toBe(404)
 expect((await request('/api/admin/training/courses/campus/end','POST',{})).status).toBe(404)
 expect(mock.course).not.toHaveBeenCalled()
 expect(mock.find).toHaveBeenCalledWith({where:{id:'campus',courseType:{in:['TRAINING_COURSE','LEGACY_COURSE']},creator:{accountDomain:{in:['TRAINING','LEGACY']}}},select:{id:true}})
})
it.each(['PUT','POST'])('requires a fresh second factor for %s supervision writes',async method=>{
 mock.principal.adminVerifiedAt=Date.now()/1000-301
 const response=await request('/api/admin/training/courses/c1'+(method==='POST'?'/end':''),method,{title:'名称'})
 expect(response.status).toBe(403);expect((await response.json()).code).toBe('ADMIN_KEY_STEP_UP_REQUIRED');expect(mock.course).not.toHaveBeenCalled()
})
it('allows title/description edits but rejects status and content grants',async()=>{
 expect((await request('/api/admin/training/courses/c1','PUT',{title:'新名称',description:'说明'})).status).toBe(200)
 expect(mock.course).toHaveBeenCalledOnce();mock.course.mockClear()
 for(const body of [{status:'PUBLISHED'},{isLibrary:true},{coverUrl:'x'},{}])expect((await request('/api/admin/training/courses/c1','PUT',body)).status).toBe(400)
 expect(mock.course).not.toHaveBeenCalled()
 expect((await request('/api/admin/training/courses/c1','DELETE')).status).toBe(404)
})
