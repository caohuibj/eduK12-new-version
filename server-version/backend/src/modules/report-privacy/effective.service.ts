import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  privacyOptionsSchema,schoolMinimumSchema,policyFingerprint,
  type EducationProduct,type PrivacyScenario,type PrivacyOptions,type SchoolMinimum,
} from './schema'
import { STANDARD,ENHANCED,presetOptions,recognizePreset,reportPrivacyCatalog } from './registry'

type Db = typeof prisma | Prisma.TransactionClient
type Row={ownerScopeKind:string;ownerUserId:string|null;revision:number;options:unknown}
type EffectiveInput={organizationId:string;product:EducationProduct;scenario:PrivacyScenario;actorUserId:string}
const optionsOf=(row:Row|null)=>row?privacyOptionsSchema.parse(row.options):null
const floorOf=(row:Row|null):SchoolMinimum=>row?schoolMinimumSchema.parse(row.options):{}
const allKeys=(Object.keys(STANDARD) as Array<keyof PrivacyOptions>)

export function resolvePrivacyLayers(input:{
  scenario:PrivacyScenario;schoolMinimum?:SchoolMinimum;
  schoolDefault?:PrivacyOptions|null;publisher?:PrivacyOptions|null;
}) {
  const selected=input.publisher??input.schoolDefault??(
    input.scenario==='SCHOOL_SENSITIVE_WELLBEING_GROUP'?ENHANCED:STANDARD)
  const origin=input.publisher?'MY':input.schoolDefault?'SCHOOL_DEFAULT':'PRODUCT_DEFAULT'
  const minimum=input.schoolMinimum??{}
  const sensitive=input.scenario==='SCHOOL_SENSITIVE_WELLBEING_GROUP'
  const effective:{[K in keyof PrivacyOptions]:PrivacyOptions[K]}={...selected}
  const locks:Partial<Record<keyof PrivacyOptions,string>>={}
  for(const key of allKeys){
    const mandated=(sensitive?ENHANCED[key]:undefined)??minimum[key]
    if(mandated!==undefined&&mandated!==selected[key]){
      // Every school minimum is an enhanced-only value, not an arbitrary override.
      ;(effective as Record<string,unknown>)[key]=mandated
      locks[key]=sensitive?'SENSITIVE_RESOURCE_BASELINE':'SCHOOL_MINIMUM'
    }
    if(sensitive)locks[key]='SENSITIVE_RESOURCE_BASELINE'
    else if(minimum[key]!==undefined)locks[key]='SCHOOL_MINIMUM'
  }
  return {selected:{...selected},effective,origin,locks,
    selectedPreset:recognizePreset(selected),
    effectivePreset:recognizePreset(effective)}
}

export async function resolveEffectiveReportPrivacy(input:EffectiveInput,db:Db=prisma){
  const catalog=reportPrivacyCatalog(input.product,input.scenario)
  const rows=await db.educationReportPrivacyPreference.findMany({
    where:{organizationId:input.organizationId,product:input.product,
      scenario:input.scenario,
      OR:[{ownerScopeKind:{in:['SCHOOL_DEFAULT','SCHOOL_MINIMUM']}},
        {ownerScopeKind:'PUBLISHER',ownerUserId:input.actorUserId}]},
    select:{ownerScopeKind:true,ownerUserId:true,revision:true,options:true},
  })
  const get=(scope:string)=>rows.find(row=>row.ownerScopeKind===scope)??null
  const schoolDefault=get('SCHOOL_DEFAULT'),schoolMinimum=get('SCHOOL_MINIMUM')
  const publisher=rows.find(row=>row.ownerScopeKind==='PUBLISHER'
    &&row.ownerUserId===input.actorUserId)??null
  const computed=resolvePrivacyLayers({scenario:input.scenario,
    schoolMinimum:floorOf(schoolMinimum),
    schoolDefault:optionsOf(schoolDefault),publisher:optionsOf(publisher)})
  const revisions={schoolDefault:schoolDefault?.revision??0,
    schoolMinimum:schoolMinimum?.revision??0,publisher:publisher?.revision??0}
  const fingerprint=policyFingerprint({
    schemaVersion:1,organizationId:input.organizationId,product:input.product,
    scenario:input.scenario,actorUserId:input.actorUserId,
    effective:computed.effective,origin:computed.origin,revisions,
  })
  return {...computed,revisions,fingerprint,catalog,
    // Do not confuse a saved preference with a report-policy that is already live.
    disclosureState:'LEGACY_STRICT' as const}
}

export function requestedOptions(input:{
  scope:'MY'|'SCHOOL_DEFAULT'|'SCHOOL_MINIMUM';
  preset?:'STANDARD'|'ENHANCED'|'CUSTOM';options?:unknown;
}):PrivacyOptions|SchoolMinimum {
  if(input.scope==='SCHOOL_MINIMUM'){
    if(input.preset!==undefined)throw new Error('PRIVACY_MINIMUM_PRESET_UNSUPPORTED')
    return schoolMinimumSchema.parse(input.options)
  }
  if(!input.preset)throw new Error('PRIVACY_PRESET_REQUIRED')
  if(input.preset!=='CUSTOM'){
    if(input.options!==undefined)throw new Error('PRIVACY_PRESET_OPTIONS_CONFLICT')
    return presetOptions(input.preset)
  }
  return privacyOptionsSchema.parse(input.options)
}
