import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {createRequire} from 'node:module'
import path from 'node:path'
const enabled=process.env.COGNITIVE_HTTP_DB_URL,suite=enabled?describe:describe.skip
suite('MOT actual authenticated HTTP START FINAL archive slice with synthetic COS',()=>{
 let h:any,session:any,submission:any,receipt:any
 const request=async(method:string,url:string,actor='student',body?:unknown,binary=false)=>{
  const response=await fetch(h.baseUrl+url,{method,headers:{...(actor?{cookie:h.cookie(actor)}:{}),...(body!==undefined?{'Content-Type':binary?'application/octet-stream':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})})
  return {status:response.status,body:await response.json() as {code:number|string;data:any;message?:string},cacheControl:response.headers.get('cache-control')}
 }
 beforeAll(async()=>{
  const require=createRequire(path.resolve(process.cwd(),'package.json'))
  h=await require(path.resolve(process.cwd(),'../scripts/cognitive/native-mot-http-review.cjs')).createNativeMotHttpReview({port:0})
 },60000)
 afterAll(async()=>{if(h)await h.close()},30000)
 it('runs real cookie auth/current principal, START and FINAL with authority receipt',async()=>{
  expect((await request('POST','/api/cognitive/sessions','',{assignmentId:h.assignmentId})).status).toBe(401)
  expect((await request('POST','/api/cognitive/sessions','teacher',{assignmentId:h.assignmentId})).status).toBe(403)
  const me=await request('GET','/api/auth/me');expect(me.status).toBe(200);expect(me.body.data.id).toBe(h.actors.student.id)
  const start=await request('POST','/api/cognitive/sessions','student',{assignmentId:h.assignmentId});expect(start.status,start.status===500?JSON.stringify(await h.diagnoseStart()):JSON.stringify(start.body)).toBe(200)
  session=start.body.data;submission=h.makeSubmission(session)
  const completed=await request('POST','/api/cognitive/sessions/'+session.sessionId+'/submit','student',submission.final)
  expect(completed.status).toBe(200);receipt=completed.body.data
  expect(receipt).toMatchObject({coreSaved:true,sessionId:session.sessionId,attemptEpoch:session.attemptEpoch,submissionId:submission.final.submissionId,definitionHash:session.definitionHash})
  expect(receipt.payloadHash).toMatch(/^[a-f0-9]{64}$/)
 })
 it('keeps archive pending on failure, rejects wrong identity/role/format then confirms same sealed retry',async()=>{
  const route='/api/cognitive/sessions/'+session.sessionId+'/raw-archive',q=new URLSearchParams({attemptEpoch:String(session.attemptEpoch),submissionId:submission.final.submissionId,definitionHash:session.definitionHash})
  expect((await request('GET',route+'?'+q,'')).status).toBe(401)
  expect((await request('GET',route+'?'+q,'teacher')).status).toBe(403)
  expect((await request('GET',route+'?'+q,'outsider')).status).toBe(403)
  const pending=await request('GET',route+'?'+q);expect(pending.body.data).toMatchObject({coreSaved:true,archiveState:'pending',archiveConfirmed:false});expect(pending.cacheControl).toBe('no-store')
  expect((await request('POST',route,'student',submission.archive,false)).status).toBe(415)
  expect((await request('POST',route,'student',{...submission.archive,attemptEpoch:session.attemptEpoch+1},true)).status).toBe(409)
  await request('POST','/__review/archive-mode','student',{failUploads:1})
  const before=await h.db.cognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}})
  expect((await request('POST',route,'student',submission.archive,true)).status).toBe(503)
  expect((await request('GET',route+'?'+q)).body.data.archiveConfirmed).toBe(false)
  const result=await request('POST',route,'student',submission.archive,true);expect(result.status).toBe(200)
  expect(result.body.data).toMatchObject({coreSaved:true,archiveConfirmed:true,rawSha256:submission.archive.rawSha256,coreHash:receipt.payloadHash})
  expect((await request('GET',route+'?'+q)).body.data).toEqual(result.body.data)
  expect((await request('POST',route,'student',submission.archive,true)).body.data).toEqual(result.body.data)
  expect((await h.db.cognitiveSession.findUniqueOrThrow({where:{id:session.sessionId}})).resultSnapshotEncrypted).toBe(before.resultSnapshotEncrypted)
  expect(h.buffers.has(result.body.data.assetId)).toBe(true)
 })
 it('only the authenticated binary archive route bypasses the unchanged global 2MiB JSON parser',async()=>{
  const large={padding:'x'.repeat(2*1024*1024+10)},route='/api/cognitive/sessions/'+session.sessionId+'/raw-archive'
  expect((await request('POST',route,'student',large,false)).status).toBe(413)
  expect((await request('POST',route,'student',large,true)).status).toBe(400)
  expect((await request('POST',route,'',large,true)).status).toBe(401)
 })
})
