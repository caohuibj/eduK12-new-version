import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {libraryCapabilities} from './authority'
import {assertLibraryUseGrantCurrent} from './usage'
import {ScaleLibraryError} from './contracts'
import {ContentAuthorityError} from '../measurement-content/content-authority'
export async function canReadLibraryScale(actorId:string,entryId:string){
 return prisma.$transaction(async tx=>{
  const caps=await libraryCapabilities(tx,actorId)
  if(caps.systemAdmin)return true
  const [entry]=await tx.$queryRaw<Array<{release_id:string}>>(Prisma.sql`SELECT release_id FROM scale_library_entries WHERE id=${entryId}`)
  if(!entry)return false
  if(caps.reviewGrants.some(g=>g.releaseIds.includes(entry.release_id)))return true
  try{await assertLibraryUseGrantCurrent(tx,{entryId,userId:actorId,product:'TRAINING'});return true}
  catch(e){if(e instanceof ScaleLibraryError||e instanceof ContentAuthorityError)return false;throw e}
 })
}
/** Lists are content reads too. Legacy ADMIN and owner shortcuts never reveal
 * the platform wrapper. Participant counts/course associations are omitted by DTO. */
export async function libraryReadableScaleIds(actorId:string){
 return prisma.$transaction(async tx=>{
  const caps=await libraryCapabilities(tx,actorId)
  const reviewIds=caps.reviewGrants.flatMap(g=>g.releaseIds)
  const rows=await tx.$queryRaw<Array<{id:string;library_entry_id:string;release_id:string}>>(Prisma.sql`
   SELECT s.id,s.library_entry_id,e.release_id FROM scales s JOIN scale_library_entries e ON e.id=s.library_entry_id
   WHERE ${caps.systemAdmin} OR e.release_id=ANY(${reviewIds}::text[]) OR EXISTS(
    SELECT 1 FROM scale_library_use_grants g WHERE g.entry_id=e.id AND g.user_id=${actorId} AND g.product='TRAINING' AND g.status='ACTIVE') ORDER BY s.id LIMIT 1000`)
  const ids:string[]=[]
  for(const row of rows){if(caps.systemAdmin||reviewIds.includes(row.release_id)){ids.push(row.id);continue}
   try{await assertLibraryUseGrantCurrent(tx,{entryId:row.library_entry_id,userId:actorId,product:'TRAINING'});ids.push(row.id)}
   catch(e){if(!(e instanceof ScaleLibraryError)&&!(e instanceof ContentAuthorityError))throw e}
  }
  return {systemAdmin:caps.systemAdmin,ids}
 })
}
