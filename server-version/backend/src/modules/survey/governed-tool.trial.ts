import {readFrozenBundleProductionDefinition} from '../bundle-product/definition-provider'
import {buildSurveyCognitiveReportSnapshot} from './cognitive-bundle-report'
import type {FrozenSurveyCognitive} from './cognitive.definition'
import {computeSurveyNativeReports} from '../bundle-product/survey-native'
import {canonicalHash} from '../assessment-runtime/canonical'
import {gonogoSequence,corsiSequence,digitBackwardSequence} from '../cognitive/randomization'
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
import {SURVEY_NATIVE_SJT_PROTOCOL} from './situational-native.contract'
import {computeGovernedNativeTrial} from './governed-tool.native-trial'
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
export function syntheticCognitiveTrials(seed:string,index=1,frozen?:FrozenSurveyCognitive){
 if(frozen?.schemaVersion===2&&['digitbackward','corsi'].includes(frozen.sessionSnapshot.testType)){
  const c=frozen.sessionSnapshot.config as Record<string,number>,backward=frozen.sessionSnapshot.testType==='digitbackward',start=c.startSpan,maximum=c.maxSpan,stop=Math.min(maximum,start+index+1)
  const trials:ReturnType<typeof createTrialEnvelope>[]=[]
  for(let level=start;level<=stop;level++)for(let within=1;within<=c.trialsPerLevel;within++){
   const trialIndex=trials.length,sequence=backward?digitBackwardSequence(seed,trialIndex,level):corsiSequence(seed,trialIndex,level,c.boardSize),response=level===stop&&stop<maximum?[]:backward?[...sequence].reverse():[...sequence]
   trials.push(createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*10000,endedAtPerfMs:trialIndex*10000+8000,payload:{spanLength:level,trialWithinLevel:within,sequence,response,responseDurationMs:1500,interrupted:false}}))
  }
  return trials
 }
 return gonogoSequence(seed,120,.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1300,endedAtPerfMs:trialIndex*1300+800,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?240+index*80:null,interrupted:false}}))}
export function syntheticUnitAnswers(unit:ResearchFrozenUnit,index:number):Record<string,unknown>{
 if(unit.kind==='FORM')return syntheticFormAnswers(unit.displayDefinition as FormDraft,index)
 if(unit.kind==='COGNITIVE')return {}
 if(unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL)return {}
 if(unit.kind==='SCALE'){
  const display=readSurveyScalePresentation(unit.displayDefinition)
  return Object.fromEntries(display.items.map(item=>{const options=scalePresentationOptions(display,item);return [item.itemKey,options[Math.floor((options.length-1)*index/2)].optionKey]}))
 }
 return Object.fromEntries(surveySjtQuestions(unit.displayDefinition as AnySjtDraft).map(q=>{const options=q.options.map(o=>o.optionKey),pick=options[Math.min(index,options.length-1)];return [q.questionKey,q.responseType==='MULTIPLE'?options.slice(0,q.minSelections??1):pick]}))
}
export function computeGovernedTrial(a:GovernedArtifact,toolId:string,index:number){
 const entries=a.unit?[{slotKey:'tool',unit:a.unit}]:a.components
 const frozenAt=new Date().toISOString()
 const units=entries.map((c,i)=>{const unit=snapshotUnit(c.unit,toolId+'-'+i,c.slotKey);return unit.nativeSituational?{...unit,nativeSituational:{...unit.nativeSituational,attemptEpoch:1 as const,frozenAt}}:unit}),answers:Record<string,unknown>={},timings:Record<string,unknown>={},cognitive=new Map<string,FrozenUnitResult>(),rawCognitive:Record<string,unknown>={},native=new Map<string,FrozenUnitResult>(),rawNative:Record<string,unknown>={}
 for(const unit of units){
  answers[unit.instrumentKey]=syntheticUnitAnswers(unit,index)
  if(unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL){const trial=computeGovernedNativeTrial(unit,index);native.set(unit.instrumentKey,trial.unitResult);rawNative[unit.instrumentKey]=trial.evidence}
  if(unit.kind==='SCALE'&&(unit.displayDefinition as {presentationMode?:string}).presentationMode==='ONE_BY_ONE')timings[unit.instrumentKey]=Object.fromEntries(readSurveyScalePresentation(unit.displayDefinition).items.map(i=>[i.itemKey,{schemaVersion:1,firstResponseMs:1000,activeTimeMs:1500,changeCount:0,visits:1,revisitCount:0,interrupted:false,recoveredWithoutClock:false}]))
  if(unit.kind==='COGNITIVE'){
   const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition),seed='survey-governance-synthetic:'+toolId+':'+index,trials=syntheticCognitiveTrials(seed,index,frozen)
   const scored=runAuthoritativeScorer({definition:surveyCognitiveTaskDefinition(frozen),session:frozen.sessionSnapshot,trials,randomSeed:seed})
   const reportSnapshot=frozen.schemaVersion===2?buildSurveyCognitiveReportSnapshot(frozen,scored,new Date('2026-11-01T00:00:00Z'),trials):undefined
   const binding=a.nativeBundle?.cognitiveReports?.[unit.instrumentKey]
   if(binding&&a.nativeBundle)unit.nativeBundleCognitiveReport={definitionHash:a.nativeBundle.source.definitionHash,...binding}
   const reference={slotKey:unit.instrumentKey,epoch:1,resultId:'00000000-0000-4000-8000-000000000001',resultHash:canonicalHash(scored),measurementDigest:frozen.measurementDigest}
   const loaded={reference,result:{...scored,...(reportSnapshot?{reportSnapshot,profileArtifactHash:frozen.schemaVersion===2?frozen.artifactHash:undefined,profile:reportSnapshot.profile,configHash:frozen.sessionSnapshot.configHash}:{}),engineVersion:frozen.sessionSnapshot.engineVersion,scoringVersion:frozen.sessionSnapshot.scoringVersion,protocolSignature:frozen.sessionSnapshot.protocolSignature}} as unknown as LoadedSurveyCognitiveResult
   cognitive.set(unit.instrumentKey,cognitiveParentUnit(unit,loaded));rawCognitive[unit.instrumentKey]={synthetic:true,trialCount:trials.length,trials}
  }
 }
 // Synthetic trial DOB is explicit and within the source-owned population;
 // production participants never use this generator or receive a default DOB.
 if(a.nativeBundle){
  const definition=readFrozenBundleProductionDefinition(a.nativeBundle.definition).bundleSnapshot.bundleDefinition
  const birthKeys=new Set(definition.slots.flatMap(s=>s.admissionContext?.birthYearMonthContextKey?[s.admissionContext.birthYearMonthContextKey]:[]))
  const age=definition.population.subjectMinAgeYears??Math.min(18,definition.population.subjectMaxAgeYears??18),at=new Date(frozenAt)
  const dob=String(at.getUTCFullYear()-age).padStart(4,'0')+'-'+String(at.getUTCMonth()+1).padStart(2,'0')
  for(const binding of a.nativeBundle.source.context)if(birthKeys.has(binding.contextKey)){
   const raw=answers[binding.slotKey]
   if(raw&&typeof raw==='object'&&!Array.isArray(raw))(raw as Record<string,unknown>)[binding.itemKey]=dob
  }
 }
 const publication:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'isolated-trial',waveId:'isolated-trial',collectionMode:'SINGLE_UNLINKED',consentVersion:1,linkageNoticeConfirmed:false,consentDigest:canonicalHash('synthetic'),units,runtimeStatus:'SURVEY_FINAL_V1'}
 if(a.nativeBundle)publication.governedPackages=[{schemaVersion:1,importId:toolId,toolId,hash:canonicalHash(a),title:a.title,family:'BUNDLE',parentGrantId:'trial-only',report:null,nativeBundle:a.nativeBundle,slots:entries.map(c=>({slotKey:c.slotKey,draftId:units.find(u=>u.instrumentKey===c.slotKey)!.draftId,instrumentKey:c.slotKey,kind:c.unit.ref.kind}))}]
 // The same controlled child scorer and parent FINAL closure, without creating a human Attempt.
 const calculated=verifySurveyFinalPublication(publication,canonicalHash(publication))!.compute(answers,null,undefined,'FINAL',Object.keys(timings).length?timings:undefined,cognitive,native,new Date(frozenAt))
 if(a.nativeBundle){calculated.nativeBundleReports=computeSurveyNativeReports(publication,calculated);if(calculated.nativeBundleReports.some(r=>r.status==='FAILED'))throw new Error('原生整包综合报告试运行失败')}
 for(const unit of calculated.units)if(unit.kind!=='FORM'&&!resultMetrics(unit).some(m=>m.value!==null))throw new Error('试运行没有生成有效评分指标：'+unit.instrumentKey)
 const report=a.unit?renderGovernedUnitReport(a,calculated.units[0]):a.packageReport?renderPackageReport(a.packageReport,a.components,calculated,Object.fromEntries(entries.map(c=>[c.slotKey,c.slotKey]))):null
 if((a.report||a.packageReport)&&!report)throw new Error('已配置报告但试运行没有生成报告')
 const result={synthetic:true,caseIndex:index,answers,rawCognitive,rawNative,calculated,report}
 return {result,hash:canonicalHash(result)}
}
