import {randomUUID} from 'node:crypto'
import type {PrismaClient} from '@prisma/client'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {getCatalogSourceSnapshot,type CatalogSourceRef} from '../../modules/survey/catalog.sources'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'

/** A pre-governance persisted grant, not an accepted new authorization request.
 * Existing native image/entry-capability fixtures exercise that historical
 * storage contract. New grants still must enter the real governed API; no
 * production caller imports this fixture or receives a legacy bypass.
 */
export async function historicalCatalogGrantFixture(db:PrismaClient,issuer:string,userId:string,ref:CatalogSourceRef){
 requireIsolatedReleaseDatabase(process.env.DATABASE_URL!)
 return db.$transaction(async tx=>{
  // The source's actual exact version and any required capability are checked.
  const snapshot=await getCatalogSourceSnapshot({actorUserId:issuer,ref},tx),id=randomUUID()
  await tx.$executeRaw`INSERT INTO survey_tool_grants(id,user_id,status,snapshot,snapshot_digest,created_by)
    VALUES(${id},${userId},'ACTIVE',${JSON.stringify(snapshot)}::jsonb,${canonicalHash(snapshot)},${issuer})`
  return {id,sourceProvenance:{...snapshot.provenance,source:ref}}
 })
}
