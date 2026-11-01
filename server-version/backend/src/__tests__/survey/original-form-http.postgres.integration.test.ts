import {randomUUID} from 'node:crypto'
import type {Server} from 'node:http'
import express from 'express'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma} from '../../config/database'
import {generateToken} from '../../utils/jwt'
import {AUTH_COOKIE_NAME} from '../../utils/authCookies'
import {surveyGovernedToolsRouter} from '../../modules/survey/governed-tool.routes'
const target=process.env.SURVEY_ORIGINAL_FORM_TEST_DATABASE_URL
const selected=Boolean(target)
let server:Server,url:string,system:string,ordinary:string,systemToken:string,ordinaryToken:string
const body=()=>({requestId:randomUUID(),toolKey:'synthetic_form_'+randomUUID().replace(/-/g,''),version:'1.0.0',title:'Synthetic Form API fixture',statement:'Synthetic isolated integration content.',classificationTags:['language_validation:content_en','use:not_diagnostic'],reference:{rights:'unknown',unknown:{preserved:true}},definition:{schemaVersion:2,pages:[{pageKey:'original_page',title:'Original page',questions:[{itemKey:'source_choice',type:'SINGLE',prompt:'Synthetic choice',required:false,options:[{optionKey:'n',label:'Not observed'},{optionKey:'y',label:'Observed'}],rows:[]}]}]}})
async function request(path:string,token?:string,data?:unknown){const response=await fetch(url+path,{method:data?'POST':'GET',headers:{...(token?{Cookie:AUTH_COOKIE_NAME+'='+token}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,body:await response.json() as any}}
describe.runIf(selected)('native Form real HTTP and PostgreSQL admission',()=>{
 beforeAll(async()=>{
  const u=new URL(target!),database=u.pathname.slice(1)
  if(!['localhost','127.0.0.1'].includes(u.hostname)||!((process.env.CI==='true'&&u.port==='5432'&&database==='ptool')||(u.port==='55432'&&/^eduk12_form_intake_test_[a-f0-9]+$/.test(database)))||process.env.DATABASE_URL!==target)throw Error('Explicit dedicated Form API fixture database required')
  const prefix='native_form_http_'+randomUUID();for(const platformRole of ['SYSTEM_ADMIN','STANDARD'] as const){const user=await prisma.user.create({data:{username:prefix+'_'+platformRole,passwordHash:'synthetic fixture, not a login password',role:'ADMIN',platformRole,accountDomain:'LEGACY'}});const token=generateToken({userId:user.id,username:user.username,role:user.role,tokenVersion:user.tokenVersion,accountDomain:'LEGACY',...(platformRole==='SYSTEM_ADMIN'?{adminSessionId:randomUUID(),adminVerifiedAt:Math.floor(Date.now()/1000)}:{})});if(platformRole==='SYSTEM_ADMIN'){system=user.id;systemToken=token}else{ordinary=user.id;ordinaryToken=token}}
  const app=express();app.use(express.json());app.use('/tools',surveyGovernedToolsRouter);app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode??500).json({message:err.message}));server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});url='http://127.0.0.1:'+(server.address() as any).port
 },30000)
 afterAll(async()=>{if(server)await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));// Append-only history stays in this disposable job database until service cleanup.
  await prisma.$disconnect();await(await import('../../config/queue')).closeQueues(true)})
 it('requires a current system session and stores only an unapproved exact Form with searchable labels',async()=>{
  const input=body();expect((await request('/tools/submissions/original-form',undefined,input)).status).toBe(401);expect((await request('/tools/submissions/original-form',ordinaryToken,input)).status).toBe(403)
  const stale=generateToken({userId:system,username:'synthetic',role:'ADMIN',tokenVersion:0,accountDomain:'LEGACY',adminSessionId:randomUUID(),adminVerifiedAt:Math.floor(Date.now()/1000)-600});expect((await request('/tools/submissions/original-form',stale,input)).status).toBe(403)
  const invalid=structuredClone(input);invalid.definition.pages[0].questions[0].type='EXECUTE_JS';expect((await request('/tools/submissions/original-form',systemToken,invalid)).status).toBe(400)
  const saved=await request('/tools/submissions/original-form',systemToken,input);expect(saved.status).toBe(200);const id=saved.body.data.id;expect(saved.body.data).toMatchObject({family:'FORM',state:'SUBMITTED',version:1,approvedBy:null})
  const detail=await request('/tools/versions/'+id,systemToken);expect(detail.status).toBe(200);expect(detail.body.data.snapshot.unit.compiledDefinition).toEqual(input.definition);expect(detail.body.data.snapshot).toMatchObject({parameters:null,report:null,components:[]});expect(detail.body.data.reference.metadata.annotations).toEqual(input.reference);expect(detail.body.data.trials).toEqual([])
  expect((await request('/tools/submissions/original-form',systemToken,input)).body.data.id).toBe(id);expect((await request('/tools/submissions/original-form',systemToken,{...input,title:'Changed request'})).status).toBe(409)
  const found=await request('/tools/catalog?family=FORM&tags=use%3Anot_diagnostic&keyword='+encodeURIComponent(input.toolKey),systemToken);expect(found.status).toBe(200);expect(found.body.data.list.map((r:any)=>r.id)).toContain(id);expect(found.body.data.list[0].classificationTags).toContainEqual(expect.objectContaining({id:'use:not_diagnostic'}));expect(found.body.data.tagFacets.use).toContainEqual(expect.objectContaining({id:'use:not_diagnostic'}))
  const [row]=await prisma.$queryRaw<Array<{state:string;approved_by:string|null;measurement_release:unknown}>>`SELECT state,approved_by,measurement_release FROM survey_governed_tools WHERE id=${id}`;expect(row).toEqual({state:'SUBMITTED',approved_by:null,measurement_release:null});expect(await prisma.$queryRaw`SELECT id FROM survey_governed_trials WHERE tool_id=${id}`).toEqual([])
 },30000)
})
