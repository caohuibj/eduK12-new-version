import express from 'express'
import type {Server} from 'node:http'
import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {grantSyntheticHuischoolProduct} from './educationProductFixture'
import {educationRosterJobRouter} from '../../modules/education-roster/jobs.routes'
import {schoolOriginGuard} from '../../modules/campus/originGuard'
import {huiteacherOriginGuard} from '../../modules/huiteacher/originGuard'
import {csrfProtection} from '../../middleware/csrf'
import {generateToken} from '../../utils/jwt'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
const source={rawDigest:'a'.repeat(64),mappingDigest:'b'.repeat(64),sheetDigest:'c'.repeat(64)},csrf='synthetic-jobs-'+ 'x'.repeat(32)
let server:Server,base:string
async function fixture(){
 const username='jobs_'+randomUUID().slice(0,12),user=await prisma.user.create({data:{username,passwordHash:'synthetic-unused',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true,mustChangePassword:false}})
 await prisma.campusAccount.create({data:{userId:user.id,loginName:username,normalizedLogin:username}})
 const org=await prisma.organization.create({data:{id:randomUUID(),name:'synthetic roster jobs only',productDomain:'SCHOOL',createdByUserId:user.id}})
 const member=await prisma.organizationMembership.create({data:{id:randomUUID(),organizationId:org.id,userId:user.id,orgRole:'ORG_ADMIN'}})
 await grantSyntheticHuischoolProduct(prisma,{organizationId:org.id,adminUserId:user.id,adminMembershipId:member.id})
 await prisma.educationProductEntitlement.create({data:{organizationId:org.id,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:user.id}})
 const teacher=await prisma.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org.id,membershipId:member.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:user.id}})
 const call=async(path:string,body?:unknown,entry:'SCHOOL'|'TEACHER'='SCHOOL',options:{age?:number;csrf?:boolean;origin?:string;actor?:typeof user;org?:string}={})=>{
  const principal=options.actor??user,te=entry==='TEACHER',cookie=te?'huiteacher':'huischool',token=generateToken({userId:principal.id,username:principal.username,role:'TEACHER',accountDomain:'SCHOOL',tokenVersion:0,mfaVerifiedAt:Math.floor(Date.now()/1000)-(options.age??0),...(te?{sessionProduct:'HUITEACHER' as const}:{})})
  const res=await fetch(`${base}/api/${te?'huiteacher':'campus'}/organizations/${options.org??org.id}/roster-imports${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:options.origin??(process.env.NODE_ENV==='production'?`https://${te?'teacher':'school'}.eduk12.top`:`http://${te?'teacher':'school'}.localhost:5197`),'X-CSRF-Token':options.csrf===false?'':csrf,Cookie:`${cookie}_csrf=${csrf}; ${cookie}_session=${token}`},...(body?{body:JSON.stringify(body)}:{})})
  return {status:res.status,body:await res.json(),cache:res.headers.get('cache-control'),retryAfter:res.headers.get('retry-after')}
 }
 const count=async()=> (await prisma.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int n FROM campus_personnel WHERE organization_id=${org.id}`)[0].n
 return {user,org,member,teacher,call,count}
}
const unit=async(data:{id:string;organizationId:string;unitKind:string;name:string;parentUnitId?:string})=>{await prisma.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name,parent_unit_id) VALUES(${data.id},${data.organizationId},${data.unitKind},${data.name},${data.parentUnitId??null})`;return data}
const staff=(n:number)=>({kind:'STAFF',rows:Array.from({length:n},(_,i)=>({line:i+2,number:'T'+String(i).padStart(5,'0'),name:'合成人员'+i}))})
const chunks=(input:any)=>Array.from({length:Math.ceil(input.rows.length/100)},(_,i)=>({...input,rows:input.rows.slice(i*100,i*100+100)}))
async function prepare(f:Awaited<ReturnType<typeof fixture>>,input:any,entry:'SCHOOL'|'TEACHER'='SCHOOL'){
 const created=await f.call('',{requestId:randomUUID(),input,source},entry);expect(created.status).toBe(200)
 const proof=created.body.data.proof,id=created.body.data.id;let job=created.body.data
 for(const [i,part] of chunks(input).entries()){const preview=await f.call(`/${id}/parts/${i}/preview`,{proof,input:part},entry);expect(preview.status).toBe(200);job=preview.body.data}
 return {id,proof,job,parts:chunks(input),entry}
}
async function begin(f:Awaited<ReturnType<typeof fixture>>,p:Awaited<ReturnType<typeof prepare>>,resume=false){const r=await f.call(`/${p.id}/${resume?'resume':'confirm'}`,{proof:p.proof,planToken:p.job.planToken,verifiedOffline:false},p.entry);expect(r.status).toBe(200);return r.body.data.runToken as string}
const save=(f:Awaited<ReturnType<typeof fixture>>,p:Awaited<ReturnType<typeof prepare>>,index:number,runToken:string)=>f.call(`/${p.id}/parts/${index}/commit`,{proof:p.proof,runToken,input:p.parts[index]},p.entry)
suite('whole roster jobs over real HTTP and isolated PostgreSQL',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY='ab'.repeat(32);const app=express();app.use(express.json({limit:'2mb'}));app.use('/api',csrfProtection);app.use('/api/campus',schoolOriginGuard,educationRosterJobRouter('SCHOOL'));app.use('/api/huiteacher',huiteacherOriginGuard,educationRosterJobRouter('TEACHER'));app.use((err:any,_req:any,res:any,_next:any)=>res.status(500).json({code:'TEST_SERVER_ERROR',message:err.message}));server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}`})
 afterAll(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect()})
 it.each([2,101])('rejects resolved class aliases across a %i-row file before creating any job',async count=>{
  const f=await fixture(),grade=await unit({id:randomUUID(),organizationId:f.org.id,unitKind:'GRADE',name:'一年级'})
  const input={kind:'CLASS',defaultGradeId:grade.id,rows:Array.from({length:count},(_,i)=>({line:i+1,name:'班级'+i,grade:'一年级'}))}
  input.rows[count-1]={line:count,name:input.rows[0].name,grade:''}
  const response=await f.call('',{requestId:randomUUID(),input,source})
  expect(response.status).toBe(400);expect(response.body.code).toBe('ROSTER_WHOLE_FILE_INVALID')
  const [jobs]=await prisma.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int n FROM education_roster_import_jobs WHERE organization_id=${f.org.id}`
  expect(jobs.n).toBe(0)
 })
 it('serializes same-parent duplicate unit creation without touching legacy rows',async()=>{
  const {createOrganizationUnit}=await import('../../modules/organization/structure')
  const f=await fixture(),grade=await unit({id:randomUUID(),organizationId:f.org.id,unitKind:'GRADE',name:'并发年级'})
  for(let i=0;i<2;i++)await unit({id:randomUUID(),organizationId:f.org.id,unitKind:'CLASS',name:'历史同名班',parentUnitId:grade.id})
  const input={organizationId:f.org.id,unitKind:'CLASS' as const,name:'并发班',parentUnitId:grade.id}
  const results=await Promise.allSettled([createOrganizationUnit(input),createOrganizationUnit(input)])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(1)
  expect((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code).toBe('UNIT_NAME_EXISTS')
  const [classes]=await prisma.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int n FROM organization_units WHERE organization_id=${f.org.id} AND parent_unit_id=${grade.id} AND name='并发班'`
  expect(classes.n).toBe(1)
  const [legacy]=await prisma.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int n FROM organization_units WHERE organization_id=${f.org.id} AND name='历史同名班'`
  expect(legacy.n).toBe(2)
  await expect(prisma.$transaction(async tx=>{await (await import('../../modules/organization/structure')).createOrganizationUnitInTransaction(tx,{...input,name:'同批班'});await (await import('../../modules/organization/structure')).createOrganizationUnitInTransaction(tx,{...input,name:'同批班'})})).rejects.toMatchObject({code:'UNIT_NAME_EXISTS'})
  const [rolledBack]=await prisma.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int n FROM organization_units WHERE organization_id=${f.org.id} AND name='同批班'`
  expect(rolledBack.n).toBe(0)
 })
 it('validates cross-part duplicate numbers and accounts before persisting a plan',async()=>{
  const f=await fixture(),input=staff(101);input.rows[100].number=input.rows[0].number.toLowerCase()
  expect(await f.call('',{requestId:randomUUID(),input,source})).toMatchObject({status:400,body:{code:'ROSTER_WHOLE_FILE_INVALID',data:{issues:[{line:102}]}}})
  input.rows[100].number='DIFFERENT';Object.assign(input.rows[0],{username:'same_user'});Object.assign(input.rows[100],{username:'SAME_USER'})
  expect((await f.call('',{requestId:randomUUID(),input,source})).status).toBe(400);expect(await f.count()).toBe(0)
 })
 it('requires all previews, explicit confirmation and matching original source',async()=>{
  const f=await fixture(),input=staff(101),id=randomUUID(),created=await f.call('',{requestId:id,input,source}),p=created.body.data
  expect((await f.call(`/${id}/confirm`,{proof:p.proof,planToken:p.planToken})).status).toBe(409)
  expect((await f.call(`/${id}/match`,{input,source:{...source,mappingDigest:'d'.repeat(64)}})).status).toBe(400)
  expect((await f.call('',{requestId:id,input,source})).body.data.id).toBe(id)
  expect((await f.call('',{requestId:id,input:staff(102),source})).status).toBe(409);expect(await f.count()).toBe(0)
 })
 it('saves 201 rows once, pauses safely, resumes and keeps immutable receipts without accounts or grants',async()=>{
  const f=await fixture(),beforeUsers=await prisma.user.count(),beforeGrants=await prisma.educationProductRoleGrant.count(),p=await prepare(f,staff(201));let token=await begin(f,p)
  const first=await save(f,p,0,token);expect(first).toMatchObject({status:200,body:{data:{savedRows:100,added:100}}});expect(await f.count()).toBe(100)
  expect((await save(f,p,0,token)).body.data).toEqual(first.body.data)
  expect((await save(f,p,2,token)).status).toBe(409)
  expect((await f.call(`/${p.id}/pause`,{proof:p.proof})).status).toBe(200);expect((await save(f,p,1,token)).status).toBe(409)
  token=await begin(f,p,true);expect((await save(f,p,1,token)).status).toBe(200);expect((await save(f,p,2,token))).toMatchObject({status:200,body:{data:{status:'COMPLETED',savedRows:201,added:201}}})
  expect(await f.count()).toBe(201);expect(await prisma.user.count()).toBe(beforeUsers);expect(await prisma.educationProductRoleGrant.count()).toBe(beforeGrants)
  const meta=await prisma.$queryRaw<any[]>`SELECT to_jsonb(j) AS j FROM education_roster_import_jobs j WHERE id=${p.id}`;const parts=await prisma.$queryRaw<any[]>`SELECT to_jsonb(p) AS p FROM education_roster_import_parts p WHERE job_id=${p.id}`
  expect(JSON.stringify([meta,parts])).not.toContain('合成人员');expect(JSON.stringify([meta,parts])).not.toContain('T00000')
  await expect(prisma.$executeRaw`UPDATE education_roster_import_parts SET receipt='{}'::jsonb WHERE job_id=${p.id} AND part_index=0`).rejects.toThrow('immutable')
  await expect(prisma.$executeRaw`DELETE FROM education_roster_import_parts WHERE job_id=${p.id} AND part_index=0`).rejects.toThrow('immutable')
  expect((await f.call('')).body.data.list).toHaveLength(1);expect((await f.call('','', 'TEACHER')).body.data.list).toHaveLength(0)
 })
 it('serializes concurrent duplicate writes and exposes a single definitive receipt',async()=>{
  const f=await fixture(),p=await prepare(f,staff(2)),token=await begin(f,p)
  const responses=await Promise.all([save(f,p,0,token),save(f,p,0,token)]);expect(responses.some(r=>r.status===200)).toBe(true);expect(responses.every(r=>[200,409].includes(r.status))).toBe(true)
  expect(await f.count()).toBe(2);expect((await f.call(`/${p.id}`))).toMatchObject({status:200,body:{data:{savedRows:2,status:'COMPLETED'}}});expect((await save(f,p,0,token)).status).toBe(200)
 })
 it('rotates the run token when another tab explicitly resumes',async()=>{
  const f=await fixture(),p=await prepare(f,staff(101)),old=await begin(f,p),next=await begin(f,p,true);expect(old).not.toBe(next)
  expect((await save(f,p,0,old)).status).toBe(409);expect(await f.count()).toBe(0);expect((await save(f,p,0,next)).status).toBe(200)
 })
 it('rechecks live product and School authority before every Teacher part',async()=>{
  const f=await fixture(),p=await prepare(f,staff(101),'TEACHER'),token=await begin(f,p)
  expect((await save(f,p,0,token)).status).toBe(200)
  await prisma.educationProductRoleGrant.update({where:{id:f.teacher.id},data:{revokedAt:new Date(),revokedByUserId:f.user.id}})
  expect((await save(f,p,1,token)).status).toBe(403);expect(await f.count()).toBe(100)
  await prisma.educationProductRoleGrant.update({where:{id:f.teacher.id},data:{revokedAt:null,revokedByUserId:null}})
  await prisma.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.org.id,userId:f.user.id,permission:'ORGANIZATION_GOVERNANCE',reason:'synthetic revoked',deniedByUserId:f.user.id}})
  expect((await save(f,p,1,token)).status).toBe(403);expect(await f.count()).toBe(100)
 })
 it('allows Teacher-only structure management without granting personnel authority',async()=>{
  const f=await fixture();await prisma.organizationAccessDeny.create({data:{id:randomUUID(),organizationId:f.org.id,userId:f.user.id,permission:'ORGANIZATION_GOVERNANCE',reason:'synthetic deny',deniedByUserId:f.user.id}})
  expect((await f.call('',{requestId:randomUUID(),input:staff(1),source},'TEACHER')).status).toBe(403)
  const p=await prepare(f,{kind:'GRADE',rows:[{line:1,name:'合成年级'}]},'TEACHER'),token=await begin(f,p)
  expect((await save(f,p,0,token))).toMatchObject({status:200,body:{data:{added:1,status:'COMPLETED'}}});expect((await f.call('',undefined,'TEACHER')).body.data.list).toHaveLength(1)
 })
 it('keeps history scoped to actor, school and entry, and expires only unfinished mutations',async()=>{
  const f=await fixture(),other=await fixture(),p=await prepare(f,staff(1))
  expect((await f.call(`/${p.id}`,undefined,'SCHOOL',{actor:other.user})).status).toBe(403)
  expect((await other.call(`/${p.id}`)).status).toBe(404);expect((await f.call(`/${p.id}`,undefined,'TEACHER')).status).toBe(404)
  await prisma.$executeRaw`UPDATE education_roster_import_jobs SET expires_at=statement_timestamp()-INTERVAL '1 second' WHERE id=${p.id}`
  expect((await f.call(`/${p.id}`)).body.data.expired).toBe(true)
  expect((await f.call(`/${p.id}/match`,{input:staff(1),source})).status).toBe(410)
 })
 it('requires current MFA, correct CSRF and origin without touching a job',async()=>{
  const f=await fixture(),body={requestId:randomUUID(),input:staff(1),source}
  expect((await f.call('',body,'SCHOOL',{age:301})).status).toBe(403)
  expect((await f.call('',body,'SCHOOL',{csrf:false})).status).toBe(403)
  expect((await f.call('',body,'TEACHER',{origin:'http://school.localhost:5197'})).status).toBe(403)
  expect(await f.count()).toBe(0)
 })
 it('rejects a class opened after preview without creating student accounts or eligibilities',async()=>{
  const f=await fixture(),grade=await unit({id:randomUUID(),organizationId:f.org.id,unitKind:'GRADE',name:'合成年级'}),cl=await unit({id:randomUUID(),organizationId:f.org.id,unitKind:'CLASS',name:'合成班级',parentUnitId:grade.id})
  const p=await prepare(f,{kind:'STUDENT',rows:[{line:2,number:'00001',grade:grade.name,className:cl.name}]}),token=await begin(f,p)
  await prisma.$executeRaw`INSERT INTO campus_class_admissions(class_unit_id,organization_id,status) VALUES(${cl.id},${f.org.id},'OPEN')`
  expect((await save(f,p,0,token)).status).toBe(409);expect(await f.count()).toBe(0)
  expect((await f.call(`/${p.id}`)).body.data.savedRows).toBe(0)
 })
 it('rolls back business writes and receipt together when the final metadata update fails',async()=>{
  const f=await fixture(),p=await prepare(f,staff(2)),token=await begin(f,p),fn='test_roster_fault_'+randomUUID().replaceAll('-','')
  await prisma.$executeRawUnsafe(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.job_id='${p.id}' AND NEW.state='COMMITTED' THEN RAISE EXCEPTION 'synthetic receipt failure'; END IF; RETURN NEW; END; $$`)
  await prisma.$executeRawUnsafe(`CREATE TRIGGER ${fn} BEFORE UPDATE ON education_roster_import_parts FOR EACH ROW EXECUTE FUNCTION ${fn}()`)
  try{expect((await save(f,p,0,token)).status).toBe(500);expect(await f.count()).toBe(0);expect((await f.call(`/${p.id}`)).body.data.savedRows).toBe(0)}
  finally{await prisma.$executeRawUnsafe(`DROP TRIGGER ${fn} ON education_roster_import_parts`);await prisma.$executeRawUnsafe(`DROP FUNCTION ${fn}()`)}
  expect((await save(f,p,0,token))).toMatchObject({status:200,body:{data:{added:2,savedRows:2}}})
 })
 it('rechecks remaining structural plans and retains completed parts',async()=>{
  const f=await fixture(),input={kind:'GRADE',rows:Array.from({length:101},(_,i)=>({line:i+1,name:'年级'+i}))},p=await prepare(f,input),token=await begin(f,p)
  expect((await save(f,p,0,token)).status).toBe(200)
  await unit({id:randomUUID(),organizationId:f.org.id,unitKind:'GRADE',name:'年级100'})
  expect((await save(f,p,1,token)).status).toBe(409)
  const reset=await f.call(`/${p.id}/recheck`,{proof:p.proof});expect(reset.body.data.parts[0].state).toBe('COMMITTED');expect(reset.body.data.parts[1].state).toBe('PLANNED')
  const preview=await f.call(`/${p.id}/parts/1/preview`,{proof:p.proof,input:p.parts[1]});p.job=preview.body.data
  const next=await begin(f,p);expect((await save(f,p,1,next))).toMatchObject({status:200,body:{data:{status:'COMPLETED',added:100,skipped:1,savedRows:101}}})
 })
})
