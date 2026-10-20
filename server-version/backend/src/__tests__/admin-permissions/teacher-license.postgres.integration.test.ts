import {randomUUID,randomBytes} from 'node:crypto'
import {createServer,type Server} from 'node:http'
import express from 'express'
import {beforeAll,afterAll,describe,expect,it} from 'vitest'
import {createCustomScaleDefinition,hashScaleDefinition} from '../../modules/scale/scale-definition'
import {registerDescriptiveResource,transitionDescriptiveResource} from '../../modules/assessment-run/registeredResources'
const suite=process.env.ADMIN_PERMISSIONS_ISOLATED_TEST==='1'?describe:describe.skip
suite('Teacher license HTTP entry authority preserves independent release policy',()=>{
  let db:typeof import('../../config/database')['prisma'],server:Server,base:string
  let resourceId:string,organizationId:string,teacherId:string
  let jwt:typeof import('../../utils/jwt'),actors:Array<{id:string;username:string;password:string;platformRole:string;entry?:string}>=[]
  beforeAll(async()=>{
    if(!new URL(process.env.DATABASE_URL!).pathname.startsWith('/eduk12_admin_permissions_'))throw new Error('Disposable DB required')
    db=(await import('../../config/database')).prisma;jwt=await import('../../utils/jwt');const {hashPassword}=await import('../../utils/password')
    for(const entry of ['HUITEACHER','HUISCHOOL','SYSTEM_ONLY']){
      const password=randomBytes(24).toString('base64url')+'7a',u=await db.user.create({data:{username:'license-'+randomUUID(),passwordHash:await hashPassword(password),role:'STUDENT',platformRole:entry==='SYSTEM_ONLY'?'SYSTEM_ADMIN':'STANDARD'}})
      actors.push({...u,password,entry})
      if(entry!=='SYSTEM_ONLY')await db.adminEntryGrant.create({data:{id:randomUUID(),userId:u.id,entry,grantedBy:u.id}})
    }
    const author=actors[2],reviewer=await db.user.create({data:{username:'license-review-'+randomUUID(),passwordHash:'unusable',role:'STUDENT',platformRole:'SYSTEM_ADMIN'}})
    const d=createCustomScaleDefinition();d.respondentType='teacher_self_report';d.source.title='合成教师支持体验'
    d.items=['Q1','Q2','Q3'].map((itemCode,sortOrder)=>({itemCode,sortOrder,content:'本轮教师支持体验 '+(sortOrder+1),type:'single',required:true,responseSetKey:'default',randomizeOptions:false}))
    d.scoring.itemRules=d.items.map(item=>({itemCode:item.itemCode,transform:{type:'identity' as const}}))
    d.scoring.scores=[{key:'support',type:'total',label:'自我支持体验',direction:'descriptive',canonical:true,displayPrecision:1,source:{type:'items',aggregation:'sum',items:d.items.map(item=>({itemCode:item.itemCode,weight:1}))}}]
    d.report.primaryScoreKeys=['support'];d.report.scoreOrder=['support']
    d.report.audienceContract={schemaVersion:1,respondent:'ADULT_SELF',audience:'teacher',locale:'zh-CN',qcReview:{reviewer:'synthetic-independent-editor',reviewedAt:'2026-10-20T00:00:00Z',basis:'合成测试：已独立检查解释与隐私边界'}}
    d.report.interpretations=[{scoreKey:'support',headline:'支持资源的体验',source:{type:'score_only'},
      summary:'这三道题反映你最近填写问卷时对工作支持的主观感受。它们不能代表所有的工作经历，也不能判断你是否是一位优秀教师。请结合最近的工作情境理解这些结果，回想一次与同事协作或者寻求帮助的经历，记录哪些支持起到了作用，哪些需求仍需要明确。再次测量前，可以观察工作条件和资源是否发生变化。',bands:[],guidance:[{category:'reflection',text:'回想一次获得支持的情境。'},{category:'strategy',text:'记录一个现实可行的协作需求。'}]}]
    const scale=await db.scale.create({data:{code:'teacher_license_'+randomUUID(),name:'合成教师量表',status:'PUBLISHED',creatorId:author.id,instrumentClass:'CUSTOM_DESCRIPTIVE',definition:d,definitionHash:hashScaleDefinition(d)}})
    const resource=await registerDescriptiveResource({userId:author.id,platformRole:'SYSTEM_ADMIN'},scale.id,'TEACHER_INDIVIDUAL')
    await transitionDescriptiveResource({userId:reviewer.id,platformRole:'SYSTEM_ADMIN'},resource.id,'review')
    await transitionDescriptiveResource({userId:author.id,platformRole:'SYSTEM_ADMIN'},resource.id,'publish');resourceId=resource.id
    const org=await db.organization.create({data:{id:randomUUID(),name:'合成授权学校',createdByUserId:author.id,productDomain:'SCHOOL'}});organizationId=org.id
    await db.educationProductEntitlement.create({data:{organizationId,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:author.id}})
    const teacher=await db.user.create({data:{username:'school-license-'+randomUUID(),passwordHash:'unusable',role:'TEACHER',accountDomain:'SCHOOL'}});teacherId=teacher.id
    const app=express();app.use(express.json());app.use('/api',(await import('../../middleware/csrf')).csrfProtection)
    app.use('/api/platform/education',(await import('../../modules/huiteacher/platform.routes')).default);app.use((await import('../../middleware/errorHandler')).errorHandler)
    server=createServer(app);await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));base='http://127.0.0.1:'+(server.address() as {port:number}).port
  },30000)
  afterAll(async()=>{if(server)await new Promise<void>(done=>server.close(()=>done()));await db?.$disconnect()})
  async function put(actor:typeof actors[number],endpoint:string){
    const token=jwt.generateToken({userId:actor.id,username:actor.username,role:'STUDENT',accountDomain:'TRAINING',tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()})
    const result=await fetch(base+'/api/platform/education'+endpoint,{method:'PUT',headers:{Origin:'http://localhost:5174','Content-Type':'application/json','X-CSRF-Token':'synthetic-csrf',Cookie:'ptool_session='+token+'; ptool_csrf=synthetic-csrf'},body:JSON.stringify({action:'GRANT',currentPassword:actor.password})})
    return {status:result.status,body:await result.json() as any}
  }
  it('STANDARD + HUITEACHER can grant both exact licensed resource kinds over real HTTP',async()=>{
    const school=await put(actors[0],`/organizations/${organizationId}/teacher-scale-licenses/${resourceId}`)
    const personal=await put(actors[0],`/personal-scale-grants/${teacherId}/${resourceId}`)
    expect(school.status).toBe(200);expect(school.body.data.status).toBe('ACTIVE')
    expect(personal.status).toBe(200);expect(personal.body.data.status).toBe('ACTIVE')
  })
  it.each([1,2])('HUISCHOOL-only or system-only does not acquire Teacher license power (%i)',async index=>{
    expect((await put(actors[index],`/organizations/${organizationId}/teacher-scale-licenses/${resourceId}`)).status).toBe(403)
    expect((await put(actors[index],`/personal-scale-grants/${teacherId}/${resourceId}`)).status).toBe(403)
  })
  it('an entry grant cannot license an unpublished resource',async()=>{
    await db.$executeRaw`UPDATE "registered_assessment_resources" SET "status"='RETIRED' WHERE "id"=${resourceId}`
    expect((await put(actors[0],`/personal-scale-grants/${teacherId}/${resourceId}`)).status).toBe(403)
    expect((await put(actors[0],`/organizations/${organizationId}/teacher-scale-licenses/${resourceId}`)).status).toBe(403)
  })
})
