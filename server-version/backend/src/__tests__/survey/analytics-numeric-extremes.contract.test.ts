import {describe,expect,it,vi} from 'vitest'
import {describeWave} from '../../modules/survey/analytics.descriptive'
import {describeSurveyWaveItemPaged} from '../../modules/survey/analytics.paged'
import {loadSurveySource,type SurveySourceProjection} from '../../modules/survey/analytics.source'

vi.mock('../../modules/survey/analytics.source',()=>({loadSurveySource:vi.fn()}))
function source(values:number[]):SurveySourceProjection{
  const columnKey='W001__form__number__synthetic'
  return {projectId:'project',collectionMode:'SINGLE_UNLINKED',completeAttempts:values.length,
    sourceFinalCount:values.length,sourceRevision:1,cutOff:'2026-11-26T00:00:00Z',
    scores:[],scoreColumns:[],attendance:[],
    codebook:[{columnKey,waveId:'wave',waveOrdinal:1,instrumentKey:'form',itemKey:'number',
      kind:'FORM',responseType:'NUMBER',title:'Synthetic',prompt:'Number',options:[],
      definitionDigest:'a'.repeat(64),scoringDigest:null,publicationVersion:1,instrumentRevision:1}],
    raw:values.map((value,i)=>({projectId:'project',waveId:'wave',waveOrdinal:1,attemptId:'attempt-'+i,
      researchCode:null,sourceFinalHash:'b'.repeat(64),instrumentKey:'form',kind:'FORM',responseType:'NUMBER',
      itemKey:'number',columnKey,publicationVersion:1,value,missingReason:null,
      completedAt:'2026-11-26T00:00:00Z',sourceVerified:true})),
  }
}
describe('Survey numeric summaries preserve finite NUMBER answers',()=>{
  it('retains one scaled accumulator when an extreme value arrives on a later FINAL page',async()=>{
    const first={...source([1,3]),sourceFinalCount:4,nextFinalCursor:{id:'attempt-1',completedAt:'2026-11-26T00:00:00Z'}}
    const last={...source([1e308,1e308]),sourceFinalCount:4}
    last.raw.forEach((row,index)=>{row.attemptId='attempt-'+(index+2)})
    vi.mocked(loadSurveySource).mockReset().mockResolvedValueOnce(first).mockResolvedValueOnce(last)
    const paged=await describeSurveyWaveItemPaged({actorUserId:'owner',projectId:'project',waveId:'wave',instrumentKey:'form',itemKey:'number'})
    expect(paged).toMatchObject({analysisFinalCount:4,respondentN:4,numericMean:5e307,complete:true})
    expect(Number.isFinite(paged.numericSampleSd)).toBe(true)
    expect(loadSurveySource).toHaveBeenCalledTimes(2)
  })

  it.each([
    {values:[1e308,1e308],mean:1e308,sd:0},
    {values:[1e308,-1e308],mean:0,sd:Math.SQRT2*1e308},
    {values:[Number.MAX_VALUE,-Number.MAX_VALUE],mean:0,sd:null},
    {values:[1,2,3],mean:2,sd:1},
    {values:[0,0],mean:0,sd:0},
  ])('keeps full and paged statistics consistent for $values',async({values,mean,sd})=>{
    const data=source(values)
    vi.mocked(loadSurveySource).mockResolvedValue(data)
    const full=describeWave(data,'wave').items[0]
    const paged=await describeSurveyWaveItemPaged({actorUserId:'owner',projectId:'project',waveId:'wave',instrumentKey:'form',itemKey:'number'})
    for(const result of [full,paged]){
      expect(result.respondentN).toBe(values.length)
      expect(result.numericMean).toBe(mean)
      expect(result.numericSampleSd).toBe(sd)
      expect(result.numericMean===null||Number.isFinite(result.numericMean)).toBe(true)
      expect(result.numericSampleSd===null||Number.isFinite(result.numericSampleSd)).toBe(true)
    }
    expect(JSON.parse(JSON.stringify(full)).numericMean).toBe(mean)
  })
})
