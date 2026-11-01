import {describe,it,expect} from 'vitest'
import {createCustomScaleDefinition,validateScaleDefinition,runnerDefinition} from '../../modules/scale/scale-definition'
import {scoreScale,missingRequiredScaleItemCodes,validateScaleAnswers} from '../../modules/scale/scale-scoring'
import {buildScaleResult} from '../../modules/scale/scale-result'
import {adaptCatalogScale} from '../../modules/survey/catalog.sources'
import {computeSurveyFinal} from '../../modules/survey/final.compute'
import type {ResearchFrozenPublication,ResearchFrozenUnit} from '../../modules/survey/publication.service'
import {rawLongExport} from '../../modules/survey/analytics.raw-export'
import type {SurveySourceProjection} from '../../modules/survey/analytics.source'

// Synthetic engineering fixture: nine scored single-choice items and a distinct
// unscored question. No clinical item text, thresholds or risk classification.
const notice='独立支持说明始终可见；未完整作答也可以求助，不由总分推断风险。'
function definition(){
 const d=createCustomScaleDefinition()
 d.responseSets=[{key:'symptoms',options:[0,1,2,3].map(value=>({value,label:String(value),score:value}))},
  {key:'function',options:['none','some','very','extreme'].map(value=>({value,label:'功能回答 '+value,score:0}))}]
 d.items=Array.from({length:9},(_,i)=>({itemCode:'Q'+(i+1),content:'合成症状题 '+(i+1),type:'single',required:true,sortOrder:i+1,responseSetKey:'symptoms',randomizeOptions:false}))
 d.items.push({itemCode:'function',content:'合成不计分功能题',type:'single',required:false,sortOrder:10,responseSetKey:'function',randomizeOptions:false,purpose:'UNSCORED'})
 d.scoring={scoringVersion:'1.0.0',defaultMissingPolicy:{type:'complete_required'},itemRules:d.items.slice(0,9).map(item=>({itemCode:item.itemCode,transform:{type:'identity'}})),
  scores:[{key:'raw_total',type:'total',label:'九题原始分',direction:'higher_is_more',canonical:true,displayPrecision:0,source:{type:'items',items:d.items.slice(0,9).map(item=>({itemCode:item.itemCode,weight:1})),aggregation:'sum'}}]}
 d.report={reportVersion:'1.0.1',primaryScoreKeys:['raw_total'],scoreOrder:['raw_total'],interpretations:[{scoreKey:'raw_total',headline:'症状自述',source:{type:'score_only'},summary:'九题相加；额外功能题不计分。',bands:[],guidance:[]}],limitations:['无常模或诊断'],disclaimer:notice}
 return d
}
const symptoms=()=>Object.fromEntries(Array.from({length:9},(_,i)=>['Q'+(i+1),1]))
describe('unscored standard single-choice supplement',()=>{
 it('validates a STANDARD supplement and never creates an item score or denominator for it',()=>{
  const d=definition()
  expect(validateScaleDefinition(d,{instrumentClass:'STANDARD'}).issues.filter(x=>x.severity==='error')).toEqual([])
  for(const value of [undefined,'none','some','very','extreme']){
   const answers={...symptoms(),...(value===undefined?{}:{function:value})}
   const out=scoreScale(d,answers)
   expect(out.scores[0]).toMatchObject({value:9,range:{min:0,max:27},expectedItems:d.items.slice(0,9).map(i=>i.itemCode),status:'calculated'})
   expect(out.itemScores.map(i=>i.itemCode)).toEqual(d.items.slice(0,9).map(i=>i.itemCode))
   expect(out.quality).toEqual({status:'interpretable',flags:[]})
  }
  expect(missingRequiredScaleItemCodes(d,Object.entries(symptoms()).map(([itemCode,responseValue])=>({itemCode,responseValue})))).toEqual([])
  expect(()=>validateScaleAnswers(d,[{itemCode:'function',responseValue:'not-an-option'}])).toThrow()
 })
 it('rejects scoring/transform misuse and keeps the existing STANDARD quality-item restriction',()=>{
  const d=definition();d.scoring.scores[0].source.items.push({itemCode:'function',weight:1})
  expect(validateScaleDefinition(d,{instrumentClass:'STANDARD'}).issues.some(i=>i.message.includes('不计分附加题不能纳入'))).toBe(true)
  expect(()=>scoreScale(d,{...symptoms(),function:'extreme'})).toThrow('不计分附加题不能纳入计分')
  const reversed=definition();reversed.scoring.itemRules.push({itemCode:'function',transform:{type:'reverse'}})
  expect(validateScaleDefinition(reversed).issues.some(i=>i.path==='scoring.itemRules.9.transform')).toBe(true)
  const quality=definition();quality.items[9].purpose='SOCIAL_DESIRABILITY'
  expect(validateScaleDefinition(quality,{instrumentClass:'STANDARD'}).issues.some(i=>i.message==='标准量表不得添加自编质量题')).toBe(true)
 })
 it('retains the typed answer through canonical Survey FINAL without scoring it, including an omitted optional answer',()=>{
  const d=definition(),s=adaptCatalogScale({kind:'SCALE',sourceId:'synthetic-source',sourceVersion:'1'},'Synthetic',d,{instrumentClass:'STANDARD',presentationMode:'ALL_AT_ONCE',instruction:notice})
  const unit:ResearchFrozenUnit={draftId:'draft',instrumentKey:'scale',kind:'SCALE',title:'Synthetic',draftRevision:1,sourceDigest:s.definitionDigest,scoringDigest:s.scoringDigest,compiledDefinition:s.compiledDefinition,displayDefinition:s.displayDefinition,sourceAnswerMapping:s.answerMapping,instruction:s.instruction}
  const publication:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'p',waveId:'w',collectionMode:'SINGLE_UNLINKED',consentVersion:1,linkageNoticeConfirmed:false,consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',units:[unit]}
  const display=s.displayDefinition as {items:Array<{itemKey:string;purpose?:string;responseOptions:Array<{optionKey:string}>}>},answers=Object.fromEntries(display.items.slice(0,9).map(i=>[i.itemKey,i.responseOptions[1].optionKey])),functional=display.items[9]
  expect(functional.purpose).toBe('UNSCORED');expect(unit.instruction).toBe(notice)
  for(const include of [false,true]){
   const input={...answers,...(include?{[functional.itemKey]:functional.responseOptions[3].optionKey}:{})},result=computeSurveyFinal(publication,{scale:input}),scored=result.units[0].privateScoring as ReturnType<typeof scoreScale>
   expect(scored.scores[0].value).toBe(9);expect(scored.itemScores).toHaveLength(9)
   expect(result.units[0].rawAnswers).toEqual(input)
  }
  expect(runnerDefinition(d).items[9]).toMatchObject({itemCode:'function',required:false,options:[{value:'none',label:'功能回答 none'},{value:'some',label:'功能回答 some'},{value:'very',label:'功能回答 very'},{value:'extreme',label:'功能回答 extreme'}]})
 })
 it('keeps support outside interpretation gating when a symptom is missing and does not invent an intent/risk label',()=>{
  const d=definition(),answers=Object.entries(symptoms()).filter(([key])=>key!=='Q1').map(([itemCode,responseValue])=>({itemCode,responseValue}))
  const r=buildScaleResult({scaleId:'synthetic',instrumentKey:'synthetic',instrumentVersion:'1.0.0',name:'Synthetic',definition:d,answers:[...answers,{itemCode:'function',responseValue:'extreme'}]})
  expect(r.scores[0].value).toBeNull();expect(r.interpretations).toEqual([]);expect(r.references).toEqual([]);expect(r.disclaimer).toBe(notice)
  expect(r.itemScores.some(i=>i.itemCode==='function')).toBe(false)
 })
 it('labels an unscored raw answer in the existing research export rather than presenting it as a content score',()=>{
  const source={projectId:'p',collectionMode:'SINGLE_UNLINKED',cutOff:'2026-11-01T00:00:00Z',attendance:[],scores:[],
   codebook:[{columnKey:'function',waveId:'w',waveOrdinal:1,instrumentKey:'s',itemKey:'function',kind:'SCALE',responseType:'LIKERT',title:'Synthetic',prompt:'Unscored supplement',options:[{code:'some',label:'Some difficulty'}],definitionDigest:'d',scoringDigest:'s',publicationVersion:1,instrumentRevision:1,purpose:'UNSCORED'}],
   raw:[{projectId:'p',waveId:'w',waveOrdinal:1,attemptId:'synthetic',researchCode:null,sourceFinalHash:'f',instrumentKey:'s',kind:'SCALE',responseType:'LIKERT',itemKey:'function',columnKey:'function',publicationVersion:1,value:'some',missingReason:null,completedAt:'2026-11-01T00:00:00Z',sourceVerified:true}]} as SurveySourceProjection
  const out=rawLongExport('p',source)
  expect(out.csv.split('\n')[0]).toContain('item_purpose');expect(out.csv).toContain('UNSCORED')
  expect(out.codebook[0]).toMatchObject({purpose:'UNSCORED',options:[{code:'some',label:'Some difficulty'}]})
 })
})
