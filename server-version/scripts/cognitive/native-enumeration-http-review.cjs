'use strict'
// Cloud-only synthetic HTTP slice. Never starts production index, workers or external COS.
const path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),{createRequire}=require('node:module')
const backend=path.resolve(__dirname,'../../backend'),requireBackend=createRequire(path.join(backend,'package.json'))
async function createNativeEnumerationHttpReview({port=18856}={}){
 const url=process.env.COGNITIVE_ENUM_HTTP_DB_URL||'postgresql://postgres@127.0.0.1:15433/cognitive_native_test?schema=cognitive_enum_http_20261026'
 const parsed=new URL(url)
 if(!['127.0.0.1','localhost'].includes(parsed.hostname)||parsed.port!=='15433'||parsed.pathname!=='/cognitive_native_test'||parsed.searchParams.get('schema')!=='cognitive_enum_http_20261026')throw Error('Dedicated loopback HTTP fixture schema required')
 requireBackend('dotenv').config=()=>({parsed:{}})
 Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:url,REDIS_URL:'redis://127.0.0.1:16380',DATA_ENCRYPTION_KEY:'a'.repeat(64),DATA_PSEUDONYM_KEY:'b'.repeat(64),JWT_SECRET:'synthetic-http-review-jwt-secret-at-least-32',ASSET_SIGNING_SECRET:'synthetic-http-review-asset-secret-at-least-32',COGNITIVE_MODULE_ENABLED:'true',BACKGROUND_WORKERS_ENABLED:'false'})
 requireBackend('tsx/cjs');requireBackend('tsx/esm/api').register()
 const source=p=>requireBackend(path.join(backend,'src',p)),db=source('config/database').prisma,express=requireBackend('express')
 const {cacheService}=source('services/cacheService');await cacheService.initialize()
 const {generateToken}=source('utils/jwt'),{authenticate}=source('middleware/auth'),{authController}=source('controllers/authController')
 const {createCognitiveRawArchiveRouter}=source('modules/cognitive/raw-archive.routes')
 const assets=source('services/assetStorage'),cos=source('utils/cos')
 cos.cos.putObject=()=>{throw Error('External COS forbidden in review harness')};cos.cos.headObject=()=>{throw Error('External COS forbidden in review harness')};cos.cos.deleteObject=(_p,cb)=>{cb(null,{});return {}}
 const prefix='enum-http-review-'+randomUUID(),actorRows={},assetIds=[],buffers=new Map();let configId,assignment,course,createdConfig=false,calls=0,successes=0,failUploads=0
 for(const [actor,role] of [['teacher','TEACHER'],['student','STUDENT'],['publisher','ADMIN'],['outsider','STUDENT']])actorRows[actor]=await db.user.create({data:{username:prefix+'-'+actor,passwordHash:'synthetic-not-login',role,platformRole:role==='ADMIN'?'SYSTEM_ADMIN':'STANDARD',isActive:true,teacherApproved:true}})
 course=await db.course.create({data:{title:prefix,courseCode:randomUUID(),creatorId:actorRows.teacher.id}})
 await db.courseStudent.create({data:{courseId:course.id,studentId:actorRows.student.id,status:'ACTIVE'}})
 const seeded=await requireBackend(path.join(backend,'prisma/seeds/native-cognitive')).seedNativeEnumerationConfig(db);configId=seeded.config.id;createdConfig=seeded.created
 if(createdConfig)await source('modules/cognitive/release.service').publishCognitiveConfig(configId,actorRows.publisher.id)
 else if(seeded.config.status!=='PUBLISHED')throw Error('Existing dedicated HTTP seed is not published')
 const errors=[]
 async function diagnoseStart(){try{const v=await source('modules/cognitive/session.service').createSession(actorRows.student.id,assignment.id);JSON.stringify(v);return {success:true}}catch(error){return {message:error.message,stack:error.stack}}}
 const assignmentService=source('modules/cognitive/assignment.service')
 assignment=await assignmentService.createAssignment(actorRows.teacher.id,'TEACHER',{courseId:course.id,configId,title:prefix,profile:'experience',required:true,maxAttempts:3})
 await assignmentService.publishAssignment(actorRows.teacher.id,'TEACHER',assignment.id)
 const cookie=actor=>{const u=actorRows[actor];if(!u)throw Error('Unknown fixture actor');return 'ptool_session='+generateToken({userId:u.id,username:u.username,role:u.role,accountDomain:u.accountDomain,tokenVersion:u.tokenVersion})}
 const fakeStore=async input=>{
  calls++;if(failUploads>0){failUploads--;throw Error('Synthetic COS unavailable')}
  if(input.provider!=='cos'||input.accessScope!=='PRIVATE'||input.initialReference?.entityType!=='CognitiveRawArchivePending')throw Error('Wrong fake COS storage contract')
  const id=randomUUID(),asset=await db.storedAsset.create({data:{id,objectKey:'assets/'+id+'.enc',provider:'cos',accessScope:'PRIVATE',ownerId:input.ownerId,scopeId:input.scopeId,mimeType:input.mimeType,originalName:input.originalName,sizeBytes:input.buffer.length,sha256:createHash('sha256').update(input.buffer).digest('hex'),references:{create:input.initialReference}}})
  assetIds.push(asset.id);buffers.set(asset.id,Buffer.from(input.buffer));successes++;return asset
 }
 const app=express();app.disable('x-powered-by');app.use(express.json({limit:'2mb'}))
 app.use('/__review',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
 app.get('/__review/context',(_req,res)=>res.json({assignmentId:assignment.id,studentId:actorRows.student.id,courseId:course.id,profile:'experience',apiBase:'/api/cognitive',fixture:'synthetic-real-http-slice'}))
 app.get('/__review/login',(req,res)=>{const actor=String(req.query.actor||'student');if(!actorRows[actor]||actor==='publisher')return res.sendStatus(400);res.setHeader('Set-Cookie',cookie(actor)+'; Path=/; HttpOnly; SameSite=Lax');res.json({actor,id:actorRows[actor].id})})
 app.post('/__review/archive-mode',(req,res)=>{const n=req.body?.failUploads;if(!Number.isInteger(n)||n<0||n>10)return res.sendStatus(400);failUploads=n;res.json({failUploads})})
 app.get('/__review/archive-state',async(_req,res)=>res.json({calls,successes,failUploads,ownedAssetCount:await db.storedAsset.count({where:{id:{in:assetIds}}})}))
 app.get('/api/auth/me',authenticate,authController.me)
 app.use('/api/cognitive/sessions/:id/raw-archive',createCognitiveRawArchiveRouter({db,storeAsset:fakeStore,discardUnreferencedAsset:assets.discardUnreferencedAsset}))
 app.use('/api/cognitive',source('modules/cognitive/cognitive.routes').default)
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({code:'REVIEW_HTTP_ERROR',message:error.type==='entity.too.large'?'request too large':'review request failed'}))
 const server=await new Promise((resolve,reject)=>{const s=app.listen(port,'127.0.0.1',()=>resolve(s));s.once('error',reject)})
 async function close(){
  await new Promise(resolve=>server.close(resolve))
  await db.assetReference.deleteMany({where:{assetId:{in:assetIds}}});await db.storedAsset.deleteMany({where:{id:{in:assetIds}}})
  const rel=[];await db.cognitiveSession.deleteMany({where:{assignmentId:assignment.id}});const ar=await db.cognitiveAssignment.findUnique({where:{id:assignment.id}});if(ar?.measurementReleaseId)rel.push(ar.measurementReleaseId)
  await db.cognitiveAssignment.delete({where:{id:assignment.id}})
  if(createdConfig){const cr=await db.cognitiveTestConfig.findUnique({where:{id:configId}});if(cr?.measurementReleaseId)rel.push(cr.measurementReleaseId);await db.cognitiveTestConfig.delete({where:{id:configId}})}
  if(rel.length)await db.$executeRawUnsafe('DELETE FROM measurement_content_releases WHERE id = ANY($1::text[])',rel)
  await db.courseStudent.deleteMany({where:{courseId:course.id}});await db.course.delete({where:{id:course.id}});await db.user.deleteMany({where:{id:{in:Object.values(actorRows).map(u=>u.id)}}});await cacheService.close();await db.$disconnect()
 }
 return {server,baseUrl:'http://127.0.0.1:'+server.address().port,assignmentId:assignment.id,actors:actorRows,cookie,buffers,db,errors,diagnoseStart,close}
}
module.exports={createNativeEnumerationHttpReview}
if(require.main===module)createNativeEnumerationHttpReview().then(h=>{process.stdout.write(JSON.stringify({ready:true,pid:process.pid,baseUrl:h.baseUrl,fixture:'synthetic-real-http-slice',externalCOS:false})+'\n');for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>h.close().finally(()=>process.exit(0)))}).catch(error=>{console.error(error.message);process.exitCode=1})
