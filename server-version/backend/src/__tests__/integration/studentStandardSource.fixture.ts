import {randomUUID} from 'node:crypto'
import {expect,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import * as registry from '../../modules/scale/onboarding/instrument-registry'
import * as packages from '../../modules/scale/scale-package.registry'
import type {ScaleInstrumentSourceV1} from '../../modules/scale/onboarding/types'
import {DISCLOSURE_PRESETS} from '../../modules/scale/policy/disclosure'
import {planScaleInstrumentInstall,installScaleInstrument} from '../../modules/scale/onboarding/install'
import {planStandardScalePublication,publishStandardScale} from '../../modules/scale/onboarding/publish'
import {sourceParts} from '../../modules/survey/standard-triplet.model'
import {previewStandardTriplet,approveStandardTriplet} from '../../modules/survey/standard-triplet.service'

/** New synthetic sources, never modified declarations on real instruments.
 * Registry delegation adds fixtures only; all native validation, publication,
 * C/P/R approval, U, SQL sealing, admission and scoring remain actual services. */
export async function installStudentStandardFixtures(){
 const sources=[true,false].map(declared=>{
  const key=declared?'synthetic_student_teacher_observer':'synthetic_generic_observer'
  const definition=compileResearchScale('Synthetic student observation',{schemaVersion:1,respondentType:'teacher_self_report',aggregation:'mean',
   responseOptions:[{optionKey:'zero',label:'Zero',score:0},{optionKey:'one',label:'One',score:1}],dimensions:[{dimensionKey:'support',label:'Observed support',direction:'descriptive'}],
   items:[{itemKey:'q',prompt:'Synthetic observed classroom support',required:true,reverse:false,dimensionKeys:['support']}]})
  definition.respondentType='observer_report';definition.report.audienceContract={schemaVersion:1,respondent:'OBSERVER_REPORT',audience:'teacher',locale:'zh-CN'}
  const source:ScaleInstrumentSourceV1={schemaVersion:1,identity:{instrumentKey:key,instrumentVersion:'1.0.0'},
   catalog:{schemaVersion:1,catalogManifestVersion:1,catalogStatus:'CANDIDATE',scientificMaturity:'PILOT',identity:{canonicalName:'Synthetic observer'},
    construct:{primaryDomain:'TEACHER_OBSERVATION',secondaryDomains:[],constructDefinition:'Synthetic observation only',constructLevel:'SPECIFIC_CONSTRUCT',constructOverlapTags:[]},
    population:{respondentTypes:['OBSERVER'],developmentalEvidence:'UNKNOWN'},administration:{itemCount:1,estimatedMinutes:1,administrationModes:['DIGITAL_SELF_ADMINISTERED'],timeFrame:'Synthetic observation',requiredTraining:false,itemOrderLocked:true,responseFormatLocked:true,layoutConstraints:[]},
    intendedUse:{intendedUses:[{use:'RESEARCH',evidenceStatus:'EVIDENCE_UNKNOWN'}],forbiddenUses:['DIAGNOSIS','HIGH_STAKES_SELECTION']},evidence:[],referenceApplicability:[]},
   localization:{schemaVersion:1,sourceLocale:'zh-CN',targetLocale:'zh-CN',localizationVersion:'1.0.0',translationSource:'Original synthetic fixture',adaptationMethod:'ORIGINAL_SOURCE',expertReviewStatus:'PENDING',cognitiveDebriefStatus:'NOT_ESTABLISHED',localEvidenceRefs:[],reviewStatus:'PENDING'},
   applicability:{schemaVersion:1,policyVersion:'synthetic-observer-v1',respondentTypes:['OBSERVER'],requiredContextKeys:[]},
   ...(declared?{educationApplicability:{schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'STUDENT_REPORT'}]} as const}:{}),
   disclosure:{schemaVersion:1,policyVersion:'synthetic-observer-v1',audiences:{respondent:DISCLOSURE_PRESETS.NONE(),subject:DISCLOSURE_PRESETS.SCORES(),teacher:DISCLOSURE_PRESETS.SCORES(),researcher:DISCLOSURE_PRESETS.SCORES()},unknownAudience:'DENY'},
   instruction:{schemaVersion:1,text:'Observe the assigned teacher only',language:'zh-CN',version:'1.0.0',source:'Original synthetic fixture'},
   executable:{releaseStatus:'PUBLISHED',contentLocale:'zh-CN',definition,references:[],goldenCases:[0,1].map(value=>({name:'Synthetic '+value,answers:[{itemCode:'q',responseValue:value===0?'zero':'one'}],expected:{quality:'interpretable',scores:{support:value},totalScoreKeys:['support']}}))}}
  return source
 })
 const local=registry.createScaleInstrumentRegistry(sources)
 expect(local.listDiagnostics()).toEqual([])
 for(const source of sources)expect(local.getValidation(source.identity.instrumentKey,'1.0.0')?.issues.filter(issue=>issue.severity==='error')).toEqual([])
 const source=registry.getScaleInstrumentSource,validation=registry.getScaleInstrumentValidation,policy=registry.getScaleInstrumentRuntimePolicy,list=registry.listScaleInstrumentSources,getPackage=packages.getScalePackage
 const matches=(key:string)=>sources.some(row=>row.identity.instrumentKey===key)
 vi.spyOn(registry,'getScaleInstrumentSource').mockImplementation((key,version)=>matches(key)?local.getSource(key,version):source(key,version))
 vi.spyOn(registry,'getScaleInstrumentValidation').mockImplementation((key,version)=>matches(key)?local.getValidation(key,version):validation(key,version))
 vi.spyOn(registry,'getScaleInstrumentRuntimePolicy').mockImplementation((key,version)=>matches(key)?local.getRuntimePolicy(key,version):policy(key,version))
 vi.spyOn(registry,'listScaleInstrumentSources').mockImplementation(()=>[...list(),...local.listSources()])
 vi.spyOn(packages,'getScalePackage').mockImplementation((key,version)=>matches(key)?local.getExecutable(key,version):getPackage(key,version))
 const system=(await db.user.create({data:{username:'student-std-system-'+randomUUID(),passwordHash:'synthetic-only',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING'}})).id
 const results=[]
 for(const source of sources){
  const {instrumentKey,instrumentVersion}=source.identity,runtime=local.getRuntimePolicy(instrumentKey,instrumentVersion)!
  const install={instrumentKey,instrumentVersion,actorUserId:system,deploymentPolicy:{schemaVersion:2 as const,revision:1,locale:'zh-CN',territory:'ZZ',deploymentModes:['STANDALONE','COMPOSITE','QUESTIONNAIRE'] as Array<'STANDALONE'|'COMPOSITE'|'QUESTIONNAIRE'>,runtimePolicyHash:runtime.runtimePolicyHash,localizationVersion:'1.0.0',inFlightCompletion:'FROZEN_DEADLINE' as const}}
  expect((await planScaleInstrumentInstall(db,install)).blockers).toEqual([]);await installScaleInstrument(db,install)
  const publication={instrumentKey,instrumentVersion,actorUserId:system,visibility:'HIDDEN' as const,allowedProducts:['SURVEY' as const]}
  const planned=await planStandardScalePublication(db,publication);expect(planned.blockers).toEqual([])
  await publishStandardScale(db,{...publication,expectedProofHash:planned.proofHash})
  const parts=sourceParts(instrumentKey,instrumentVersion),selection={toolKey:instrumentKey,CONTENT:parts.find(p=>p.axis==='CONTENT')!.hash,PARAMETERS:parts.find(p=>p.axis==='PARAMETERS')!.hash,REPORT:parts.find(p=>p.axis==='REPORT')!.hash}
  const preview=await previewStandardTriplet(db,system,selection);expect(preview.blockers).toEqual([])
  const online=await approveStandardTriplet(system,{...selection,requestId:randomUUID(),expectedCombinationHash:preview.combinationHash,reason:'Synthetic exact student observer approval',allowedProducts:['SURVEY']},
   {tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:'synthetic-student-standard-strong-session'})
  results.push({provider:'STANDARD_SCALE' as const,kind:'SCALE' as const,versionId:online.id,contentHash:preview.combinationHash})
 }
 return {system,declared:results[0],generic:results[1]}
}
