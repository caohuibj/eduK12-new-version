// This fresh check runs only in the disposable Actions database and consumes
// the compiled backend. It never connects to a developer or production DB.
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const fs=require('node:fs/promises');const path=require('node:path');
const root=path.resolve(__dirname,'../..'),backend=path.join(root,'server-version/backend');
const from=(file)=>require(path.join(backend,'dist',file));
async function main(){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.NODE_ENV,'test');
 const selected=new URL(process.env.DATABASE_URL);assert.ok(['127.0.0.1','localhost'].includes(selected.hostname));assert.equal(selected.pathname,'/shared_authoring_ci');
 assert.ok(process.env.UPLOAD_DIR?.includes('shared-authoring-'));
 const {prisma:db}=from('config/database.js'),{compileResearchScale}=from('modules/survey/builder.compiler.js');
 const express=require(path.join(backend,'node_modules/express'));const router=from('routes/scales.js').default;
 const {generateToken}=from('utils/jwt.js');const {hashScaleDefinition}=from('modules/scale/scale-definition.js');
 const {loadFrozenScaleRuntimeSnapshot}=from('modules/assessment-runtime/runtime-snapshot.js');
 const {publishedScaleMediaOwner,frozenScaleMediaOwner}=from('modules/scale/scale-image-retention.js');
 const checks=[],ids=[randomUUID(),randomUUID(),randomUUID()];let server;
 try{
  const teacher=await db.user.create({data:{id:ids[0],username:'shared-ci-'+ids[0],passwordHash:'synthetic-disabled-no-password-login',role:'TEACHER',accountDomain:'TRAINING',teacherApproved:true}});
  const students=[];for(const id of ids.slice(1))students.push(await db.user.create({data:{id,username:'shared-ci-'+id,passwordHash:'synthetic-disabled-no-password-login',role:'STUDENT',accountDomain:'TRAINING'}}));
  const tokens=new Map([teacher,...students].map(u=>[u.id,generateToken({userId:u.id,username:u.username,role:u.role,accountDomain:'TRAINING',tokenVersion:u.tokenVersion})]));
  const contents=[['image/png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c3ioAAAAASUVORK5CYII=','base64')],['video/mp4',Buffer.from('000000186674797069736F6D0000020069736F6D69736F32','hex')],['application/pdf',Buffer.from('%PDF-1.4\n% synthetic stimulus\n%%EOF')],['application/pdf',Buffer.from('%PDF-1.4\n% report-only\n%%EOF')],['application/pdf',Buffer.from('%PDF-1.4\n% unrelated\n%%EOF')]];
  const materials=[];
  for(const[mimeType,bytes]of contents){const objectKey='shared-authoring/'+randomUUID();await fs.mkdir(path.dirname(path.join(process.env.UPLOAD_DIR,objectKey)),{recursive:true});await fs.writeFile(path.join(process.env.UPLOAD_DIR,objectKey),bytes);
   const asset=await db.storedAsset.create({data:{objectKey,provider:'local',ownerId:teacher.id,accessScope:'PRIVATE',sha256:createHash('sha256').update(bytes).digest('hex'),mimeType,sizeBytes:bytes.length,originalName:'synthetic material'}});
   materials.push({asset:{assetId:asset.id,contentHash:asset.sha256,mimeType},name:'Synthetic '+materials.length,rightsStatus:'authorized',rightsNote:'Synthetic CI rights'});
  }
  const definition=compileResearchScale('Synthetic material release',{schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',responseOptions:[{optionKey:'a',label:'No',score:0},{optionKey:'b',label:'Yes',score:1}],dimensions:[{dimensionKey:'d',label:'Descriptive',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic question',required:true,reverse:false,dimensionKeys:['d'],materials:materials.slice(0,3)}]});
  definition.report.rawScoreFeedback={schemaVersion:1,rules:[{scoreKey:'d',ranges:[{key:'r',min:0,max:1,includeMax:true,text:'Synthetic matched feedback',materials:[materials[3]]}]}]};
  const scale=await db.scale.create({data:{code:'shared_'+randomUUID().replaceAll('-',''),name:'Synthetic material release',creatorId:teacher.id,instrumentClass:'CUSTOM_DESCRIPTIVE',status:'DRAFT',visibility:'COURSE',definition}});
  const course=await db.course.create({data:{title:'Synthetic course',courseCode:randomUUID(),creatorId:teacher.id,status:'PUBLISHED'}});
  await db.courseScale.create({data:{courseId:course.id,scaleId:scale.id}});await db.courseStudent.create({data:{courseId:course.id,studentId:students[0].id,status:'ACTIVE'}});
  const app=express();app.use(express.json());app.use('/api/scales',router);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});const origin='http://127.0.0.1:'+server.address().port;
  const request=async(url,user,method='GET',body)=>fetch(origin+'/api/scales'+url,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:'ptool_session='+tokens.get(user.id)}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json=async(...args)=>{const response=await request(...args),value=await response.json();assert.equal(value.code,0,JSON.stringify({status:response.status,message:value.message}));return value.data};
  await json('/'+scale.id+'/publish',teacher,'POST',{expectedUpdatedAt:scale.updatedAt.toISOString()});
  const released=await db.scale.findUniqueOrThrow({where:{id:scale.id}});assert.equal(released.status,'PUBLISHED');
  const publicationOwner=publishedScaleMediaOwner(scale.id,released.definitionHash);assert.equal(await db.assetReference.count({where:{entityType:publicationOwner.entityType,entityId:publicationOwner.entityId,field:publicationOwner.field}}),4);checks.push('real publish retains stimulus and report-only immutable references');
  const started=await json('/'+scale.id+'/assessments',students[0],'POST',{});const attempt=started.assessment;assert.ok(attempt?.id,'Actual start returns an assessment');
  const row=await db.assessment.findUniqueOrThrow({where:{id:attempt.id}});const snapshot=await loadFrozenScaleRuntimeSnapshot(row.runtimeSnapshotEncrypted);
  assert.deepEqual(snapshot.definition.items[0].materials,materials.slice(0,3));const owner=frozenScaleMediaOwner(attempt.id);assert.equal(await db.assetReference.count({where:{entityType:owner.entityType,entityId:owner.entityId,field:owner.field}}),4);checks.push('student course admission freezes exact material definition and durable references');
  const assetUrl=id=>'/assessments/'+attempt.id+'/assets/'+id,reportUrl=id=>'/assessments/'+attempt.id+'/report-assets/'+id;
  for(let i=0;i<3;i++){const response=await request(assetUrl(materials[i].asset.assetId),students[0]);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),materials[i].asset.mimeType);assert.ok(response.headers.get('Cache-Control').includes('no-store'));assert.deepEqual(Buffer.from(await response.arrayBuffer()),contents[i][1]);}
  checks.push('authenticated frozen PNG/MP4/PDF HTTP delivery returns exact bytes and private headers');
  for(const i of [3,4]){const response=await request(assetUrl(materials[i].asset.assetId),students[0]);const body=await response.json();assert.notEqual(body.code,0);}
  assert.equal((await request(assetUrl(materials[0].asset.assetId))).status,401);assert.equal((await request(assetUrl(materials[0].asset.assetId),students[1])).status,404);
  assert.equal((await request(reportUrl(materials[3].asset.assetId),students[0])).status,404);checks.push('unauthenticated, unrelated student, unrelated asset and premature report media remain denied');
  const savedHash=hashScaleDefinition(snapshot.definition);await db.scale.update({where:{id:scale.id},data:{definition:{...definition,items:definition.items.map(item=>({...item,materials:[]}))}}});
  assert.equal((await request(assetUrl(materials[0].asset.assetId),students[0])).status,200);checks.push('editing live definition does not change frozen attempt media');
  const submit=await json('/assessments/'+attempt.id+'/submit',students[0],'POST',{submissionId:randomUUID(),attemptEpoch:1,definitionHash:savedHash,answers:[{itemCode:snapshot.definition.items[0].itemCode,responseValue:'b'}]});
  assert.ok(submit);assert.equal((await db.assessment.findUniqueOrThrow({where:{id:attempt.id}})).status,'COMPLETED');
  const report=await request(reportUrl(materials[3].asset.assetId),students[0]);assert.equal(report.status,200);assert.deepEqual(Buffer.from(await report.arrayBuffer()),contents[3][1]);checks.push('actual final submission discloses only matched report media through report-authorized HTTP');
  assert.equal((await request(reportUrl(materials[4].asset.assetId),students[0])).status,404);assert.equal((await request(reportUrl(materials[3].asset.assetId),students[1])).status,404);
  await db.storedAsset.update({where:{id:materials[0].asset.assetId},data:{sha256:'0'.repeat(64)}});assert.notEqual((await request(assetUrl(materials[0].asset.assetId),students[0])).status,200);checks.push('changed frozen asset hash fails closed');
  await fs.mkdir(path.join(root,'shared-authoring-evidence'),{recursive:true});await fs.writeFile(path.join(root,'shared-authoring-evidence/frozen-chain.json'),JSON.stringify({status:'PASS',compiledBackend:true,syntheticAccounts:true,loginUiManuallyAccepted:false,checks},null,2));
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();}
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error.stack);process.exit(1)});
