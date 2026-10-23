import {rawParticipantFeedback} from '../../modules/survey/participant-feedback'
import {describe,it,expect} from 'vitest'
import {materialListSchema,publicMaterial} from '../../modules/assessment-media/material'
import {assertSurveyDraft,initialSurveyDefinition} from '../../modules/survey/builder.definition'
import {compileFrozenResearchUnit} from '../../modules/survey/publication.service'
import {matchRawScoreFeedback} from '../../modules/scale/raw-score-feedback'
const item={asset:{assetId:'198e278f-f993-44fa-9eaa-223693fa4db3',contentHash:'a'.repeat(64),mimeType:'application/pdf' as const},name:'研究说明',rightsStatus:'authorized' as const,rightsNote:'本研究展示授权'}
describe('Survey material-bearing definitions',()=>{
  it('normalizes legacy Form and keeps optional materials without changing its shared questions',()=>{
    const core={schemaVersion:2,pages:[{pageKey:'first',title:'首页',questions:[{itemKey:'q',type:'SINGLE',prompt:'题目',required:true,options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}],rows:[]}]}]}
    const old=assertSurveyDraft('FORM',core,true)
    const next=assertSurveyDraft('FORM',{...core,materials:[item]},true)
    expect(next).toEqual({...old,materials:[item]})
    const frozen=compileFrozenResearchUnit({id:'draft',instrumentKey:'form',kind:'FORM',title:'表单',revision:1,definition:next})
    expect(frozen.displayDefinition).toMatchObject({materials:[item]})
    expect(publicMaterial(item)).toEqual({asset:item.asset,name:item.name})
  })
  it('preserves media on a Scale and in its matched raw-score feedback without changing scoring',()=>{
    const base=initialSurveyDefinition('SCALE')
    expect(assertSurveyDraft('SCALE',{...base,materials:[item]})).toMatchObject({materials:[item]})
    const match=matchRawScoreFeedback({schemaVersion:1,rules:[{scoreKey:'total',ranges:[{key:'r',min:0,max:10,includeMax:true,text:'反馈',materials:[item]}]}]},'total',5)
    expect(match).toMatchObject({materials:[item],text:'反馈'})
  })
  it('rejects executable formats, external addresses, malformed digests, duplicate attachments and excessive lists',()=>{
    expect(materialListSchema.safeParse([{...item,asset:{...item.asset,mimeType:'text/html'}}]).success).toBe(false)
    expect(materialListSchema.safeParse([{...item,asset:{...item.asset,assetId:'https://example.com/file'}}]).success).toBe(false)
    expect(materialListSchema.safeParse([{...item,asset:{...item.asset,contentHash:'changed'}}]).success).toBe(false)
    expect(materialListSchema.safeParse([item,item]).success).toBe(false)
    expect(materialListSchema.safeParse(Array(11).fill(item)).success).toBe(false)
  })
  it('discloses only released saved feedback materials and strips internal rights notes',()=>{
    const unit={instrumentKey:'scale',kind:'SCALE',title:'量表',sourceDigest:'source',scoringDigest:'score',measurementRelease:{releaseId:'release'},compiledDefinition:{scoring:{scores:[{key:'total'}]}},participantFeedback:{policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',metricKeys:['total'],release:'AFTER_COLLECTION'}}
    const stored={instrumentKey:'scale',kind:'SCALE',sourceDigest:'source',scoringDigest:'score',privateScoring:{scores:[{key:'total',value:2,status:'calculated'}],quality:{status:'interpretable'},rawScoreFeedback:[{scoreKey:'total',rangeKey:'r',text:'已保存反馈',materials:[item]}]}}
    expect(rawParticipantFeedback(unit as never,stored as never,false)).toEqual({pending:true})
    const output=rawParticipantFeedback(unit as never,stored as never,true)
    expect(output).toMatchObject({rawScoreFeedback:[{materials:[{asset:item.asset,name:item.name}]}]})
    expect(JSON.stringify(output)).not.toContain('rightsNote')
  })

})
