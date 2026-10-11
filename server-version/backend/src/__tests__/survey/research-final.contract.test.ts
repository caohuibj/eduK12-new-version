import { describe,expect,it } from 'vitest'
import { compileFrozenResearchUnit,type ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { computeSurveyFinal,SurveyFinalValidationError } from '../../modules/survey/final.compute'
import type { FormDraft,ScaleDraft,SjtDraft } from '../../modules/survey/builder.definition'

const frozen=(kind:'FORM'|'SCALE'|'SJT',definition:FormDraft|ScaleDraft|SjtDraft)=>
  compileFrozenResearchUnit({
    id:'2e7a5013-7ab9-4e62-bc35-f89a67e49a63',instrumentKey:'researchinstrument',
    title:'科研情境工具',revision:1,kind,definition,
  })
const snapshot=(unit:ReturnType<typeof frozen>):ResearchFrozenPublication=>({
  schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'project',waveId:'wave',
  collectionMode:'LINKED_WAVES',consentVersion:1,consentDigest:'consent-hash',
  runtimeStatus:'SURVEY_FINAL_V1',units:[unit],
})
const form:FormDraft={schemaVersion:1,pages:[{pageKey:'pageone',title:'科目与体验',questions:[
  {itemKey:'subject',type:'SINGLE',prompt:'本轮主要学习的科目',required:true,rows:[],
    options:[{optionKey:'math',label:'数学'},{optionKey:'chemistry',label:'化学'}]},
  {itemKey:'reflection',type:'SHORT_TEXT',prompt:'你愿意分享的方法',required:false,
    options:[],rows:[],maxLength:300,
    displayIf:{itemKey:'subject',operator:'EQUALS',optionKey:'math'}},
]}]}
const scale:ScaleDraft={
  schemaVersion:1,respondentType:'participant_self_report',
  responseOptions:[
    {optionKey:'one',label:'完全不同意',score:1},
    {optionKey:'two',label:'不同意',score:2},
    {optionKey:'three',label:'一般',score:3},
    {optionKey:'four',label:'同意',score:4},
    {optionKey:'five',label:'完全同意',score:5},
  ],
  dimensions:[{dimensionKey:'learning',label:'学习动机',direction:'descriptive'},
    {dimensionKey:'strategy',label:'学习策略',direction:'descriptive'}],
  aggregation:'mean',
  items:[
    {itemKey:'itemone',prompt:'我愿意学习',required:true,reverse:false,dimensionKeys:['learning']},
    {itemKey:'itemtwo',prompt:'遇到难题我会立即放弃',required:true,reverse:true,dimensionKeys:['strategy']},
  ],
}
const sjt:SjtDraft={
  schemaVersion:1,respondentType:'student_self_report',scenarioKey:'sceneone',
  title:'课堂交流',stimulus:'同学邀请你参加讨论，你会如何回应？',
  author:'项目研究者',sourceNote:'项目自编情境',redistribution:'allowed',
  metrics:[{metricKey:'effort',label:'学习投入',direction:'descriptive'},
    {metricKey:'support',label:'互助倾向',direction:'descriptive'}],
  questions:[
    {questionKey:'first',prompt:'你会首先怎么做？',options:[
      {optionKey:'aone',label:'先表达看法',contributions:{effort:2,support:1}},
      {optionKey:'atwo',label:'暂不参与',contributions:{effort:0,support:0}},
    ]},
    {questionKey:'second',prompt:'同学需要帮助时？',options:[
      {optionKey:'bone',label:'尝试支持',contributions:{effort:3,support:2}},
      {optionKey:'btwo',label:'等其他人',contributions:{effort:0,support:0}},
    ]},
  ],
}
describe('Survey RESEARCH_ONLY authoritative FINAL',()=>{
  it('retains structurally hidden vs shown-missing semantics without trusting browser',()=>{
    const unit=frozen('FORM',form),pub=snapshot(unit)
    const absent=computeSurveyFinal(pub,{researchinstrument:{subject:'chemistry'}})
    expect(absent.units[0].missing).toContainEqual({itemKey:'reflection',reason:'NOT_SHOWN'})
    const shown=computeSurveyFinal(pub,{researchinstrument:{subject:'math'}})
    expect(shown.units[0].missing).toContainEqual({itemKey:'reflection',reason:'SHOWN_MISSING'})
    expect(()=>computeSurveyFinal(pub,{researchinstrument:{
      subject:'chemistry',reflection:'hidden response',
    }})).toThrow(SurveyFinalValidationError)
    expect(()=>computeSurveyFinal(pub,{researchinstrument:{subject:'not-an-option'}}))
      .toThrow(SurveyFinalValidationError)
  })
  it('uses the same frozen Scale scorer and reversal as official runtime',()=>{
    const unit=frozen('SCALE',scale),pub=snapshot(unit)
    const final=computeSurveyFinal(pub,{researchinstrument:{itemone:'five',itemtwo:'five'}})
    const privateScore=final.units[0].privateScoring as {scores:{key:string;value:number|null}[]}
    expect(privateScore.scores.find(s=>s.key==='learning')?.value).toBe(5)
    expect(privateScore.scores.find(s=>s.key==='strategy')?.value).toBe(1)
    expect(final.units[0].scoringDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(()=>computeSurveyFinal(pub,{researchinstrument:{itemone:'five'}}))
      .toThrow(SurveyFinalValidationError)
  })
  it('follows a real frozen SJT trajectory with non-equal multi-construct contributions',()=>{
    const unit=frozen('SJT',sjt),pub=snapshot(unit)
    const final=computeSurveyFinal(pub,{
      researchinstrument:{first:'aone',second:'bone'},
    })
    const score=final.units[0].privateScoring as {metrics:{key:string;value:number|null}[]}
    expect(score.metrics.find(m=>m.key==='effort')?.value).toBe(5)
    expect(score.metrics.find(m=>m.key==='support')?.value).toBe(3)
    expect(()=>computeSurveyFinal(pub,{researchinstrument:{first:'not-an-option',second:'bone'}}))
      .toThrow(SurveyFinalValidationError)
  })
  it('distinguishes an explicit refusal from skipped, hidden and ordinary missing',()=>{
    const withRefusal:FormDraft=structuredClone(form)
    withRefusal.pages[0].questions[0].allowRefusal=true
    withRefusal.pages[0].questions[1].allowRefusal=true
    const pub=snapshot(frozen('FORM',withRefusal))
    const refused=computeSurveyFinal(pub,{researchinstrument:{subject:'REFUSED'}})
    expect(refused.units[0].missing).toContainEqual({itemKey:'subject',reason:'REFUSED'})
    expect(refused.units[0].missing).toContainEqual({itemKey:'reflection',reason:'NOT_SHOWN'})
    const shown=computeSurveyFinal(pub,{researchinstrument:{subject:'math',reflection:'REFUSED'}})
    expect(shown.units[0].missing).toContainEqual({itemKey:'reflection',reason:'REFUSED'})
    const unmarked=snapshot(frozen('FORM',form))
    expect(()=>computeSurveyFinal(unmarked,{researchinstrument:{subject:'REFUSED'}}))
      .toThrow(SurveyFinalValidationError)
  })
  it('forbids missing or non-frozen tools and deliberately cannot produce a personalized report',()=>{
    const frozenUnit=frozen('FORM',form)
    expect(()=>computeSurveyFinal(snapshot(frozenUnit),{})).toThrow(SurveyFinalValidationError)
    const unit=computeSurveyFinal(snapshot(frozenUnit),{researchinstrument:{subject:'chemistry'}}).units[0]
    expect(Object.keys(unit).sort()).toEqual([
      'instrumentKey','kind','missing','privateScoring','rawAnswers','scoringDigest','sourceDigest',
    ].sort())
  })
})
