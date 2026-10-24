import {beforeEach,describe,expect,it,vi} from 'vitest'
vi.mock('../../modules/survey/admission.service',()=>({verifiedSurveyAttempt:vi.fn()}))
vi.mock('../../modules/survey/flow.assignment',()=>({assignedSurveySnapshot:vi.fn(snapshot=>snapshot),ensureSurveyFlowAssignment:vi.fn()}))
vi.mock('../../modules/survey/cognitive.service',()=>({readSurveyCognitiveProgressFromVerifiedAttempt:vi.fn()}))
import {getOwnResearchTask} from '../../modules/survey/task.public'
import {verifiedSurveyAttempt} from '../../modules/survey/admission.service'
import type {CatalogScalePresentation} from '../../modules/survey/catalog-scale.presentation'

const options=[{optionKey:'a',label:'第一项',score:1},{optionKey:'b',label:'第二项',score:2}]
const proof={publicId:'public',attemptId:'attempt',accessCredential:'proof'}
function own(display:unknown){
  vi.mocked(verifiedSurveyAttempt).mockResolvedValue({status:'STARTED',attemptId:'attempt',waveId:'wave',definitionDigest:'digest',compiledSnapshot:{units:[{kind:'SCALE',instrumentKey:'scale',title:'合成量表',displayDefinition:display}]}} as never)
}
function catalog():CatalogScalePresentation{return {schemaVersion:1,runtime:'CANONICAL_SCALE_V1',presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',randomizeItems:false,responseOptions:options,items:[{itemKey:'i1',prompt:'合成题',required:true,reverse:false,dimensionKeys:['d'],responseOptions:options.map(o=>({...o})),randomizeOptions:false}]}}
beforeEach(()=>vi.clearAllMocks())
describe('Survey public shared response options',()=>{
  it('omits repeated native options without leaking private scores or dimensions',async()=>{
    own({schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',responseOptions:options,dimensions:[{dimensionKey:'d',label:'合成',direction:'descriptive'}],aggregation:'mean',items:[{itemKey:'i1',prompt:'合成题',required:true,reverse:true,dimensionKeys:['d']}]})
    const task=await getOwnResearchTask(proof),scale=task.units[0]
    expect(verifiedSurveyAttempt).toHaveBeenCalledWith(proof)
    expect(scale).toMatchObject({responseOptions:options.map(({optionKey,label})=>({optionKey,label})),items:[{itemKey:'i1',prompt:'合成题',required:true}]})
    expect(scale.items![0]).not.toHaveProperty('responseOptions')
    for(const privateKey of ['score','reverse','dimensionKeys','aggregation'])expect(JSON.stringify(task)).not.toContain('"'+privateKey+'"')
  })
  it('omits identical projected catalog options without changing the frozen definition',async()=>{
    const display=catalog(),before=structuredClone(display);own(display)
    const task=await getOwnResearchTask(proof)
    expect(task.units[0].items![0]).not.toHaveProperty('responseOptions')
    expect(display).toEqual(before)
  })
  it.each(['label','optionKey','order','length'])('retains an item-specific %s override',async difference=>{
    const display=catalog(),item=display.items[0]
    if(difference==='label')item.responseOptions[0].label='另一标签'
    if(difference==='optionKey')item.responseOptions[0].optionKey='another'
    if(difference==='order')item.responseOptions.reverse()
    if(difference==='length')item.responseOptions.pop()
    own(display);const task=await getOwnResearchTask(proof)
    expect(task.units[0].items![0].responseOptions).toEqual(item.responseOptions.map(({optionKey,label})=>({optionKey,label})))
  })
  it('never projects a task when current participant proof is rejected',async()=>{
    vi.mocked(verifiedSurveyAttempt).mockRejectedValue(new Error('revoked'))
    await expect(getOwnResearchTask(proof)).rejects.toThrow('revoked')
  })
})


describe('Survey task unit material projection',()=>{
  const material={asset:{assetId:'a8d5f8ce-4c34-4be0-96d6-9a3100030303',contentHash:'a'.repeat(64),mimeType:'image/png'},
    name:'Study material',caption:'Read this',rightsStatus:'authorized',rightsNote:'PRIVATE CONTRACT'}
  it('preserves public materials without leaking rights or mutating the frozen source',async()=>{
    const display={...catalog(),materials:[material]},before=structuredClone(display);own(display)
    const task=await getOwnResearchTask(proof)
    expect(task.units[0].materials).toEqual([{asset:material.asset,name:material.name,caption:material.caption}])
    expect(JSON.stringify(task)).not.toContain('PRIVATE CONTRACT');expect(display).toEqual(before)
  })
  it('omits empty materials and still rejects duplicate or invalid lists',async()=>{
    own({...catalog(),materials:[]});expect((await getOwnResearchTask(proof)).units[0]).not.toHaveProperty('materials')
    own({...catalog(),materials:[material,material]});await expect(getOwnResearchTask(proof)).rejects.toThrow()
    own({...catalog(),materials:[{...material,rightsStatus:'INVALID'}]});await expect(getOwnResearchTask(proof)).rejects.toThrow()
  })
})
