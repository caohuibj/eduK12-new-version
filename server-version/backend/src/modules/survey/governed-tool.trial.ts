import {canonicalHash} from '../assessment-runtime/canonical'
import {gonogoSequence} from '../cognitive/randomization'
import {createTrialEnvelope} from '../cognitive/v2/trial-envelope'
import {runAuthoritativeScorer} from '../cognitive/v2/authoritative-scorer'
import {verifySurveyFinalPublication,type FrozenUnitResult} from './final.compute'
import {parseFrozenSurveyCognitive,surveyCognitiveTaskDefinition} from './cognitive.definition'
import {cognitiveParentUnit} from './measurement.result'
import type {LoadedSurveyCognitiveResult} from './cognitive.results'
import {surveySjtQuestions} from './sjt-structure'
import {readSurveyScalePresentation,scalePresentationOptions} from './catalog-scale.presentation'
import type {FormDraft,AnySjtDraft} from './builder.definition'
import {snapshotUnit,type GovernedArtifact} from './governed-tool.model'
import {resultMetrics,renderGovernedUnitReport,renderPackageReport} from './governed-tool.reports'
import type {ResearchFrozenPublication,ResearchFrozenUnit} from './publication.service'
export function syntheticFormAnswers(form:FormDraft,index:number){
 const answer:Record<string,unknown>={}
 for(const page of form.pages)for(const q of page.questions){
  if(q.displayIf){const previous=answer[q.displayIf.itemKey];if(q.displayIf.operator==='EQUALS'?previous!==q.displayIf.optionKey:!Array.isArray(previous)||!previous.includes(q.displayIf.optionKey))continue}
  const options=q.options.filter(o=>o.optionKey!==q.otherOptionKey),chosen=options[Math.min(index,Math.max(0,options.length-1))]?.optionKey??q.options[0]?.optionKey
  const choices=options.filter(o=>!q.exclusiveOptionKeys?.includes(o.optionKey)).slice(0,q.minSelections??1).map(o=>o.optionKey)
  let value:unknown
  switch(q.type){
   case 'SINGLE':case 'LIKERT':value=chosen;break
   case 'MULTIPLE':value=choices.length?choices:[chosen];break
   case 'RANK_ORDER':value=q.options.map(o=>o.optionKey);break
   case 'CONSTANT_SUM':value=Object.fromEntries(q.options.map((o,i)=>[o.optionKey,i===0?q.total??0:0]));break
   case 'MATRIX':case 'MATRIX_MULTIPLE':for(const row of q.rows)answer[q.itemKey+':'+row.rowKey]=q.type==='MATRIX'?chosen:choices;continue
   case 'DATE':value='2026-01-01';break
   case 'TIME':value='12:00';break
   case 'NUMBER':case 'SLIDER':value=q.min??0;break
   default:value=q.textValidation==='EMAIL'?'synthetic@example.invalid':q.textValidation==='DIGITS'?'1':q.textValidation==='ALPHANUMERIC'?'Test':'试';value=String(value).slice(0,q.maxLength??100);break
  }
  answer[q.itemKey]=value
  if(q.otherOptionKey&&(value===q.otherOptionKey||Array.isArray(value)&&value.includes(q.otherOptionKey)))answer[q.itemKey+':other']='试'
 }
 return answer
}
export function syntheticCognitiveTrials(seed:string,index=1){return gonogoSequence(seed,120,.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1300,endedAtPerfMs:trialIndex*1300+800,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?240+index*80:null,interrupted:false}}))}
export function syntheticUnitAnswers(unit:ResearchFrozenUnit,index:number):Record<string,unknown>{
 if(unit.kind==='FORM')return syntheticFormAnswers(unit.displayDefinition as FormDraft,index)
 if(unit.kind==='COGNITIVE')return {}
 if(unit.kind==='SCALE'){
  const display=readSurveyScalePresentation(unit.displayDefinition)
  return Object.fromEntries(display.items.map(item=>{const options=scalePresentationOptions(display,item);return [item.itemKey,options[Math.floor((options.length-1)*index/2)].optionKey]}))
 }
 return Object.fromEntries(surveySjtQuestions(unit.displayDefinition as AnySjtDraft).map(q=>{const options=q.options.map(o=>o.optionKey),pick=options[Math.min(index,options.length-1)];return [q.questionKey,q.responseType==='MULTIPLE'?options.slice(0,q.minSelections??1):pick]}))
}
export function computeGovernedTrial(a:GovernedArtifact,toolId:string,index:number){
 const entries=a.unit?[{slotKey:'tool',unit:a.unit}]:a.components
 const units=entries.map((c,i)=>snapshotUnit(c.unit,toolId+'-'+i,c.slotKey)),answers:Record<string,unknown>={},timings:Record<string,unknown>={},cognitive=new Map<string,FrozenUnitResult>(),rawCognitive:Record<string,unknown>={}
 for(const unit of units){
  answers[unit.instrumentKey]=syntheticUnitAnswers(unit,index)
  if(unit.kind==='SCALE'&&(unit.displayDefinition as {presentationMode?:string}).presentationMode==='ONE_BY_ONE')timings[unit.instrumentKey]=Object.fromEntries(readSurveyScalePresentation(unit.displayDefinition).items.map(i=>[i.itemKey,{schemaVersion:1,firstResponseMs:1000,activeTimeMs:1500,changeCount:0,visits:1,revisitCount:0,interrupted:false,recoveredWithoutClock:false}]))
  if(unit.kind==='COGNITIVE'){
   const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition),seed='survey-governance-synthetic:'+toolId+':'+index,trials=syntheticCognitiveTrials(seed,index)
   const scored=runAuthoritativeScorer({definition:surveyCognitiveTaskDefinition(),session:frozen.sessionSnapshot,trials,randomSeed:seed})
   const reference={slotKey:unit.instrumentKey,epoch:1,resultId:'00000000-0000-4000-8000-000000000001',resultHash:canonicalHash(scored),measurementDigest:frozen.measurementDigest}
   const loaded={reference,result:{...scored,engineVersion:frozen.sessionSnapshot.engineVersion,scoringVersion:frozen.sessionSnapshot.scoringVersion,protocolSignature:frozen.sessionSnapshot.protocolSignature}} as unknown as LoadedSurveyCognitiveResult
   cognitive.set(unit.instrumentKey,cognitiveParentUnit(unit,loaded));rawCognitive[unit.instrumentKey]={synthetic:true,trialCount:trials.length,trials}
  }
 }
 const publication:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'isolated-trial',waveId:'isolated-trial',collectionMode:'SINGLE_UNLINKED',consentVersion:1,linkageNoticeConfirmed:false,consentDigest:canonicalHash('synthetic'),units,runtimeStatus:'SURVEY_FINAL_V1'}
 // The same controlled child scorer and parent FINAL closure, without creating a human Attempt.
 const calculated=verifySurveyFinalPublication(publication,canonicalHash(publication))!.compute(answers,null,undefined,'FINAL',Object.keys(timings).length?timings:undefined,cognitive)
 for(const unit of calculated.units)if(unit.kind!=='FORM'&&!resultMetrics(unit).some(m=>m.value!==null))throw new Error('试运行没有生成有效评分指标：'+unit.instrumentKey)
 const report=a.unit?renderGovernedUnitReport(a,calculated.units[0]):a.packageReport?renderPackageReport(a.packageReport,a.components,calculated,Object.fromEntries(entries.map(c=>[c.slotKey,c.slotKey]))):null
 if((a.report||a.packageReport)&&!report)throw new Error('已配置报告但试运行没有生成报告')
 const result={synthetic:true,caseIndex:index,answers,rawCognitive,calculated,report}
 return {result,hash:canonicalHash(result)}
}
