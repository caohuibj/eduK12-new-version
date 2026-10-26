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
