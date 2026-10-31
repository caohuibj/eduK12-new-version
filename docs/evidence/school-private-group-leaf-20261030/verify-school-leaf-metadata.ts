import assert from 'node:assert/strict'
import {PrismaClient} from '/workspace/eduK12-new-version/server-version/backend/node_modules/@prisma/client'
import {requireIsolatedReleaseDatabase} from '/workspace/eduK12-new-version/server-version/backend/src/__tests__/integration/integration-env'
import {loadSchoolPrivateGroupDisclosure,schoolPrivateGroupLeafDisclosure} from '/workspace/eduK12-new-version/server-version/backend/src/modules/education-tools/school-private-group-leaf'

async function main(){
 requireIsolatedReleaseDatabase(process.env.DATABASE_URL!)
 const db=new PrismaClient({log:[{emit:'event',level:'query'}]}),queries:string[]=[]
 db.$on('query',event=>queries.push(event.query))
 try{
  // Reuse the exact synthetic source already published by the previous PG
  // case. No source publication, participant save or FINAL is replayed here.
  const scope={organizationId:'3bfb1802-d3df-418c-91e2-8484544d3c2e',runId:'fed88858-ae3e-482e-aad9-cef00f0986c9',trackId:'75d8e1ba-f39e-45c0-ba42-dba335307327'}
  const source=await db.$transaction(tx=>loadSchoolPrivateGroupDisclosure(tx,scope))
  assert(source);assert.equal(source.leaves.length,1)
  const selected=source.leaves[0],leaf={slotKey:selected.slotKey,unitType:'SCALE' as const,instrumentKey:selected.instrumentKey,instrumentVersion:selected.instrumentVersion,compiledRuntimeHash:'a'.repeat(64)}
  const projection=schoolPrivateGroupLeafDisclosure(source,leaf)
  assert.equal(projection.identity,null);assert.equal(projection.contract.audiences.TEACHER.mode,'NONE')
  assert.equal(projection.contract.audiences.PROFESSIONAL.mode,'AGGREGATE_ONLY')
  assert.throws(()=>schoolPrivateGroupLeafDisclosure(source,{...leaf,slotKey:'scale:wrong'}))
  assert.equal(await db.$transaction(tx=>loadSchoolPrivateGroupDisclosure(tx,{...scope,organizationId:'00000000-0000-4000-8000-000000000001'})),null)
  const finalFactQueries=queries.filter(query=>/assessment_unit_snapshots|canonical_result_encrypted|composite_assessment_attempts/.test(query)).length
  assert.equal(finalFactQueries,0)
  console.log(JSON.stringify({scope,parent:source.parent,acceptedLeafCount:source.leaves.length,queries:queries.length,finalFactQueries,
   realPublishedMetadata:true,coreOrFINALProved:false,publisherReplayed:false}))
 }finally{await db.$disconnect()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
