import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {packageEntry} from '../assessment-bundle/onboarding/catalog'
import {BundleDefinitionProvider,type BundleDefinitionEntry} from '../bundle-product/definition-provider'
import {readPackageReleaseAdmission} from '../bundle-product/package-release'
import {assertGovernedOnline,assertGovernedDependencies} from '../survey/governed-tool.service'
import {artifactBlockers,type GovernedArtifact} from '../survey/governed-tool.model'
import {AdminPermissionError} from '../admin-permissions/service'
import {authorizePrivateTool} from './private-tool.access'
import {privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {readEducationPublicUse} from './public-source.catalog'
import {educationPackageSelectionSchema,educationPackageKey,type EducationPackageReference} from './package-reference.contracts'
import {readEducationPackageHeaders,readPublishedCodePackage} from './package-reference.headers'
import {packageHeaderSupportsEntry,educationPackageHeaderView} from './package-reference.catalog'
import {readInstance} from '../bundle-product/instance'

export type EducationWholePackageSource=
 |{kind:'NATIVE_BUNDLE';sourceRef:EducationPackageReference;entry:BundleDefinitionEntry}
 |{kind:'GOVERNED_PACKAGE';sourceRef:EducationPackageReference;artifact:GovernedArtifact}
/** Match the complete published source, not merely its title or Bundle key.
 * Original C/P/R and item bindings are subsequently retained by preparation. */
export function matchesEducationWholePackage(instance:Parameters<typeof readInstance>[0]|null|undefined,source:EducationWholePackageSource){
 if(!instance||source.kind!=='NATIVE_BUNDLE')return false
 const {frozen}=readInstance(instance)
 return canonicalHash({definition:frozen.bundleSnapshot.bundleDefinition,contextDefinition:frozen.contextDefinition,
  ruleSet:frozen.ruleSet,reportDefinition:frozen.reportDefinition,...(frozen.declarativePackage?{declarativePackage:frozen.declarativePackage}:{})})===canonicalHash(source.entry)
}
/** Authorized immutable source read, not a Survey delivery/import or a new
 * public package. The caller owns its current author and exact whole-package U.
 * No leaf grants, editable private version or source Composite are fabricated.
 */
export async function readEducationWholePackageSource(tx:Prisma.TransactionClient,source:EducationPackageReference):Promise<EducationWholePackageSource>{
 if(source.provider==='GOVERNED_PACKAGE'){
  const row=await assertGovernedOnline(tx,source.versionId,source.contentHash)
  if(!['BUNDLE','COMBINATION'].includes(row.family))privateToolFail('EDUCATION_WHOLE_PACKAGE_REQUIRED',400)
  const blockers=artifactBlockers(row.snapshot)
  if(blockers.length)privateToolFail('EDUCATION_PACKAGE_SOURCE_INVALID',409)
  await assertGovernedDependencies(tx,row.snapshot)
  return {kind:'GOVERNED_PACKAGE',sourceRef:source,artifact:row.snapshot}
 }
 if(source.provider==='CODE_BUNDLE'){
  const entry=readPublishedCodePackage(source)
  if(!entry)privateToolFail('EDUCATION_PACKAGE_SOURCE_UNAVAILABLE',409)
  return {kind:'NATIVE_BUNDLE',sourceRef:source,entry}
 }
 const row=await readPackageReleaseAdmission(tx,source.versionId,source.contentHash)
 if(row.id!==source.versionId||row.contentHash!==source.contentHash)privateToolFail('EDUCATION_PACKAGE_SOURCE_CHANGED',409)
 const original=packageEntry(row.content),entry={...original,definition:{...original.definition,status:'PUBLISHED' as const}}
 if(new BundleDefinitionProvider([entry]).publicationBlockers(entry.definition.bundleKey,entry.definition.bundleVersion).length)
  privateToolFail('EDUCATION_PACKAGE_PROTOCOL_UNAVAILABLE',409)
 return {kind:'NATIVE_BUNDLE',sourceRef:source,entry}
}
export async function previewEducationWholePackage(c:PrivateToolContext,raw:unknown){
 const {sourceRef}=educationPackageSelectionSchema.parse(raw),key=educationPackageKey(sourceRef)
 try{return await prisma.$transaction(async tx=>{
  await authorizePrivateTool(tx,c)
  if(!(await readEducationPublicUse(tx,c,[key])).has(key))privateToolFail('EDUCATION_PACKAGE_USE_REQUIRED',403)
  const header=(await readEducationPackageHeaders(tx,[sourceRef],true)).get(key)
  if(!header)privateToolFail('EDUCATION_PACKAGE_SOURCE_UNAVAILABLE',404)
  if(!packageHeaderSupportsEntry(header,c.entry))privateToolFail('EDUCATION_PACKAGE_ADMINISTRATION_UNSUPPORTED',400)
  const source=await readEducationWholePackageSource(tx,sourceRef)
  const view=educationPackageHeaderView(header,c.entry)
  if(source.kind==='NATIVE_BUNDLE')return {...view,readOnly:true,protocol:'NATIVE_BUNDLE_V3' as const,
   description:source.entry.definition.description,members:source.entry.definition.slots.map(slot=>({slotKey:slot.slotKey,kind:slot.unitType,
    position:slot.position,required:slot.required,instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,respondentType:slot.respondentType})),
   context:source.entry.contextDefinition,engine:source.entry.definition.engine,report:source.entry.reportDefinition,limitations:source.entry.definition.limitations}
  // Keep the original package report vocabulary. A FORM_FIELD is a definition
  // reference here; access to any participant's answer is a separate data right.
  return {...view,readOnly:true,protocol:'GOVERNED_COMPLETE_ORDERED_V1' as const,members:source.artifact.components.map((member,position)=>({
   slotKey:member.slotKey,title:member.title,position,kind:member.unit.ref.kind,source:member.source,sourceVersion:member.unit.ref.sourceVersion})),
   report:source.artifact.packageReport,artifactHash:canonicalHash(source.artifact)}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})}catch(error){
  if(error instanceof AdminPermissionError)privateToolFail('EDUCATION_PACKAGE_SOURCE_UNAVAILABLE',error.statusCode)
  if(error instanceof Error&&/^BUNDLE_[A-Z_]+$/.test(error.message))privateToolFail('EDUCATION_PACKAGE_SOURCE_UNAVAILABLE',409)
  throw error
 }
}
