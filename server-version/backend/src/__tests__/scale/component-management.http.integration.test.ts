import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import express from 'express'
import ExcelJS from 'exceljs'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {generateToken} from '../../utils/jwt'
import {csrfProtection} from '../../middleware/csrf'
import {errorHandler} from '../../middleware/errorHandler'
import {platformSurveyOriginGuard} from '../../modules/survey/originGuard'
import {surveyStandardTripletRouter} from '../../modules/survey/standard-triplet.routes'
import {standardReleaseRow} from '../../modules/survey/standard-triplet.service'
import {databaseContentSource} from '../../modules/scale/component-import/native-source'
import {readCurrentStandardCombination} from '../../modules/measurement-content/standard-combination-source'
import {trainingStandardManagementCatalog} from '../../modules/measurement-content/standard-combination-management'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'

// Share the existing component-import fixture selection. Ordinary collection
// does not create another required database setting or fall back to DATABASE_URL.
const selected=process.env.COMPONENT_IMPORT_TEST_DATABASE_URL?.trim()
const suite=selected?describe:describe.skip
suite('system-admin imported component HTTP integration',()=>{
 let server:Server,base:string,system:{id:string;username:string},manager:{id:string;username:string}
 const prefix='/api/platform/survey-standard'
 const proof={adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}
 const journal:Array<{method:string;path:string;status:number}>=[]
 const token=(user=system,extra={})=>generateToken({userId:user.id,username:user.username,role:'ADMIN',accountDomain:'TRAINING',tokenVersion:0,...proof,...extra})
 async function call(path:string,input?:unknown,options:{user?:typeof system;anonymous?:boolean;claims?:object;csrf?:boolean;origin?:string}={}){
  const headers:Record<string,string>={Origin:options.origin??'http://localhost:5174','X-CSRF-Token':options.csrf===false?'wrong':'synthetic-csrf'}
  if(!options.anonymous)headers.Cookie='ptool_session='+token(options.user,options.claims)+'; ptool_csrf=synthetic-csrf'
  const form=input instanceof FormData
  if(!form)headers['Content-Type']='application/json'
  const method=input===undefined?'GET':'POST'
  const response=await fetch(base+prefix+path,{method,headers,...(input===undefined?{}:{body:form?input:JSON.stringify(input)})})
  journal.push({method,path,status:response.status})
  return response
 }
 async function json(path:string,input?:unknown,options:Parameters<typeof call>[2]={}){
  const response=await call(path,input,options)
  return {status:response.status,body:await response.json()}
 }
 const multipart=(buffer:Buffer,fields:Record<string,string>={})=>{
  const form=new FormData();form.set('file',new Blob([Uint8Array.from(buffer)]),'synthetic.xlsx')
  for(const [key,value]of Object.entries(fields))form.set(key,value)
  return form
 }
 async function publish(id:string){
  const preview=await json('/component-drafts/'+id+'/preview');expect(preview.status).toBe(200);expect(preview.body.data.blockers).toEqual([])
  const p=preview.body.data
  const result=await json('/component-drafts/'+id+'/publish',{requestId:randomUUID(),expectedRevision:p.revision,expectedPreviewHash:p.previewHash,expectedBase:p.baseCombination,reason:'Synthetic HTTP integration only',allowedProducts:['TRAINING']})
  expect(result.status,result.body.message).toBe(200);expect(result.body.data.state).toBe('ONLINE')
  return result.body.data as {id:string;combinationHash:string}
 }
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(selected!)
  const create=(name:string,platformRole:'SYSTEM_ADMIN'|'STANDARD')=>db.user.create({data:{username:'component_http_'+name+'_'+randomUUID(),passwordHash:'synthetic-unused',role:'ADMIN',platformRole,accountDomain:'TRAINING',mustChangePassword:false}})
  system=await create('system','SYSTEM_ADMIN');manager=await create('entry','STANDARD')
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:manager.id,entry:'TRAINING',grantedBy:system.id}})
  const app=express();app.use(express.json());app.use('/api',csrfProtection)
  app.use(prefix,platformSurveyOriginGuard,surveyStandardTripletRouter);app.use(errorHandler)
  server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as {port:number}).port
 })
 afterAll(async()=>{
  if(process.env.COMPONENT_MANAGEMENT_HTTP_JOURNAL){const {writeFile}=await import('node:fs/promises');await writeFile(process.env.COMPONENT_MANAGEMENT_HTTP_JOURNAL,JSON.stringify({scope:'task-owned synthetic HTTP; signed-session fixture, no MFA ceremony or four-entry administration',requests:journal},null,2)+'\n')}
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))
  await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()
 })
 it('downloads, imports, edits and publishes through HTTP then preserves the old exact source on an R-only revision',async()=>{
  const response=await call('/component-template');expect(response.status).toBe(200);expect(response.headers.get('content-type')).toContain('spreadsheetml')
  const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as never)
  const key='http_synthetic_'+randomUUID().replaceAll('-','')
  for(const sheet of book.worksheets)if(sheet.name!=='填写说明')sheet.eachRow((row,n)=>{if(n>1&&row.getCell(1).value==='synthetic_import_example')row.getCell(1).value=key})
  const buffer=Buffer.from(await book.xlsx.writeBuffer())
  const preview=await json('/component-import/preview',multipart(buffer));expect(preview.status).toBe(200);expect(preview.body.data.entries[0].issues).toEqual([])
  const saved=await json('/component-import/save',multipart(buffer,{requestId:randomUUID(),expectedDigest:preview.body.data.digest}));expect(saved.status).toBe(200);expect(saved.body.data.entries[0].status).toBe('IMPORTED')
  const id=saved.body.data.entries[0].draft.id,read=await json('/component-drafts/'+id);expect(read.status).toBe(200)
  const draft=read.body.data,editable={toolKey:draft.toolKey,configurationName:'Edited synthetic configuration',baseCombination:draft.baseCombination,changedParts:draft.changedParts}
  const edited=await json('/component-drafts/'+id,{expectedRevision:draft.revision,draft:editable});expect(edited.status).toBe(200);expect(edited.body.data.revision).toBe(draft.revision+1)
  const first=await publish(id),row=await standardReleaseRow(db,first.id),nativeId=databaseContentSource(row.snapshot.parts.CONTENT)!.scaleId
  const nativeBefore=await db.scale.findUniqueOrThrow({where:{id:nativeId}}),oldSnapshot=JSON.stringify(row.snapshot)
  const trialsBefore=await db.$queryRaw`SELECT * FROM survey_standard_trials WHERE release_id=${first.id} ORDER BY id`
  expect((await json('/component-drafts/'+id,{expectedRevision:edited.body.data.revision,draft:editable})).status).toBe(409)
  const prefill=await json('/component-revision-prefill',{releaseId:first.id,combinationHash:first.combinationHash});expect(prefill.status).toBe(200)
  const report=structuredClone(prefill.body.data.changedParts.REPORT),payload=report.payload.definition??report.payload
  report.version='http-r2';payload.reportVersion='http-r2';payload.interpretations[0].summary='Synthetic revised report only'
  const secondDraft=await json('/component-drafts',{requestId:randomUUID(),draft:{toolKey:key,configurationName:'Synthetic report-only revision',baseCombination:{releaseId:first.id,combinationHash:first.combinationHash},changedParts:{REPORT:report}}});expect(secondDraft.status).toBe(200)
  const second=await publish(secondDraft.body.data.id),newRow=await standardReleaseRow(db,second.id)
  expect(second.id).not.toBe(first.id);expect(second.combinationHash).not.toBe(first.combinationHash)
  expect(newRow.snapshot.parts.CONTENT).toEqual(row.snapshot.parts.CONTENT);expect(newRow.snapshot.parts.PARAMETERS).toEqual(row.snapshot.parts.PARAMETERS);expect(newRow.measurement_release).toEqual(row.measurement_release)
  expect(await db.scale.findUniqueOrThrow({where:{id:nativeId}})).toEqual(nativeBefore)
  expect(JSON.stringify((await standardReleaseRow(db,first.id)).snapshot)).toBe(oldSnapshot)
  expect(await db.$queryRaw`SELECT * FROM survey_standard_trials WHERE release_id=${first.id} ORDER BY id`).toEqual(trialsBefore)
  const choices=await trainingStandardManagementCatalog(manager.id,1)
  expect(choices.list.filter(c=>c.toolKey===key).map(c=>({id:c.id,hash:c.combinationHash,assignable:c.assignable}))).toEqual(expect.arrayContaining([{id:first.id,hash:first.combinationHash,assignable:true},{id:second.id,hash:second.combinationHash,assignable:true}]))
  for(const pointer of [first,second])await db.$transaction(async tx=>{const exact=await readCurrentStandardCombination(tx,{releaseId:pointer.id,combinationHash:pointer.combinationHash});expect(exact.row.id).toBe(pointer.id)})
  await expect(db.$transaction(tx=>readCurrentStandardCombination(tx,{releaseId:first.id,combinationHash:second.combinationHash}))).rejects.toThrow()
 },60000)
 it('rejects anonymous, entry-admin, stale-step-up, invalid CSRF/origin and invalidated-session requests before import writes',async()=>{
  const before=await db.$queryRaw`SELECT id,revision FROM scale_component_drafts ORDER BY id`
  expect((await call('/component-template',undefined,{anonymous:true})).status).toBe(401)
  expect((await call('/component-template',undefined,{user:manager})).status).toBe(403)
  expect((await call('/component-import/preview',multipart(Buffer.from('not an Excel file')),{claims:{adminVerifiedAt:proof.adminVerifiedAt-301}})).status).toBe(403)
  expect((await call('/component-import/preview',multipart(Buffer.from('not an Excel file')),{csrf:false})).status).toBe(403)
  expect((await call('/component-import/preview',multipart(Buffer.from('not an Excel file')),{origin:'https://foreign.example'})).status).toBe(403)
  await db.user.update({where:{id:system.id},data:{tokenVersion:1}})
  try{expect((await call('/component-drafts')).status).toBe(401)}finally{await db.user.update({where:{id:system.id},data:{tokenVersion:0}})}
  expect(await db.$queryRaw`SELECT id,revision FROM scale_component_drafts ORDER BY id`).toEqual(before)
 })
})
