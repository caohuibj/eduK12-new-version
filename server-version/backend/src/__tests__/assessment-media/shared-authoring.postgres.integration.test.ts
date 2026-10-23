import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {UserRole} from '@prisma/client'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
import type {AssessmentMaterial} from '../../modules/assessment-media/material'
const suite=process.env.SHARED_AUTHORING_INTEGRATION==='1'?describe:describe.skip
let db:typeof import('../../config/database')['prisma']
let forms:typeof import('../../modules/questionnaire-product/service')
const author={userId:randomUUID(),role:UserRole.TEACHER},viewer={userId:randomUUID(),role:UserRole.TEACHER}
const owners=[author.userId,viewer.userId],assetIds:string[]=[],scaleIds:string[]=[]
const materials:AssessmentMaterial[]=[]
const policy={version:3,requiredRefusal:'BLOCK_SUBMIT',hiddenRequired:'EXEMPT'}
const formItem=(text='合成题目')=>({type:'FORM',required:true,formType:'single_choice',formLabel:text,formOptions:[{value:'yes',label:'是'},{value:'no',label:'否'}],formPolicy:policy,
  formDefinition:{type:'SINGLE',prompt:text,required:true,options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}],rows:[],materials}})
suite('Shared assessment authoring real isolated persistence',()=>{
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(process.env.RELEASE_INTEGRATION_DATABASE_URL!)
    db=(await import('../../config/database')).prisma;forms=await import('../../modules/questionnaire-product/service')
    for(const actor of [author,viewer])await db.user.create({data:{id:actor.userId,username:'shared-authoring-fixture-'+actor.userId,passwordHash:'synthetic-no-login',role:'TEACHER',accountDomain:'TRAINING',teacherApproved:true}})
    for(const mimeType of ['image/png','video/mp4','application/pdf'] as const){
      const row=await db.storedAsset.create({data:{objectKey:'shared-authoring-fixture/'+randomUUID(),sha256:'a'.repeat(64),mimeType,sizeBytes:100,ownerId:author.userId,accessScope:'PRIVATE',originalName:'合成素材 '+mimeType}})
      assetIds.push(row.id);materials.push({asset:{assetId:row.id,contentHash:row.sha256,mimeType},name:row.originalName!,rightsStatus:'authorized',rightsNote:'合成测试使用依据'})
    }
  },30000)
  afterAll(async()=>{
    if(!db)return
    await db.materialGrant.deleteMany({where:{teacherId:{in:owners}}})
    await db.assetReference.deleteMany({where:{assetId:{in:assetIds}}})
    await db.compositeAssessment.deleteMany({where:{createdBy:{in:owners}}})
    await db.scale.deleteMany({where:{id:{in:scaleIds}}})
    await db.storedAsset.deleteMany({where:{id:{in:assetIds}}})
    await db.user.deleteMany({where:{id:{in:owners}}});await db.$disconnect()
  })
  it('lists eligible immutable identities and enforces independent grant revocation',async()=>{
    const router=(await import('../../routes/trainingWorkspace')).default
    const handler=(router as any).stack.find((row:any)=>row.route?.path==='/media').route.stack[0].handle
    const res:any={json(value:unknown){this.body=value;return this},status(){return this}}
    let failure:unknown
    await handler({user:{userId:author.userId},query:{usage:'assessment',pageSize:40}},res,(error:unknown)=>{failure=error})
    if(failure)throw failure
    expect(res.body.data.list).toHaveLength(3)
    expect(res.body.data.list[0]).toHaveProperty('contentHash','a'.repeat(64))
    const {assertTrainingMaterialsUsable}=await import('../../modules/assessment-media/training-materials')
    await expect(db.$transaction(tx=>assertTrainingMaterialsUsable(tx,viewer.userId,[materials]))).rejects.toThrow('无权')
    await db.materialGrant.createMany({data:assetIds.map(resourceId=>({teacherId:viewer.userId,resourceType:'MEDIA_ASSET' as const,resourceId,grantedBy:author.userId}))})
    await expect(db.$transaction(tx=>assertTrainingMaterialsUsable(tx,viewer.userId,[materials]))).resolves.toBeUndefined()
    await db.materialGrant.deleteMany({where:{teacherId:viewer.userId}})
    await expect(db.$transaction(tx=>assertTrainingMaterialsUsable(tx,viewer.userId,[materials]))).rejects.toThrow('无权')
  })
  it('saves, reopens, edits and independently copies a Form without reuploading its three assets',async()=>{
    let form=await forms.createFormTemplate(author,{requestId:randomUUID(),name:'素材表单'})
    form=await forms.addItem(author,form.id,{revision:form.revision,item:formItem()})
    const saved=await forms.detail(author,form.id)
    expect(saved.items[0].form.formDefinition.materials).toEqual(materials)
    const oldKey=saved.items[0].form.formDefinition.itemKey
    form=await forms.updateFormItem(author,form.id,saved.items[0].id,{revision:saved.revision,item:formItem('已修改题干')})
    expect(form.items[0].form.formDefinition).toMatchObject({itemKey:oldKey,materials,prompt:'已修改题干'})
    const copy=await forms.createFormTemplate(author,{requestId:randomUUID(),name:'独立副本',source:{kind:'COMPOSITE',id:form.id,revision:form.revision}})
    expect(copy.items[0].form.formDefinition.materials).toEqual(materials)
    expect(copy.items[0].form.formDefinition.itemKey).not.toBe(oldKey)
    expect((await forms.detail(author,form.id)).items[0].form.formDefinition.itemKey).toBe(oldKey)
    expect(await db.storedAsset.count({where:{ownerId:author.userId}})).toBe(3)
  },30000)
  it('rejects another author’s material without a partial Form write or revision advance',async()=>{
    const form=await forms.createFormTemplate(viewer,{requestId:randomUUID(),name:'权限测试表单'})
    await expect(forms.addItem(viewer,form.id,{revision:form.revision,item:formItem()})).rejects.toThrow('无权')
    const after=await forms.detail(viewer,form.id)
    expect(after.revision).toBe(form.revision);expect(after.items).toHaveLength(0)
  })
  it('saves Scale stimulus and report material identities, and retains only exact frozen references',async()=>{
    const {compileResearchScale}=await import('../../modules/survey/builder.compiler')
    const definition=compileResearchScale('合成量表',{schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',responseOptions:[{optionKey:'a',label:'否',score:0},{optionKey:'b',label:'是',score:1}],dimensions:[{dimensionKey:'d',label:'维度',direction:'descriptive'}],items:[{itemKey:'q',prompt:'问题',required:true,reverse:false,dimensionKeys:['d'],materials}]})
    definition.report.rawScoreFeedback={schemaVersion:1,rules:[{scoreKey:'d',ranges:[{key:'r',min:0,max:1,includeMax:true,text:'合成反馈',materials:[materials[2]]}]}]}
    const scale=await db.scale.create({data:{code:randomUUID(),name:'合成量表',creatorId:author.userId,instrumentClass:'CUSTOM_DESCRIPTIVE',status:'DRAFT',definition:definition as any}});scaleIds.push(scale.id)
    const {scaleController}=await import('../../controllers/scaleController')
    const res:any={statusCode:200,status(code:number){this.statusCode=code;return this},json(value:unknown){this.body=value;return this}}
    await scaleController.updateDefinition({params:{id:scale.id},user:author,body:{definition,expectedUpdatedAt:scale.updatedAt.toISOString()}} as any,res)
    expect(res.body.code,res.body.message).toBe(0)
    const saved=await db.scale.findUniqueOrThrow({where:{id:scale.id}})
    expect((saved.definition as any).items[0].materials).toEqual(materials)
    const {retainScaleAssessmentImages,scaleStimulusMaterialReferences}=await import('../../modules/scale/scale-image-retention')
    await db.$transaction(tx=>retainScaleAssessmentImages({owner:{entityType:'SharedAuthoringFixture',entityId:scale.id,field:'media'},definition:saved.definition as any,db:tx}))
    expect(await db.assetReference.count({where:{entityType:'SharedAuthoringFixture',entityId:scale.id}})).toBe(3)
    expect(scaleStimulusMaterialReferences(saved.definition as any)).toEqual(materials.map(item=>item.asset))
  },30000)
})
