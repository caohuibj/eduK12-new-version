import {describe,expect,it,vi} from 'vitest'
import {describeWave} from '../../modules/survey/analytics.descriptive'
import {describeSurveyWaveItemPaged} from '../../modules/survey/analytics.paged'
import {loadSurveySource,type SurveySourceProjection} from '../../modules/survey/analytics.source'

vi.mock('../../modules/survey/analytics.source',()=>({loadSurveySource:vi.fn()}))
const options=[
  {code:'rea0',label:'冻结选项：愿意'},
  {code:'rea1',label:'冻结选项：不愿意'},
  {code:'rea2',label:'冻结选项：暂不确定'},
]
function source(responseType:string,value:string):SurveySourceProjection{
  const itemKey=responseType.startsWith('MATRIX')?'question:row':'question'
  const columnKey='W001__form__question__synthetic'
  return {projectId:'project',collectionMode:'SINGLE_UNLINKED',completeAttempts:1,sourceFinalCount:1,
    sourceRevision:1,cutOff:'2026-11-26T00:00:00Z',scores:[],scoreColumns:[],attendance:[],
    codebook:[{columnKey,waveId:'wave',waveOrdinal:1,instrumentKey:'form',itemKey,
      kind:'FORM',responseType,title:'Synthetic',prompt:'冻结题目',options:options.map(option=>({...option})),
      definitionDigest:'a'.repeat(64),scoringDigest:null,publicationVersion:1,instrumentRevision:1}],
    raw:[{projectId:'project',waveId:'wave',waveOrdinal:1,attemptId:'attempt',researchCode:null,
      sourceFinalHash:'b'.repeat(64),instrumentKey:'form',kind:'FORM',responseType,itemKey,columnKey,
      publicationVersion:1,value,missingReason:null,completedAt:'2026-11-26T00:00:00Z',sourceVerified:true}],
  }
}
describe('Survey statistics carry frozen option labels beside stable frequency values',()=>{
  it.each([
    {type:'SINGLE',value:'rea0',frequencies:{rea0:1}},
    {type:'MULTIPLE',value:'["rea1","rea0"]',frequencies:{rea0:1,rea1:1}},
    {type:'LIKERT',value:'rea1',frequencies:{rea1:1}},
    {type:'MATRIX',value:'rea2',frequencies:{rea2:1}},
    {type:'RANK_ORDER',value:'["rea2","rea0","rea1"]',frequencies:{'rea2@rank1':1,'rea0@rank2':1,'rea1@rank3':1}},
    {type:'MATRIX_MULTIPLE',value:'["rea0","rea2"]',frequencies:{rea0:1,rea2:1}},
  ])('adds labels without rewriting $type raw keys, ranks or counts',async({type,value,frequencies})=>{
    const data=source(type,value)
    vi.mocked(loadSurveySource).mockResolvedValue(data)
    const full=describeWave(data,'wave').items[0]
    const paged=await describeSurveyWaveItemPaged({actorUserId:'owner',projectId:'project',waveId:'wave',instrumentKey:'form',itemKey:data.codebook[0].itemKey})
    for(const result of [full,paged]){
      expect(result).toHaveProperty('options',options)
      expect(Object.fromEntries(result.frequencies.map(row=>[row.value,row.count]))).toEqual(frequencies)
      expect(result.frequencies.every(row=>Object.keys(row).sort().join(',')==='count,value')).toBe(true)
    }
    if(type==='MULTIPLE')expect(full.combinationFrequencies).toEqual([{value:'["rea0","rea1"]',count:1}])
    expect(data.raw[0].value).toBe(value)
    full.options[0].label='caller mutation'
    expect(data.codebook[0].options[0].label).toBe(options[0].label)
    expect(paged.options[0].label).toBe(options[0].label)
  })
})
