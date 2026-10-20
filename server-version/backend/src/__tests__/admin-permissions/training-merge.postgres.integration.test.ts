import {randomUUID} from 'node:crypto'
import {basename} from 'node:path'
import {promises as fs} from 'node:fs'
import {beforeAll,afterAll,describe,expect,it} from 'vitest'
import type {TrainingAnalysisRequestV1} from '../../modules/training-analysis/types'
const suite=process.env.ADMIN_PERMISSIONS_ISOLATED_TEST==='1'?describe:describe.skip
suite('merged Training source, public-round and export authority',()=>{
  let db:typeof import('../../config/database')['prisma'],source:typeof import('../../modules/training-analysis/source')
  let service:typeof import('../../modules/training-analysis/service'),worker:typeof import('../../services/assessmentExportWorker')
  let permissions:typeof import('../../modules/admin-permissions/service'),artifacts:typeof import('../../services/assessmentExportArtifact')
  let courseId:string,selector:TrainingAnalysisRequestV1,readyPath:string,artifactId:string
  const ids:Record<string,string>={},publishedAt=new Date(),paths:string[]=[]
  let intent:import('../../services/exportJobService').ClaimedExportBatch
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL!)
    if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/eduk12_admin_permissions_'))throw new Error('Dedicated local synthetic DB required')
    db=(await import('../../config/database')).prisma;source=await import('../../modules/training-analysis/source')
    service=await import('../../modules/training-analysis/service');worker=await import('../../services/assessmentExportWorker')
    permissions=await import('../../modules/admin-permissions/service');artifacts=await import('../../services/assessmentExportArtifact')
    for(const [name,role,entry]of [['owner','TEACHER',null],['training','STUDENT','TRAINING'],['survey','TEACHER','SURVEY'],
      ['school','STUDENT','HUISCHOOL'],['legacy','ADMIN',null],['system','STUDENT',null],['outside','TEACHER',null],['realm','TEACHER','TRAINING']] as const){
      const user=await db.user.create({data:{username:'training-merge-'+name+'-'+randomUUID(),passwordHash:'unusable',role,
        teacherApproved:role==='TEACHER',platformRole:name==='system'?'SYSTEM_ADMIN':'STANDARD',accountDomain:name==='realm'?'SCHOOL':'TRAINING'}})
      ids[name]=user.id
      if(entry)await db.adminEntryGrant.create({data:{id:randomUUID(),userId:user.id,entry,grantedBy:user.id}})
    }
    courseId=(await db.course.create({data:{title:'合成 Training 权限衔接',courseCode:'merge-'+randomUUID(),creatorId:ids.owner,courseType:'TRAINING_COURSE',status:'PUBLISHED'}})).id
    const waves:TrainingAnalysisRequestV1['waves']=[]
    for(let index=0;index<2;index++){
      const task=await db.compositeAssessment.create({data:{name:'合成空样本波次',code:'merge-'+randomUUID(),createdBy:ids.owner,courseId,
        productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',status:'PUBLISHED',publicEnabled:true,publishedAt}})
      await db.questionnaireCourseDelivery.create({data:{compositeId:task.id,courseId}})
      const section=await db.compositeFormSection.create({data:{compositeAssessmentId:task.id,title:'合成数值',position:0}})
      const item=await db.compositeAssessmentItem.create({data:{compositeAssessmentId:task.id,type:'FORM',position:0,required:false,
        formSectionId:section.id,formSectionPosition:0,formType:'number',formLabel:'合成数值',
        formDefinition:{itemKey:'numeric',type:'NUMBER',prompt:'合成数值',required:false,options:[],rows:[]}}})
      waves.push({waveKey:'wave'+index,taskId:task.id,publication:publishedAt.toISOString(),configDigest:null,variantKey:null,metrics:[{itemId:item.id,metricKey:'numeric'}]})
    }
    selector={schemaVersion:1,courseId,mode:'PAIRWISE',waves}
  },30000)
  afterAll(async()=>{for(const path of paths)await fs.rm(path,{force:true});await db?.$disconnect()})
  const actor=(name:string,role:'ADMIN'|'TEACHER')=>({userId:ids[name],role})
  const discover=(name:string,role:'ADMIN'|'TEACHER')=>db.$transaction(tx=>source.listTrainingAnalysisSources(tx,actor(name,role),courseId,{authorityLock:'SHARE'}),{isolationLevel:'RepeatableRead'})
  it('STUDENT + explicit Training projects ADMIN in the full locked context, with no business-role change',async()=>{
    expect((await discover('training','ADMIN')).list).toHaveLength(2)
    const result=await db.$transaction(tx=>source.loadTrainingAnalysisSources(tx,actor('training','ADMIN'),selector,{authorityLock:'SHARE',expectedTokenVersion:0}),{isolationLevel:'RepeatableRead'})
    expect((result.manifest.authoritySnapshot as any).principal).toMatchObject({id:ids.training,role:'ADMIN',businessRole:'STUDENT',
      accountDomain:'TRAINING',isActive:true,isFrozen:false,mustChangePassword:false,tokenVersion:0,trainingGrantVersion:1})
    expect((await db.user.findUniqueOrThrow({where:{id:ids.training}})).role).toBe('STUDENT')
  })
  it.each(['system','legacy','survey','school','outside','realm'])('does not treat %s as a Training administrator or course owner',async name=>{
    await expect(discover(name,'ADMIN')).rejects.toMatchObject({statusCode:404})
    await expect(discover(name,'TEACHER')).rejects.toMatchObject({statusCode:404})
  })
  it('preserves an approved teacher’s own-course access without an entry grant',async()=>{
    expect((await discover('owner','TEACHER')).list).toHaveLength(2)
  })
  it('frozen feedback/persistence authoring uses the current entry role inside its own transaction',async()=>{
    const {validateTrainingFeedbackAuthoring,validateTrainingPersistenceAuthoring}=await import('../../modules/questionnaire-product/service')
    const row={productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',questionnaireCourses:[{courseId}],publicEnabled:true}
    const validate=(name:string)=>db.$transaction(async tx=>{
      const input={...row,createdBy:ids[name]}
      await validateTrainingFeedbackAuthoring(tx,input,{schemaVersion:1,mode:'IMMEDIATE'})
      return validateTrainingPersistenceAuthoring(tx,input,{schemaVersion:1,checkpoint:{enabled:true,ttlHours:6},localCognitive:null})
    })
    for(const name of ['legacy','system','survey','outside','realm'])await expect(validate(name)).rejects.toMatchObject({statusCode:403})
    expect(await validate('owner')).toHaveProperty('trainingPersistencePolicyHash')
    expect(await validate('training')).toHaveProperty('trainingPersistencePolicyHash')
  })
  it('builds and opens a real Training CSV through the original worker and one-row artifact resolver',async()=>{
    const analyzed=await service.analyzeTrainingCourse({actor:{id:ids.training,role:'ADMIN'},courseId,selector,expectedTokenVersion:0})
    intent={batchId:randomUUID(),generation:1,resourceType:'TRAINING_ANALYSIS',resourceId:courseId,createdBy:ids.training,
      createdAt:new Date(),artifactIds:[],options:{anonymize:true,creatorRole:'ADMIN',authorityTokenVersion:0,
        trainingAnalysis:{version:1,selector,manifest:analyzed.manifest,table:'long'}}}
    const prepared=await worker.prepareAssessmentExport(intent)
    const temporaryPath=await prepared.save('csv')
    readyPath=temporaryPath.replace(/\.tmp-[a-f0-9-]+$/,'')
    await fs.rename(temporaryPath,readyPath);paths.push(readyPath)
    expect((await fs.stat(readyPath)).size).toBeGreaterThan(0)
    artifactId=(await db.exportArtifact.create({data:{resourceType:'TRAINING_ANALYSIS',resourceId:courseId,createdBy:ids.training,
      anonymized:true,storageKey:basename(readyPath),format:'csv',status:'READY',provenance:prepared.provenance,
      expiresAt:new Date(Date.now()+60000)}})).id
    const resolved=await artifacts.resolveAssessmentExportById({resourceType:'TRAINING_ANALYSIS',resourceId:courseId,
      actor:actor('training','ADMIN'),artifactId})
    expect(resolved?.filePath).toBe(readyPath)
    await worker.revalidateAssessmentExport(intent)
  })
  it('revoke and regrant never revive the old manifest, intent or READY download',async()=>{
    const change=(active:boolean,expectedVersion:number)=>permissions.changeEntryGrant({actorUserId:ids.system,
      actorSession:{tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()},targetUserId:ids.training,
      entry:'TRAINING',active,expectedVersion,reason:'synthetic merged Training revocation'})
    await change(false,1)
    await expect(worker.prepareAssessmentExport(intent)).rejects.toMatchObject({statusCode:404})
    await expect(worker.revalidateAssessmentExport(intent)).rejects.toMatchObject({statusCode:404})
    await change(true,2)
    await expect(worker.prepareAssessmentExport(intent)).rejects.toMatchObject({statusCode:404})
    expect(await artifacts.resolveAssessmentExportById({resourceType:'TRAINING_ANALYSIS',resourceId:courseId,actor:actor('training','ADMIN'),artifactId})).toBeNull()
    const fresh=await service.analyzeTrainingCourse({actor:{id:ids.training,role:'ADMIN'},courseId,selector,expectedTokenVersion:2})
    expect(fresh.manifest.authorityHash).not.toBe(intent.options.trainingAnalysis!.manifest.authorityHash)
    await expect(worker.prepareAssessmentExport({...intent,options:{...intent.options,trainingAnalysis:{version:1,selector,manifest:fresh.manifest,table:'long'}}})).rejects.toMatchObject({statusCode:404})
  })
  it('public-round creator checks follow explicit entry grants and preserve teacher ownership',async()=>{
    const {prepareTrainingPublicRound}=await import('../../modules/composite/training-public-round')
    const expiry=new Date(Date.now()+3600000)
    const row={id:selector.waves[0].taskId,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',publicEnabled:true,status:'PUBLISHED',publishedAt,
      questionnaireCourses:[{courseId}]}
    const prepare=(name:string)=>db.$transaction(tx=>prepareTrainingPublicRound(tx,{...row,createdBy:ids[name]},ids[name],{groupIpPolicy:{schemaVersion:1,timeZone:'Asia/Shanghai'}},expiry))
    for(const name of ['legacy','system','survey','outside','realm'])await expect(prepare(name)).rejects.toMatchObject({statusCode:403})
    const round=await prepare('owner')
    expect(round).toMatchObject({courseId,createdBy:ids.owner})
    expect(await prepare('training')).toMatchObject({courseId,createdBy:ids.training})
    // The additive database guard also rejects direct writes with old broad
    // roles, independently of the application predicate.
    for(const name of ['legacy','system','survey'])await expect(db.trainingPublicRound.create({data:{...round!,id:randomUUID(),createdBy:ids[name]}})).rejects.toThrow(/course\/author mismatch/)
  })
})
