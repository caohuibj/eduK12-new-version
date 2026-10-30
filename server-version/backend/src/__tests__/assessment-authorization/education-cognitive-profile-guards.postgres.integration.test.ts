import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_EDUCATION_COGNITIVE_GUARDS==='1'?describe:describe.skip
suite('Education exact cognitive native seals and legacy actual authority',()=>{
 let db:any,state:any
 const observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_EDUCATION_COGNITIVE_DATABASE_URL!;requireIsolatedReleaseDatabase(url);const u=new URL(url)
  if(u.hostname!=='127.0.0.1'||u.port!=='55439'||u.pathname!=='/precise_education_cognitive_profile_test_20261030'||u.username!=='precise_task1_runtime')throw Error('Actual retained restricted fixture required')
  state=JSON.parse(await readFile(process.env.PRECISE_EDUCATION_COGNITIVE_CHECKPOINT!,'utf8'));db=(await import('../../config/database')).prisma
 })
 afterAll(async()=>{await writeFile(process.env.PRECISE_EDUCATION_COGNITIVE_EVIDENCE??'/tmp/education-cognitive-guards.json',JSON.stringify({productionAccessed:false,observations,scope:'Retained published native seal validation, rejected SQL mutation, and actual pre-existing STANDARD authority read only. No new grant, trial, participant or backfill.'},null,2)+'\n');if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it.each(['SCHOOL','TEACHER'] as const)('%s rejects another approved profile, swapped T1 pointer and pin removal while keeping the actual seal immutable',async product=>{
  const e=state.entries[product],parent=await db.compositeAssessment.findUniqueOrThrow({where:{id:e.compositeId}}),snapshot=parent.trainingContentSnapshot,block=e.definition.blocks[0]
  const read=(b:any)=>db.$queryRaw`SELECT education_native_composition_unit(${parent.id},${product},${e.userId},${product==='SCHOOL'?'STUDENT:SELF':'TEACHER:SELF'},${JSON.stringify(b)}::jsonb,0,${JSON.stringify(snapshot)}::jsonb) AS unit`
  expect((await read(block))[0].unit).toEqual(snapshot.units[0])
  const other=block.source.profile==='experience'?'research':'experience'
  const removed=structuredClone(block);delete removed.source.artifactHash;delete removed.source.selectedBinding
  for(const b of [{...block,source:{...block.source,profile:other}},{...block,source:{...block.source,artifactHash:state.profiles[other].artifactHash}},
   {...block,source:{...block.source,selectedBinding:{...block.source.selectedBinding,configurationHash:'f'.repeat(64)}}},removed])
   await expect(read(b)).rejects.toMatchObject({meta:{code:'P0001'}})
  await expect(db.$executeRaw`UPDATE cognitive_assignments SET course_snapshot='{}'::jsonb WHERE id=${e.assignmentId}`).rejects.toMatchObject({meta:{code:'P0001'}})
  const assignment=await db.cognitiveAssignment.findUniqueOrThrow({where:{id:e.assignmentId}})
  expect(assignment.courseSnapshot.selectedEducationCognitiveProfile.artifactHash).toBe(block.source.artifactHash)
  expect(await db.compositeAssessment.findUniqueOrThrow({where:{id:parent.id}})).toEqual(parent)
  observations.push({product,validNativeSeal:true,fourWrongProfileOrPointerInputsRejected:true,courseSnapshotUpdateRejected:true,publishedRootUnchanged:true})
 })
 it('preserves ordinary withdrawal of a pre-existing STANDARD use through the shared current-authority reader',async()=>{
  const [row]=await db.$queryRaw`SELECT g.id,g.subject_id,g.product,g.scope_id,g.resource_keys,e.metadata FROM content_capability_grants g JOIN assessment_management_events e ON e.id=g.id AND e.action='EDUCATION_STANDARD_CONFIGURATION_USE_GRANTED'
   JOIN content_capability_grants original ON original.id=e.metadata#>>'{selectedBinding,binding,authorization,authority,1,id}' AND (original.revoked_at IS NOT NULL OR g.revoked_at IS NOT NULL)
   WHERE e.metadata#>>'{selectedBinding,binding,configuration,kind}'='STANDARD_COMBINATION' ORDER BY g.id LIMIT 1`
  expect(row).toBeTruthy()
  const c={entry:row.product,organizationId:row.scope_id,principal:{userId:row.subject_id,accountDomain:'SCHOOL'}},pointer=(await import('../../modules/assessment-authorization/standard-configuration-binding')).selectedConfigurationPointer(row.metadata.selectedBinding)
  const parsed=(await import('../../modules/education-tools/public-source.identity')).parseEducationPublicSourceKey(row.resource_keys[0])!
  const pins=(await import('../../modules/education-tools/selected-source-binding')).readSelectedSourceBindings([{provider:'STANDARD_SCALE',versionId:parsed.id,contentHash:parsed.hash,selectedBinding:pointer}])
  const allowed=await db.$transaction((tx:any)=>(import('../../modules/education-tools/public-source.catalog')).then(m=>m.readEducationPublicUse(tx,c,row.resource_keys,false,pins,true)))
  expect(allowed.has(row.resource_keys[0])).toBe(false)
  observations.push({existingStandardGrantId:row.id,product:row.product,withdrawnOriginalStillDenied:true})
 },30000)
})
