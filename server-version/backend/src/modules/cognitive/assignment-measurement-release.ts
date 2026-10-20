import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {cognitiveMeasurementRelease} from '../measurement-content/cognitive'
import {ContentReleaseError,prepareRelease} from '../measurement-content/release'
import {getContentRelease,publishContentRelease} from '../measurement-content/repository'
import {requireCognitiveRegistryEntry} from './cognitive.registry'
import {decryptCognitivePayload} from './cognitive.security'
import {hashResolvedConfig} from './profile-freeze'

type Assignment={id:string;config_id:string;created_by:string|null;status:string;profile:string|null;profile_definition_version:string|null;
 resolved_config_snapshot_encrypted:string|null;resolved_config_hash:string|null;measurement_release_id:string|null}
type Config={id:string;status:string;test_type:string;config_version:string;engine_version:string;scoring_version:string;config:unknown}
class AssignmentMeasurementError extends ContentReleaseError{readonly statusCode=409}
function fail(code:string):never{throw new AssignmentMeasurementError('CONTENT_ASSIGNMENT_'+code)}
/** Internal explicit-publication helper, never an admission or public endpoint.
 * The outer transaction must hold current Training teacher/course authorization
 * and complete existing copy/material/source-license gates before calling.
 * prepareTeacherPublishedAssignment/persistPreparedTeacherPublishedAssignment
 * supply the real owned PUBLISHED wrapper. No caller-supplied config or owner.
 * Lock order: owned assignment UPDATE -> actual config SHARE -> release SHARE.
 */
export async function publishAssignmentMeasurementRelease(tx:Prisma.TransactionClient,actorId:string,assignmentId:string){
 if(!actorId.trim()||!assignmentId.trim())fail('IDENTITY_REQUIRED')
 const [assignment]=await tx.$queryRaw<Assignment[]>(Prisma.sql`SELECT id,config_id,created_by,status::text,profile::text,
  profile_definition_version,resolved_config_snapshot_encrypted,resolved_config_hash,measurement_release_id
  FROM cognitive_assignments WHERE id=${assignmentId} FOR UPDATE`)
 if(!assignment||assignment.created_by!==actorId||assignment.status!=='PUBLISHED')fail('SOURCE_DENIED')
 const [config]=await tx.$queryRaw<Config[]>(Prisma.sql`SELECT id,status::text,test_type,config_version,engine_version,scoring_version,config
  FROM cognitive_test_configs WHERE id=${assignment.config_id} FOR SHARE`)
 if(!config||config.status!=='PUBLISHED')fail('CONFIG_NOT_PUBLISHED')
 let effective:unknown
 try{
  const entry=requireCognitiveRegistryEntry(config.test_type,config.engine_version,config.scoring_version)
  const fields=[assignment.profile,assignment.profile_definition_version,assignment.resolved_config_snapshot_encrypted,assignment.resolved_config_hash]
  const count=fields.filter(value=>value!==null&&value!=='').length
  if(count!==0&&count!==fields.length)fail('PROFILE_INVALID')
  const raw=assignment.resolved_config_snapshot_encrypted?decryptCognitivePayload<unknown>(assignment.resolved_config_snapshot_encrypted):config.config
  effective=entry.configSchema.parse(raw)
  if(assignment.resolved_config_snapshot_encrypted&&hashResolvedConfig(effective)!==assignment.resolved_config_hash)fail('PROFILE_INVALID')
 }catch(error){if(error instanceof AssignmentMeasurementError)throw error;fail('PROFILE_INVALID')}
 const effectiveHash=canonicalHash(effective)
 const input=cognitiveMeasurementRelease({localId:config.test_type,version:'assignment-v1',
  testType:config.test_type,configVersion:config.config_version,engineVersion:config.engine_version,scoringVersion:config.scoring_version,
  config:effective,scope:{kind:'PRIVATE',product:'TRAINING',ownerId:actorId,resourceId:assignment.id}})
 if(input.layer!=='MEASUREMENT')fail('RELEASE_MISMATCH')
 input.version='assignment-v1:'+input.content.measurementHash
 input.provenance={...input.provenance,configId:config.id,configVersion:config.config_version,assignmentId:assignment.id,
  profile:assignment.profile,profileDefinitionVersion:assignment.profile_definition_version,resolvedConfigHash:assignment.resolved_config_hash,effectiveConfigHash:effectiveHash}
 const expected=prepareRelease(input)
 const validate=(release:NonNullable<Awaited<ReturnType<typeof getContentRelease>>>)=>{
  if(release.status!=='PUBLISHED')fail('RELEASE_NOT_PUBLISHED')
  if(release.layer!=='MEASUREMENT')fail('RELEASE_MISMATCH')
  if(release.family!=='COGNITIVE'||release.key!==expected.key||release.version!==expected.version||
   release.contentHash!==expected.contentHash||canonicalHash(release.content)!==canonicalHash(expected.content)||
   canonicalHash(release.scope)!==canonicalHash(expected.scope)||canonicalHash(release.provenance)!==canonicalHash(expected.provenance))fail('RELEASE_MISMATCH')
  return {releaseId:release.releaseId,contentHash:release.contentHash,measurementHash:release.content.measurementHash}
 }
 if(assignment.measurement_release_id){
  const stored=await getContentRelease(tx,assignment.measurement_release_id,true)
  if(!stored)fail('RELEASE_MISSING')
  return validate(stored!)
 }
 const release=await publishContentRelease(tx,input,actorId)
 const pointer=validate(release)
 const updated=await tx.$executeRaw(Prisma.sql`UPDATE cognitive_assignments SET measurement_release_id=${pointer.releaseId}
  WHERE id=${assignment.id} AND config_id=${config.id} AND created_by=${actorId} AND status='PUBLISHED' AND measurement_release_id IS NULL`)
 if(updated!==1)fail('SOURCE_CHANGED')
 return pointer
}
