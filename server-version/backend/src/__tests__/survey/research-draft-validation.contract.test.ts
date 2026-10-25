import {afterEach,describe,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import * as canonical from '../../modules/assessment-runtime/canonical'
import {
  assertSurveyDraft,validateSurveyDraft,SurveyDraftError,
  type FormDraft,type ScaleDraft,type SjtDraft,type SurveyKind,
} from '../../modules/survey/builder.definition'

const form=():FormDraft=>({schemaVersion:1,pages:[{pageKey:'page',title:'Page',questions:[
  {itemKey:'source',type:'MULTIPLE',prompt:'Choose',required:true,rows:[],
    options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}]},
  {itemKey:'next',type:'SHORT_TEXT',prompt:'Explain',required:false,rows:[],options:[],
    displayIf:{itemKey:'source',operator:'INCLUDES',optionKey:'yes'}},
]}]})
const scale=():ScaleDraft=>({schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
  responseOptions:[{optionKey:'low',label:'Low',score:1},{optionKey:'high',label:'High',score:5}],
  dimensions:[{dimensionKey:'dimension',label:'Dimension',direction:'descriptive'}],
  items:[{itemKey:'first',prompt:'First',required:true,reverse:false,dimensionKeys:['dimension']}],
})
const sjt=():SjtDraft=>({schemaVersion:1,respondentType:'student_self_report',scenarioKey:'scene',
  title:'Scene',stimulus:'Consider',author:'Author',sourceNote:'Original',
  licenseStatus:'self_authored',redistribution:'allowed',
  metrics:[{metricKey:'effort',label:'Effort',direction:'descriptive'}],
  questions:['first','second'].map(questionKey=>({questionKey,prompt:'Choose',options:[
    {optionKey:'yes',label:'Yes',contributions:{effort:1}},
    {optionKey:'no',label:'No',contributions:{effort:0}},
  ]})),
})
const expectedDigest=(kind:SurveyKind,definition:unknown)=>createHash('sha256')
  .update(canonical.canonicalJsonString(JSON.parse(JSON.stringify({kind,definition})))).digest('hex')
const draftDigestCalls=(hash:{mock:{calls:unknown[][]}})=>hash.mock.calls.filter(([value])=>
  value&&typeof value==='object'&&'kind' in value&&'definition' in value)
const rejected=(kind:SurveyKind,input:unknown,forPreview=true,legacy=false)=>{
  const result=validateSurveyDraft(kind,input,forPreview,legacy)
  expect(result.issues.some(x=>x.severity==='error')).toBe(true)
  let error:unknown
  try{assertSurveyDraft(kind,input,forPreview,legacy)}catch(e){error=e}
  expect(error).toBeInstanceOf(SurveyDraftError)
  expect((error as SurveyDraftError).issues).toEqual(result.issues)
  if(result.definition)expect(result.digest).toBe(expectedDigest(kind,result.definition))
  else expect(result).not.toHaveProperty('digest')
  return result
}
const exactBytesForm=(bytes:number):FormDraft=>{
  const definition:FormDraft={schemaVersion:1,pages:[{pageKey:'page',title:'Page',questions:
    Array.from({length:30},(_,i)=>({itemKey:'item'+i,type:'SHORT_TEXT',prompt:'x',
      required:false,options:[],rows:[]}))}]}
  let remaining=bytes-Buffer.byteLength(JSON.stringify({kind:'FORM',definition}),'utf8')
  for(const q of definition.pages[0].questions){
    const add=Math.min(remaining,40000)
    q.prompt+='界'.repeat(Math.floor(add/3))+'x'.repeat(add%3)
    remaining-=add
  }
  expect(remaining).toBe(0)
  expect(Buffer.byteLength(JSON.stringify({kind:'FORM',definition}),'utf8')).toBe(bytes)
  return definition
}
afterEach(()=>vi.restoreAllMocks())

describe('Survey assertion shares validation without an unused draft digest',()=>{
  it.each([
    ['FORM',form],['SCALE',scale],['SJT',sjt],
  ] as const)('keeps %s normalization and public digest while assertion skips the draft hash',(kind,fixture)=>{
    const expected=fixture(),input=structuredClone(expected)
    if('pages' in input){
      input.pages[0].title='  Page  '
      // HTTP JSON omits absent optional fields; retain parser defaults.
      delete (input.pages[0].questions[1] as Partial<FormDraft['pages'][number]['questions'][number]>).rows
    }else if('items' in input)input.items[0].prompt='  First  '
    else input.title='  Scene  '
    const original=structuredClone(input),digest=expectedDigest(kind,expected)
    const hash=vi.spyOn(canonical,'canonicalHash')
    expect(assertSurveyDraft(kind,input,true)).toStrictEqual(expected)
    expect(hash).not.toHaveBeenCalled()
    expect(input).toStrictEqual(original)
    expect(validateSurveyDraft(kind,input,true)).toStrictEqual({definition:expected,issues:[],digest})
    expect(draftDigestCalls(hash)).toHaveLength(1)
  })
  it('retains SJT multi-selection validation hashes and only removes the discarded draft digest',()=>{
    const input=sjt()
    Object.assign(input.questions[0],{responseType:'MULTIPLE',aggregationPolicy:'MEAN',
      minSelections:1,maxSelections:2})
    const hash=vi.spyOn(canonical,'canonicalHash')
    expect(assertSurveyDraft('SJT',input,true)).toEqual(input)
    const assertionCalls=hash.mock.calls.map(([value])=>value)
    expect(assertionCalls).toHaveLength(3)
    expect(draftDigestCalls(hash)).toHaveLength(0)
    hash.mockClear()
    const validated=validateSurveyDraft('SJT',input,true)
    expect(validated.issues).toEqual([])
    expect(validated.digest).toBe(expectedDigest('SJT',input))
    expect(hash.mock.calls.slice(0,-1).map(([value])=>value)).toEqual(assertionCalls)
    expect(draftDigestCalls(hash)).toHaveLength(1)
  })
  it.each(['FORM','SCALE','SJT'] as const)('keeps %s schema errors and never hashes an unparsed draft',kind=>{
    const hash=vi.spyOn(canonical,'canonicalHash')
    rejected(kind,{schemaVersion:99,unexpected:true})
    expect(hash).not.toHaveBeenCalled()
  })
  it.each(['FORM','SCALE','SJT'] as const)('keeps %s semantic errors and public invalid-draft digests',kind=>{
    const input=kind==='FORM'?form():kind==='SCALE'?scale():sjt()
    if('pages' in input)input.pages[0].questions[1].itemKey='source'
    else if('items' in input)input.items[0].dimensionKeys=['missing']
    else input.questions[0].options[0].contributions={missing:1}
    const hash=vi.spyOn(canonical,'canonicalHash')
    rejected(kind,input)
    expect(draftDigestCalls(hash)).toHaveLength(1)
  })
  it('preserves preview-only rejection and ordinary incomplete draft acceptance',()=>{
    const input=scale()
    input.items[0].prompt='   '
    expect(assertSurveyDraft('SCALE',input)).toEqual({...input,items:[{...input.items[0],prompt:''}]})
    rejected('SCALE',input,true)
  })
  it.each([false,true])('keeps the exact UTF-8 480 KB definition limit with legacy=%s',legacy=>{
    const accepted=exactBytesForm(480000)
    expect(assertSurveyDraft('FORM',accepted,true,legacy)).toEqual(accepted)
    const valid=validateSurveyDraft('FORM',accepted,true,legacy)
    expect(valid.issues).toEqual([])
    expect(valid.digest).toBe(expectedDigest('FORM',accepted))
    const invalid=rejected('FORM',exactBytesForm(480001),true,legacy)
    expect(invalid.issues).toEqual([{path:'definition',message:'单份研究工具数据体积不能超过 480 KB',severity:'error'},
      {path:'definition',message:'定义超过大小限制',severity:'error'}])
  })
  it('keeps historical condition operators opt-in without accepting broken frozen references',()=>{
    const input=form()
    input.pages[0].questions[1].displayIf!.operator='EQUALS'
    expect(rejected('FORM',input).issues[0].path).toMatch(/displayIf.operator$/)
    expect(assertSurveyDraft('FORM',input,true,true)).toEqual(input)
    expect(validateSurveyDraft('FORM',input,true,true).digest).toBe(expectedDigest('FORM',input))
    input.pages[0].questions[1].displayIf!.optionKey='missing'
    expect(rejected('FORM',input,true,true).issues[0].path).toMatch(/displayIf.optionKey$/)
  })
  it.each(['fields','answer bytes'] as const)('keeps the authoring %s budget and frozen-publication exemption',budget=>{
    const input=form()
    input.pages[0].questions=budget==='fields'
      ?Array.from({length:13},(_,i)=>({itemKey:'matrix'+i,type:'MATRIX',prompt:'Matrix',required:true,
        options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],
        rows:Array.from({length:40},(_,r)=>({rowKey:'row'+r,label:'Row'}))}))
      :Array.from({length:9},(_,i)=>({itemKey:'text'+i,type:'LONG_TEXT',prompt:'Text',required:false,
        options:[],rows:[],maxLength:10000}))
    expect(rejected('FORM',input).issues.some(x=>x.path==='pages')).toBe(true)
    expect(assertSurveyDraft('FORM',input,true,true)).toEqual(input)
    expect(validateSurveyDraft('FORM',input,true,true)).toEqual({definition:input,issues:[],digest:expectedDigest('FORM',input)})
  })
  it('keeps the V1/V2 schema semantics even for frozen publications',()=>{
    const input=form()
    input.pages[0].questions=[{itemKey:'date',type:'DATE',prompt:'Date',required:true,options:[],rows:[]}]
    expect(rejected('FORM',input,true,true).issues[0].path).toMatch(/\.type$/)
    input.schemaVersion=2
    expect(assertSurveyDraft('FORM',input,true,true)).toEqual(input)
  })
})
