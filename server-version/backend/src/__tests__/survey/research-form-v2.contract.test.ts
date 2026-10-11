import { describe,expect,it } from 'vitest'
import { assertSurveyDraft,validateSurveyDraft,type FormDraft } from '../../modules/survey/builder.definition'
import { dryRunSurveyForm,computeSurveyFinal,SurveyFinalValidationError } from '../../modules/survey/final.compute'
import { compileFrozenResearchUnit,type ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { rawLongExport,rawWideExport } from '../../modules/survey/analytics.raw-export'
import type { SurveySourceProjection } from '../../modules/survey/analytics.source'
const choices=[{optionKey:'one',label:'第一项'},{optionKey:'two',label:'第二项'},{optionKey:'three',label:'第三项'}]
const form=():FormDraft=>({schemaVersion:2,pages:[
  {pageKey:'page1',title:'基础资料',questions:[
    {itemKey:'date',type:'DATE',prompt:'调查日期',required:true,options:[],rows:[]},
    {itemKey:'time',type:'TIME',prompt:'填写时间',required:true,options:[],rows:[],timeZone:'Asia/Shanghai'},
    {itemKey:'text',type:'SHORT_TEXT',prompt:'电子邮箱',required:false,options:[],rows:[],textValidation:'EMAIL'},
    {itemKey:'rank',type:'RANK_ORDER',prompt:'优先级',required:true,options:choices,rows:[]},
  ]},
  {pageKey:'page2',title:'专业条目',questions:[
    {itemKey:'slider',type:'SLIDER',prompt:'评分',required:true,min:-1,max:1,step:0.25,precision:2,options:[],rows:[]},
    {itemKey:'total',type:'CONSTANT_SUM',prompt:'预算分配',required:true,total:10,integerOnly:true,
      options:choices,rows:[]},
    {itemKey:'multi',type:'MATRIX_MULTIPLE',prompt:'多选矩阵',required:true,allowRefusal:true,
      options:choices,rows:[{rowKey:'rowa',label:'A'},{rowKey:'rowb',label:'B'}],
      minSelections:1,maxSelections:2},
  ]},
]})
const answers=()=>({
  date:'2024-02-29',time:'09:30',text:'demo@example.edu',rank:['two','one','three'],
  slider:0.25,total:{one:0,two:4,three:6},
  'multi:rowa':['one','three'],'multi:rowb':{_surveyRefusal:true},
})
const snapshot=(definition:FormDraft):ResearchFrozenPublication=>({
  schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'project',waveId:'wave',
  collectionMode:'LINKED_WAVES',consentVersion:1,linkageNoticeConfirmed:true,
  consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',
  units:[compileFrozenResearchUnit({id:'draft',instrumentKey:'form',kind:'FORM',
    title:'专业问卷',revision:3,definition})],
})
describe('Form V2 frozen answer contract',()=>{
  it('keeps v1 immutable and forbids silent V2 type migration',()=>{
    const old=form();old.schemaVersion=1
    expect(validateSurveyDraft('FORM',old,true).issues.some(i=>i.path.includes('.type'))).toBe(true)
    expect(()=>assertSurveyDraft('FORM',old,true)).toThrow()
    expect(validateSurveyDraft('FORM',form(),true).issues).toHaveLength(0)
  })
  it('accepts full valid typed answers from dry-run through authoritative FINAL',()=>{
    const draft=form(),typed=answers()
    const dry=dryRunSurveyForm(draft,typed)
    const published=computeSurveyFinal(snapshot(draft),{form:typed})
    expect(dry.rawAnswers).toEqual(published.units[0].rawAnswers)
    expect(dry.rawAnswers.rank).toEqual(['two','one','three'])
    expect(dry.rawAnswers.slider).toBe(0.25)
    expect(dry.rawAnswers.total).toEqual({one:0,two:4,three:6})
    expect(dry.rawAnswers.multi).toEqual({rowa:['one','three']})
    expect(dry.missing).toContainEqual({itemKey:'multi:rowb',reason:'REFUSED'})
  })
  it('rejects invalid date/time/ranking/slider/constant sum/matrix multi and text',()=>{
    const base=answers(),draft=form()
    const bad=[
      {...base,date:'2023-02-29'},{...base,date:'2024-13-01'},
      {...base,time:'24:00'},{...base,time:'09:30Z'},
      {...base,rank:['one','one','three']},{...base,rank:['one','two']},
      {...base,slider:0.2},{...base,slider:2},
      {...base,total:{one:0,two:4,three:5}},
      {...base,total:{one:0,two:4,three:-1}},
      {...base,'multi:rowa':['one','one']},
      {...base,'multi:rowa':['one','two','three']},
      {...base,'multi:rowa':[]},
      {...base,text:'not-an-email'},
      {...base,unexpected:'injected'},
    ]
    for(const invalid of bad){
      expect(()=>dryRunSurveyForm(draft,invalid)).toThrow(SurveyFinalValidationError)
      expect(()=>computeSurveyFinal(snapshot(draft),{form:invalid}))
        .toThrow(SurveyFinalValidationError)
    }
  })
  it('enforces selected other-text and exclusive multi-select across dry-run and frozen FINAL',()=>{
    const choiceForm:FormDraft={schemaVersion:2,pages:[{pageKey:'page',title:'类别',questions:[
      {itemKey:'single',type:'SINGLE',prompt:'身份',required:true,rows:[],
        options:[{optionKey:'standard',label:'标准'},{optionKey:'other',label:'其他'}],
        otherOptionKey:'other',otherMaxLength:15},
      {itemKey:'multiple',type:'MULTIPLE',prompt:'途径',required:true,rows:[],
        options:[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'},
          {optionKey:'other',label:'其他'},{optionKey:'none',label:'没有'}],
        otherOptionKey:'other',exclusiveOptionKeys:['none'],minSelections:1,maxSelections:3},
    ]}]}
    expect(validateSurveyDraft('FORM',choiceForm,true).issues).toEqual([])
    const valid={single:'other','single:other':'私下说明',
      multiple:['a','other'],'multiple:other':'另有一种'}
    const preview=dryRunSurveyForm(choiceForm,valid)
    const official=computeSurveyFinal(snapshot(choiceForm),{form:valid})
    expect(preview.rawAnswers).toEqual(official.units[0].rawAnswers)
    expect(preview.rawAnswers['single:other']).toBe('私下说明')
    expect(preview.rawAnswers['multiple:other']).toBe('另有一种')
    const neutral=dryRunSurveyForm(choiceForm,{single:'standard',multiple:['none']})
    expect(neutral.missing).toContainEqual({itemKey:'single:other',reason:'NOT_SHOWN'})
    expect(neutral.missing).toContainEqual({itemKey:'multiple:other',reason:'NOT_SHOWN'})
    for(const bad of [
      {...valid,'single:other':''},
      {...valid,'single:other':'x'.repeat(16)},
      {...valid,single:'standard'},
      {...valid,multiple:['none','a']},
      {...valid,multiple:['none','other']},
      {...valid,'multiple:other':''},
      {...valid,multiple:['a']},
      {...valid,multiple:['other','other']},
    ]){
      expect(()=>dryRunSurveyForm(choiceForm,bad)).toThrow(SurveyFinalValidationError)
      expect(()=>computeSurveyFinal(snapshot(choiceForm),{form:bad}))
        .toThrow(SurveyFinalValidationError)
    }
    const invalid=structuredClone(choiceForm)
    invalid.pages[0].questions[1].exclusiveOptionKeys=['removed']
    expect(validateSurveyDraft('FORM',invalid,true).issues.some(i=>
      i.path.includes('exclusiveOptionKeys'))).toBe(true)
    invalid.pages[0].questions[1].exclusiveOptionKeys=['none']
    invalid.schemaVersion=1
    expect(validateSurveyDraft('FORM',invalid,true).issues.some(i=>
      i.path.includes('otherOptionKey'))).toBe(true)
  })
  it('exports typed JSON arrays and object values without conflating zero and missing',()=>{
    const source:SurveySourceProjection={
      projectId:'project',collectionMode:'LINKED_WAVES',completeAttempts:1,sourceRevision:1,
      cutOff:'2026-10-11T00:00:00.000Z',scores:[],scoreColumns:[],attendance:[
        {researchCode:'R-TEST',waveId:'wave',status:'COMPLETED'}],
      raw:[
        {projectId:'project',waveId:'wave',waveOrdinal:1,attemptId:'attempt1',
          researchCode:'R-TEST',sourceFinalHash:'sha',instrumentKey:'form',kind:'FORM',
          responseType:'CONSTANT_SUM',itemKey:'total',columnKey:'W001__form__total',
          publicationVersion:1,value:'{"one":0,"two":4,"three":6}',missingReason:null,
          completedAt:'2026-10-11T00:00:00.000Z',sourceVerified:true},
        {projectId:'project',waveId:'wave',waveOrdinal:1,attemptId:'attempt1',
          researchCode:'R-TEST',sourceFinalHash:'sha',instrumentKey:'form',kind:'FORM',
          responseType:'SLIDER',itemKey:'slider',columnKey:'W001__form__slider',
          publicationVersion:1,value:0,missingReason:null,
          completedAt:'2026-10-11T00:00:00.000Z',sourceVerified:true},
        {projectId:'project',waveId:'wave',waveOrdinal:1,attemptId:'attempt1',
          researchCode:'R-TEST',sourceFinalHash:'sha',instrumentKey:'form',kind:'FORM',
          responseType:'DATE',itemKey:'date',columnKey:'W001__form__date',
          publicationVersion:1,value:null,missingReason:'SHOWN_MISSING',
          completedAt:'2026-10-11T00:00:00.000Z',sourceVerified:true},
      ],
      codebook:['total','slider','date'].map(itemKey=>({
        columnKey:'W001__form__'+itemKey,waveId:'wave',waveOrdinal:1,instrumentKey:'form',itemKey,
        kind:'FORM' as const,responseType:itemKey==='total'?'CONSTANT_SUM':itemKey==='slider'?'SLIDER':'DATE',
        title:'研究',prompt:itemKey,options:[],definitionDigest:'digest',scoringDigest:null,
        publicationVersion:1,instrumentRevision:1,
      })),
    }
    const long=rawLongExport('project',source)
    expect(long.csv).toContain('{\"one\":0,\"two\":4,\"three\":6}'.replaceAll('"','""'))
    expect(long.csv).toContain('"0"')
    expect(long.csv).toContain('"SHOWN_MISSING"')
    const wide=rawWideExport('project',source)
    expect(wide.manifest.columnCount).toBe(7)
    expect(wide.codebook.map(x=>x.responseType)).toContain('CONSTANT_SUM')
  })
})
