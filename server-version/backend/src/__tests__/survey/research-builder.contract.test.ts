import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  initialSurveyDefinition, validateSurveyDraft, assertSurveyDraft, type FormDraft, type ScaleDraft, type SjtDraft,
} from '../../modules/survey/builder.definition'
import { compileResearchScale, compileResearchSjt, previewResearchInstrument } from '../../modules/survey/builder.compiler'
import { previewBulk, applyBulk, BulkImportError } from '../../modules/survey/builder.import'
import { computeSurveyFinal } from '../../modules/survey/final.compute'
import type { ResearchFrozenPublication } from '../../modules/survey/publication.service'

const scale=():ScaleDraft=>({
  schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
  responseOptions:[
    {optionKey:'o1',label:'完全不同意',score:1},
    {optionKey:'o2',label:'较不同意',score:2},
    {optionKey:'o3',label:'一般',score:3},
    {optionKey:'o4',label:'较同意',score:4},
    {optionKey:'o5',label:'完全同意',score:5},
  ],
  dimensions:[{dimensionKey:'motivation',label:'动机',direction:'descriptive'},
    {dimensionKey:'strategy',label:'策略',direction:'descriptive'}],
  items:[
    {itemKey:'item1',prompt:'我愿意努力尝试',required:true,reverse:false,dimensionKeys:['motivation']},
    {itemKey:'item2',prompt:'遇到难题我会立刻放弃',required:true,reverse:true,dimensionKeys:['strategy']},
  ],
})
const sjt=():SjtDraft=>({
  schemaVersion:1,respondentType:'student_self_report',scenarioKey:'sceneone',
  title:'课堂讨论情境',stimulus:'同学们围绕一个问题展开讨论，你希望参与。',
  author:'项目研究者',sourceNote:'研究自编内容',licenseStatus:'self_authored',redistribution:'allowed',
  metrics:[{metricKey:'effort',label:'投入',direction:'descriptive'},
    {metricKey:'support',label:'支持',direction:'descriptive'}],
  questions:[
    {questionKey:'first',prompt:'你首先会怎么做？',options:[
      {optionKey:'aone',label:'主动分享',contributions:{effort:2,support:1}},
      {optionKey:'atwo',label:'安静倾听',contributions:{effort:0,support:0}},
    ]},
    {questionKey:'second',prompt:'同学遇到困难时你会怎么做？',options:[
      {optionKey:'bone',label:'帮助整理思路',contributions:{effort:3,support:2}},
      {optionKey:'btwo',label:'等待别人处理',contributions:{effort:0,support:0}},
    ]},
  ],
})
describe('Survey research builder contracts without formal publication authority',()=>{
  it('requires stable keys and server-checkable preceding branching questions',()=>{
    const form:FormDraft={schemaVersion:1,pages:[
      {pageKey:'pageone',title:'背景',questions:[
        {itemKey:'school',type:'SINGLE',prompt:'今天学习的科目',required:true,
          options:[{optionKey:'math',label:'数学'},{optionKey:'chemistry',label:'化学'}],rows:[]},
        {itemKey:'studytime',type:'NUMBER',prompt:'学习时间',required:false,
          options:[],rows:[],min:0,max:24,
          displayIf:{itemKey:'school',operator:'EQUALS',optionKey:'math'}},
      ]},
      {pageKey:'pagetwo',title:'课堂体验',questions:[
        {itemKey:'matrix',type:'MATRIX',prompt:'本节课的体验',required:true,
          rows:[{rowKey:'rowone',label:'注意力'},{rowKey:'rowtwo',label:'参与感'}],
          options:[{optionKey:'low',label:'较少'},{optionKey:'high',label:'较多'}]},
      ]},
    ]}
    expect(validateSurveyDraft('FORM',form,true).issues).toHaveLength(0)
    const changed=structuredClone(form)
    changed.pages[0].questions[1].displayIf={itemKey:'matrix',operator:'EQUALS',optionKey:'low'}
    expect(validateSurveyDraft('FORM',changed,true).issues.some(i=>i.path.includes('displayIf'))).toBe(true)
    changed.pages[0].questions[1].displayIf=undefined
    changed.pages[1].questions[0].itemKey='school'
    expect(validateSurveyDraft('FORM',changed,true).issues.some(i=>i.message.includes('重复'))).toBe(true)
  })
  it('rejects invalid conditional operator combinations while allowing valid nested branches',()=>{
    const form:FormDraft={schemaVersion:1,pages:[{pageKey:'main',title:'多层条件',questions:[
      {itemKey:'source',type:'MULTIPLE',prompt:'多选来源',required:true,
        options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}],rows:[]},
      {itemKey:'middle',type:'SINGLE',prompt:'第二层',required:true,
        options:[{optionKey:'go',label:'继续'},{optionKey:'stop',label:'停止'}],rows:[],
        displayIf:{itemKey:'source',operator:'INCLUDES',optionKey:'yes'}},
      {itemKey:'last',type:'SHORT_TEXT',prompt:'第三层',required:false,
        options:[],rows:[],displayIf:{itemKey:'middle',operator:'EQUALS',optionKey:'go'}},
    ]}]}
    expect(validateSurveyDraft('FORM',form,true).issues).toHaveLength(0)
    const invalidMultiple=structuredClone(form)
    invalidMultiple.pages[0].questions[1].displayIf!.operator='EQUALS'
    expect(validateSurveyDraft('FORM',invalidMultiple,true).issues.some(x=>
      x.path.includes('displayIf.operator'))).toBe(true)
    const invalidSingle=structuredClone(form)
    invalidSingle.pages[0].questions[2].displayIf!.operator='INCLUDES'
    expect(validateSurveyDraft('FORM',invalidSingle,true).issues.some(x=>
      x.path.includes('displayIf.operator'))).toBe(true)
  })
  it('preserves pre-v1.1 immutable Form FINAL without allowing new invalid publications',()=>{
    const legacy:FormDraft={schemaVersion:1,pages:[{pageKey:'page',title:'历史已冻结问卷',questions:[
      {itemKey:'source',type:'MULTIPLE',prompt:'已经冻结的多选题',required:true,rows:[],
        options:[{optionKey:'one',label:'选项一'},{optionKey:'two',label:'选项二'}]},
      {itemKey:'next',type:'SHORT_TEXT',prompt:'旧规则条件题',required:false,rows:[],options:[],
        // Before v1.1 this combination compiled, but could never match an array.
        displayIf:{itemKey:'source',operator:'EQUALS',optionKey:'one'}},
    ]}]}
    expect(validateSurveyDraft('FORM',legacy,true).issues.some(x=>
      x.path.includes('displayIf.operator'))).toBe(true)
    expect(()=>assertSurveyDraft('FORM',legacy,true)).toThrow()
    expect(assertSurveyDraft('FORM',legacy,true,true)).toEqual(legacy)
    const snapshot:ResearchFrozenPublication={
      schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'existing-project',
      waveId:'existing-wave',collectionMode:'SINGLE_UNLINKED',
      consentVersion:1,linkageNoticeConfirmed:false,consentDigest:'old-consent',
      runtimeStatus:'SURVEY_FINAL_V1',units:[{
        draftId:'frozen-form',instrumentKey:'legacyform',kind:'FORM',title:'历史问卷',
        draftRevision:1,sourceDigest:canonicalHash({kind:'FORM',definition:legacy}),
        scoringDigest:null,compiledDefinition:legacy,displayDefinition:legacy,
      }],
    }
    const final=computeSurveyFinal(snapshot,{legacyform:{source:['one']}})
    expect(final.units[0].rawAnswers).toEqual({source:['one']})
    expect(final.units[0].missing).toContainEqual({itemKey:'next',reason:'NOT_SHOWN'})
    const broken=structuredClone(legacy)
    broken.pages[0].questions[1].displayIf!.optionKey='does-not-exist'
    expect(()=>assertSurveyDraft('FORM',broken,true,true)).toThrow()
  })
  it('uses existing ScaleDefinitionV2 scoring for reversal and distinct dimensions',()=>{
    const definition=compileResearchScale('学习动机',scale())
    expect(definition.license.status).toBe('self_authored')
    expect(definition.referencePolicy).toEqual({type:'none'})
    expect(definition.scoring.itemRules[1].transform.type).toBe('reverse')
    const preview=previewResearchInstrument({kind:'SCALE',instrumentKey:'testscale',
      title:'学习动机',definition:scale(),answers:{item1:'o5',item2:'o5'}})
    expect(preview.ok).toBe(true)
    if(!preview.ok||!preview.score||!('scores' in preview.score))throw new Error('scoring not available')
    const scores=preview.score.scores
    expect(scores.find(s=>s.key==='motivation')?.value).toBe(5)
    expect(scores.find(s=>s.key==='strategy')?.value).toBe(1)
    expect(preview.participantReport).toBe('GENERAL_ONLY')
  })
  it('compiles shared-stimulus two-question SJT with nonuniform multi-construct weights',()=>{
    const invalidSource=sjt()
    invalidSource.licenseStatus='unknown'
    expect(validateSurveyDraft('SJT',invalidSource,true).issues.some(x=>x.path==='licenseStatus')).toBe(true)
    const compiled=compileResearchSjt('sjtstudy',sjt())
    expect(compiled.package.definition.scoring.model?.modelKey).toBe('AUTHOR_KEY_SUM')
    const r=previewResearchInstrument({kind:'SJT',instrumentKey:'sjtstudy',
      title:'课堂讨论情境',definition:sjt(),answers:{first:'aone',second:'bone'}})
    expect(r.ok).toBe(true)
    if(!r.ok||!r.score||!('metrics' in r.score))throw new Error('SJT model scoring unavailable')
    expect(r.score.metrics.find(m=>m.key==='effort')?.value).toBe(5)
    expect(r.score.metrics.find(m=>m.key==='support')?.value).toBe(3)
    expect(r.participantReport).toBe('GENERAL_ONLY')
  })
  it('previews SJT multi-select through official model scoring rather than a new parallel scorer',()=>{
    const d=sjt()
    d.questions[0].responseType='MULTIPLE'
    d.questions[0].aggregationPolicy='SUM'
    d.questions[0].minSelections=2
    d.questions[0].maxSelections=2
    d.questions[0].options.push({
      optionKey:'athree',label:'整理讨论要点',contributions:{effort:1,support:2},
    })
    const result=previewResearchInstrument({kind:'SJT',instrumentKey:'sjt-multi',
      title:'课堂讨论',definition:d,answers:{first:['aone','athree'],second:'bone'}})
    expect(result.ok).toBe(true)
    if(!result.ok||!result.score||!('metrics' in result.score))
      throw new Error('multi-select compiled scorer unavailable')
    expect(result.score.metrics.find(m=>m.key==='effort')?.value).toBe(6)
    expect(result.score.metrics.find(m=>m.key==='support')?.value).toBe(5)
    // 5 choices with 1..3 selections yield 5+10+10=25 combinations,
    // exceeding the 24-option bounded Survey-only SJT adapter.
    d.questions[0].minSelections=1
    d.questions[0].maxSelections=3
    d.questions[0].options.push({optionKey:'afour',label:'提出疑问',contributions:{effort:2,support:0}})
    d.questions[0].options.push({optionKey:'afive',label:'联系同伴',contributions:{effort:0,support:1}})
    const rejected=validateSurveyDraft('SJT',d,true)
    expect(rejected.issues.some(i=>i.message.includes('24'))).toBe(true)
  })
  it('parses text/CSV with deterministic batch identifiers and rejects invalid portions',()=>{
    const form=initialSurveyDefinition('FORM')
    const batch={
      batchId:'a7a7a7a7-1111-4444-8888-111111111111',format:'TEXT' as const,
      content:'上课时我有信心\nA. 不同意\nB. 同意\n\n今天你学习了什么？',
    }
    const preview=previewBulk(batch,'FORM')
    expect(preview.ok).toBe(true)
    expect(preview.count).toBe(2)
    const result=applyBulk('FORM',form,batch,preview.digest)
    const parsed=validateSurveyDraft('FORM',result,true)
    expect(parsed.issues).toHaveLength(0)
    expect(()=>applyBulk('FORM',result,batch,preview.digest)).toThrow(BulkImportError)
    expect(()=>applyBulk('FORM',form,{...batch,content:batch.content+'变更'},preview.digest)).toThrow(BulkImportError)
    const csv=previewBulk({...batch,format:'CSV',content:
      'type,prompt,required,options\nSINGLE,我喜欢科学课,true,不同意||同意'},'FORM')
    expect(csv.ok).toBe(true)
    const malformed=previewBulk({...batch,format:'CSV',content:
      'type,prompt,options\nSINGLE,测试,仅一个选项'},'FORM')
    expect(malformed.ok).toBe(false)
    expect(malformed.issues.some(i=>i.line===2)).toBe(true)
  })
})
