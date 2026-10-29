import path from 'node:path'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {freezeBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {getExecutableScalePackage} from '../../modules/scale/onboarding/executable-registry'
import {createScaleProjectionContext} from '../../modules/scale/projection/context-factory'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import type {SurveyNativeBundle} from '../../modules/bundle-product/survey-native'
import type {ResearchFrozenPublication} from '../../modules/survey/publication.service'
import type {SurveyComputedFinal} from '../../modules/survey/final.compute'

/** Hand-recorded score facts from S04, not a second scoring invocation. */
export function surveyNativeFixture(){
 const pack=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.1'))
 const definition=freezeBundleProductionDefinition(packageEntry(pack),{frozenAt:'2026-10-29T12:00:00.000Z',sourceReference:'synthetic-survey-native'})
 const source={compositeId:'00000000-0000-4000-8000-000000000001',definitionHash:definition.contentHash,bindingsHash:'1'.repeat(64),context:[{contextKey:'grade_level',slotKey:'context',itemKey:'grade'}]}
 const native:SurveyNativeBundle={schemaVersion:1,source,ownerId:'synthetic-owner',definition,policies:{},reportAudiences:{}}
 const units:ResearchFrozenPublication['units']=[],results:SurveyComputedFinal['units']=[]
 for(const slot of definition.bundleSnapshot.slotBindings.filter(s=>s.unitType==='SCALE')){
  const d=getExecutableScalePackage(slot.instrumentKey,slot.instrumentVersion)!.definition
  native.policies[slot.slotKey]=createScaleProjectionContext({instrumentKey:slot.instrumentKey,instrumentVersion:slot.instrumentVersion,audience:'subject',purpose:'report'}).frozenPolicy
  native.reportAudiences[slot.slotKey]='student'
  units.push({draftId:slot.slotKey,instrumentKey:slot.slotKey,kind:'SCALE',title:slot.slotKey,draftRevision:1,sourceDigest:canonicalHash(d),scoringDigest:canonicalHash(d.scoring),compiledDefinition:d,displayDefinition:{},participantFeedback:{policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',metricKeys:slot.valueSelectors??[],release:'AFTER_FINAL'}})
  results.push({instrumentKey:slot.slotKey,kind:'SCALE',sourceDigest:canonicalHash(d),scoringDigest:canonicalHash(d.scoring),rawAnswers:{},missing:[],privateScoring:{quality:{status:'interpretable',flags:[]},itemScores:[],scores:d.scoring.scores.map(s=>({...s,value:s.key==='academic_self_efficacy'?2.2:5,range:{min:1,max:slot.slotKey==='ase'?5:6},status:'calculated',expectedItems:d.items.map(i=>i.itemCode),answeredItems:d.items.map(i=>i.itemCode),prorated:false}))}})
 }
 units.push({draftId:'context',instrumentKey:'context',kind:'FORM',title:'年级',draftRevision:1,sourceDigest:'form',scoringDigest:null,compiledDefinition:{},displayDefinition:{}})
 results.push({instrumentKey:'context',kind:'FORM',sourceDigest:'form',scoringDigest:null,rawAnswers:{grade:'9'},missing:[],privateScoring:null})
 const p={schemaVersion:1 as const,importId:'import',toolId:'tool',hash:'hash',title:'数学学习动机',family:'BUNDLE' as const,parentGrantId:'whole-package-grant',report:null,nativeBundle:native,slots:units.map(u=>({slotKey:u.instrumentKey,draftId:u.draftId,instrumentKey:u.instrumentKey,kind:u.kind}))}
 return {snapshot:{units,governedPackages:[p]},result:{schemaVersion:1 as const,definitionDigest:'frozen-union',units:results} as SurveyComputedFinal,native}
}
