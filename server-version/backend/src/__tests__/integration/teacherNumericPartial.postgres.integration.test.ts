import {randomUUID} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {insertRunActorSnapshot,insertRunRelationshipSnapshot,insertRunExecution} from '../../modules/assessment-run/repository'
import {readReportingArtifactRecord} from '../../modules/reporting/artifact'
import {generateTeacherNumericGroup,readTeacherNumericGroup,listTeacherNumericGroups} from '../../modules/huiteacher/numericGroupReport.service'
import {setReportingPayloadMaterializationObserverForTests} from '../../modules/reporting/resultSource'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),enabled=process.env.TEACHER_SELF_GROUP_CONTINUATION
const suite=url&&enabled?describe:describe.skip
suite('Teacher partial numeric population / existing real FINAL continuation',()=>{
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!);await db.$connect()})
 afterAll(async()=>{setReportingPayloadMaterializationObserverForTests(null);await db.$disconnect()})
 it('preserves N10 real FINALs, withholds a small missing complement and discloses N10 of20 without requiring complete participation',async()=>{
  const f=JSON.parse(await readFile(enabled!,'utf8'))
  const oldProof=JSON.parse(await readFile('/tmp/teacher-numeric-group-consumer/original-proof.json','utf8'))
  const old=await readReportingArtifactRecord(oldProof.artifactId)
  if(old.analysisKind!=='GROUP'||old.artifactPayload.schemaVersion!==2)throw Error('retained V2 GROUP source required')
  const originals=await db.$queryRaw<Array<{id:string;runtimeBindingRef:string;completedAt:Date}>>`SELECT id,runtime_binding_ref AS "runtimeBindingRef",completed_at AS "completedAt" FROM assessment_run_executions WHERE run_id=${f.runId} AND status='COMPLETED' ORDER BY id`
  expect(originals).toHaveLength(10)
  const originalReport=await readTeacherNumericGroup({...f.scope,artifactId:old.id})
  async function pending(n:number){
   const [count]=await db.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int AS n FROM assessment_run_executions WHERE run_id=${f.runId} AND status='ASSIGNED'`
   for(let i=count.n;i<n;i++)await db.$transaction(async tx=>{
    const user=await tx.user.create({data:{username:'teacher-partial-pending-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
    const member=await tx.organizationMembership.create({data:{id:randomUUID(),organizationId:f.scope.organizationId,userId:user.id}})
    const persona=await tx.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:f.scope.organizationId,membershipId:member.id,persona:'TEACHER',grantedByUserId:f.actor.userId}})
    // Deliberate incomplete boundary fixture only: use existing graph repository
    // helpers, preserve old actors, assignments, canonical results and snapshots.
    // This is not a fresh twenty-person publication acceptance claim.
    const actor=await insertRunActorSnapshot(tx,{organizationId:f.scope.organizationId,runId:f.runId,provenanceKind:'ORG_MEMBER',userId:user.id,membershipId:member.id,actorRole:'TEACHER',snapshotPayload:{schemaVersion:1,provenanceKind:'ORG_MEMBER',userId:user.id,membershipId:member.id,actorRole:'TEACHER',personaGrantId:persona.id}})
    const relationship=await insertRunRelationshipSnapshot(tx,{organizationId:f.scope.organizationId,runId:f.runId,relationshipKind:'SELF',subjectActorSnapshotId:actor.id,respondentActorSnapshotId:actor.id,snapshotPayload:{schemaVersion:1,relationshipKind:'SELF',relationshipRef:null,subjectActorSnapshotId:actor.id,respondentActorSnapshotId:actor.id}})
    await insertRunExecution(tx,{organizationId:f.scope.organizationId,runId:f.runId,trackId:old.artifactPayload.source.trackId,subjectActorSnapshotId:actor.id,respondentActorSnapshotId:actor.id,relationshipSnapshotId:relationship.id})
   })
  }
  const input={...f.scope,trackId:old.artifactPayload.source.trackId,leaf:old.artifactPayload.source.leaf,specId:old.specId,selection:{kind:'ALL' as const}}
  const [small]=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM reporting_analysis_artifacts WHERE organization_id=${f.scope.organizationId}
   AND artifact_payload->'source'->>'runId'=${f.runId} AND artifact_payload->'projection'->>'eligibleN'='11' ORDER BY generated_at DESC,id DESC LIMIT 1`
  if(!small){
   await pending(1)
   const withheld=await generateTeacherNumericGroup(input)
   expect(withheld.projection).toMatchObject({completedN:null,assignedN:null,metrics:[{key:'support',state:'suppressed',validN:null,mean:null}]})
  }
  await pending(10)
  const report=await generateTeacherNumericGroup(input)
  expect(report.projection).toMatchObject({completedN:10,assignedN:20,metrics:[{key:'support',state:'present',validN:10,missingN:10,mean:3,sdSample:0}]})
  let reads=0;setReportingPayloadMaterializationObserverForTests(()=>{reads++})
  expect(await readTeacherNumericGroup({...f.scope,artifactId:report.artifactId})).toEqual(report)
  expect(await readTeacherNumericGroup({...f.scope,artifactId:old.id})).toEqual(originalReport)
  setReportingPayloadMaterializationObserverForTests(null);expect(reads).toBe(0)
  expect(await db.$queryRaw`SELECT id,runtime_binding_ref AS "runtimeBindingRef",completed_at AS "completedAt" FROM assessment_run_executions WHERE run_id=${f.runId} AND status='COMPLETED' ORDER BY id`).toEqual(originals)
  await writeFile('/tmp/teacher-group-partial-population/proof.json',JSON.stringify({passed:true,productionAccessed:false,realFinalsRetained:10,newFinalSubmissions:0,deliberateIncompleteBoundaryRows:10,smallComplementN11:'all numeric/count fields withheld',partialN20:{completedN:10,validN:10,missingN:10,mean:3,sdSample:0},oldSnapshotUnchanged:true,readCanonicalMaterializations:reads,artifactId:report.artifactId,full20PersonPublicationReplayed:false},null,2))
 },120000)
 it('reads only authorized version pointers and the saved partial Artifact when reopening the report',async()=>{
  const f=JSON.parse(await readFile(enabled!,'utf8')),proof=JSON.parse(await readFile('/tmp/teacher-group-partial-population/proof.json','utf8'))
  let reads=0;setReportingPayloadMaterializationObserverForTests(()=>{reads++})
  const directory=await listTeacherNumericGroups(f.scope)
  expect(directory.sources).toEqual([]);expect(directory.specs).toEqual([])
  expect(directory.versions.some(v=>v.artifactId===proof.artifactId)).toBe(true)
  expect((await readTeacherNumericGroup({...f.scope,artifactId:proof.artifactId})).projection.completedN).toBe(10)
  setReportingPayloadMaterializationObserverForTests(null);expect(reads).toBe(0)
  await writeFile('/tmp/teacher-group-partial-population/pointer-read-proof.json',JSON.stringify({passed:true,actualPostgres:true,configurationNotLoaded:true,versionPointersRead:true,readCanonicalMaterializations:reads,newFinalSubmissions:0},null,2))
 },30000)

})
