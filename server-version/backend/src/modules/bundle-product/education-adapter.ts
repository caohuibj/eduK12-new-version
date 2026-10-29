import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {encryptCognitivePayload} from '../cognitive/cognitive.security'
import {readInstance,type BundleBindings} from './instance'
import {EducationNativeBundleError,type EducationNativeBundle} from './education-identity'

type Instance={definitionEncrypted:string;definitionHash:string;bindingsEncrypted:string;bindingsHash:string}
export function assertEducationNativeBundlePopulation(source:Instance|null|undefined,product:'SCHOOL'|'TEACHER'){
  if(source&&product==='TEACHER'&&readInstance(source).frozen.bundleSnapshot.bundleDefinition.population.subjectPopulation==='youth')throw new EducationNativeBundleError('EDUCATION_NATIVE_BUNDLE_POPULATION_UNSUPPORTED',400)
}
/** Existing organization preparation has already authorized the complete source
 * and all original C/P/R distribution. Never infer public-library package U here. */
export async function retainEducationNativeBundle(tx:Prisma.TransactionClient,source:Instance|null|undefined,runtimeId:string,itemIds:ReadonlyMap<string,string>):Promise<EducationNativeBundle|undefined>{
  if(!source)return undefined
  const {bindings,frozen}=readInstance(source)
  const ids=[...bindings.slots,...bindings.context].map(item=>item.itemId)
  if(new Set(ids).size!==ids.length||ids.length!==itemIds.size)throw new EducationNativeBundleError('EDUCATION_NATIVE_BUNDLE_INCOMPLETE')
  const remap=(id:string)=>{const mapped=itemIds.get(id);if(!mapped)throw new EducationNativeBundleError('EDUCATION_NATIVE_BUNDLE_INCOMPLETE');return mapped}
  const next:BundleBindings={schemaVersion:1,slots:bindings.slots.map(slot=>({...slot,itemId:remap(slot.itemId)})),
    context:bindings.context.map(field=>({...field,itemId:remap(field.itemId)}))}
  const bindingsHash=canonicalHash(next)
  await tx.bundleInstance.create({data:{compositeId:runtimeId,
    bundleKey:frozen.bundleSnapshot.bundleKey,bundleVersion:frozen.bundleSnapshot.bundleVersion,definitionHash:source.definitionHash,definitionEncrypted:source.definitionEncrypted,
    bindingsEncrypted:encryptCognitivePayload(next),bindingsHash}})
  return {definitionHash:source.definitionHash,sourceBindingsHash:source.bindingsHash,bindingsHash}
}
export async function assertEducationNativeBundle(instance:Instance|null|undefined,identity:EducationNativeBundle|undefined){
  if(!identity){if(instance)throw new EducationNativeBundleError('EDUCATION_NATIVE_BUNDLE_IDENTITY_MISSING');return}
  if(!instance||instance.definitionHash!==identity.definitionHash||instance.bindingsHash!==identity.bindingsHash)throw new EducationNativeBundleError('EDUCATION_NATIVE_BUNDLE_IDENTITY_CHANGED')
  readInstance(instance)
}
/** Called only after the existing execution-scoped personal report authority.
 * Single-report availability and metric policy can further withhold the Bundle. */
export async function readEducationNativeBundleFeedback(input:{attemptId:string;instance:Instance;identity:EducationNativeBundle;
  availableItemIds:ReadonlySet<string>;metricKeys:ReadonlySet<string>;db?:Prisma.TransactionClient}){
  await assertEducationNativeBundle(input.instance,input.identity)
  const {frozen,bindings}=readInstance(input.instance),pack=frozen.declarativePackage
  const hidden={schemaVersion:1 as const,kind:'NATIVE_BUNDLE_FEEDBACK' as const,status:'WITHHELD',title:frozen.reportDefinition.title,profileView:null}
  if(pack?.schemaVersion!==2)return hidden
  if(pack.profile.bindings.some(core=>{
    const evidence=pack.evidence.find(e=>e.evidenceKey===core.evidenceKey)!,binding=bindings.slots.find(slot=>slot.slotKey===evidence.slotKey)
    return !binding||!input.availableItemIds.has(binding.itemId)||!input.metricKeys.has(evidence.selector)
  }))return hidden
  const {readReport}=await import('./analysis')
  const saved=await readReport(input.attemptId,'student',undefined,input.db)
  return {...hidden,status:saved.status,profileView:saved.view?.profileView??null,factsHash:saved.factsHash}
}
