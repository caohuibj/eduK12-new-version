import {surveyNativeFixture} from './survey-native.fixture'
import {parseDeclarativePackage,type DerivedPackage} from '../../modules/assessment-bundle/onboarding/contract'
import {freezeBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import path from 'node:path'

/** Recorded scores from the existing fixture; no leaf scorer or raw answers. */
export function derivedAdapterFixture(){
 const fixture=surveyNativeFixture()
 const old=loadPackage(path.resolve(__dirname,'../../modules/assessment-bundle/packages/learning_motivation_math_support/0.1.1'))
 const raw=JSON.parse(JSON.stringify(old));delete raw.profile;delete raw.manifest.files.profile
 raw.schemaVersion=3;raw.manifest.packageSchemaVersion=3;raw.manifest.definition.engine.version='1.2.0'
 raw.rules={version:'1.0.0',derivations:[{key:'value_max',op:'EXACT_MAX_SET',inputs:['vc.value','vc.cost']}],items:[
  {ruleId:'independent_ase',when:{op:'present',evidenceKey:'ase.efficacy'},kind:'independent_summary',text:'获准的独立说明',evidenceKeys:['ase.efficacy'],supportRefs:[]}]}
 raw.evidence=raw.evidence.map((e:any)=>({...e,evidenceKey:e.selector==='academic_self_efficacy'?'ase.efficacy':e.selector==='grade_level'?'context.grade':`vc.${e.selector}`}))
 raw.report={...raw.report,narrativeContent:'BUNDLE_OWNED_SELF',rows:[
  {rowKey:'ase',valueRef:{kind:'evidence',key:'ase.efficacy'},label:'学习把握',unit:'mean',range:{min:1,max:5},order:0},
  {rowKey:'value',valueRef:{kind:'evidence',key:'vc.value'},label:'价值感',unit:'mean',range:{min:1,max:6},order:1},
  {rowKey:'cost',valueRef:{kind:'evidence',key:'vc.cost'},label:'投入感受',unit:'mean',range:{min:1,max:6},order:2}],
  blocks:[{blockId:'scores',kind:'evidence',title:'已冻结原分',audience:['student','admin'],rowKeys:['ase','value','cost'],maxSetKeys:['value_max'],ruleIds:['independent_ase']}]}
 raw.context.fields.push({contextKey:'course_code',valueType:'string',required:true},{contextKey:'adult_confirmed',valueType:'boolean',required:true})
 raw.rules.applicability={op:'all',conditions:[{op:'eq',evidenceKey:'context.course',value:'00123'},{op:'eq',evidenceKey:'context.adult',value:true}]}
 raw.evidence.push(...[{evidenceKey:'context.course',selector:'course_code',valueType:'string'},{evidenceKey:'context.adult',selector:'adult_confirmed',valueType:'boolean'}].map(e=>({...e,slotKey:'context',construct:e.evidenceKey,role:'CONTEXT',direction:'neutral',qualityPolicy:'interpretable_only',unit:'context'})))
 for(const f of Object.values(raw.fixtures) as any[]){delete f.expectedProfile;f.expectedRuleIds=[];f.expectedKind='COMPUTED'}
 const pack=parseDeclarativePackage(raw) as DerivedPackage
 const frozen=freezeBundleProductionDefinition(packageEntry(pack),{frozenAt:'2026-11-01T00:00:00.000Z',sourceReference:'synthetic-derived-adapter'})
 fixture.native.definition=frozen;fixture.native.source.definitionHash=frozen.contentHash
 fixture.native.source.context.push({contextKey:'course_code',slotKey:'context',itemKey:'course'},{contextKey:'adult_confirmed',slotKey:'context',itemKey:'adult'})
 fixture.result.units[2].rawAnswers={grade:'9',course:'00123',adult:'true'}
 return {...fixture,pack,frozen}
}
