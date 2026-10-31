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
const url=integrationDatabaseUrl('COMPONENT_IMPORT_TEST_DATABASE_URL'),suite=url?describe:describe.skip
let actor:string,other:string
async function sheet(key='synthetic_'+randomUUID().replaceAll('-','')){
 const b=new ExcelJS.Workbook();await b.xlsx.load(await componentTemplateWorkbook() as never)
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
 it('retains R-only drafts and refuses publication until C and explicit P exist',async()=>{
  const w=await sheet(),basic=w.book.getWorksheet('基本信息')!
  for(const c of ['E2','F2','H2','J2','K2'])basic.getCell(c).value=null
  for(const name of ['题目','选项','计分'])w.book.removeWorksheet(w.book.getWorksheet(name)!.id)
  const s=await imported(await w.buffer()),p=await previewComponentPublication(actor,s.draft.id)
  expect(p.triplet).toBeNull();expect(p.blockers.some(b=>b.includes('尚无 C'))).toBe(true)
  expect((await readComponentDraft(actor,s.draft.id)).changedParts.REPORT).toBeDefined()
 })
 it('publishes, freezes, runs two independent C versions and preserves the first exact source',async()=>{
  const w=await sheet(),first=await imported(await w.buffer()),published=await publish(first.draft.id)
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
})
