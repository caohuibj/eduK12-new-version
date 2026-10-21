import {describe,it,expect} from 'vitest'
import {adaptCatalogScale,catalogAdapterForRecheck} from '../../modules/survey/catalog.sources'
import {canonicalScalePresentation,readSurveyScalePresentation,scalePresentationOptions} from '../../modules/survey/catalog-scale.presentation'
import {assertSurveyDraft} from '../../modules/survey/builder.definition'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {computeSurveyFinal,validateSurveyUnitAnswers} from '../../modules/survey/final.compute'
import {scoreScale} from '../../modules/scale/scale-scoring'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import type {ResearchFrozenPublication,ResearchFrozenUnit} from '../../modules/survey/publication.service'

function source(){
  const definition=compileResearchScale('Canonical',{schemaVersion:1,respondentType:'participant_self_report',
    responseOptions:[{optionKey:'low',label:'Low',score:0},{optionKey:'high',label:'High',score:2}],
    dimensions:[{dimensionKey:'sum',label:'Sum',direction:'descriptive'}],aggregation:'sum',
    items:[{itemKey:'content',prompt:'Content',required:true,reverse:true,dimensionKeys:['sum']}]})
  definition.responseSets[0].options=[{value:'1',label:'String one',score:0},{value:1,label:'Number one',score:2}]
  definition.responseSets.push({key:'quality',options:[{value:'yes',label:'Quality yes',score:900},{value:'no',label:'Quality no',score:800}]})
  definition.items.push({...definition.items[0],itemCode:'quality',content:'Quality',sortOrder:1,
    purpose:'CONTENT',required:false,responseSetKey:'quality'})
  definition.scoring.itemRules.push({itemCode:'quality',transform:{type:'identity'}})
  definition.items[0].images=[{asset:{assetId:'00000000-0000-4000-8000-000000000001',contentHash:'a'.repeat(64),mimeType:'image/png'},altText:'Stimulus',order:0}]
  definition.items[0].video={schemaVersion:1,video:{assetId:'00000000-0000-4000-8000-000000000002',contentHash:'b'.repeat(64),mimeType:'video/mp4'},transcript:{language:'en',text:'Frozen transcript'}}
  return definition
}
function customSource(){
  const definition=source()
  definition.responseSets=definition.responseSets.slice(0,1)
  definition.items[1]={...definition.items[1],purpose:'ATTENTION_CHECK',attentionTarget:'1',required:true,responseSetKey:definition.responseSets[0].key}
  return definition
}
// STANDARD here is only the adapter validation contract, not registry authorization.
function imported(definition=source(),instrumentClass:'STANDARD'|'CUSTOM_DESCRIPTIVE'='STANDARD'){
  const snapshot=adaptCatalogScale({kind:'SCALE',sourceId:'library:approved',sourceVersion:'1'},'Canonical',definition,
    {instrumentClass,presentationMode:'ALL_AT_ONCE'})
  const unit:ResearchFrozenUnit={draftId:'draft',instrumentKey:'scale',kind:'SCALE',title:'Canonical',draftRevision:1,
    sourceDigest:snapshot.definitionDigest,scoringDigest:snapshot.scoringDigest,compiledDefinition:snapshot.compiledDefinition,
    displayDefinition:snapshot.displayDefinition,sourceAnswerMapping:snapshot.answerMapping}
  const publication:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'p',waveId:'w',collectionMode:'SINGLE_UNLINKED',
    consentVersion:1,linkageNoticeConfirmed:false,consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',units:[unit]}
  return {definition,snapshot,unit,publication}
}
describe('canonical read-only Scale consumption',()=>{
  it('retains exact canonical bytes, mixed typed response sets, media, purpose and source mode without admitting native editing',()=>{
    const {definition,snapshot}=imported(),display=readSurveyScalePresentation(snapshot.displayDefinition)
    expect(snapshot.compiledDefinition).toEqual(definition)
    expect(snapshot.definitionDigest).toBe(canonicalHash(definition))
    expect(display.presentationMode).toBe('ALL_AT_ONCE')
    expect(display.items[0]).toMatchObject({reverse:true,images:definition.items[0].images,video:definition.items[0].video})
    expect(display.items[1]).toMatchObject({purpose:'CONTENT',required:false,dimensionKeys:[]})
    expect(scalePresentationOptions(display,display.items[0]).map(o=>o.optionKey)).toEqual(['o_0','o_1'])
    expect(scalePresentationOptions(display,display.items[1]).map(o=>o.optionKey)).toEqual(['o_1_0','o_1_1'])
    expect(snapshot.answerMapping?.options).toEqual({o_0:'1',o_1:1,o_1_0:'yes',o_1_1:'no'})
    expect(()=>assertSurveyDraft('SCALE',display,true)).toThrow()
    expect(canonicalScalePresentation(definition,'ONE_BY_ONE').display.presentationMode).toBe('ONE_BY_ONE')
  })
  it('uses the original scorer for string/number values, reverse transforms and unscored optional content',()=>{
    const {definition,publication}=imported()
    for(const [key,value] of [['o_0','1'],['o_1',1]] as const){
      const result=computeSurveyFinal(publication,{scale:{i_0:key,i_1:'o_1_0'}}).units[0]
      expect(result.privateScoring).toEqual(scoreScale(definition,{content:value,quality:'yes'}))
      expect(result.rawAnswers).toEqual({i_0:key,i_1:'o_1_0'})
    }
  })
  it('records optional omission, rejects a different item response set, and retains required checks',()=>{
    const {publication,unit}=imported()
    const result=computeSurveyFinal(publication,{scale:{i_0:'o_1'}}).units[0]
    expect(result.missing).toEqual([{itemKey:'i_1',reason:'SHOWN_MISSING'}])
    expect(validateSurveyUnitAnswers(unit,{i_0:'o_1'}).missing).toEqual(result.missing)
    expect(()=>computeSurveyFinal(publication,{scale:{i_0:'o_1_0'}})).toThrow()
    expect(()=>computeSurveyFinal(publication,{scale:{i_1:'o_1_0'}})).toThrow()
  })
  it('preserves valid CUSTOM shared typed options and unscored required quality items through the real adapter',()=>{
    const {definition,snapshot,publication}=imported(customSource(),'CUSTOM_DESCRIPTIVE')
    const display=readSurveyScalePresentation(snapshot.displayDefinition)
    expect(snapshot.compiledDefinition).toEqual(definition)
    expect(display.items[1]).toMatchObject({purpose:'ATTENTION_CHECK',required:true,attentionTarget:'o_0',dimensionKeys:[]})
    expect(scalePresentationOptions(display,display.items[1]).map(option=>option.optionKey)).toEqual(['o_0','o_1'])
    for(const [option,value] of [['o_0','1'],['o_1',1]] as const){
      const result=computeSurveyFinal(publication,{scale:{i_0:option,i_1:'o_0'}}).units[0]
      expect(result.privateScoring).toEqual(scoreScale(definition,{content:value,quality:'1'}))
      expect(result.rawAnswers).toEqual({i_0:option,i_1:'o_0'})
      const changedQuality=computeSurveyFinal(publication,{scale:{i_0:option,i_1:'o_1'}}).units[0]
      expect(changedQuality.privateScoring).toMatchObject({scores:scoreScale(definition,{content:value,quality:'1'}).scores})
    }
  })
  it('rejects unsupported CUSTOM multiple response sets and optional items instead of silently flattening them',()=>{
    const ref={kind:'SCALE' as const,sourceId:'library:approved',sourceVersion:'1'}
    const multiple=customSource();multiple.responseSets.push({key:'extra',options:[{value:'yes',label:'Yes',score:1},{value:'no',label:'No',score:0}]})
    expect(()=>adaptCatalogScale(ref,'Canonical',multiple,{instrumentClass:'CUSTOM_DESCRIPTIVE'})).toThrow('SOURCE_SCALE_INVALID')
    const optional=customSource();optional.items[1].required=false
    expect(()=>adaptCatalogScale(ref,'Canonical',optional,{instrumentClass:'CUSTOM_DESCRIPTIVE'})).toThrow('SOURCE_SCALE_INVALID')
  })
  it('rechecks historical V1 grants under their original presentation without rewriting them',()=>{
    const definition=source();definition.items=definition.items.slice(0,1)
    delete definition.items[0].images;delete definition.items[0].video
    definition.responseSets=definition.responseSets.slice(0,1)
    definition.scoring.itemRules=definition.scoring.itemRules.filter(rule=>rule.itemCode==='content')
    const current=adaptCatalogScale({kind:'SCALE',sourceId:'source',sourceVersion:'1'},'Canonical',definition)
    const stored={...current,adapterVersion:'survey-catalog-v1' as const,displayDefinition:{schemaVersion:1,
      presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',
      responseOptions:[{optionKey:'o_0',label:'String one',score:0},{optionKey:'o_1',label:'Number one',score:2}],
      dimensions:[{dimensionKey:'d_0',label:'Sum',direction:'descriptive'}],aggregation:'sum',
      items:[{itemKey:'i_0',prompt:'Content',required:true,reverse:true,dimensionKeys:['d_0']}]}}
    const before=structuredClone(stored)
    expect(catalogAdapterForRecheck(current,stored)).toEqual(stored)
    expect(stored).toEqual(before)
    expect(catalogAdapterForRecheck(current,current)).toBe(current)
    const changed=structuredClone(current);(changed.compiledDefinition as typeof definition).items[0].content='Changed source'
    expect(canonicalHash(catalogAdapterForRecheck(changed,stored))).not.toBe(canonicalHash(stored))
  })
  it('does not erase unsupported randomization or response mechanics',()=>{
    const definition=customSource(),ref={kind:'SCALE' as const,sourceId:'library:approved',sourceVersion:'1'}
    definition.items[0].randomizeOptions=true
    expect(()=>adaptCatalogScale(ref,'Canonical',definition,{instrumentClass:'CUSTOM_DESCRIPTIVE'})).toThrow('RANDOMIZATION_RUNTIME_UNSUPPORTED')
    definition.items[0].randomizeOptions=false;definition.items[0].type='multiple'
    expect(()=>adaptCatalogScale(ref,'Canonical',definition,{instrumentClass:'CUSTOM_DESCRIPTIVE'})).toThrow('RESPONSE_TYPE_RUNTIME_UNSUPPORTED')
  })
})
