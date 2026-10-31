import {afterAll,beforeAll,describe,it,expect} from 'vitest'
import ExcelJS from 'exceljs'
import {randomUUID} from 'node:crypto'
import {prisma} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {componentTemplateWorkbook} from '../../modules/scale/component-import/excel'
import {previewComponentImport,saveComponentImport,editComponentDraft,readComponentDraft} from '../../modules/scale/component-import/service'
import {previewComponentPublication,publishComponentDraft} from '../../modules/scale/component-import/publication'
import {standardReleaseRow} from '../../modules/survey/standard-triplet.service'
import {databaseContentSource} from '../../modules/scale/component-import/native-source'
import {frozenDatabaseScaleDefinition} from '../../modules/scale/scale-workflow.service'
import {scoreScale} from '../../modules/scale/scale-scoring'
import {readCurrentStandardCombination} from '../../modules/measurement-content/standard-combination-source'
import {createComponentDraft} from '../../modules/scale/component-import/service'
const url=integrationDatabaseUrl('COMPONENT_IMPORT_TEST_DATABASE_URL'),suite=url?describe:describe.skip
let actor:string,other:string
async function sheet(key='synthetic_'+randomUUID().replaceAll('-','')){
 const b=new ExcelJS.Workbook();await b.xlsx.load(await componentTemplateWorkbook({advanced:true}) as never)
 for(const s of b.worksheets)if(s.name!=='填写说明')s.eachRow((r,n)=>{if(n>1&&r.getCell(1).value==='synthetic_import_example')r.getCell(1).value=key})
 return {key,book:b,buffer:async()=>Buffer.from(await b.xlsx.writeBuffer())}
}
async function imported(buffer:Buffer,requestId=randomUUID()){
 const p=await previewComponentImport(actor,buffer),r=await saveComponentImport(actor,{requestId,expectedDigest:p.digest,buffer})
 expect(r.entries[0].status).toBe('IMPORTED');return {draft:(r.entries[0] as {draft:{id:string}}).draft,requestId,preview:p}
}
async function publish(id:string){const p=await previewComponentPublication(actor,id);expect(p.blockers).toEqual([]);return publishComponentDraft(actor,id,{requestId:randomUUID(),expectedRevision:p.revision,expectedPreviewHash:p.previewHash,expectedBase:p.baseCombination,allowedProducts:['TRAINING','SURVEY','SCHOOL','TEACHER'],reason:'合成集成测试'})}
suite('database C source and existing exact publication lifecycle',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  const a=await prisma.user.create({data:{username:'component_admin_'+randomUUID(),passwordHash:'synthetic-unused',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING',mustChangePassword:false}})
  actor=a.id
  other=(await prisma.user.create({data:{username:'component_other_'+randomUUID(),passwordHash:'synthetic-unused',role:'TEACHER',accountDomain:'TRAINING',mustChangePassword:false}})).id
 })
 afterAll(async()=>{await prisma.$disconnect()})
 it('publishes the ordinary-column Likert template with selected thresholds and report without any JSON input',async()=>{
  const b=new ExcelJS.Workbook();await b.xlsx.load(await componentTemplateWorkbook() as never)
  const key='ordinary_'+randomUUID().replaceAll('-','')
  for(const sheet of b.worksheets)if(sheet.name!=='填写说明')sheet.eachRow((row,n)=>{if(n>1&&row.getCell(1).value==='synthetic_import_example')row.getCell(1).value=key})
  const buffer=Buffer.from(await b.xlsx.writeBuffer()),s=await imported(buffer),draft=await readComponentDraft(actor,s.draft.id)
  expect(draft.changedParts.CONTENT?.definition.items).toHaveLength(2)
  expect(draft.changedParts.CONTENT?.metadata.instruction?.text).toContain('请选择')
  const p=await publish(s.draft.id);expect(p.state).toBe('ONLINE')
  const row=await standardReleaseRow(prisma,p.id),native=await prisma.scale.findUniqueOrThrow({where:{id:databaseContentSource(row.snapshot.parts.CONTENT)!.scaleId}})
  expect(native.status).toBe('PUBLISHED')
  expect(scoreScale(row.snapshot.definition,[{itemCode:'Q1',responseValue:5},{itemCode:'Q2',responseValue:1}]).scores.map(s=>s.value)).toEqual([15,5])
  expect(row.snapshot.references[0].referenceVersion).toBe('P1')
  const trials=await prisma.$queryRaw<Array<{report:{blocks:Array<{type:string;bandKey?:string}>}}>>`SELECT report FROM survey_standard_trials WHERE release_id=${p.id}`
  expect(trials.some(t=>t.report.blocks.some(block=>block.type==='REFERENCE_BAND'&&block.bandKey==='high'))).toBe(true)
  expect(trials.some(t=>t.report.blocks.some(block=>block.type==='REFERENCE_BAND'&&block.bandKey==='low'))).toBe(true)
 })
 it('imports once, rejects changed preview/request intent and denies non-system admins',async()=>{
  const w=await sheet(),buffer=await w.buffer(),s=await imported(buffer)
  const again=await saveComponentImport(actor,{requestId:s.requestId,expectedDigest:s.preview.digest,buffer})
  expect(again.entries[0].status).toBe('EXISTING')
  await expect(saveComponentImport(actor,{requestId:randomUUID(),expectedDigest:'0'.repeat(64),buffer})).rejects.toMatchObject({statusCode:409})
  w.book.getWorksheet('基本信息')!.getCell('B2').value='另一份意图'
  const changed=await w.buffer(),p=await previewComponentImport(actor,changed)
  await expect(saveComponentImport(actor,{requestId:s.requestId,expectedDigest:p.digest,buffer:changed})).rejects.toMatchObject({statusCode:409})
  await expect(previewComponentImport(other,buffer)).rejects.toMatchObject({statusCode:403})
 })
 it('commits multiple complete instruments independently and safely replays a partially invalid batch',async()=>{
  const w=await sheet(),basic=w.book.getWorksheet('基本信息')!,second=w.key+'_second'
  const basicValues=(basic.getRow(2).values as unknown[]).slice(1);basicValues[0]=second;basic.addRow(basicValues)
  for(const name of ['题目','选项','计分','报告']){const ws=w.book.getWorksheet(name)!;const values=(ws.getRow(2).values as unknown[]).slice(1);values[0]=second;ws.addRow(values)}
  basic.addRow([w.key+'_bad','结构错误条目','','','1.0.0','','','','','{broken','{}'])
  const buffer=await w.buffer(),preview=await previewComponentImport(actor,buffer),requestId=randomUUID()
  const first=await saveComponentImport(actor,{requestId,expectedDigest:preview.digest,buffer})
  expect(first.entries.map(e=>e.status)).toEqual(['IMPORTED','IMPORTED','INVALID'])
  expect((await saveComponentImport(actor,{requestId,expectedDigest:preview.digest,buffer})).entries.map(e=>e.status)).toEqual(['EXISTING','EXISTING','INVALID'])
  const [count]=await prisma.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int n FROM scale_component_drafts WHERE request_id=${requestId}`
  expect(count.n).toBe(2)
 })
 it('locates a base-identity save failure at its original spreadsheet row after blank lines',async()=>{
  const w=await sheet(),basic=w.book.getWorksheet('基本信息')!
  basic.getCell('C2').value=randomUUID();basic.getCell('D2').value='a'.repeat(64);basic.spliceRows(2,0,[])
  const buffer=await w.buffer(),preview=await previewComponentImport(actor,buffer)
  const result=await saveComponentImport(actor,{requestId:randomUUID(),expectedDigest:preview.digest,buffer})
  expect(result.entries[0]).toMatchObject({status:'FAILED',issues:[{sheet:'基本信息',row:3,path:'baseCombination'}]})
 })
 it('retains R-only drafts and refuses publication until C and explicit P exist',async()=>{
  const w=await sheet(),basic=w.book.getWorksheet('基本信息')!
  for(const c of ['E2','F2','H2','J2','K2'])basic.getCell(c).value=null
  for(const name of ['题目','选项','计分'])w.book.removeWorksheet(w.book.getWorksheet(name)!.id)
  const s=await imported(await w.buffer()),p=await previewComponentPublication(actor,s.draft.id)
  expect(p.triplet).toBeNull();expect(p.blockers.some(b=>b.includes('尚无 C'))).toBe(true)
  expect((await readComponentDraft(actor,s.draft.id)).changedParts.REPORT).toBeDefined()
 })
 it('publishes, freezes, runs two independent C versions and preserves the first exact source',async()=>{
  const w=await sheet()
  // A legacy native row with the same key AND version must not shadow exact DB C.
  const legacy=await prisma.scale.create({data:{code:w.key,name:'合成旧代码版本',instrumentClass:'STANDARD',instrumentVersion:'1.0.0',creatorId:actor}})
  const first=await imported(await w.buffer()),published=await publish(first.draft.id)
  expect(published.state).toBe('ONLINE')
  const row1=await standardReleaseRow(prisma,published.id),oldSnapshot=JSON.stringify(row1.snapshot),c1=databaseContentSource(row1.snapshot.parts.CONTENT)!
  const native1=await prisma.scale.findUniqueOrThrow({where:{id:c1.scaleId}})
  expect(native1.status).toBe('PUBLISHED');expect(native1.standardToolKey).toBe(w.key);expect(native1.code).not.toBe(w.key)
  expect(scoreScale(frozenDatabaseScaleDefinition(native1),[{itemCode:'Q1',responseValue:1}]).scores[0].value).toBe(1)
  const draft=await readComponentDraft(actor,first.draft.id)
  await expect(editComponentDraft(actor,draft.id,{expectedRevision:draft.revision,draft:{toolKey:draft.toolKey,configurationName:draft.configurationName,baseCombination:draft.baseCombination,changedParts:draft.changedParts}})).rejects.toMatchObject({statusCode:409})
  w.book.getWorksheet('基本信息')!.getCell('E2').value='2.0.0'
  const score=JSON.parse(String(w.book.getWorksheet('计分')!.getCell('B2').value));score.scoringVersion='2.0.0';w.book.getWorksheet('计分')!.getCell('B2').value=JSON.stringify(score)
  const item=JSON.parse(String(w.book.getWorksheet('题目')!.getCell('B2').value));item.content='第二个C的合成题干';w.book.getWorksheet('题目')!.getCell('B2').value=JSON.stringify(item)
  const second=await imported(await w.buffer()),pub2=await publish(second.draft.id)
  expect(pub2.state).toBe('ONLINE')
  const row2=await standardReleaseRow(prisma,pub2.id),c2=databaseContentSource(row2.snapshot.parts.CONTENT)!
  expect(c2.scaleId).not.toBe(c1.scaleId)
  const {freezeExactStandardScaleRuntime,freezeExactStandardScaleDefinition}=await import('../../modules/composite/training-standard-combination')
  const {frozenTripletInstruction}=await import('../../modules/survey/standard-triplet.model')
  const {readEducationStandardSources,readEducationStandardStartSources}=await import('../../modules/education-tools/public-source.standard')
  for(const row of [row1,row2]){
   const frozen=await prisma.$transaction(tx=>freezeExactStandardScaleRuntime(tx,row.snapshot))
   expect(frozen.schemaVersion).toBe(2);expect(frozen.instrumentVersion).toBe(row.snapshot.instrumentVersion)
   await prisma.$transaction(async tx=>{
    const leaf=(await readEducationStandardSources(tx,[{versionId:row.id,contentHash:row.combination_hash}],{population:'TEACHER',responseMode:'SELF'})).get(row.id)!
    const unit={itemId:randomUUID(),family:'SCALE' as const,source:{kind:'SCALE' as const,id:leaf.scale.id,ownerId:leaf.scale.creatorId,educationStandard:leaf.descriptor},
     measurement:{releaseId:leaf.measurement.releaseId,contentHash:leaf.measurement.contentHash,measurementHash:leaf.measurement.content.measurementHash}}
    const source=(await readEducationStandardStartSources(tx,[unit],[leaf.scale])).get(row.id)!
    expect(source.importedScaleId).toBe(leaf.scale.id)
    expect((await freezeExactStandardScaleDefinition(tx,source)).schemaVersion).toBe(2)
   })
  }
  const source={...row1.snapshot,instruction:frozenTripletInstruction(row1.snapshot)}
  for(const importedScaleId of [randomUUID(),legacy.id,c2.scaleId]){
   await expect(prisma.$transaction(tx=>freezeExactStandardScaleDefinition(tx,{...source,importedScaleId}))).rejects.toThrow('IMPORTED_SOURCE_IDENTITY_MISMATCH')
  }
  expect(JSON.stringify((await standardReleaseRow(prisma,published.id)).snapshot)).toBe(oldSnapshot)
  await prisma.$transaction(async tx=>{const exact=await readCurrentStandardCombination(tx,{releaseId:published.id,combinationHash:published.combinationHash});expect(exact.row.snapshot.instrumentVersion).toBe('1.0.0')})
  await expect(prisma.scale.update({where:{id:native1.id},data:{definition:row2.snapshot.definition as never}})).rejects.toThrow()
 })
 it('publishes an R-only revision over an exact base without creating C or measurement again',async()=>{
  const w=await sheet(),first=await imported(await w.buffer()),p1=await publish(first.draft.id),row1=await standardReleaseRow(prisma,p1.id)
  const b=w.book.getWorksheet('基本信息')!
  for(const cell of ['E2','F2','H2','J2','K2'])b.getCell(cell).value=null
  b.getCell('C2').value=p1.id;b.getCell('D2').value=p1.combinationHash;b.getCell('G2').value='2.0.0'
  for(const name of ['题目','选项','计分'])w.book.removeWorksheet(w.book.getWorksheet(name)!.id)
  const rs=w.book.getWorksheet('报告')!,report=JSON.parse(String(rs.getCell('B2').value));report.reportVersion='2.0.0';report.interpretations[0].summary='第二份合成解释。';rs.getCell('B2').value=JSON.stringify(report)
  const next=await imported(await w.buffer()),p2=await publish(next.draft.id),row2=await standardReleaseRow(prisma,p2.id)
  expect(row2.snapshot.parts.CONTENT).toEqual(row1.snapshot.parts.CONTENT)
  expect(row2.snapshot.parts.PARAMETERS).toEqual(row1.snapshot.parts.PARAMETERS)
  expect(row2.measurement_release).toEqual(row1.measurement_release)
  expect(await prisma.scale.count({where:{standardSourceKind:'DB_IMPORTED',standardToolKey:w.key}})).toBe(1)
 })
 it('keeps a C-only configuration with explicit no-report valid and rejects stale revisions',async()=>{
  const w=await sheet();w.book.removeWorksheet(w.book.getWorksheet('报告')!.id)
  const basic=w.book.getWorksheet('基本信息')!;basic.getCell('I2').value='NONE';basic.getCell('G2').value='none-v1'
  const s=await imported(await w.buffer()),d=await readComponentDraft(actor,s.draft.id),preview=await previewComponentPublication(actor,d.id)
  await editComponentDraft(actor,d.id,{expectedRevision:d.revision,draft:{toolKey:d.toolKey,configurationName:'修订后的配置',baseCombination:d.baseCombination,changedParts:d.changedParts}})
  await expect(publishComponentDraft(actor,d.id,{requestId:randomUUID(),expectedRevision:d.revision,expectedPreviewHash:preview.previewHash,expectedBase:preview.baseCombination,reason:'合成并发检查',allowedProducts:['TRAINING']})).rejects.toMatchObject({statusCode:409})
  const p=await publish(d.id),row=await standardReleaseRow(prisma,p.id)
  expect(row.snapshot.template).toBeNull();expect(row.snapshot.parts.REPORT.payload).toBeNull();expect(p.state).toBe('ONLINE')
 })
 it('leaves a new C unavailable when the installed runner trial rejects its presentation',async()=>{
  const w=await sheet(),basic=w.book.getWorksheet('基本信息')!,definition=JSON.parse(String(basic.getCell('J2').value));definition.display.randomizeItems=true;basic.getCell('J2').value=JSON.stringify(definition)
  const s=await imported(await w.buffer()),preview=await previewComponentPublication(actor,s.draft.id)
  const p=await publishComponentDraft(actor,s.draft.id,{requestId:randomUUID(),expectedRevision:preview.revision,expectedPreviewHash:preview.previewHash,expectedBase:preview.baseCombination,reason:'合成失败试运行',allowedProducts:['TRAINING']})
  expect(p.state).toBe('TRIAL_FAILED')
  const row=await standardReleaseRow(prisma,p.id),native=databaseContentSource(row.snapshot.parts.CONTENT)!
  expect((await prisma.scale.findUniqueOrThrow({where:{id:native.scaleId}})).status).toBe('DRAFT')
  expect(await prisma.materialGrant.count({where:{resourceType:'STANDARD_COMBINATION',resourceId:p.id}})).toBe(0)
 })
 it('retains an independently imported P when the inherited R needs old band keys',async()=>{
  const w=await sheet(),basic=w.book.getWorksheet('基本信息')!,parameter=w.book.getWorksheet('参数')!
  const parameters=(version:string,band:string)=>({referencePolicy:{type:'declared',selections:[{scoreKey:'total',referenceVersion:version,referenceKind:'criterion_threshold'}]},references:[{schemaVersion:1,instrumentType:'scale',instrumentKey:w.key,referenceVersion:version,status:'ACTIVE',entries:[{scoreKey:'total',referenceKind:'criterion_threshold',evidenceLevel:'theoretical',provenanceType:'theoretical_score_range',instrumentVersion:'1.0.0',scoringVersion:'1.0.0',population:{description:'合成示例'},source:{citation:'仅合成阈值'},statistics:{thresholds:[{key:band,label:'合成分档',minInclusive:0,maxInclusive:1}]}}]}]})
  basic.getCell('H2').value='PROVIDED';basic.getCell('F2').value='P1';parameter.addRow([w.key,JSON.stringify(parameters('P1','low'))])
  const reportSheet=w.book.getWorksheet('报告')!,report=JSON.parse(String(reportSheet.getCell('B2').value));report.interpretations[0].source={type:'reference_context'};report.interpretations[0].bands=[{key:'low',label:'合成分档',summary:'仅合成解释',guidance:[]}];reportSheet.getCell('B2').value=JSON.stringify(report)
  const first=await imported(await w.buffer()),p1=await publish(first.draft.id),old=await standardReleaseRow(prisma,p1.id)
  for(const c of ['E2','G2','I2','J2','K2'])basic.getCell(c).value=null
  basic.getCell('C2').value=p1.id;basic.getCell('D2').value=p1.combinationHash;basic.getCell('F2').value='P2'
  for(const name of ['题目','选项','计分','报告'])w.book.removeWorksheet(w.book.getWorksheet(name)!.id)
  parameter.getCell('B2').value=JSON.stringify(parameters('P2','high'))
  const second=await imported(await w.buffer()),preview=await previewComponentPublication(actor,second.draft.id)
  expect(preview.blockers.some(b=>b.includes('分档'))).toBe(true)
  const d=await readComponentDraft(actor,second.draft.id)
  expect(Object.keys(d.changedParts)).toEqual(['PARAMETERS'])
  const nextReport=structuredClone(report);nextReport.reportVersion='2.0.0';nextReport.interpretations[0].bands[0].key='high'
  await editComponentDraft(actor,d.id,{expectedRevision:d.revision,draft:{toolKey:d.toolKey,configurationName:d.configurationName,baseCombination:d.baseCombination,changedParts:{...d.changedParts,REPORT:{version:'2.0.0',payload:nextReport}}}})
  const result=await publish(d.id),next=await standardReleaseRow(prisma,result.id)
  expect(next.snapshot.parts.CONTENT).toEqual(old.snapshot.parts.CONTENT)
  expect(next.measurement_release).toEqual(old.measurement_release)
 })
 it('keeps an incompatible declared REFERENCE_BAND in draft and publishes after matching the selected P',async()=>{
  const w=await sheet(),basic=w.book.getWorksheet('基本信息')!,reportSheet=w.book.getWorksheet('报告')!
  basic.getCell('H2').value='PROVIDED';basic.getCell('F2').value='P1'
  const parameters={referencePolicy:{type:'declared',selections:[{scoreKey:'total',referenceVersion:'P1',referenceKind:'criterion_threshold'}]},references:[{
   schemaVersion:1,instrumentType:'scale',instrumentKey:w.key,referenceVersion:'P1',status:'ACTIVE',entries:[{scoreKey:'total',referenceKind:'criterion_threshold',
    evidenceLevel:'theoretical',provenanceType:'theoretical_score_range',instrumentVersion:'1.0.0',scoringVersion:'1.0.0',population:{description:'合成示例'},
    source:{citation:'仅合成阈值'},statistics:{thresholds:[{key:'current',label:'合成分档',minInclusive:0,maxInclusive:1}]}}]}]}
  w.book.getWorksheet('参数')!.addRow([w.key,JSON.stringify(parameters)])
  const definition=JSON.parse(String(reportSheet.getCell('B2').value)),payload={definition,template:{blocks:[
   {type:'TEXT',text:'始终保留的合成文字'},
   {type:'REFERENCE_BAND',metricKey:'total',referenceKind:'criterion_threshold',bandKey:'old',text:'已过期的合成分档',guidance:[]},
  ],limitations:[]}}
  expect(definition.interpretations.every((i:{source:{type:string}})=>i.source.type==='score_only')).toBe(true)
  reportSheet.getCell('B2').value=JSON.stringify(payload)
  const s=await imported(await w.buffer()),preview=await previewComponentPublication(actor,s.draft.id)
  expect(preview.blockers).toContain('报告所需分档缺少选定参数支持：total/old')
  await expect(publishComponentDraft(actor,s.draft.id,{requestId:randomUUID(),expectedRevision:preview.revision,expectedPreviewHash:preview.previewHash,
   expectedBase:preview.baseCombination,reason:'合成独立模板引用检查',allowedProducts:['TRAINING']})).rejects.toMatchObject({statusCode:409})
  const draft=await readComponentDraft(actor,s.draft.id)
  expect(draft.publishedReleaseId).toBeNull();expect(draft.revision).toBe(preview.revision)
  expect(await prisma.scale.count({where:{standardSourceKind:'DB_IMPORTED',standardToolKey:w.key}})).toBe(0)
  payload.template.blocks[1].bandKey='current'
  await editComponentDraft(actor,draft.id,{expectedRevision:draft.revision,draft:{toolKey:draft.toolKey,configurationName:draft.configurationName,
   baseCombination:draft.baseCombination,changedParts:{...draft.changedParts,REPORT:{version:'1.0.0',payload}}}})
  const p=await publish(draft.id)
  expect(p.state).toBe('ONLINE')
  const row=await standardReleaseRow(prisma,p.id)
  const trials=await prisma.$queryRaw<Array<{report:{blocks:Array<{type:string;bandKey?:string}>}}>>`SELECT report FROM survey_standard_trials WHERE release_id=${p.id}`
  expect(trials.some(t=>t.report.blocks.some(b=>b.type==='REFERENCE_BAND'&&b.bandKey==='current'))).toBe(true)
  expect(row.snapshot.parts.PARAMETERS.payload).toEqual(parameters)
 })
 it('consumes a database C through existing four-entry grants and freezes the stable business identity',async()=>{
  const w=await sheet(),s=await imported(await w.buffer()),p=await publish(s.draft.id),row=await standardReleaseRow(prisma,p.id)
  const pointer={releaseId:p.id,combinationHash:p.combinationHash}
  const {standardTripletCatalog,standardTripletDetail}=await import('../../modules/survey/standard-triplet.service')
  expect((await standardTripletCatalog(actor,1,{keyword:w.key})).list.some(r=>r.toolKey===w.key)).toBe(true)
  expect((await standardTripletDetail(actor,w.key,'1.0.0')).selection.CONTENT).toBe(row.snapshot.parts.CONTENT.hash)
  const create=(name:string,domain='TRAINING',teacher=false)=>prisma.user.create({data:{username:'components_'+name+'_'+randomUUID(),passwordHash:'synthetic-unused',accountDomain:domain,role:teacher?'TEACHER':'STUDENT',teacherApproved:teacher,mustChangePassword:false}})
  const managers=await Promise.all(['TRAINING','SURVEY','HUISCHOOL','HUITEACHER'].map(async entry=>{const u=await create(entry);await prisma.adminEntryGrant.create({data:{id:randomUUID(),userId:u.id,entry:entry as never,grantedBy:actor}});return u}))
  const teacher=await create('teacher','TRAINING',true)
  const {grantTrainingStandardCombinationUse,listTrainingStandardCombinationChoices}=await import('../../modules/measurement-content/standard-combination-use')
  const training=await grantTrainingStandardCombinationUse(managers[0].id,p.id,{requestId:randomUUID(),userId:teacher.id,combinationHash:p.combinationHash,configurationName:'合成固定配置'})
  expect((await listTrainingStandardCombinationChoices(teacher.id)).some(c=>c.combination.releaseId===p.id&&c.toolKey===w.key)).toBe(true)
  const native=databaseContentSource(row.snapshot.parts.CONTENT)!
  const frozen=await prisma.$transaction(async tx=>(await import('../../modules/composite/training-standard-combination')).freezeExactStandardScaleDefinition(tx,{...row.snapshot,instruction:(await import('../../modules/survey/standard-triplet.model')).frozenTripletInstruction(row.snapshot)}))
  expect(frozen.schemaVersion).toBe(2)
  const {readEducationStandardSources}=await import('../../modules/education-tools/public-source.standard')
  const education=await prisma.$transaction(tx=>readEducationStandardSources(tx,[{versionId:p.id,contentHash:p.combinationHash}],{population:'TEACHER',responseMode:'SELF'}))
  expect(education.get(p.id)?.scale.id).toBe(native.scaleId)
  const researcher=await create('researcher','SURVEY'),login='component_'+randomUUID().replaceAll('-','').slice(0,16)
  await prisma.surveyAccount.create({data:{userId:researcher.id,loginName:login,normalizedLogin:login}})
  await prisma.surveyResearcherGrant.create({data:{userId:researcher.id,status:'ACTIVE',grantedBy:managers[1].id}})
  await prisma.surveyMfaCredential.create({data:{userId:researcher.id,enabled:true,secretCipher:'synthetic-unused'}})
  const {grantCatalogSource,sourceCatalog}=await import('../../modules/survey/catalog.service')
  const sourceRef={kind:'SCALE' as const,sourceId:'survey-standard:'+p.id,sourceVersion:p.combinationHash}
  const survey=await grantCatalogSource(managers[1].id,researcher.id,sourceRef,{requestId:randomUUID(),configurationName:'合成Survey固定配置'})
  expect(survey.sourceRef).toEqual(sourceRef)
  expect((await sourceCatalog(managers[1].id,{kind:'SCALE',page:1,discovery:{keyword:w.key,tags:['synthetic']}})).list.some(s=>s.ref.sourceId===sourceRef.sourceId)).toBe(true)
  const org=randomUUID()
  await prisma.organization.create({data:{id:org,name:'合成四入口组织',productDomain:'SCHOOL',createdByUserId:actor}})
  for(const product of ['HUISCHOOL','HUITEACHER'] as const)await prisma.educationProductEntitlement.create({data:{organizationId:org,product,grantedByUserId:actor}})
  const {issueAdminContentRoot}=await import('../../modules/measurement-content/admin-authority.service')
  const {grantEducationStandardConfigurationUse}=await import('../../modules/assessment-authorization/education-standard-use')
  const proof={tokenVersion:0,adminSessionId:randomUUID(),adminVerifiedAt:Math.floor(Date.now()/1000)}
  const educationIds=[]
  for(const [product,manager]of [['SCHOOL',managers[2]],['TEACHER',managers[3]]] as const){
   const recipient=await create(product+'_recipient','SCHOOL',true),membership=await prisma.organizationMembership.create({data:{id:randomUUID(),organizationId:org,userId:recipient.id}})
   if(product==='SCHOOL'){
    await prisma.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:membership.id,persona:'COUNSELOR',grantedByUserId:actor}})
    await prisma.organizationCapabilityGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:membership.id,capability:'PSYCHOLOGY_STAFF',grantedByUserId:actor}})
   }else await prisma.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:membership.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:actor}})
   const root=await issueAdminContentRoot(actor,proof,{requestId:randomUUID(),expectedVersion:0,reason:'合成精确委托',grant:{subjectId:manager.id,scope:{product,scopeKind:'ORGANIZATION',scopeId:org,resourceKind:'material',resourceKeys:[row.measurement_release!.releaseId]},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}})
   const use=await grantEducationStandardConfigurationUse(manager.id,{product,organizationId:org},p.id,{requestId:randomUUID(),userId:recipient.id,combinationHash:p.combinationHash,authorityGrantId:root.grantId,expectedAuthorityVersion:1,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2090-01-01T00:00:00Z',configurationName:'合成'+product+'配置'})
   expect(use.changed).toBe(true);educationIds.push(use.id)
   const context={principal:{userId:recipient.id,accountDomain:'SCHOOL'},entry:product,organizationId:org}
   expect(await (await import('../../modules/education-tools/access')).resolveEducationToolAuthoringContext(context,prisma)).not.toBeNull()
   const catalog=await (await import('../../modules/education-tools/public-source.catalog')).listEducationPublicSources(context,{})
   expect(catalog.list.some(s=>s.sourceId===p.id)).toBe(true)
  }
  expect(educationIds).toHaveLength(2)
  const oldTraining=await prisma.materialGrant.findUniqueOrThrow({where:{id:training.id}})
  const oldSurvey=await prisma.$queryRaw`SELECT to_jsonb(g) AS record FROM survey_tool_grants g WHERE id=${survey.id}`
  const oldEducation=await prisma.$queryRaw`SELECT to_jsonb(g) AS record FROM content_capability_grants g WHERE id=ANY(${educationIds}::text[]) ORDER BY id`
  const report=structuredClone(row.snapshot.definition.report);report.reportVersion='2.0.0';report.interpretations[0].summary='新报告仅用于新配置'
  const next=await createComponentDraft(actor,{requestId:randomUUID(),draft:{toolKey:w.key,configurationName:'报告修订',baseCombination:pointer,changedParts:{REPORT:{version:'2.0.0',payload:report}}}})
  expect((await publish(next.id)).state).toBe('ONLINE')
  expect(await prisma.materialGrant.findUniqueOrThrow({where:{id:training.id}})).toEqual(oldTraining)
  expect(await prisma.$queryRaw`SELECT to_jsonb(g) AS record FROM survey_tool_grants g WHERE id=${survey.id}`).toEqual(oldSurvey)
  expect(await prisma.$queryRaw`SELECT to_jsonb(g) AS record FROM content_capability_grants g WHERE id=ANY(${educationIds}::text[]) ORDER BY id`).toEqual(oldEducation)
  expect((await standardReleaseRow(prisma,p.id)).combination_hash).toBe(pointer.combinationHash)
  await expect(previewComponentPublication(managers[0].id,next.id)).rejects.toMatchObject({statusCode:403})
 })
 it('creates a new frozen C identity for an instruction-only revision',async()=>{
  const w=await sheet(),first=await imported(await w.buffer()),p1=await publish(first.draft.id),old=await standardReleaseRow(prisma,p1.id)
  const source=await readComponentDraft(actor,first.draft.id),content=structuredClone(source.changedParts.CONTENT!)
  content.version='2.0.0';content.metadata.instruction!.text='第二版合成指导语，旧版保持原文。'
  const next=await createComponentDraft(actor,{requestId:randomUUID(),draft:{toolKey:w.key,configurationName:'指导语第二版',baseCombination:{releaseId:p1.id,combinationHash:p1.combinationHash},changedParts:{CONTENT:content}}})
  const p2=await publish(next.id),current=await standardReleaseRow(prisma,p2.id)
  expect(current.snapshot.parts.CONTENT.hash).not.toBe(old.snapshot.parts.CONTENT.hash)
  const instruction=(await import('../../modules/survey/standard-triplet.model')).frozenTripletInstruction
  expect(instruction(current.snapshot)?.text).toBe(content.metadata.instruction!.text)
  expect(instruction((await standardReleaseRow(prisma,p1.id)).snapshot)?.text).not.toBe(content.metadata.instruction!.text)
 })
 it('retains owned declared report assets and rejects a nonexistent asset without freezing the draft',async()=>{
  const w=await sheet(),assetId=randomUUID()
  await prisma.storedAsset.create({data:{id:assetId,objectKey:'synthetic/'+assetId,provider:'local',mimeType:'image/png',sizeBytes:1,sha256:'a'.repeat(64),ownerId:actor,accessScope:'PRIVATE'}})
  const rs=w.book.getWorksheet('报告')!,definition=JSON.parse(String(rs.getCell('B2').value))
  rs.getCell('B2').value=JSON.stringify({definition,template:{title:'合成素材报告',blocks:[{type:'ASSET',assetId,alt:'合成占位素材'},{type:'CHART',metricKeys:['total'],style:'TABLE'}],limitations:[]},assetRefs:[{assetId,sha256:'a'.repeat(64),mediaType:'image/png'}]})
  const importedReport=await imported(await w.buffer()),published=await publish(importedReport.draft.id)
  expect(published.state).toBe('ONLINE')
  const row=await standardReleaseRow(prisma,published.id)
  const content=(await import('../../modules/measurement-content/standard-combination-content')).standardCombinationContentInputs(row,(await prisma.$transaction(tx=>readCurrentStandardCombination(tx,{releaseId:row.id,combinationHash:row.combination_hash}))).measurement)
  expect(content.report?.assetRefs).toEqual([{assetId,sha256:'a'.repeat(64),mediaType:'image/png'}])
  const missing=randomUUID(),payload=JSON.parse(String(rs.getCell('B2').value));payload.definition.reportVersion='2.0.0';payload.template.blocks[0].assetId=missing;payload.assetRefs[0].assetId=missing
  const next=await createComponentDraft(actor,{requestId:randomUUID(),draft:{toolKey:w.key,configurationName:'缺失素材草稿',baseCombination:{releaseId:row.id,combinationHash:row.combination_hash},changedParts:{REPORT:{version:'2.0.0',payload}}}})
  const preview=await previewComponentPublication(actor,next.id)
  await expect(publishComponentDraft(actor,next.id,{requestId:randomUUID(),expectedRevision:next.revision,expectedPreviewHash:preview.previewHash,expectedBase:preview.baseCombination,allowedProducts:['TRAINING'],reason:'合成缺失素材'})).rejects.toThrow()
  expect((await readComponentDraft(actor,next.id)).publishedReleaseId).toBeNull()
 })
})
