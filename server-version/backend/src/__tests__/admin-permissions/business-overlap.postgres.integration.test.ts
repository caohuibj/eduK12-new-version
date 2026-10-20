import {randomUUID} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import express from 'express'
import {beforeAll,afterAll,describe,expect,it} from 'vitest'
import example from '../../modules/situational/authoring/examples/teacher-demonstration.json'
import {compileSjtTemplate} from '../../modules/situational/authoring/template'
import {captureFixture} from '../situational/vnext-capture-fixture'
const suite=process.env.ADMIN_PERMISSIONS_ISOLATED_TEST==='1'?describe:describe.skip
suite('business identities remain orthogonal to Training management over real HTTP/PG',()=>{
  let db:typeof import('../../config/database')['prisma'],sign:typeof import('../../utils/jwt')['generateToken'],server:Server,base:string
  const users:Record<string,any>={},courses:Record<string,any>={},assignments:Record<string,string>={},templates:Record<string,typeof example>={}
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL!)
    if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/eduk12_admin_permissions_'))throw new Error('Dedicated local synthetic DB required')
    db=(await import('../../config/database')).prisma;sign=(await import('../../utils/jwt')).generateToken
    for(const [name,role,entry]of [['student','STUDENT',true],['teacher','TEACHER',true],['otherStudent','STUDENT',false],['otherTeacher','TEACHER',false],['pureAdmin','ADMIN',true],['system','ADMIN',false],['target','STUDENT',false]] as const){
      users[name]=await db.user.create({data:{username:'business-overlap-'+name+'-'+randomUUID(),passwordHash:'unusable',role,accountDomain:'TRAINING',teacherApproved:true,platformRole:name==='system'?'SYSTEM_ADMIN':'STANDARD'}})
      if(entry)await db.adminEntryGrant.create({data:{id:randomUUID(),userId:users[name].id,entry:'TRAINING',grantedBy:users[name].id}})
    }
    for(const name of ['teacher','otherTeacher']){
      courses[name]=await db.course.create({data:{title:'合成身份叠加 '+name,courseCode:randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED',creatorId:users[name].id}})
      assignments[name]=(await db.assignment.create({data:{courseId:courses[name].id,title:'仅所属课程可见的合成任务'}})).id
    }
    await db.courseStudent.create({data:{courseId:courses.teacher.id,studentId:users.target.id,status:'ACTIVE'}})
    await db.courseStudent.create({data:{courseId:courses.otherTeacher.id,studentId:users.otherStudent.id,status:'ACTIVE'}})
    const authoring=await import('../../modules/situational/authoring/service')
    for(const [name,respondentType]of [['student','student_self_report'],['teacher','teacher_self_report']] as const){
      const template={...structuredClone(example),instrumentKey:'sjt-overlap-'+name+'-'+randomUUID(),respondentType}
      const actor={userId:users.teacher.id,admin:false},reviewer={userId:users.system.id,admin:true}
      const draft=await authoring.createSjtDraft(actor,template)
      await authoring.requestSjtReview(actor,draft.id,draft.revision,draft.contentDigest)
      await authoring.reviewSjtDraft(reviewer,draft.id,draft.revision,draft.contentDigest,true,'合成身份叠加验收，仅隔离数据库')
      templates[name]=template as typeof example
    }
    const app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
    app.use('/api/courses',(await import('../../routes/courses')).default)
    app.use('/api/situational',(await import('../../routes/situational')).default)
    app.use('/api/teacher/situational',(await import('../../routes/sjtTeacherParticipation')).default)
    app.use('/api/organizations',(await import('../../modules/organization/organization.routes')).default)
    app.use('/api/users',(await import('../../routes/users')).default)
    app.use((await import('../../middleware/errorHandler')).errorHandler)
    server=createServer(app);await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+(server.address() as {port:number}).port
  },30000)
  afterAll(async()=>{if(server)await new Promise<void>(done=>server.close(()=>done()));await (await import('../../config/queue')).closeQueues(true);await db?.$disconnect()})
  async function call(name:string,path:string,method='GET',body?:unknown,view?:'BUSINESS'|'MANAGEMENT',proof=true){
    const u=users[name],token=sign({userId:u.id,username:u.username,role:u.role,accountDomain:'TRAINING',tokenVersion:0,...(proof?{adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()}:{})})
    const response=await fetch(base+'/api'+path,{method,headers:{Cookie:'ptool_session='+token+'; ptool_csrf=synthetic-csrf',Origin:'http://localhost:5174','Content-Type':'application/json','X-CSRF-Token':'synthetic-csrf',...(view?{'X-EduK12-Account-View':view}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
    return {status:response.status,body:await response.json() as any}
  }
  it('STUDENT + Training can join, see its actual tasks and retain management in the separate view',async()=>{
    expect((await call('student','/courses/join','POST',{courseCode:courses.teacher.courseCode})).status).toBe(200)
    // A pure ADMIN business label is not a student, even with a Training grant.
    expect((await call('pureAdmin','/courses/join','POST',{courseCode:courses.teacher.courseCode})).status).toBe(403)
    expect((await call('pureAdmin','/courses/my/tasks')).status).toBe(403)
    const tasks=await call('student','/courses/my/tasks')
    expect(tasks.status).toBe(200);expect(tasks.body.data.list.map((x:any)=>x.id)).toContain(assignments.teacher)
    expect(tasks.body.data.list.map((x:any)=>x.id)).not.toContain(assignments.otherTeacher)
    expect((await call('student','/courses/my/tasks?courseId='+courses.otherTeacher.id)).body.data.list).toEqual([])
    expect((await call('student','/users','GET',undefined,'MANAGEMENT')).status).toBe(200)
    expect((await call('student','/users','GET',undefined,'BUSINESS')).status).toBe(403)
    expect((await call('otherStudent','/users','GET',undefined,'MANAGEMENT')).status).toBe(403)
    expect((await call('student','/courses/my/tasks','GET',undefined,'BUSINESS',false)).status).toBe(401)
  })
  it('teacher business view is restricted to its own course, while its explicit management view remains available',async()=>{
    expect((await call('teacher','/courses/'+courses.teacher.id+'/students','GET',undefined,'BUSINESS')).status).toBe(200)
    expect((await call('teacher','/courses/'+courses.otherTeacher.id+'/students','GET',undefined,'BUSINESS')).status).toBe(403)
    expect((await call('teacher','/courses/'+courses.otherTeacher.id+'/students','GET',undefined,'MANAGEMENT')).status).toBe(200)
    expect((await call('otherTeacher','/courses/'+courses.teacher.id+'/students','GET',undefined,'MANAGEMENT')).status).toBe(403)
    expect((await call('teacher','/courses/'+courses.teacher.id+'/training-analysis/sources','GET',undefined,'BUSINESS')).status).toBe(200)
    expect((await call('teacher','/courses/'+courses.otherTeacher.id+'/training-analysis/sources','GET',undefined,'BUSINESS')).status).toBe(404)
    await db.user.update({where:{id:users.teacher.id},data:{teacherApproved:false}})
    try{
      expect((await call('teacher','/teacher/situational/history')).status).toBe(403)
      expect((await call('teacher','/courses/'+courses.teacher.id+'/students','GET',undefined,'BUSINESS')).status).toBe(403)
    }finally{await db.user.update({where:{id:users.teacher.id},data:{teacherApproved:true}})}
  })
  it('a teacher-business export keeps its owned-resource scope despite the same account’s management grant',async()=>{
    const {runExportBatch}=await import('../../workers/exportBatchTask')
    const create=async(owner:string)=>{
      const resource=await db.questionnaire.create({data:{name:'合成业务导出',code:'business-'+randomUUID(),type:'COURSE',creatorId:users[owner].id}})
      const id=randomUUID()
      await db.exportBatch.create({data:{id,resourceType:'QUESTIONNAIRE',resourceId:resource.id,createdBy:users.teacher.id,anonymized:true,formats:['csv'],
        options:{anonymize:true,creatorRole:'TEACHER',authorityTokenVersion:0},requestKey:randomUUID(),requestHash:randomUUID(),recordCount:0,expiresAt:new Date(Date.now()+60000)}})
      await db.exportArtifact.create({data:{resourceType:'QUESTIONNAIRE',resourceId:resource.id,createdBy:users.teacher.id,batchId:id,anonymized:true,status:'PROCESSING',format:'csv',
        storageKey:'questionnaire_'+resource.id.slice(0,8)+'_'+id+'__projection_v1_business.csv',expiresAt:new Date(Date.now()+60000)}})
      return id
    }
    const job=(batchId:string)=>({id:'business-'+batchId,data:{batchId},opts:{attempts:1},attemptsMade:0})
    expect(await runExportBatch(job(await create('teacher')))).toMatchObject({status:'READY'})
    await expect(runExportBatch(job(await create('otherTeacher')))).rejects.toThrow('Export resource authority revoked')
  })
  it('TEACHER + Training uses owned-course credential support, without falling into a SYSTEM_ADMIN command',async()=>{
    const owned=await call('teacher',`/courses/${courses.teacher.id}/students/${users.target.id}/reset-password`,'POST',{})
    expect(owned.status).toBe(200);expect(owned.body.data.mustChangePassword).toBe(true)
    expect(typeof owned.body.data.temporaryPassword).toBe('string')
    expect((await call('teacher',`/courses/${courses.otherTeacher.id}/students/${users.otherStudent.id}/reset-password`,'POST',{})).status).toBe(403)
    expect((await call('teacher',`/courses/${courses.teacher.id}/students/${users.otherStudent.id}/reset-password`,'POST',{})).status).toBe(403)
  })
  it.each(['student','teacher'])('%s + Training can participate, recover and submit only its own SJT attempt',async name=>{
    const prefix=name==='teacher'?'/teacher/situational':'/situational',other=name==='teacher'?'otherTeacher':'otherStudent'
    expect((await call(name,prefix+'/instruments')).status).toBe(200)
    expect((await call(name,prefix+'/history')).status).toBe(200)
    const started=await call(name,prefix+'/attempts','POST',{instrumentKey:templates[name].instrumentKey})
    expect(started.status).toBe(200);expect(started.body.code).toBe(0)
    const data=started.body.data,id=data.attemptId
    expect((await call(name,prefix+'/attempts/'+id)).body.code).toBe(0)
    const denied=await call(other,prefix+'/attempts/'+id)
    expect(denied.body.code).not.toBe(0)
    const source=compileSjtTemplate(templates[name]).package.definition
    if(source.schemaVersion!==2)throw new Error('V2 fixture required')
    const capture=captureFixture(source,id),body={submissionId:randomUUID(),attemptEpoch:data.attempt.attemptEpoch,definitionHash:data.attempt.definitionHash,
      compiledRuntimeHash:data.attempt.compiledRuntimeHash,scoringVersion:data.attempt.scoringVersion,responses:capture.responses,researchCapture:capture.capture}
    expect((await call(other,prefix+'/attempts/'+id+'/submit','POST',body)).body.code).not.toBe(0)
    const submitted=await call(name,prefix+'/attempts/'+id+'/submit','POST',body)
    expect(submitted.status).toBe(200);expect(submitted.body.code).toBe(0)
    expect((await call('pureAdmin',prefix+'/history')).status).toBe(403)
  })
  it('reporting resource governance is SYSTEM_ADMIN-only, independent of Training and business role',async()=>{
    expect((await call('system','/organizations/measurement-resources')).status).toBe(200)
    expect((await call('system','/organizations/reporting-specs')).status).toBe(200)
    expect((await call('teacher','/organizations/measurement-resources')).status).toBe(403)
    expect((await call('student','/organizations/reporting-specs')).status).toBe(403)
    const {createCustomScaleDefinition,hashScaleDefinition}=await import('../../modules/scale/scale-definition')
    const definition=createCustomScaleDefinition()
    const fixture=await db.scale.create({data:{code:'sys-candidate-'+randomUUID(),name:'合成目录字段检查',status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',
      creatorId:users.teacher.id,definition,definitionHash:hashScaleDefinition(definition)}})
    const candidates=await call('system','/organizations/measurement-resources/candidates')
    expect(candidates.status).toBe(200)
    expect(candidates.body.data.list.some((scale:any)=>scale.id===fixture.id)).toBe(true)
    for(const scale of candidates.body.data.list)expect(Object.keys(scale).sort()).toEqual(['id','instrumentClass','name','status'])
    expect((await call('teacher','/organizations/measurement-resources/candidates')).status).toBe(403)
    // Candidate metadata does not replace the registration/scientific policy.
    expect((await call('system','/organizations/measurement-resources','POST',{scaleId:fixture.id,mode:'INDIVIDUAL'})).status).toBe(409)
  })
})
