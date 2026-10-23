import {createDraft} from '../../modules/survey/builder.service'
import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma} from '../../config/database'
import {createTemplate,saveTemplate,getTemplate,listTemplates,inspectTemplate,selectTemplate,ownedTemplate,copyProjectTool,bulkTemplate,dryRunTemplate,archiveTemplate,completeTemplate,toolKind} from '../../modules/survey/tool-library.service'
import {assertSurveyMediaOwned} from '../../modules/survey/media.references'
const enabled=process.env.SURVEY_TOOL_LIBRARY_ACCEPTANCE==='1'
const suite=enabled?describe:describe.skip
const toolIds:string[]=[],projectIds:string[]=[],assetIds:string[]=[]
let uid:string,other:string,pid:string,formId:string,scaleId:string,groupId:string
const form={schemaVersion:1,pages:[{pageKey:'page1',title:'背景',questions:[{itemKey:'q1',type:'SINGLE',prompt:'请选择',required:true,options:[{optionKey:'a1',label:'甲'},{optionKey:'a2',label:'乙'}],rows:[]}]}]}
const newTool=async(kind:'FORM'|'SCALE'|'COMPOSITION',title=kind)=>{const id=randomUUID();toolIds.push(id);return createTemplate(uid,{requestId:id,kind,title})}
suite('Survey independent tool library — isolated local synthetic records',()=>{
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL!);expect(url.hostname).toBe('127.0.0.1');expect(url.port).toBe('5557');expect(url.pathname).toBe('/survey_mac_manual_20261022')
  const [user]=await prisma.$queryRaw<Array<{id:string}>>`SELECT u.id FROM users u JOIN survey_researcher_grants g ON g.user_id=u.id JOIN survey_mfa_credentials m ON m.user_id=u.id WHERE u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen AND g.status='ACTIVE' AND m.enabled AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp()) ORDER BY u.id LIMIT 1`;if(!user)throw new Error('Existing local synthetic researcher required; no account will be created')
  uid=user.id;other=randomUUID()
  pid=randomUUID();projectIds.push(pid)
  await prisma.surveyProject.create({data:{id:pid,ownerUserId:uid,title:'Synthetic tool library acceptance',collectionMode:'SINGLE_UNLINKED'}})
 })
 afterAll(async()=>{
  // Only records created by this file; no existing project, account or service is removed.
  if(projectIds.length){await prisma.surveyEvent.deleteMany({where:{projectId:{in:projectIds}}});await prisma.$executeRaw`DELETE FROM survey_tool_selections WHERE project_id IN (${(await import('@prisma/client')).Prisma.join(projectIds)})`;await prisma.assetReference.deleteMany({where:{entityType:'SurveyProject',entityId:{in:projectIds}}});await prisma.surveyInstrumentDraft.deleteMany({where:{projectId:{in:projectIds}}});await prisma.surveyProject.deleteMany({where:{id:{in:projectIds}}})}
  if(toolIds.length){const {Prisma}=await import('@prisma/client');await prisma.$executeRaw`DELETE FROM survey_tool_templates WHERE id IN (${Prisma.join(toolIds)})`;await prisma.assetReference.deleteMany({where:{entityType:'SurveyToolTemplate',entityId:{in:toolIds}}})}
  if(assetIds.length)await prisma.storedAsset.deleteMany({where:{id:{in:assetIds}}})
  await prisma.$disconnect()
 })
 it('creates a private form without a project association and replays only the exact original request',async()=>{
  const tool=await newTool('FORM');formId=tool.id
  expect(tool).not.toHaveProperty('projectId')
  expect(tool.definition).toEqual({schemaVersion:2,pages:[]})
  expect(await createTemplate(uid,{requestId:formId,kind:'FORM',title:'FORM'})).toMatchObject({id:formId,revision:0})
  await expect(createTemplate(uid,{requestId:formId,kind:'SCALE',title:'FORM'})).rejects.toMatchObject({statusCode:409})
  expect(await listTemplates(uid,{page:1,query:'FORM',kind:'FORM'})).toMatchObject({total:1})
 })
 it('new forms use V2 date and text formatting without an upgrade step',async()=>{
  const tool=await newTool('FORM','扩展题型验收')
  const definition={...tool.definition,pages:[{pageKey:'schedule',title:'时间安排',questions:[{itemKey:'date',type:'DATE',prompt:'参与日期',required:true,options:[],rows:[]},{itemKey:'email',type:'SHORT_TEXT',prompt:'邮箱',required:false,options:[],rows:[],textValidation:'EMAIL'}]}]}
  await saveTemplate(uid,tool.id,{revision:0,title:tool.title,definition})
  expect(await getTemplate(uid,tool.id)).toMatchObject({definition:{schemaVersion:2}})
  expect(await inspectTemplate(uid,tool.id)).toMatchObject({ok:true})
  expect(await dryRunTemplate(uid,tool.id,{date:'2026-10-22',email:'test@example.invalid'})).toMatchObject({ok:true})
  expect(await dryRunTemplate(uid,tool.id,{date:'not-a-date',email:'invalid'})).toMatchObject({ok:false})
 })
 it('denies other owners and incomplete researcher qualification',async()=>{
  await expect(prisma.$transaction(tx=>ownedTemplate(tx,other,formId))).rejects.toMatchObject({statusCode:404})
  await expect(getTemplate(other,formId)).rejects.toMatchObject({statusCode:403})
 })
 it('saves validated form revisions and rejects stale writes without overwriting',async()=>{
  expect(await saveTemplate(uid,formId,{title:'背景表单',revision:0,definition:form})).toMatchObject({revision:1})
  await expect(saveTemplate(uid,formId,{title:'错误覆盖',revision:0,definition:form})).rejects.toMatchObject({statusCode:409})
  expect(await getTemplate(uid,formId)).toMatchObject({title:'背景表单',revision:1})
  expect(await inspectTemplate(uid,formId)).toMatchObject({ok:true})
  expect(await dryRunTemplate(uid,formId,{q1:'a1'})).toMatchObject({ok:true})
  expect(await dryRunTemplate(uid,formId,{q1:'unknown'})).toMatchObject({ok:false})
 })
 it('uses the existing scale dimension and raw score feedback validator',async()=>{
  const tool=await newTool('SCALE');scaleId=tool.id
  const definition={...tool.definition,dimensions:[{dimensionKey:'focus',label:'专注',direction:'descriptive'}],items:[{itemKey:'i1',prompt:'我能专心',required:true,reverse:false,dimensionKeys:['focus']}],rawScoreFeedback:{schemaVersion:1,rules:[{scoreKey:'focus',ranges:[{key:'r1',min:1,max:5,includeMax:true,text:'仅描述本轮表现'}]}]}}
  await saveTemplate(uid,scaleId,{revision:0,title:'专注量表',definition})
  expect(await inspectTemplate(uid,scaleId,{i1:'o5'})).toMatchObject({ok:true})
  await expect(saveTemplate(uid,scaleId,{revision:1,title:'错误反馈',definition:{...definition,rawScoreFeedback:{schemaVersion:1,rules:[{scoreKey:'missing',ranges:[]}]}}})).rejects.toHaveProperty('issues')
 })
 it('requires explicit completion, excludes drafts, and invalidates readiness on edit',async()=>{
  const empty=await newTool('FORM','未完成合成表单')
  await expect(completeTemplate(uid,empty.id,0)).rejects.toHaveProperty('issues')
  await expect(selectTemplate(uid,pid,{requestId:randomUUID(),tool:{source:'owned',id:formId,revision:1}})).rejects.toMatchObject({statusCode:409})
  await expect(completeTemplate(other,formId,1)).rejects.toMatchObject({statusCode:403})
  await expect(completeTemplate(uid,formId,0)).rejects.toMatchObject({statusCode:409})
  expect(await completeTemplate(uid,formId,1)).toMatchObject({revision:1,completedRevision:1,readiness:'READY'})
  const ready=await listTemplates(uid,{page:1,kind:'FORM',query:'背景表单',selectableOnly:true})
  expect(ready.list.map(row=>row.id)).toContain(formId)
  expect((await listTemplates(uid,{page:1,kind:'FORM',query:'未完成合成表单',selectableOnly:true})).list).toHaveLength(0)
 })
 it('copies the selected revision into a study and keeps the study unchanged by later template edits',async()=>{
  const requestId=randomUUID(),tool={source:'owned' as const,id:formId,revision:1}
  const result=await selectTemplate(uid,pid,{requestId,tool});expect(result.instrumentIds).toHaveLength(1)
  expect(await selectTemplate(uid,pid,{requestId,tool})).toMatchObject({instrumentIds:result.instrumentIds,replayed:true})
  await saveTemplate(uid,formId,{revision:1,title:'后来修订',definition:{...form,pages:[{...form.pages[0],title:'新版'}]}})
  expect(await getTemplate(uid,formId)).toMatchObject({readiness:'DRAFT',completedRevision:null,revision:2})
  const projectCopy=await prisma.surveyInstrumentDraft.findUniqueOrThrow({where:{id:result.instrumentIds[0]}})
  expect(projectCopy.title).toBe('背景表单');expect(projectCopy.definition).toMatchObject({pages:[{title:'背景'}]})
  await expect(selectTemplate(uid,pid,{requestId:randomUUID(),tool})).rejects.toMatchObject({statusCode:409})
 })
 it('keeps normal composition order and separate project units; rejects nested or stale components',async()=>{
  const group=await newTool('COMPOSITION');groupId=group.id
  const items=[{source:'owned',id:scaleId,revision:1,title:'专注量表'},{source:'owned',id:formId,revision:2,title:'后来修订'}]
  await completeTemplate(uid,scaleId,1);await completeTemplate(uid,formId,2)
  await saveTemplate(uid,groupId,{revision:0,title:'普通组合',definition:{schemaVersion:1,items}})
  expect(await inspectTemplate(uid,groupId)).toMatchObject({ok:true,unitCount:2})
  await completeTemplate(uid,groupId,1)
  const result=await selectTemplate(uid,pid,{requestId:randomUUID(),tool:{source:'owned',id:groupId,revision:1}})
  const rows=await prisma.surveyInstrumentDraft.findMany({where:{id:{in:result.instrumentIds}}})
  expect(result.instrumentIds.map(id=>rows.find(row=>row.id===id)?.kind)).toEqual(['SCALE','FORM'])
  await expect(saveTemplate(uid,groupId,{revision:1,title:'嵌套',definition:{schemaVersion:1,items:[{source:'owned',id:groupId,revision:1}]}})).rejects.toMatchObject({statusCode:409})
  await expect(saveTemplate(uid,groupId,{revision:1,title:'过时',definition:{schemaVersion:1,items:[{source:'owned',id:formId,revision:0}]}})).rejects.toMatchObject({statusCode:409})
 })
 it('hides a completed composition when a referenced revision changes',async()=>{
  const before=await listTemplates(uid,{page:1,kind:'COMPOSITION',query:'普通组合',selectableOnly:true});expect(before.list.map(row=>row.id)).toContain(groupId)
  const scale=await getTemplate(uid,scaleId)
  await saveTemplate(uid,scaleId,{revision:scale.revision,title:scale.title,definition:scale.definition})
  const after=await listTemplates(uid,{page:1,kind:'COMPOSITION',query:'普通组合',selectableOnly:true});expect(after.list.map(row=>row.id)).not.toContain(groupId)
  await expect(selectTemplate(uid,pid,{requestId:randomUUID(),tool:{source:'owned',id:groupId,revision:1}})).rejects.toMatchObject({statusCode:409})
 })
 it('does not allow self-authored cognitive/SJT or forged/revoked grants',async()=>{
  expect(toolKind.safeParse('SJT').success).toBe(false);expect(toolKind.safeParse('COGNITIVE').success).toBe(false)
  for(const kind of ['SJT','COGNITIVE'] as const)await expect(createDraft(uid,pid,{requestId:randomUUID(),instrumentKey:'blocked_tool',kind,title:'暂不开放'})).rejects.toMatchObject({statusCode:403})
  await expect(selectTemplate(uid,pid,{requestId:randomUUID(),tool:{source:'granted',id:randomUUID()}})).rejects.toMatchObject({statusCode:403})
 })
 it('enforces study ownership and lifecycle before selection',async()=>{
  await expect(selectTemplate(uid,randomUUID(),{requestId:randomUUID(),tool:{source:'owned',id:formId,revision:2}})).rejects.toMatchObject({statusCode:404})
  await prisma.surveyProject.update({where:{id:pid},data:{status:'CLOSED'}})
  await expect(selectTemplate(uid,pid,{requestId:randomUUID(),tool:{source:'owned',id:formId,revision:2}})).rejects.toMatchObject({statusCode:409})
  await prisma.surveyProject.update({where:{id:pid},data:{status:'DRAFT'}})
 })
 it('exports existing self-authored study tools into an independent template with idempotency',async()=>{
  const source=await prisma.surveyInstrumentDraft.findFirstOrThrow({where:{projectId:pid,kind:'FORM'}}),id=randomUUID();toolIds.push(id)
  expect(await copyProjectTool(uid,pid,source.id,id)).toMatchObject({id,kind:'FORM',revision:0})
  expect(await copyProjectTool(uid,pid,source.id,id)).toMatchObject({id})
 })
 it('retains only verified same-owner template images for the selected study',async()=>{
  const tool=await newTool('FORM'),assetId=randomUUID();assetIds.push(assetId)
  const contentHash='a'.repeat(64),asset={assetId,contentHash,mimeType:'image/png'}
  await prisma.storedAsset.create({data:{id:assetId,ownerId:uid,scopeId:tool.id,objectKey:'synthetic-tool-library/'+assetId,mimeType:'image/png',sizeBytes:100,sha256:contentHash}})
  const definition={...form,pages:[{...form.pages[0],questions:[{...form.pages[0].questions[0],image:{asset,altText:'示意',rightsStatus:'self_authored',rightsNote:'本地合成测试图'}}]}]}
  await saveTemplate(uid,tool.id,{revision:0,title:'含图表单',definition})
  await expect(prisma.$transaction(tx=>assertSurveyMediaOwned(tx,uid,pid,[{kind:'FORM',definition}]))).rejects.toMatchObject({statusCode:403})
  await completeTemplate(uid,tool.id,1)
  await selectTemplate(uid,pid,{requestId:randomUUID(),tool:{source:'owned',id:tool.id,revision:1}})
  expect(await prisma.$transaction(tx=>assertSurveyMediaOwned(tx,uid,pid,[{kind:'FORM',definition}]))).toEqual([asset])
 })
 it('invalidates completion after a bulk edit',async()=>{
  const tool=await newTool('FORM','合成批量修订检查')
  await saveTemplate(uid,tool.id,{revision:0,title:tool.title,definition:form});await completeTemplate(uid,tool.id,1)
  const batch={batchId:randomUUID(),format:'CSV' as const,content:'type,prompt,required,options\nSINGLE,新增问题,true,甲||乙'}
  const preview=await bulkTemplate(uid,tool.id,batch)
  expect(await bulkTemplate(uid,tool.id,batch,{revision:1,digest:preview.digest})).toMatchObject({revision:2,readiness:'DRAFT',completedRevision:null})
  await expect(selectTemplate(uid,pid,{requestId:randomUUID(),tool:{source:'owned',id:tool.id,revision:2}})).rejects.toMatchObject({statusCode:409})
 })
 it('uses existing bulk parsing with a revision-bound atomic apply and archive protection',async()=>{
  const tool=await newTool('FORM'),batch={batchId:randomUUID(),format:'CSV' as const,content:'type,prompt,required,options\nSINGLE,喜欢什么,true,甲||乙'}
  const result=await bulkTemplate(uid,tool.id,batch);expect(result).toMatchObject({ok:true,count:1})
  await bulkTemplate(uid,tool.id,batch,{revision:0,digest:result.digest})
  await expect(bulkTemplate(uid,tool.id,batch,{revision:0,digest:result.digest})).rejects.toMatchObject({statusCode:409})
  await archiveTemplate(uid,tool.id,1)
  await expect(selectTemplate(uid,pid,{requestId:randomUUID(),tool:{source:'owned',id:tool.id,revision:2}})).rejects.toMatchObject({statusCode:409})
 })
 it('reuses private images, video and PDF from another tool and preserves them through completion and composition selection',async()=>{
  const source=await newTool('FORM','Synthetic media source'),target=await newTool('FORM','Synthetic media target')
  const materials=[]
  for(const mimeType of ['image/png','video/mp4','application/pdf'] as const){
   const id=randomUUID();assetIds.push(id)
   await prisma.storedAsset.create({data:{id,objectKey:'synthetic/materials/'+id,ownerId:uid,scopeId:source.id,accessScope:'PRIVATE',mimeType,sizeBytes:100,sha256:'a'.repeat(64)}})
   materials.push({asset:{assetId:id,contentHash:'a'.repeat(64),mimeType},name:'Synthetic '+mimeType,rightsStatus:'self_authored' as const,rightsNote:'Isolated synthetic acceptance'})
  }
  const saved=await saveTemplate(uid,target.id,{revision:target.revision,title:'Synthetic media target',definition:{...form,materials}})
  const ready=await completeTemplate(uid,saved.id,saved.revision)
  expect(ready.readiness).toBe('READY')
  expect(await prisma.assetReference.count({where:{entityType:'SurveyToolTemplate',entityId:target.id,assetId:{in:materials.map(item=>item.asset.assetId)}}})).toBe(3)
  // Archive the originating tool: the target's retained references remain sufficient.
  await archiveTemplate(uid,source.id,source.revision)
  expect(await prisma.$transaction(tx=>assertSurveyMediaOwned(tx,uid,target.id,[{kind:'SCALE',definition:{materials}}],true))).toHaveLength(3)
  const group=await newTool('COMPOSITION','Synthetic media composition')
  const composed=await saveTemplate(uid,group.id,{revision:group.revision,title:group.title,definition:{schemaVersion:1,items:[{source:'owned',id:ready.id,revision:ready.revision}]}})
  await completeTemplate(uid,composed.id,composed.revision)
  const chosen=await selectTemplate(uid,pid,{requestId:randomUUID(),tool:{source:'owned',id:composed.id,revision:composed.revision}})
  const copy=await prisma.surveyInstrumentDraft.findUniqueOrThrow({where:{id:chosen.instrumentIds[0]}})
  expect(copy.definition).toMatchObject({materials})
  expect(await prisma.assetReference.count({where:{entityType:'SurveyProject',entityId:pid,assetId:{in:materials.map(item=>item.asset.assetId)}}})).toBe(3)
  const invalid=[{...materials[0],asset:{...materials[0].asset,contentHash:'b'.repeat(64)}}]
  await expect(prisma.$transaction(tx=>assertSurveyMediaOwned(tx,uid,pid,[{kind:'SCALE',definition:{materials:invalid}}]))).rejects.toMatchObject({statusCode:403})
  await expect(prisma.$transaction(tx=>assertSurveyMediaOwned(tx,other,pid,[{kind:'SCALE',definition:{materials}}]))).rejects.toMatchObject({statusCode:403})
  await expect(prisma.$transaction(tx=>assertSurveyMediaOwned(tx,uid,pid,[{kind:'SCALE',definition:{materials:[{...materials[0],rightsStatus:'unknown'}]}}]))).rejects.toMatchObject({statusCode:403})
 })

})
