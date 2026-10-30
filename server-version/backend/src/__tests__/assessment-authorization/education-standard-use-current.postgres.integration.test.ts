/** Read-only continuation of the retained eight-actor education T1 fixture. */
import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_USE_CURRENT==='1'?describe:describe.skip
suite('education exact original entry/delegation consumer facts, real PostgreSQL',()=>{
 let db:any,uses:any[],helper:any
 const observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_TEST_DATABASE_URL
  if(!url)throw Error('Explicit retained fixture required');requireIsolatedReleaseDatabase(url)
  if(process.env.NODE_ENV!=='test'||new URL(url).pathname!=='/precise_education_test_20261029'||new URL(url).port!=='55439')throw Error('Dedicated local education fixture required')
  db=(await import('../../config/database')).prisma
  if(await db.user.count()!==8||await db.organization.count()!==2)throw Error('Inspect retained outcomes before continuation')
  uses=await db.contentCapabilityGrant.findMany({where:{capabilities:{equals:['material.use']}}})
  if(uses.length!==3)throw Error('Expected the three retained synthetic T1 uses')
  helper=await import('../../modules/assessment-authorization/education-standard-use-current')
 },30000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_EDUCATION_USE_CURRENT_EVIDENCE??'/tmp/education-standard-current.json',JSON.stringify({productionAccessed:false,readOnlyDatabase:true,
   scope:'Protected current-authority reader only; consumer route not mounted',observations},null,2)+'\n')
  if(db){await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it.each(['SCHOOL','TEACHER'])('reads exact %s authority without repairing a revoked original root',async(product)=>{
  const selected=uses.filter(use=>use.product===product)
  expect(selected).toHaveLength(product==='SCHOOL'?2:1)
  const context={entry:product,organizationId:selected[0].scopeId,principal:{userId:selected[0].subjectId,accountDomain:'SCHOOL'}}
  const headers=selected.map(use=>({id:use.id,subject_id:use.subjectId,issuer_id:use.issuerId,resource_keys:use.resourceKeys}))
  const checked=await db.$transaction(async(tx:any)=>{
   const evidence=await helper.readEducationStandardCurrentEvidence(tx,context,headers,true)
   const [clock]=await tx.$queryRaw`SELECT clock_timestamp() AS now`
   expect(evidence.size).toBe(selected.length)
   return selected.map(use=>({id:use.id,current:helper.educationStandardEvidenceCurrent(evidence.get(use.id),clock.now),bindingHash:evidence.get(use.id).binding.bindingHash}))
  })
  expect(checked.every((row:any)=>row.current===(product==='TEACHER'))).toBe(true)
  observations.push({product,checked})
 })
 it('does not invent typed use evidence for a different existing distribution-capability record',async()=>{
  const legacy=await db.contentCapabilityGrant.findFirstOrThrow({where:{capabilities:{equals:['material.distribute']},product:'TEACHER'}})
  const context={entry:'TEACHER',organizationId:legacy.scopeId,principal:{userId:legacy.subjectId,accountDomain:'SCHOOL'}}
  const evidence=await db.$transaction((tx:any)=>helper.readEducationStandardCurrentEvidence(tx,context,[{id:legacy.id,
   subject_id:legacy.subjectId,issuer_id:legacy.issuerId,resource_keys:legacy.resourceKeys}],false))
  expect(evidence.size).toBe(0)
 })
 it('feeds the existing protected public-use consumer without reviving the School delegation or changing the Teacher grant',async()=>{
  const {readEducationPublicUse}=await import('../../modules/education-tools/public-source.catalog')
  const {authorizePrivateTool}=await import('../../modules/education-tools/private-tool.access')
  for(const product of ['SCHOOL','TEACHER'] as const){
   const selected=uses.filter(use=>use.product===product),context={entry:product,organizationId:selected[0].scopeId,
    principal:{userId:selected[0].subjectId,accountDomain:'SCHOOL' as const}}
   const keys=[...new Set(selected.flatMap(use=>use.resourceKeys))] as string[]
   const checked=await db.$transaction(async(tx:any)=>{
    await authorizePrivateTool(tx,context,{kind:'COMPOSITION'})
    let queries=0
    const tracked=new Proxy(tx,{get(object,property){if(property==='$queryRaw')return(query:any)=>{queries++;return object.$queryRaw(query)};return Reflect.get(object,property)}})
    const result=await readEducationPublicUse(tracked,context,keys,true)
    return {result,queries}
   })
   const {result}=checked
   expect(result.size).toBe(product==='SCHOOL'?0:1)
   if(product==='TEACHER')expect(result.get(keys[0])!.selectedBinding!.binding.authorization.id).toBe(selected[0].id)
   observations.push({product,existingConsumerAllowed:result.size,grantsInBatch:selected.length,protectedUseQueries:checked.queries,
    measurement:'One synthetic protected read, not latency qualification or a new rigid performance gate'})
  }
 })
 it('rejects recomputed binding hashes naming a different original entry or delegation revision',async()=>{
  const use=uses.find(value=>value.product==='TEACHER'),audit=await db.assessmentManagementEvent.findUniqueOrThrow({where:{id:use.id}})
  const {sealSelectedConfigurationBinding}=await import('../../modules/assessment-authorization/selected-configuration')
  const context={entry:'TEACHER',organizationId:use.scopeId,principal:{userId:use.subjectId,accountDomain:'SCHOOL'}}
  const header={id:use.id,subject_id:use.subjectId,issuer_id:use.issuerId,resource_keys:use.resourceKeys}
  for(const kind of ['ENTRY_ADMIN','CONTENT_DELEGATION']){
   const body=structuredClone(audit.metadata.selectedBinding.binding)
   body.authorization.authority.find((item:any)=>item.kind===kind).revision++
   const selectedBinding=sealSelectedConfigurationBinding({product:body.product,configuration:body.configuration,authorization:body.authorization})
   const result=await db.$transaction(async(tx:any)=>{
    const evidence=await helper.readEducationStandardCurrentEvidence(tx,context,[header],true,[{id:use.id,actor_id:use.issuerId,metadata:{...audit.metadata,selectedBinding}}])
    const [clock]=await tx.$queryRaw`SELECT clock_timestamp() AS now`
    return helper.educationStandardEvidenceCurrent(evidence.get(use.id),clock.now)
   })
   expect(result).toBe(false)
  }
 })
})
