import { describe, expect, it } from 'vitest'
import { describeWave } from '../../modules/survey/analytics.descriptive'
import { surveyAnalyticsItemRequestSchema } from '../../modules/survey/analytics.request'
import type { SurveySourceProjection } from '../../modules/survey/analytics.source'

function source(responseType:string,values:Array<string|null>):SurveySourceProjection {
  const columnKey='W001__form__matrix_row__abcdef'
  return {
    projectId:'project',collectionMode:'SINGLE_UNLINKED',completeAttempts:values.length,
    sourceRevision:0,cutOff:'2026-10-17T00:00:00Z',scores:[],scoreColumns:[],attendance:[],
    codebook:[{columnKey,waveId:'wave',waveOrdinal:1,instrumentKey:'form',itemKey:'matrix:row',
      kind:'FORM',responseType,title:'Synthetic',prompt:'Synthetic question',
      options:[{code:'a',label:'A'},{code:'b',label:'B'},{code:'c',label:'C'}],
      definitionDigest:'a'.repeat(64),scoringDigest:null,publicationVersion:1,instrumentRevision:0}],
    raw:values.map((value,i)=>({projectId:'project',waveId:'wave',waveOrdinal:1,
      attemptId:'synthetic-'+i,researchCode:null,sourceFinalHash:'b'.repeat(64),
      instrumentKey:'form',kind:'FORM',responseType,itemKey:'matrix:row',columnKey,
      publicationVersion:1,value,missingReason:value===null?'REFUSED':null,
      completedAt:'2026-10-17T00:00:00Z',sourceVerified:true})),
  }
}

describe('Survey Form summary and matrix row request parity',()=>{
  it('counts matrix multi-select options and normalized combinations without counting refusals',()=>{
    const result=describeWave(source('MATRIX_MULTIPLE',['["b","a"]','["a","b"]','["c"]',null]),'wave').items[0]
    expect(result).toMatchObject({respondentN:3,missingByReason:{REFUSED:1},
      frequencies:[{value:'a',count:2},{value:'b',count:2},{value:'c',count:1}],
      combinationFrequencies:[{value:'["a","b"]',count:2},{value:'["c"]',count:1}],numericMean:null})
  })
  it.each(['not-json','["a","a"]','["unknown"]','{"a":1}'])('rejects malformed matrix selection %s',(value)=>{
    expect(()=>describeWave(source('MATRIX_MULTIPLE',[value]),'wave')).toThrow()
  })
  it('counts ranking positions using the same option@rankN representation as paged analytics',()=>{
    const result=describeWave(source('RANK_ORDER',['["c","b","a"]','["a","b","c"]',null]),'wave').items[0]
    expect(result.frequencies).toEqual([{value:'c@rank1',count:1},{value:'b@rank2',count:2},
      {value:'a@rank3',count:1},{value:'a@rank1',count:1},{value:'c@rank3',count:1}])
    expect(result.respondentN).toBe(2)
    expect(result.missingByReason).toEqual({REFUSED:1})
    expect(result.combinationFrequencies).toEqual([])
    expect(result.numericMean).toBeNull()
  })
  it.each(['not-json','["a","b"]','["a","a","c"]','["a","b","unknown"]'])('rejects malformed ranking %s',(value)=>{
    expect(()=>describeWave(source('RANK_ORDER',[value]),'wave')).toThrow()
  })
  it.each(['question','matrix:row','q_1:r-2'])('accepts frozen question or matrix-row key %s',(itemKey)=>{
    expect(surveyAnalyticsItemRequestSchema.parse({instrumentKey:'form',itemKey})).toEqual({instrumentKey:'form',itemKey})
  })
  it.each([':row','question:','question:row:extra','question:UPPER','question/row','a'.repeat(81),'q:'+ 'r'.repeat(81)])('rejects invalid scoped item key %s',(itemKey)=>{
    expect(surveyAnalyticsItemRequestSchema.safeParse({instrumentKey:'form',itemKey}).success).toBe(false)
  })
  it('retains strict instrument keys and request fields',()=>{
    expect(surveyAnalyticsItemRequestSchema.safeParse({instrumentKey:'form:other',itemKey:'q:r'}).success).toBe(false)
    expect(surveyAnalyticsItemRequestSchema.safeParse({instrumentKey:'form',itemKey:'q:r',projectId:'other'}).success).toBe(false)
  })
})
