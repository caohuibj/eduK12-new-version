import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {trainingContentSnapshotSchema,prepareTrainingContentSnapshot} from '../composite/training-content-binding'
import {buildTrainingFlowUnits} from '../composite/training-flow-definition'
import {lockInstrumentSourceIdentity} from '../assessment-authorization/source-identity-lock'
import {readSjtEntryDistributionSource} from '../situational/entry-authority'
import {selectPublishedSituationPackage,listSituationPackages,validateSituationPackage} from '../situational/situation-package.registry'
import {freezeSituationalRuntimeAtAttemptStart} from '../assessment-runtime/situational-runtime-snapshot'
import {resolveSituationalScientificContext} from '../situational/scientific-maturity'
import {situationalReleaseKey,type ResolvedSituationalRelease} from '../situational/situational-release.service'
import {educationManagementFail as fail} from './assessment-resource.issuer'
import {frozenDatabaseScaleDefinition} from '../scale/scale-workflow.service'
import {assertScalePublicationRights} from '../scale/scale-publication-guard'
import {prelockEducationStandardSourceActors} from './assessment-resource.marker'

export const educationCompositeInclude={bundleInstance:true,questionnaireCourses:true,items:{orderBy:{position:'asc' as const},include:{scale:true,cognitiveAssignment:{include:{config:true}}}},formSections:{orderBy:{position:'asc' as const},include:{items:{orderBy:{position:'asc' as const}}}}}
/** Lock these advisory source identities before Org/User/Composite row locks.
 * The initial item read orders locks only; readEducationAssessmentSource then
 * verifies the same exact identities under the composite lock. */
export async function lockEducationAssessmentSourceIdentities(tx:Prisma.TransactionClient,sourceId:string){
 const items=await tx.compositeAssessmentItem.findMany({where:{compositeAssessmentId:sourceId,type:'SITUATIONAL'},select:{situationalInstrumentKey:true,situationalInstrumentVersion:true}})
 const identities=items.map(item=>({instrumentKey:item.situationalInstrumentKey!,instrumentVersion:item.situationalInstrumentVersion!}))
 for(const identity of identities.sort((a,b)=>situationalReleaseKey(a).localeCompare(situationalReleaseKey(b))))await lockInstrumentSourceIdentity(tx,identity,'READ')
 return identities
}
export async function readEducationAssessmentSource(tx:Prisma.TransactionClient,sourceId:string,lockedIdentities:Awaited<ReturnType<typeof lockEducationAssessmentSourceIdentities>>,product:'SCHOOL'|'TEACHER'){
 await tx.$queryRaw(Prisma.sql`SELECT id FROM composite_assessments WHERE id=${sourceId} FOR SHARE`)
 const source=await tx.compositeAssessment.findUnique({where:{id:sourceId},include:educationCompositeInclude})
 if(!source||source.status!=='PUBLISHED'||!source.createdBy)fail('EDUCATION_ASSESSMENT_SOURCE_REQUIRED')
 const measured=source.items.some(item=>item.type!=='FORM')
 if(source.trainingContentSnapshot===null?(measured||source.trainingContentSnapshotHash!==null)
  :!source.trainingContentSnapshotHash||canonicalHash(source.trainingContentSnapshot)!==source.trainingContentSnapshotHash)fail('EDUCATION_ASSESSMENT_SOURCE_REQUIRED')
 const snapshot=trainingContentSnapshotSchema.parse(source.trainingContentSnapshot??{schemaVersion:1,compositeId:source.id,units:[]})
 if(snapshot.compositeId!==source.id||!buildTrainingFlowUnits(source).length)fail('EDUCATION_ASSESSMENT_SOURCE_REQUIRED')
 const identities=source.items.filter(item=>item.type==='SITUATIONAL').map(item=>({instrumentKey:item.situationalInstrumentKey!,instrumentVersion:item.situationalInstrumentVersion!}))
 if(canonicalHash([...identities].sort((a,b)=>situationalReleaseKey(a).localeCompare(situationalReleaseKey(b))))!==canonicalHash(lockedIdentities))fail('EDUCATION_ASSESSMENT_SOURCE_CHANGED')
 const resolved=await resolveEducationAssessmentSituationalItems(tx,identities,product,false)
 // This existing helper proves executable/measurement identity only. Its Training
 // scope checks do NOT grant the target entry permission; explicit distribution
 // is checked separately before any draft or frozen metadata is written.
 if(source.items.some(item=>item.standardCombinationSource!==null))
  await prelockEducationStandardSourceActors(tx,source.createdBy,source.items)
 const content=await prepareTrainingContentSnapshot(tx,source,resolved)
 if(snapshot.units.length!==content.snapshot.units.length||snapshot.units.some(unit=>{
  const actual=content.snapshot.units.find(value=>value.itemId===unit.itemId)
  return !actual||actual.family!==unit.family||canonicalHash(actual.source)!==canonicalHash(unit.source)||canonicalHash(actual.measurement)!==canonicalHash(unit.measurement)
 }))fail('EDUCATION_ASSESSMENT_SOURCE_CHANGED')
 if(source.items.some(item=>item.type==='COGNITIVE'&&(item.cognitiveAssignment?.status!=='PUBLISHED'||item.cognitiveAssignment.config.status!=='PUBLISHED')
  ||item.type==='SCALE'&&item.scale?.status!=='PUBLISHED'))fail('EDUCATION_ASSESSMENT_SOURCE_NOT_PUBLISHED')
 const owner=await tx.user.findUnique({where:{id:source.createdBy}})
 if(!owner||!owner.isActive||owner.isFrozen||owner.mustChangePassword||owner.expiresAt&&owner.expiresAt<=new Date())fail('EDUCATION_ASSESSMENT_SOURCE_OWNER_UNAVAILABLE',403)
 const scales=source.items.filter(item=>item.type==='SCALE')
 for(const item of scales){
  if(!item.scale)fail('EDUCATION_ASSESSMENT_SOURCE_NOT_PUBLISHED')
  const definition=frozenDatabaseScaleDefinition(item.scale)
  if(!['participant_self_report',product==='TEACHER'?'teacher_self_report':'student_self_report'].includes(definition.respondentType))fail('EDUCATION_ASSESSMENT_SELF_SOURCE_REQUIRED',403)
  if(definition.license.status==='unknown'||definition.license.redistribution==='unknown')fail('EDUCATION_ASSESSMENT_SOURCE_RIGHTS_UNKNOWN',403)
 }
 await assertScalePublicationRights(tx,owner.id,owner.role,scales.filter(item=>item.standardCombinationSource===null).map(item=>item.scaleId!))
 for(const item of source.items)if(item.type==='COGNITIVE'&&item.cognitiveAssignment?.config.accessPolicy==='GRANT'){
  const author=await tx.user.findUnique({where:{id:item.cognitiveAssignment.createdBy!}})
  if(!author||!author.isActive||author.isFrozen||author.mustChangePassword||author.expiresAt&&author.expiresAt<=new Date())fail('EDUCATION_ASSESSMENT_SOURCE_OWNER_UNAVAILABLE',403)
  if(author.role!=='ADMIN'||!['LEGACY','TRAINING'].includes(author.accountDomain)){
   const [grant]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM material_grants WHERE teacher_id=${author.id}
    AND resource_type='COGNITIVE_CONFIG' AND resource_id=${item.cognitiveAssignment.configId} FOR SHARE`)
   if(!grant)fail('EDUCATION_ASSESSMENT_ORIGINAL_CONFIG_AUTHORITY_REQUIRED',403)
  }
 }
 return {source,content,snapshot}
}

/** Exact original education releases; never borrows a Training course grant. */
export async function resolveEducationAssessmentSituationalItems(tx:Prisma.TransactionClient,identities:Array<{instrumentKey:string;instrumentVersion:string}>,product:'SCHOOL'|'TEACHER',lockIdentities=true){
 // Registration already holds these exact source locks before Org/row locks.
 if(lockIdentities)for(const identity of [...identities].sort((a,b)=>situationalReleaseKey(a).localeCompare(situationalReleaseKey(b))))await lockInstrumentSourceIdentity(tx,identity,'READ')
 const resolved=new Map<string,ResolvedSituationalRelease>(),builtins=listSituationPackages()
 for(const identity of identities){
  let pkg=builtins.some(value=>value.key===identity.instrumentKey)?selectPublishedSituationPackage(builtins,identity.instrumentKey,identity.instrumentVersion):undefined
  if(!pkg){
   const release=await tx.sjtAuthorRelease.findUnique({where:{instrumentKey_instrumentVersion:{instrumentKey:identity.instrumentKey,instrumentVersion:identity.instrumentVersion}}})
   if(!release?.measurementReleaseId)fail('EDUCATION_ASSESSMENT_SJT_SOURCE_REQUIRED')
   // Independent original author publication, never Training course permission.
   await readSjtEntryDistributionSource(tx,release.measurementReleaseId)
   pkg=selectPublishedSituationPackage([release.package as any],identity.instrumentKey,identity.instrumentVersion)
  }
  if(!pkg)fail('EDUCATION_ASSESSMENT_SJT_SOURCE_REQUIRED')
  if(!['participant_self_report',product==='TEACHER'?'teacher_self_report':'student_self_report'].includes(pkg.definition.respondentType))fail('EDUCATION_ASSESSMENT_SELF_SOURCE_REQUIRED',403)
  if(pkg.definition.license.status==='unknown'||pkg.definition.license.redistribution==='unknown')fail('EDUCATION_ASSESSMENT_SOURCE_RIGHTS_UNKNOWN',403)
  const validation=validateSituationPackage(pkg.online?{...pkg,online:undefined}:pkg)
  if(!validation.valid)fail('EDUCATION_ASSESSMENT_SJT_SOURCE_INVALID')
  const frozen=freezeSituationalRuntimeAtAttemptStart({...identity,definition:pkg.definition,scientificContext:resolveSituationalScientificContext(pkg),...(pkg.online?{online:pkg.online}:{})})
  resolved.set(situationalReleaseKey(identity),{situationPackage:pkg,definitionHash:validation.definitionHash,runtime:frozen.compiledRuntime,snapshot:frozen})
 }
 return resolved
}
