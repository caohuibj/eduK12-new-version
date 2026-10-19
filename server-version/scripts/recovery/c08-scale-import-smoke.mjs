/** Public authoring/save/import/validation/publication with real loopback HTTP. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend')
const require=createRequire(path.join(backend,'package.json'))
const {prisma}=require(path.join(backend,'dist/config/database.js'))
const {createCustomScaleDefinition}=require(path.join(backend,'dist/modules/scale/scale-definition.js'))
const {importScaleCsv}=require(path.join(backend,'dist/modules/scale/scale-import.service.js'))
const bcrypt=require('bcryptjs')
const state=process.argv[2],status=JSON.parse(fs.readFileSync(path.join(state,'status.json')))
assert.equal(new URL(status.apiUrl).hostname,'127.0.0.1')
const checks=[], observations=[];let requests=0,sqlEvents=0
prisma.$on('query',()=>sqlEvents++)
const check=name=>{checks.push(name);console.log('PASS',name)}
function client(){const cookies=new Map();return {async request(route,method='GET',body,expected=200){
 requests++;const start=performance.now(),wire=body===undefined?undefined:JSON.stringify(body)
 const response=await fetch(status.apiUrl+'/api'+route,{method,signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',...(cookies.size?{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{})},...(wire===undefined?{}:{body:wire})})
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
 const text=await response.text();observations.push({route,method,status:response.status,requestBytes:wire?Buffer.byteLength(wire):0,responseBytes:Buffer.byteLength(text),durationMs:Math.round(performance.now()-start)})
 assert.equal(response.status,expected,`${method} ${route}: ${text.slice(0,500)}`)
 const data=JSON.parse(text);if(expected!==200)return data;assert.equal(data.code,0,`${route}: ${data.message}`);return data.data
}}}
function definition(){const d=createCustomScaleDefinition();d.items=[{itemCode:'Q1',content:'Existing item',type:'single',required:true,sortOrder:0,responseSetKey:'default',randomizeOptions:false}];d.scoring.itemRules=[{itemCode:'Q1',transform:{type:'identity'}}];d.scoring.scores=[{key:'total',type:'total',label:'Total',direction:'descriptive',canonical:true,displayPrecision:1,source:{type:'items',items:[{itemCode:'Q1',weight:1}],aggregation:'sum'}}];d.report.primaryScoreKeys=['total'];d.report.scoreOrder=['total'];d.report.interpretations=[{scoreKey:'total',headline:'Total',source:{type:'score_only'},summary:'Synthetic descriptive fixture',bands:[],guidance:[]}];return d}
const content='item_code,prompt,reverse,score_keys,response_set_key\nQ2,"中文, quoted\nitem",true,total,default'
const teacher=client(),other=client(),student=client(),anonymous=client();const password='C08SyntheticOnly2026'
let storage,queryCounts
try{
 const users=[];for(const role of ['TEACHER','TEACHER','STUDENT'])users.push(await prisma.user.create({data:{username:'c08-http-'+randomUUID(),passwordHash:await bcrypt.hash(password,10),role,teacherApproved:true,mustChangePassword:false}}))
 for(const [c,u] of [[teacher,users[0]],[other,users[1]],[student,users[2]]]){await c.request('/auth/csrf');await c.request('/auth/training-login','POST',{username:u.username,password,expectedRole:u.role})}
 let draft=await teacher.request('/scales','POST',{code:'C08-'+randomUUID(),name:'C08 public import',visibility:'HIDDEN'})
 draft=await teacher.request(`/scales/${draft.id}/definition`,'PUT',{definition:definition(),expectedUpdatedAt:draft.updatedAt})
 const input={content,expectedUpdatedAt:draft.updatedAt}, pre=await teacher.request(`/scales/${draft.id}/import/preview`,'POST',input)
 assert.equal(pre.count,1);assert.equal(pre.totalItems,2)
 await prisma.materialGrant.create({data:{teacherId:users[1].id,resourceType:'SCALE',resourceId:draft.id,grantedBy:users[0].id}})
 await other.request(`/scales/${draft.id}/import/preview`,'POST',input,403)
 await other.request(`/scales/${draft.id}/import/confirm`,'POST',{...input,digest:pre.digest,previewToken:pre.previewToken,previewExpiresAt:pre.previewExpiresAt},403)
 await student.request(`/scales/${draft.id}/import/preview`,'POST',input,403)
 await anonymous.request('/auth/csrf')
 await anonymous.request(`/scales/${draft.id}/import/preview`,'POST',input,401)
 check('owner-only import; use-grant, student and anonymous denied')
 for(const body of [{...input,content:content+'\n',digest:pre.digest,previewToken:pre.previewToken,previewExpiresAt:pre.previewExpiresAt},{...input,digest:'0'.repeat(64),previewToken:pre.previewToken,previewExpiresAt:pre.previewExpiresAt},{...input,expectedUpdatedAt:new Date(0).toISOString(),digest:pre.digest,previewToken:pre.previewToken,previewExpiresAt:pre.previewExpiresAt}])await teacher.request(`/scales/${draft.id}/import/confirm`,'POST',body,409)
 assert.equal((await prisma.scale.findUniqueOrThrow({where:{id:draft.id}})).itemCount,1)
 await teacher.request(`/scales/${draft.id}/import/preview`,'POST',{...input,content:content.replace('reverse','score')},400)
 check('changed original content/digest/revision and unknown science columns rejected without writes')
 const before=Buffer.byteLength(JSON.stringify(draft.definition));draft=await teacher.request(`/scales/${draft.id}/import/confirm`,'POST',{...input,digest:pre.digest,previewToken:pre.previewToken,previewExpiresAt:pre.previewExpiresAt})
 assert.equal(draft.definition.items[1].content,'中文, quoted\nitem');await teacher.request(`/scales/${draft.id}/import/confirm`,'POST',{...input,digest:pre.digest,previewToken:pre.previewToken,previewExpiresAt:pre.previewExpiresAt},409)
 const audits=await prisma.assessmentManagementEvent.findMany({where:{resourceId:draft.id}});assert.equal(audits.length,1);assert.equal(audits[0].action,'SCALE_IMPORT');assert.ok(!JSON.stringify(audits).includes('quoted'));assert.ok(!JSON.stringify(audits).includes('item_code'))
 storage={sourceBytes:Buffer.byteLength(content),definitionBytesBefore:before,definitionBytesAfter:Buffer.byteLength(JSON.stringify(draft.definition)),auditMetadataBytes:Buffer.byteLength(JSON.stringify(audits[0].metadata)),rawCsvStored:false}
 assert.equal((await teacher.request(`/scales/${draft.id}/validate`,'POST',{})).valid,true)
 const scored=await teacher.request(`/scales/${draft.id}/preview`,'POST',{answers:[{itemCode:'Q1',responseValue:'option_5'},{itemCode:'Q2',responseValue:'option_1'}]})
 assert.equal(scored.scores.find(x=>x.key==='total').value,10)
 check('exact appended definition, canonical scorer oracle 5+reverse(1)=10, compact audit and replay conflict')
 draft=await teacher.request(`/scales/${draft.id}/publish`,'POST',{expectedUpdatedAt:draft.updatedAt});assert.equal(draft.status,'PUBLISHED')
 await teacher.request(`/scales/${draft.id}/import/preview`,'POST',{...input,expectedUpdatedAt:draft.updatedAt},409)
 await teacher.request(`/scales/${draft.id}/import/confirm`,'POST',{...input,expectedUpdatedAt:draft.updatedAt,digest:pre.digest,previewToken:pre.previewToken,previewExpiresAt:pre.previewExpiresAt},409)
 check('public validation/publication freezes imported definition')
 const standard=await prisma.scale.create({data:{code:'C08-standard-'+randomUUID(),name:'Standard protection fixture',creatorId:users[0].id,instrumentClass:'STANDARD',status:'DRAFT',definition:definition()}})
 await teacher.request(`/scales/${standard.id}/import/preview`,'POST',{...input,expectedUpdatedAt:standard.updatedAt.toISOString()},409)
 await teacher.request(`/scales/${standard.id}/import/confirm`,'POST',{...input,expectedUpdatedAt:standard.updatedAt.toISOString(),digest:pre.digest,previewToken:pre.previewToken,previewExpiresAt:pre.previewExpiresAt},409)
 check('STANDARD cannot be imported or overridden')
 let cost=await teacher.request('/scales','POST',{code:'C08-cost-'+randomUUID(),name:'Cost fixture'});cost=await teacher.request(`/scales/${cost.id}/definition`,'PUT',{definition:definition(),expectedUpdatedAt:cost.updatedAt})
 const ci={content,expectedUpdatedAt:cost.updatedAt},actor={userId:users[0].id,role:'TEACHER'};let start=sqlEvents
 const cp=await importScaleCsv(cost.id,actor,ci,false);const previewSql=sqlEvents-start;start=sqlEvents
 await importScaleCsv(cost.id,actor,{...ci,digest:cp.digest,previewToken:cp.previewToken,previewExpiresAt:cp.previewExpiresAt},true);queryCounts={previewSql,confirmSql:sqlEvents-start,scope:'direct native-draft service transactions; includes BEGIN/COMMIT, excludes HTTP auth and fixtures'}
 assert.ok(queryCounts.previewSql>0 && queryCounts.confirmSql>queryCounts.previewSql)
 fs.writeFileSync(path.join(state,'c08-http-result.json'),JSON.stringify({passed:true,requests,checks,observations,storage,queryCounts},null,2))
}catch(error){fs.writeFileSync(path.join(state,'c08-http-result.json'),JSON.stringify({passed:false,requests,checks,observations,storage,queryCounts,error:String(error)},null,2));throw error}finally{await prisma.$disconnect()}
process.exit(0)
