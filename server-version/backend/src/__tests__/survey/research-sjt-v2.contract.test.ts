import * as sjtRuntime from '../../modules/survey/sjt-runtime'
import {compileFrozenResearchUnit} from '../../modules/survey/publication.service'
import {validateSurveyUnitAnswers} from '../../modules/survey/final.compute'
import {describe,it,expect,vi} from 'vitest'
import {assertSurveyDraft,initialSurveyDefinition,validateSurveyDraft,type SjtDraft,type SjtDraftV2,type SjtQuestionV2} from '../../modules/survey/builder.definition'
import {compileResearchSjt,previewResearchInstrument} from '../../modules/survey/builder.compiler'
import {normalizeSurveySjtAnswers,scoreResearchSjtAnswers} from '../../modules/survey/sjt-runtime'
import {expandedSurveySjtOptions,resolveSurveySjtAnswer} from '../../modules/survey/sjt-selection'
import {surveySjtQuestionEntries,surveySjtScenes} from '../../modules/survey/sjt-structure'
import type {SituationDefinitionV2} from '../../modules/situational/situation-branching'
const question=(key:string,positive=2):SjtQuestionV2=>({questionKey:key,prompt:'选择本次行动',
  responseType:'SINGLE',required:true,allowRefusal:false,options:[
    {optionKey:'yes',label:'协调参与',contributions:{cooperation:positive,risk:1}},
    {optionKey:'no',label:'保持观察',contributions:{cooperation:0,risk:-1}},
  ]})
const fixture=():SjtDraftV2=>({schemaVersion:2,respondentType:'participant_self_report',
  title:'多个情境',author:'研究团队',sourceNote:'研究团队原创',licenseStatus:'self_authored',
  redistribution:'allowed',orderPolicy:'FIXED',
  metrics:[{metricKey:'cooperation',label:'合作',direction:'descriptive'},
    {metricKey:'risk',label:'风险判断',direction:'descriptive'}],
  scoring:{modelKey:'AUTHOR_KEY_SUM',modelVersion:'1',sourceNote:''},
  scenes:[{sceneKey:'discussion',title:'讨论',stimulus:'小组正在讨论一个共同问题。',
    questions:[question('first',2),question('second',4)]},
  {sceneKey:'planning',title:'计划',stimulus:'团队需要准备下一步计划。',questions:[question('third',3)]}],
})
const compile=(d:SjtDraftV2)=>compileResearchSjt('study',d).package.definition as SituationDefinitionV2
const score=(d:SjtDraftV2,answers:Record<string,unknown>)=>{
  const compiled=compile(d),normalized=normalizeSurveySjtAnswers(d,compiled,answers)
  return {...normalized,privateScoring:scoreResearchSjtAnswers(d,compiled,normalized.responses)}
}
const metric=(s:ReturnType<typeof score>,key='cooperation')=>s.privateScoring.metrics.find(m=>m.key===key)!
const all={first:'yes',second:'yes',third:'yes'}
describe('Survey SJT V2 fixed-order measurement contract',()=>{
  it('indexes compiled channels once and preserves referenced duplicate ambiguity',()=>{
    const d=fixture(),compiled=compile(d)
    const expected=normalizeSurveySjtAnswers(d,compiled,all)
    let reads=0
    for(const scene of compiled.scenes){
      const channels=scene.channels
      Object.defineProperty(scene,'channels',{get:()=>{reads++;return channels},configurable:true})
    }
    expect(normalizeSurveySjtAnswers(d,compiled,all)).toEqual(expected)
    expect(reads).toBe(compiled.scenes.length)
    const duplicate=compile(d),unused={...duplicate.scenes[0].channels[0],channelKey:'unused'}
    duplicate.scenes[0].channels.push(unused,{...unused})
    expect(normalizeSurveySjtAnswers(d,duplicate,all)).toEqual(expected)
    duplicate.scenes[1].channels.push({...duplicate.scenes[0].channels[0]})
    expect(()=>normalizeSurveySjtAnswers(d,duplicate,all)).toThrow(/不明确/)
  })
  it('creates participant V2 drafts while preserving student/teacher V1 scoring semantics',()=>{
    expect(initialSurveyDefinition('SJT')).toMatchObject({schemaVersion:2,respondentType:'participant_self_report',orderPolicy:'FIXED'})
    const v2=fixture(),v1:SjtDraft={schemaVersion:1,respondentType:'student_self_report',scenarioKey:'discussion',
      title:v2.title,stimulus:v2.scenes[0].stimulus,author:v2.author,sourceNote:v2.sourceNote,
      licenseStatus:v2.licenseStatus,redistribution:v2.redistribution,metrics:v2.metrics,
      questions:v2.scenes[0].questions.map(({required,allowRefusal,...q})=>q)}
    expect(assertSurveyDraft('SJT',v1,true)).toEqual(v1)
    expect(surveySjtScenes(v1).map(s=>s.sceneKey)).toEqual(['discussion'])
    const old=previewResearchInstrument({kind:'SJT',title:v1.title,instrumentKey:'legacy',definition:v1,answers:{first:'yes',second:'yes'}})
    expect(old.ok).toBe(true)
    expect((old.score as ReturnType<typeof score>['privateScoring']).metrics[0].coverage?.numberOfIndependentScenes).toBe(2)
    v1.respondentType='teacher_self_report'
    expect(compileResearchSjt('legacy',v1).package.definition.respondentType).toBe('teacher_self_report')
    expect(validateSurveyDraft('SJT',{...v1,respondentType:'participant_self_report'},true).issues.length).toBeGreaterThan(0)
  })
  it('reuses AUTHOR_KEY_SUM and counts original scenes rather than question nodes',()=>{
    const d=fixture(),compiled=compile(d),result=score(d,all)
    expect(compiled.scenes.map(s=>s.channels[0].channelKey)).toEqual(['first','second','third'])
    expect(compiled.flow.nodes.slice(0,-1).map(n=>n.nodeType==='SCENE'&&n.motherSceneKey)).toEqual(['discussion','discussion','planning'])
    expect(compiled.flow.nodes.slice(0,-1).every(n=>n.nodeType==='SCENE'&&n.transition.type==='NEXT')).toBe(true)
    expect(metric(result).value).toBe(9)
    expect(metric(result).range).toEqual({min:0,max:9})
    expect(metric(result).coverage).toEqual({numberOfOpportunities:3,numberOfAnsweredOpportunities:3,numberOfIndependentScenes:2})
    expect(surveySjtQuestionEntries(d).map(x=>[x.motherSceneKey,x.question.questionKey])).toEqual([['discussion','first'],['discussion','second'],['planning','third']])
  })
  it('uses EXPERT_KEY mean and requires an explicit key source and known version',()=>{
    const d=fixture();d.scoring.modelKey='EXPERT_KEY'
    expect(validateSurveyDraft('SJT',d,true).issues).toContainEqual(expect.objectContaining({path:'scoring.sourceNote'}))
    d.scoring.sourceNote='研究团队整理的专家评分键'
    const result=score(d,all)
    expect(result.privateScoring.model?.modelKey).toBe('EXPERT_KEY')
    expect(metric(result).value).toBe(3)
    expect(metric(result).range).toEqual({min:0,max:3})
    expect(metric(result).coverage?.numberOfIndependentScenes).toBe(2)
    expect(validateSurveyDraft('SJT',{...d,scoring:{...d.scoring,modelVersion:'999'}},true).issues.length).toBeGreaterThan(0)
  })
  it('normalizes unordered subsets and freezes distinct SUM and MEAN policies',()=>{
    const d=fixture(),q=d.scenes[0].questions[0]
    q.responseType='MULTIPLE';q.aggregationPolicy='SUM';q.minSelections=2;q.maxSelections=2
    q.options.push({optionKey:'extra',label:'整理计划',contributions:{cooperation:6,risk:2}})
    const a=score(d,{...all,first:['extra','yes']}),b=score(d,{...all,first:['yes','extra']})
    expect(a.rawAnswers.first).toEqual(['yes','extra']);expect(a.responses).toEqual(b.responses)
    expect(metric(a).value).toBe(15)
    expect(a.questionResults[0].scorerOptionKey).toMatch(/^m[a-f0-9]{22}$/)
    q.aggregationPolicy='MEAN';expect(metric(score(d,{...all,first:['extra','yes']})).value).toBe(11)
    for(const raw of [[],['yes'],['yes','yes'],['yes','unknown'],['yes','no','extra'],'yes'])expect(()=>score(d,{...all,first:raw})).toThrow()
  })
  it('enforces exclusive options and the 24-choice subset budget',()=>{
    const d=fixture(),q=d.scenes[0].questions[0]
    q.responseType='MULTIPLE';q.aggregationPolicy='SUM';q.minSelections=1;q.maxSelections=3
    q.options.push({optionKey:'extra',label:'仅保留这个选择',contributions:{cooperation:6,risk:2}});q.exclusiveOptionKeys=['extra']
    expect(expandedSurveySjtOptions(q)).toHaveLength(4)
    expect(()=>resolveSurveySjtAnswer(q,['yes','extra'])).toThrow(/互斥/)
    expect(()=>resolveSurveySjtAnswer(q,['extra'])).not.toThrow()
    q.minSelections=2;expect(validateSurveyDraft('SJT',d,true).issues.some(i=>i.path.endsWith('minSelections'))).toBe(true)
    q.minSelections=1;q.exclusiveOptionKeys=[]
    q.options.push({optionKey:'four',label:'第四项',contributions:{cooperation:1,risk:0}},
      {optionKey:'five',label:'第五项',contributions:{cooperation:1,risk:0}})
    expect(validateSurveyDraft('SJT',d,true).issues.some(i=>i.message.includes('24'))).toBe(true)
  })
  it('keeps optional missing, refusal and not-applicable distinct without zero filling in either model',()=>{
    for(const modelKey of ['AUTHOR_KEY_SUM','EXPERT_KEY'] as const){
      const d=fixture();d.scoring={modelKey,modelVersion:'1',sourceNote:'专家来源'}
      d.scenes[0].questions[0].required=false;d.scenes[0].questions[1].allowRefusal=true
      d.scenes[1].questions[0].options.push({optionKey:'unjudgeable',label:'无法判断',nonanswerReason:'UNABLE_TO_JUDGE',contributions:{}})
      const result=score(d,{second:{_surveyRefusal:true},third:'unjudgeable'})
      expect(result.responses).toEqual([])
      expect(result.rawAnswers).toEqual({second:{_surveyRefusal:true},third:'unjudgeable'})
      expect(result.missing).toEqual([{itemKey:'first',reason:'SHOWN_MISSING'},
        {itemKey:'second',reason:'REFUSED'},{itemKey:'third',reason:'UNABLE_TO_JUDGE'}])
      expect(metric(result).value).toBeNull();expect(metric(result).status).toBe('not_calculable')
      expect(metric(result).coverage?.numberOfIndependentScenes).toBe(0)
      expect(compile(d).scoring.model?.expertKey?.some(e=>e.optionKey==='unjudgeable')).toBe(false)
    }
  })
  it('allows only singleton nonanswer sets below multi min and never gives them scores',()=>{
    const d=fixture(),q=d.scenes[0].questions[0]
    q.responseType='MULTIPLE';q.aggregationPolicy='SUM';q.minSelections=2;q.maxSelections=2
    q.options.push({optionKey:'extra',label:'整理计划',contributions:{cooperation:6,risk:2}},
      {optionKey:'declined',label:'不愿回答',contributions:{},nonanswerReason:'DECLINED'})
    const result=score(d,{...all,first:['declined']})
    expect(result.rawAnswers.first).toEqual(['declined'])
    expect(result.questionResults[0]).toMatchObject({scorerOptionKey:null,status:'REFUSED'})
    expect(metric(result).value).toBeNull();expect(()=>score(d,{...all,first:['declined','yes']})).toThrow()
    expect(()=>score(d,{...all,first:['declined','forged']})).toThrow()
    q.options[3].contributions={cooperation:0,risk:0}
    expect(validateSurveyDraft('SJT',d,true).issues.some(i=>i.message.includes('不能补零'))).toBe(true)
  })
  it('rejects required omissions, forged questions/refusal objects, and mismatched frozen choices',()=>{
    const d=fixture(),compiled=compile(d)
    for(const raw of [{first:'yes'}, {...all,forged:'yes'}, {...all,first:{_surveyRefusal:true}},
      {...all,first:{_surveyRefusal:true,extra:1}}, {...all,first:'missing'}])expect(()=>normalizeSurveySjtAnswers(d,compiled,raw)).toThrow()
    compiled.scenes[0].channels[0]={...compiled.scenes[0].channels[0],responseType:'SINGLE_CHOICE',
      options:[{optionKey:'forged',label:'forged'},{optionKey:'other',label:'other'}]}
    expect(()=>normalizeSurveySjtAnswers(d,compiled,all)).toThrow(/冻结/)
  })
  it('checks unique identities, full matrices, permissions, total budget, and fixed order',()=>{
    const changes:Array<(d:SjtDraftV2)=>void>=[d=>{d.scenes[1].questions[0].questionKey='first'},
      d=>{d.scenes[1].sceneKey='discussion'},d=>{delete d.scenes[0].questions[0].options[0].contributions.risk},
      d=>{d.scenes[0].questions[0].options[0].contributions.unknown=1},d=>{d.scenes[0].questions[0].options[0].contributions.risk=Infinity},
      d=>{d.scenes[0].questions[0].options[0].label=''}]
    for(const change of changes){const d=fixture();change(d);expect(validateSurveyDraft('SJT',d,true).issues.length).toBeGreaterThan(0)}
    expect(validateSurveyDraft('SJT',{...fixture(),orderPolicy:'RANDOM'},true).issues.length).toBeGreaterThan(0)
    expect(validateSurveyDraft('SJT',{...fixture(),flow:{script:'x'}},true).issues.length).toBeGreaterThan(0)
    const many=fixture();many.scenes=Array.from({length:11},(_,si)=>({sceneKey:'s'+si,title:'场景',stimulus:'情境',
      questions:Array.from({length:10},(_,qi)=>question('q'+si+'_'+qi))}))
    expect(validateSurveyDraft('SJT',many,true).issues.some(i=>i.message.includes('100'))).toBe(true)
  })
  it('previews partial answers as real kernel missingness',()=>{
    const result=previewResearchInstrument({kind:'SJT',title:'test',instrumentKey:'study',definition:fixture(),answers:{first:'yes'}})
    expect(result.ok).toBe(true)
    expect((result.score as ReturnType<typeof score>['privateScoring']).metrics.every(m=>m.value===null)).toBe(true)
    expect(result).toMatchObject({missing:[{itemKey:'second',reason:'SHOWN_MISSING'},{itemKey:'third',reason:'SHOWN_MISSING'}]})
  })
  it('accepts the exact 16000-cell maximum and rejects expansion beyond it',()=>{
    const d=fixture()
    d.metrics=Array.from({length:20},(_,i)=>({metricKey:'metric'+i,label:'维度'+i,direction:'descriptive' as const}))
    const contributions=Object.fromEntries(d.metrics.map(m=>[m.metricKey,1]))
    d.scenes=Array.from({length:20},(_,si)=>({sceneKey:'s'+si,title:'情境'+si,stimulus:'完整材料',
      questions:Array.from({length:5},(_,qi)=>({...question('q'+si+'_'+qi),
        options:Array.from({length:8},(_,oi)=>({optionKey:'o'+oi,label:'选项'+oi,contributions:{...contributions}})),
      }))}))
    expect(validateSurveyDraft('SJT',d,true).issues).toEqual([])
    const compiled=compile(d)
    expect(compiled.scenes).toHaveLength(100)
    expect(compiled.scoring.model?.expertKey).toHaveLength(16000)
    d.scenes[0].questions[0].options.push({optionKey:'extra',label:'额外选项',contributions})
    expect(validateSurveyDraft('SJT',d,true).issues.some(i=>i.message.includes('16000'))).toBe(true)
  })
  it('handles valid constructor keys without prototype contributions and rejects empty single arrays',()=>{
    const d=fixture()
    d.metrics=[{metricKey:'constructor',label:'属性名维度',direction:'descriptive'}]
    for(const {question:q} of surveySjtQuestionEntries(d)){
      q.responseType='MULTIPLE';q.aggregationPolicy='SUM';q.minSelections=1;q.maxSelections=2
      q.options.forEach(o=>{o.contributions={constructor:2}})
    }
    expect(score(d,{first:['yes'],second:['yes','no'],third:['yes']}).privateScoring.metrics[0].value).toBe(8)
    const single=fixture();single.scenes[0].questions[0].required=false
    expect(()=>score(single,{...all,first:[]})).toThrow()
    const explicit=fixture();explicit.scenes[0].image=undefined
    expect(()=>compile(explicit)).not.toThrow()
  })
  it('returns precise answer paths in V2 preview errors',()=>{
    const result=previewResearchInstrument({kind:'SJT',title:'test',instrumentKey:'study',definition:fixture(),answers:{first:'forged'}})
    expect(result).toMatchObject({ok:false,issues:[{path:'answers.first',severity:'error'}]})
  })

})

it('normalizes complete SJT V2 cognitive prefix including refusal without invoking scorer',()=>{
  const d=fixture();d.scenes[0].questions[0].allowRefusal=true
  const unit=compileFrozenResearchUnit({id:'2e7a5013-7ab9-4e62-bc35-f89a67e49a63',instrumentKey:'prefix',title:d.title,revision:1,kind:'SJT',definition:d})
  const spy=vi.spyOn(sjtRuntime,'scoreResearchSjtAnswers')
  try{
    const answers={...all,first:{_surveyRefusal:true}}
    const normalized=validateSurveyUnitAnswers(unit,answers)
    expect(normalized.rawAnswers).toEqual(answers)
    expect(normalized.missing).toContainEqual({itemKey:'first',reason:'REFUSED'})
    expect(Object.keys(normalized).sort()).toEqual(['missing','rawAnswers'])
    expect(()=>validateSurveyUnitAnswers(unit,{...all,second:'invalid'})).toThrow()
    expect(()=>validateSurveyUnitAnswers(unit,{first:'yes'})).toThrow()
    expect(spy).toHaveBeenCalledTimes(0)
  }finally{spy.mockRestore()}
})
