import {describe,it,expect} from 'vitest'
import {formQuestionRegistry,assertSurveyDraft,type FormDraft,type FormQuestion,type ScaleDraft} from '../../modules/survey/builder.definition'
import {compileFrozenResearchUnit,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {computeSurveyFinal} from '../../modules/survey/final.compute'
import {tableToCsv,protectCsvCell} from '../../modules/survey/analytics.export-format'
const options=[{optionKey:'a',label:'零一, "中文"\nA',score:1},{optionKey:'b',label:'B',score:3},{optionKey:'c',label:'C',score:5}];
const opts=options.map(({optionKey,label})=>({optionKey,label}));
const q=(itemKey:string,type:FormQuestion['type'],extra:Partial<FormQuestion>={}):FormQuestion=>({itemKey,type,prompt:'TEST '+itemKey,required:true,options:[],rows:[],...extra});
const form:FormDraft={schemaVersion:2,pages:[{pageKey:'p1',title:'Unicode 中文',questions:[
 q('single','SINGLE',{options:opts}),q('multi','MULTIPLE',{options:opts}),q('short','SHORT_TEXT',{maxLength:80}),q('long','LONG_TEXT',{maxLength:100}),q('number','NUMBER',{min:-100,max:100}),q('likert','LIKERT',{options:opts}),q('matrix','MATRIX',{options:opts,rows:[{rowKey:'z',label:'Z'},{rowKey:'a',label:'A'}]})
]},{pageKey:'p2',title:'Page 2',questions:[
 q('conditional','SHORT_TEXT',{displayIf:{itemKey:'single',operator:'EQUALS',optionKey:'b'}}),q('optional','NUMBER',{required:false}),q('refusal','NUMBER',{allowRefusal:true}),q('date','DATE'),q('time','TIME',{timeZone:'Asia/Shanghai'}),q('rank','RANK_ORDER',{options:opts}),q('slider','SLIDER',{min:-1,max:1,step:0.25,precision:2}),q('sum','CONSTANT_SUM',{options:opts,total:1}),q('mm','MATRIX_MULTIPLE',{options:opts,rows:[{rowKey:'z',label:'Z'},{rowKey:'a',label:'A'}]}),q('other','SINGLE',{options:opts,otherOptionKey:'c'})]}]};
const text='00123';const long='中文, "quoted"\nline two 🐈';
function formAnswers(n:number){return {single:n?'b':'a',multi:['c','a'],short:n?'=SUM(1,2)':text,long,number:n?0:-12.3456789,likert:'b','matrix:z':'c','matrix:a':'a',...(n?{conditional:'shown'}:{}),refusal:{_surveyRefusal:true},date:'2024-02-29',time:'09:05',rank:['c','b','a'],slider:-0.25,sum:{a:0.1,b:0.2,c:0.7},'mm:z':['c','a'],'mm:a':['b'],other:'c','other:other':'其他, "值"'}}
function scale(mode:'ONE_BY_ONE'|'ALL_AT_ONCE',aggregation:'sum'|'mean'):ScaleDraft{return {schemaVersion:1,presentationMode:mode,respondentType:'participant_self_report',responseOptions:options,dimensions:[{dimensionKey:'d1',label:'D1',direction:'descriptive'},{dimensionKey:'d2',label:'D2',direction:'descriptive'}],aggregation,items:[{itemKey:'q1',prompt:'Q1',required:true,reverse:false,dimensionKeys:['d1']},{itemKey:'q2',prompt:'Q2',required:true,reverse:true,dimensionKeys:['d1','d2']},{itemKey:'q3',prompt:'Q3',required:true,reverse:false,dimensionKeys:['d2']}]}}
const timings={timed:{q1:{schemaVersion:1,firstResponseMs:125,activeTimeMs:250,changeCount:0,revisitCount:0,visits:1,interrupted:false,recoveredWithoutClock:false},q2:{schemaVersion:1,firstResponseMs:300,activeTimeMs:900,changeCount:2,revisitCount:1,visits:2,interrupted:true,recoveredWithoutClock:false},q3:{schemaVersion:1,firstResponseMs:null,activeTimeMs:150,changeCount:0,revisitCount:0,visits:1,interrupted:true,recoveredWithoutClock:true}}};

const snapshot=(definition:FormDraft=form):ResearchFrozenPublication=>({schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:'project',waveId:'wave',collectionMode:'SINGLE_UNLINKED',consentVersion:1,linkageNoticeConfirmed:false,consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',units:[
 compileFrozenResearchUnit({id:'f',instrumentKey:'form',kind:'FORM',title:'Form',revision:1,definition}),
 compileFrozenResearchUnit({id:'s',instrumentKey:'timed',kind:'SCALE',title:'Scale',revision:1,definition:scale('ONE_BY_ONE','sum')}),
]})
const input=()=>({form:formAnswers(0),timed:{q1:'a',q2:'a',q3:'c'}})
describe('Survey typed storage and export boundaries',()=>{
 it('exercises every registered FORM type with exact storage shapes',()=>{
  expect(new Set(form.pages.flatMap(p=>p.questions.map(q=>q.type)))).toEqual(new Set(Object.keys(formQuestionRegistry)))
  assertSurveyDraft('FORM',form,true)
  const result=computeSurveyFinal(snapshot(),input(),undefined,undefined,'FINAL',timings)
  const f=result.units[0]
  expect(f.rawAnswers).toMatchObject({single:'a',multi:['c','a'],short:'00123',long,number:-12.3456789,likert:'b',matrix:{z:'c',a:'a'},date:'2024-02-29',time:'09:05',rank:['c','b','a'],slider:-0.25,sum:{a:0.1,b:0.2,c:0.7},mm:{z:['c','a'],a:['b']},other:'c','other:other':'其他, "值"'})
  expect(f.missing).toEqual(expect.arrayContaining([{itemKey:'conditional',reason:'NOT_SHOWN'},{itemKey:'optional',reason:'SHOWN_MISSING'},{itemKey:'refusal',reason:'REFUSED'}]))
  expect(result.itemTimings).toEqual(timings)
  expect(result.units[1].rawAnswers).toEqual({q1:'a',q2:'a',q3:'c'})
  expect(JSON.parse(JSON.stringify(result))).toEqual(result)
 })
 it.each([
  ['single','label instead of code'],['multi',['a','a']],['short','x'.repeat(81)],['long',123],['number','00123'],['likert','z'],['matrix:z','z'],['date','2023-02-29'],['time','24:00'],['rank',['a','a','b']],['slider',0.2],['sum',{a:0.1,b:0.2,c:0.6}],['mm:z',['a','a']],['other:other',''],
 ])('rejects invalid %s without silently coercing data',(key,value)=>{
  const answers=input();(answers.form as Record<string,unknown>)[key]=value
  expect(()=>computeSurveyFinal(snapshot(),answers,undefined,undefined,'FINAL',timings)).toThrow()
 })
 it.each(['single','multi','short','long','number','likert','matrix:z','date','time','rank','slider','sum','mm:z','other:other'])('rejects missing required %s',(key)=>{
  const answers=input();delete (answers.form as Record<string,unknown>)[key]
  expect(()=>computeSurveyFinal(snapshot(),answers,undefined,undefined,'FINAL',timings)).toThrow()
 })
 it.each(['single','multi','short','long','number','likert','matrix:z','date','time','rank','slider','sum','mm:z'])('distinguishes optional missing and explicit refusal for %s',(key)=>{
  const definition=structuredClone(form),question=definition.pages.flatMap(p=>p.questions).find(q=>q.itemKey===key.split(':')[0])!
  question.required=false
  const missing=input();delete (missing.form as Record<string,unknown>)[key]
  expect(computeSurveyFinal(snapshot(definition),missing,undefined,undefined,'FINAL',timings).units[0].missing)
    .toContainEqual({itemKey:key,reason:'SHOWN_MISSING'})
  question.required=true;question.allowRefusal=true
  const refused=input();(refused.form as Record<string,unknown>)[key]={_surveyRefusal:true}
  expect(computeSurveyFinal(snapshot(definition),refused,undefined,undefined,'FINAL',timings).units[0].missing)
    .toContainEqual({itemKey:key,reason:'REFUSED'})
 })
 it('rejects slider range and precision violations with specific validation',()=>{
  const outside=input();outside.form.slider=1.25
  expect(()=>computeSurveyFinal(snapshot(),outside,undefined,undefined,'FINAL',timings)).toThrow(/范围|最大/)
  const precise=input();precise.form.slider=0.125
  expect(()=>computeSurveyFinal(snapshot(),precise,undefined,undefined,'FINAL',timings)).toThrow('最多允许 2 位小数')
 })
 it('keeps choice order/ranking and input objects unchanged',()=>{
  const answers=input(),before=JSON.stringify(answers),clocks=JSON.stringify(timings)
  computeSurveyFinal(snapshot(),answers,undefined,undefined,'FINAL',timings)
  expect(JSON.stringify(answers)).toBe(before);expect(JSON.stringify(timings)).toBe(clocks)
 })
 it.each(['=SUM(1,2)','+cmd','-cmd','@cmd',' \t=1','\u200B=1','\uFEFF@x'])('protects dangerous CSV text %s',(value)=>{
  expect(protectCsvCell(value)).toBe("'"+value)
 })
 it('preserves numeric negatives/zero, quotes, newlines and leading zeros',()=>{
  expect(protectCsvCell(-12.3456789)).toBe('-12.3456789');expect(protectCsvCell(0)).toBe('0')
  expect(tableToCsv(['text','number'],[['00123',-0.25],[long,0]])).toBe('"text","number"\r\n"00123","-0.25"\r\n"中文, ""quoted""\nline two 🐈","0"\r\n')
  expect(()=>tableToCsv(['a'],[[1,2]])).toThrow();expect(()=>protectCsvCell(Infinity)).toThrow();expect(()=>protectCsvCell(['a'])).toThrow()
 })
})
