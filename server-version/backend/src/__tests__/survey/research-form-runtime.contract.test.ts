import { describe,expect,it } from 'vitest'
import { assertSurveyDraft,validateSurveyDraft,type FormDraft } from '../../modules/survey/builder.definition'
import { dryRunSurveyForm,computeSurveyFinal,SurveyFinalValidationError } from '../../modules/survey/final.compute'
import { compileFrozenResearchUnit,type ResearchFrozenPublication } from '../../modules/survey/publication.service'

const publication=(form:FormDraft):ResearchFrozenPublication=>({
  schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'project',waveId:'wave',
  collectionMode:'SINGLE_UNLINKED',consentVersion:1,linkageNoticeConfirmed:false,
  consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',
  units:[compileFrozenResearchUnit({id:'draft',instrumentKey:'theform',kind:'FORM',
    title:'Form',revision:1,definition:form})],
})
const matrixForm=(count:number):FormDraft=>({
  schemaVersion:1,pages:[{pageKey:'page',title:'矩阵问卷',questions:Array.from({length:count},(_,i)=>({
    itemKey:'matrix'+i,type:'MATRIX' as const,prompt:'矩阵 '+i,required:true,
    options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}],
    rows:Array.from({length:40},(_,r)=>({rowKey:'row'+r,label:'条目 '+r})),
  }))}],
})
describe('Form authoring budget and authoritative preview',()=>{
  it('accepts 12×40 row keys throughout freeze and FINAL but rejects 13×40 before save or freeze',()=>{
    const accepted=matrixForm(12)
    expect(validateSurveyDraft('FORM',accepted,true).issues).toEqual([])
    const answers=Object.fromEntries(accepted.pages[0].questions.flatMap(q=>
      q.rows.map(row=>[q.itemKey+':'+row.rowKey,'yes'])))
    expect(Object.keys(answers)).toHaveLength(480)
    const preview=dryRunSurveyForm(accepted,answers)
    expect(preview.missing).toEqual([])
    const final=computeSurveyFinal(publication(accepted),{theform:answers})
    expect(Object.keys(final.units[0].rawAnswers)).toHaveLength(12)
    const rejected=matrixForm(13)
    expect(validateSurveyDraft('FORM',rejected).issues.some(x=>x.path==='pages')).toBe(true)
    expect(validateSurveyDraft('FORM',rejected,true).issues.some(x=>x.message.includes('500'))).toBe(true)
    expect(()=>assertSurveyDraft('FORM',rejected,true)).toThrow()
    expect(()=>publication(rejected)).toThrow()
  })
  it('aligns decimal, step, integer, bounds and JSON type rejection with FINAL',()=>{
    const form:FormDraft={schemaVersion:1,pages:[{pageKey:'p',title:'数值',questions:[{
      itemKey:'num',type:'NUMBER',prompt:'数值',required:true,options:[],rows:[],
      min:-3.5,max:4.5,step:0.25,precision:2,
    }]}]}
    for(const value of [-3.5,-3.25,0,4.5]){
      expect(dryRunSurveyForm(form,{num:value}).rawAnswers.num).toBe(value)
      expect(computeSurveyFinal(publication(form),{theform:{num:value}})
        .units[0].rawAnswers.num).toBe(value)
    }
    for(const value of [0.1,4.75,-4,NaN,Infinity,'0',{},[]]){
      expect(()=>dryRunSurveyForm(form,{num:value})).toThrow(SurveyFinalValidationError)
    }
    const integer=structuredClone(form)
    integer.pages[0].questions[0]={...integer.pages[0].questions[0],
      integerOnly:true,step:1,precision:0,min:-2,max:2}
    expect(dryRunSurveyForm(integer,{num:-1}).rawAnswers.num).toBe(-1)
    expect(()=>dryRunSurveyForm(integer,{num:0.5})).toThrow(SurveyFinalValidationError)
    const invalid=structuredClone(integer)
    invalid.pages[0].questions[0].min=-0.5
    expect(validateSurveyDraft('FORM',invalid,true).issues.some(i=>i.message.includes('整数'))).toBe(true)
  })
  it('distinguishes hidden, omitted, and refused without trusting injected hidden keys',()=>{
    const form:FormDraft={schemaVersion:1,pages:[{pageKey:'one',title:'条件',questions:[
      {itemKey:'source',type:'SINGLE',prompt:'来源',required:true,rows:[],
        options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}]},
      {itemKey:'matrix',type:'MATRIX',prompt:'矩阵',required:false,allowRefusal:true,
        rows:[{rowKey:'row',label:'条目'}],
        options:[{optionKey:'yes',label:'好'},{optionKey:'no',label:'否'}],
        displayIf:{itemKey:'source',operator:'EQUALS',optionKey:'yes'}},
    ]}]}
    const hidden=dryRunSurveyForm(form,{source:'no'})
    expect(hidden.missing).toContainEqual({itemKey:'matrix',reason:'NOT_SHOWN'})
    const missing=dryRunSurveyForm(form,{source:'yes'})
    expect(missing.missing).toContainEqual({itemKey:'matrix:row',reason:'SHOWN_MISSING'})
    const refused=dryRunSurveyForm(form,{source:'yes','matrix:row':{_surveyRefusal:true}})
    expect(refused.missing).toContainEqual({itemKey:'matrix:row',reason:'REFUSED'})
    expect(()=>dryRunSurveyForm(form,{source:'no','matrix:row':'yes'}))
      .toThrow(SurveyFinalValidationError)
  })
  it('rejects extra fields and payload size without weakening runtime authority',()=>{
    const form:FormDraft={schemaVersion:1,pages:[{pageKey:'p',title:'文本',questions:[{
      itemKey:'text',type:'LONG_TEXT',prompt:'分享',required:false,options:[],rows:[],
    }]}]}
    expect(()=>dryRunSurveyForm(form,Object.fromEntries(
      Array.from({length:501},(_,i)=>['key'+i,'junk']))))
      .toThrow(SurveyFinalValidationError)
    expect(()=>dryRunSurveyForm(form,{text:'x'.repeat(512001)}))
      .toThrow(SurveyFinalValidationError)
  })
})
