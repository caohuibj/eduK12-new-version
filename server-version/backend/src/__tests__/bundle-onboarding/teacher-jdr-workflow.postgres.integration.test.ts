import {it,expect} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {teacherJdrPackage} from './teacher-jdr.fixture'
import * as questionnaire from '../../modules/questionnaire-product/service'
import {bundleDefinitionProvider} from '../../modules/bundle-product/service'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {readReport} from '../../modules/bundle-product/analysis'
const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL'),dir=process.env.JDR_EVIDENCE_DIRECTORY,test=url&&dir?it:it.skip
test('uses the same five sources as an ordinary collection and keeps saved JD-R feedback after a new catalog template',async()=>{
  requireIsolatedReleaseDatabase(url!)
  // Explicit continuation of the already installed/scored synthetic example.
  // Never read this private checkpoint into public logs or evidence bundles.
  const file=path.join(dir!,'jdr-private-checkpoint.json'),c=JSON.parse(fs.readFileSync(file,'utf8'))
  const actor={userId:'jdr-owner-'+c.tag,role:'TEACHER' as const},courseId='jdr-course-'+c.tag
  try{
    if(!c.ordinaryId){const row=await questionnaire.create(actor,{requestId:randomUUID(),questionnaireType:'COURSE',name:'工作条件工具普通组合｜仅独立结果',courseIds:[courseId]});c.ordinaryId=row.id;fs.writeFileSync(file,JSON.stringify(c),{mode:0o600})}
    let draft=await questionnaire.detail(actor,c.ordinaryId)
    for(const b of c.bindings as Array<{resourceId:string}>){
      // The public DTO nests the source under `scale`; it does not expose
      // scaleId or internal protocol keys. Never edit a published continuation.
      if(draft.status!=='DRAFT'||draft.items.some((i:{scale?:{id?:string}})=>i.scale?.id===b.resourceId))continue
      draft=await questionnaire.addItem(actor,draft.id,{revision:draft.revision,item:{type:'SCALE',scaleId:b.resourceId,required:true}})
    }
    if(draft.status==='DRAFT')draft=await questionnaire.publish(actor,draft.id,{revision:draft.revision})
    expect(draft).toMatchObject({status:'PUBLISHED',productKind:'QUESTIONNAIRE'})
    expect(await db.compositeAssessment.findUniqueOrThrow({where:{id:draft.id},select:{reportPackageKey:true,analysisProtocolKey:true}})).toEqual({reportPackageKey:null,analysisProtocolKey:null})
    expect(draft.items).toHaveLength(5);expect(await db.bundleInstance.findUnique({where:{compositeId:draft.id}})).toBeNull()
    const before=await readReport(c.attemptId,'student'),future=structuredClone(teacherJdrPackage())
    future.manifest.definition.bundleVersion='0.1.1';future.manifest.definition.reportDefinitionVersion='0.1.1'
    future.report.version='0.1.1';future.profile.templateVersion='0.1.1';future.profile.profiles[1].summary='Synthetic future template, never installed or published.'
    bundleDefinitionProvider.register(packageEntry(future))
    const after=await readReport(c.attemptId,'student')
    expect(after.factsHash).toBe(before.factsHash);expect(after.view?.profileView).toEqual(before.view?.profileView)
    expect(after.view?.profileView?.explanation).not.toContain('Synthetic future')
    fs.writeFileSync(path.join(dir!,'jdr-workflow-result.json'),JSON.stringify({ordinaryId:draft.id,status:draft.status,productKind:draft.productKind,independentTools:5,bundleInstance:null,ordinaryScoringExecuted:false,savedAttemptId:c.attemptId,factsHash:after.factsHash,templateCatalogUpgrade:'0.1.1 synthetic DRAFT only',savedTemplate:after.view?.profileView?.methods?.templateVersion,historyUnchanged:true},null,2)+'\n')
  }finally{await db.$disconnect()}
},60000)
