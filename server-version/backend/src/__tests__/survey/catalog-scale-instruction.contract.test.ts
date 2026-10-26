import {describe,expect,it} from 'vitest'
import {adaptCatalogScale} from '../../modules/survey/catalog.sources'
import {snapshotUnit} from '../../modules/survey/governed-tool.model'
import {compileResearchScale} from '../../modules/survey/builder.compiler'

function source(){
  return compileResearchScale('Canonical',{schemaVersion:1,respondentType:'participant_self_report',
    responseOptions:[{optionKey:'low',label:'Low',score:0},{optionKey:'high',label:'High',score:2}],
    dimensions:[{dimensionKey:'sum',label:'Sum',direction:'descriptive'}],aggregation:'sum',
    items:[{itemKey:'content',prompt:'Content',required:true,reverse:true,dimensionKeys:['sum']}]})
}

describe('frozen administration instruction threading through the Survey catalog',()=>{
  const definition=source()
  it('carries the source instruction on the catalog snapshot without touching the definition digest',()=>{
    const without=adaptCatalogScale({kind:'SCALE',sourceId:'library:approved',sourceVersion:'1'},'Canonical',definition)
    const withText=adaptCatalogScale({kind:'SCALE',sourceId:'library:approved',sourceVersion:'1'},'Canonical',definition,{instruction:'请根据最近两周作答'})
    expect(without.instruction).toBeUndefined()
    expect(withText.instruction).toBe('请根据最近两周作答')
    expect(withText.definitionDigest).toBe(without.definitionDigest)
    expect(withText.scoringDigest).toBe(without.scoringDigest)
  })
  it('freezes the instruction into the governed unit',()=>{
    const snapshot=adaptCatalogScale({kind:'SCALE',sourceId:'library:approved',sourceVersion:'1'},'Canonical',definition,{instruction:'冻结版本指导语'})
    const unit=snapshotUnit(snapshot,'trial-unit','tool')
    expect(unit.instruction).toBe('冻结版本指导语')
  })
})


describe('approved exact combination instruction source',()=>{
 it('threads the frozen CONTENT source instruction into Survey and Training without reading a later registry default',async()=>{
  const {getScaleInstrumentSource}=await import('../../modules/scale/onboarding/instrument-registry')
  const {sourceParts,composeTriplet,tripletSnapshot,frozenTripletInstruction}=await import('../../modules/survey/standard-triplet.model')
  const {toolReference}=await import('../../modules/survey/tool-reference')
  const source=getScaleInstrumentSource('academic_self_concept_biology_zh_cn','1.0.0')!
  expect(source).toBeTruthy()
  const parts=Object.fromEntries(sourceParts(source.identity.instrumentKey,source.identity.instrumentVersion).map(p=>[p.axis,p])) as Parameters<typeof composeTriplet>[1]
  parts.CONTENT.reference=toolReference('SCALE',source.identity.instrumentKey,{...parts.CONTENT.reference.metadata,instruction:{schemaVersion:1,text:'This exact approved wording',language:'zh-CN',version:'instruction-approved-1',source:'Synthetic approved source'}})
  const triplet=composeTriplet(source.identity.instrumentKey,parts),content=triplet.parts.CONTENT
  expect(frozenTripletInstruction(triplet)).toMatchObject({text:'This exact approved wording',version:'instruction-approved-1',origin:'INSTRUMENT_SOURCE'})
  const snapshot=tripletSnapshot(triplet,'approved-release')
  expect(snapshot.instruction).toBe('This exact approved wording')
  expect(snapshotUnit(snapshot,'exact-unit','tool').instruction).toBe('This exact approved wording')
  content.reference.metadata.instruction={text:'Changed without approved source hash'}
  expect(()=>tripletSnapshot(triplet,'approved-release')).toThrow('STANDARD_CONTENT_REFERENCE_HASH_MISMATCH')
 })
})
