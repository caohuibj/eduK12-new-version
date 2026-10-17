import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {selectSurveyFixtureRecord,surveyFixtureSql} from './survey-source-select.fixture'
import {prisma} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import * as security from '../../modules/assessment-runtime/security'
import {compileFrozenResearchUnit,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {computeSurveyFinal,type SurveyComputedFinal} from '../../modules/survey/final.compute'
import {loadSurveyItemDictionary,loadSurveySource} from '../../modules/survey/analytics.source'
import type {FormDraft,FormQuestion,ScaleDraft,SjtDraft} from '../../modules/survey/builder.definition'

vi.mock('../../config/database',()=>({prisma:{$transaction:vi.fn()}}))
const owner={actorUserId:'synthetic-owner',projectId:'synthetic-project',waveIds:['synthetic-wave'],includeAttendance:false}
const dictionaryInput={actorUserId:owner.actorUserId,projectId:owner.projectId,waveId:owner.waveIds[0]}
const choices=[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'}]
const question=(itemKey:string,extra:Partial<FormQuestion>={}):FormQuestion=>({
  itemKey,type:'NUMBER',prompt:itemKey,required:false,options:[],rows:[],...extra,
})
function fixture(participants=3){
  const form:FormDraft={schemaVersion:2,pages:[{pageKey:'page',title:'Synthetic',questions:[
    question('zero'),question('blank',{type:'SHORT_TEXT'}),question('note',{type:'LONG_TEXT'}),
    question('multi',{type:'MULTIPLE',options:choices}),
    question('rank',{type:'RANK_ORDER',options:choices}),
    question('total',{type:'CONSTANT_SUM',options:choices,total:10}),
    question('time',{type:'TIME',timeZone:'Asia/Shanghai'}),
    question('grid',{type:'MATRIX',options:choices,rows:[{rowKey:'first',label:'First'},{rowKey:'second',label:'Second'}]}),
    question('grid_first'),
    question('matrix',{type:'MATRIX_MULTIPLE',options:choices,rows:[{rowKey:'row',label:'Row'}]}),
    question('choose',{type:'SINGLE',options:choices,otherOptionKey:'b'}),question('choose_other'),
    question('missing'),question('refused',{allowRefusal:true}),
  ]}]}
  const scale:ScaleDraft={schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',
    responseOptions:choices.map((o,i)=>({...o,score:i+1})),
    dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
    items:['one','two','three'].map(itemKey=>({itemKey,prompt:itemKey,required:true,reverse:false,dimensionKeys:['total']}))}
  const sjt:SjtDraft={schemaVersion:1,respondentType:'student_self_report',scenarioKey:'scene',title:'Scene',stimulus:'Synthetic',
    author:'Researcher',sourceNote:'Synthetic',licenseStatus:'self_authored',redistribution:'allowed',
    metrics:[{metricKey:'total',label:'Total',direction:'descriptive'}],questions:[
      {questionKey:'single',prompt:'Single',options:choices.map((o,i)=>({...o,contributions:{total:i+1}}))},
      {questionKey:'multiple',prompt:'Multiple',responseType:'MULTIPLE',aggregationPolicy:'SUM',
        minSelections:1,maxSelections:2,options:choices.map((o,i)=>({...o,contributions:{total:i+1}}))},
    ]}
  const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:owner.projectId,waveId:owner.waveIds[0],
    collectionMode:'LINKED_WAVES',consentVersion:1,linkageNoticeConfirmed:true,consentDigest:'synthetic-consent',
    runtimeStatus:'SURVEY_FINAL_V1',units:[
      compileFrozenResearchUnit({id:'form',instrumentKey:'form',kind:'FORM',title:'Form',revision:2,definition:form}),
      compileFrozenResearchUnit({id:'scale',instrumentKey:'scale',kind:'SCALE',title:'Scale',revision:3,definition:scale}),
      compileFrozenResearchUnit({id:'sjt',instrumentKey:'sjt',kind:'SJT',title:'SJT',revision:4,definition:sjt}),
    ]}
  const result=computeSurveyFinal(snapshot,{form:{zero:0,blank:'',note:'private text',multi:['b','a'],rank:['b','a'],
    total:{a:0,b:10},time:'09:30','grid:first':'a',grid_first:7,'matrix:row':['a','b'],
    choose:'b','choose:other':'private other',choose_other:8,refused:{_surveyRefusal:true}},
    scale:{one:'a',two:'b',three:'a'},sjt:{single:'b',multiple:['b','a']}})
  const publication={id:'synthetic-publication',projectId:owner.projectId,version:4,
    compiledSnapshot:snapshot,definitionDigest:canonicalHash(snapshot)}
  const wave={id:owner.waveIds[0],projectId:owner.projectId,ordinal:1,status:'OPEN',revision:1,publicationId:publication.id}
  const completedAt=new Date('2026-10-17T00:00:00Z')
  const finals=Array.from({length:participants},(_,i)=>({id:'final-'+i,publicationId:publication.id,
    definitionDigest:publication.definitionDigest,completedAt,resultsHash:canonicalHash(result),
    resultsCipher:security.encryptUnifiedRuntimePayload(result),wave,
    attempt:{id:'attempt-'+i,projectId:owner.projectId,waveId:wave.id,
      startedAt:new Date('2026-10-16T23:59:00Z'),flowAssignmentCipher:null,
      participant:{status:'ACTIVE',researchCode:'R-'+i}}}))
  const state={reads:0,beforeRead:(_read:number)=>{}}
  const tx={
    $queryRaw:vi.fn(async(parts:TemplateStringsArray|{strings:string[]})=>surveyFixtureSql(parts).includes('FROM "survey_projects"')
      ?[{collectionMode:'LINKED_WAVES',sourceRevision:1,sourceCutOff:new Date('2026-10-17T00:01:00Z')}]:surveyFixtureSql(parts).includes('finalCipherBytes')?[{finalCipherBytes:0n,frozenBytes:0n}]:[{bytes:0n}]),
    surveyWave:{count:vi.fn(async()=>1),findFirst:vi.fn(async()=>wave),findMany:vi.fn(async()=>[wave])},
    surveyWaveFinal:{count:vi.fn(async()=>finals.length),findMany:vi.fn(async(args:{select?:unknown})=>
      finals.map(final=>selectSurveyFixtureRecord(final,args.select)))},
    surveyPublication:{findUnique:vi.fn(async()=>publication),findMany:vi.fn(async()=>[publication])},
  }
  vi.mocked(prisma.$transaction).mockImplementation((async(fn:(value:typeof tx)=>Promise<unknown>)=>{
    state.beforeRead(++state.reads);return fn(tx)
  }) as never)
  const rewriteResult=()=>{for(const final of finals){final.resultsHash=canonicalHash(result);final.resultsCipher=security.encryptUnifiedRuntimePayload(result)}}
  return {snapshot,result,publication,wave,finals,tx,state,rewriteResult}
}
// JSON source signatures do not invoke array iterators or .map methods. These
// counters therefore measure schema projection work, not the retained fences.
function countSchemaWork(snapshot:ResearchFrozenPublication){
  const form=snapshot.units[0].displayDefinition as FormDraft
  const scale=snapshot.units[1].displayDefinition as ScaleDraft
  const sjt=snapshot.units[2].displayDefinition as SjtDraft
  const iterations=[...form.pages.map(p=>vi.spyOn(p.questions,Symbol.iterator)),
    vi.spyOn(scale.items,Symbol.iterator),vi.spyOn(sjt.questions,Symbol.iterator)]
  const optionMaps=[...form.pages.flatMap(p=>p.questions.map(q=>vi.spyOn(q.options,'map'))),
    vi.spyOn(scale.responseOptions,'map'),...sjt.questions.map(q=>vi.spyOn(q.options,'map'))]
  return {iterations,optionMaps}
}
const observedMissing=()=>{
  const decrypt=security.decryptUnifiedRuntimePayload
  const findCalls:Array<{mock:{calls:unknown[][]}}>=[],iterations:Array<{mock:{calls:unknown[][]}}>=[]
  vi.spyOn(security,'decryptUnifiedRuntimePayload').mockImplementation(((cipher:string)=>{
    const result=decrypt<SurveyComputedFinal>(cipher)
    for(const unit of result.units){
      findCalls.push(vi.spyOn(unit.missing,'find'))
      iterations.push(vi.spyOn(unit.missing,Symbol.iterator))
    }
    return result
  }) as typeof security.decryptUnifiedRuntimePayload)
  return {findCalls,iterations}
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','ab'.repeat(32));vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','false')})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})

describe('Request-local frozen Survey raw descriptors',()=>{
  it('constructs each unit descriptor and option table once across schema and participant projection',async()=>{
    const {snapshot}=fixture(4),counts=countSchemaWork(snapshot)
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    expect(source.raw).toHaveLength(source.codebook.length*4)
    expect.soft(counts.iterations.map(counter=>counter.mock.calls.length)).toEqual([1,1,1])
    expect.soft(counts.optionMaps.map(counter=>counter.mock.calls.length)).toEqual(counts.optionMaps.map(()=>1))
  })
  it('enumerates dictionary definitions once and never constructs unused option tables',async()=>{
    const {snapshot,tx}=fixture(0),counts=countSchemaWork(snapshot)
    const dictionary=await loadSurveyItemDictionary(dictionaryInput)
    expect(dictionary.variables.some(v=>['SHORT_TEXT','LONG_TEXT','OTHER_TEXT'].includes(v.responseType))).toBe(false)
    expect(dictionary.variables.find(v=>v.itemKey==='choose_other')?.columnKey).toContain('__K')
    expect.soft(counts.iterations.map(counter=>counter.mock.calls.length)).toEqual([1,1,1])
    expect.soft(counts.optionMaps.map(counter=>counter.mock.calls.length)).toEqual(counts.optionMaps.map(()=>0))
    expect(tx.surveyWaveFinal.findMany).not.toHaveBeenCalled()
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  })
  it('indexes missing entries once per participant unit and retains first occurrence and matrix fallback',async()=>{
    const {result,rewriteResult}=fixture(2)
    result.units[0].missing.push({itemKey:'missing',reason:'REFUSED'},
      {itemKey:'grid',reason:'NOT_SHOWN'},{itemKey:'grid',reason:'REFUSED'},
      {itemKey:'grid:second',reason:'REFUSED'})
    rewriteResult()
    const counts=observedMissing(),source=await loadSurveySource({...owner,includeWideSchema:true})
    for(const attemptId of ['attempt-0','attempt-1']){
      const rows=source.raw.filter(r=>r.attemptId===attemptId)
      expect(rows.find(r=>r.itemKey==='missing')).toMatchObject({value:null,missingReason:'SHOWN_MISSING'})
      expect(rows.find(r=>r.itemKey==='grid:first')).toMatchObject({value:'a',missingReason:'NOT_SHOWN'})
      expect(rows.find(r=>r.itemKey==='grid:second')).toMatchObject({value:null,missingReason:'SHOWN_MISSING'})
      expect(rows.find(r=>r.itemKey==='refused')).toMatchObject({value:null,missingReason:'REFUSED'})
    }
    expect.soft(counts.findCalls.map(counter=>counter.mock.calls.length)).toEqual([0,0,0,0,0,0])
    expect.soft(counts.iterations.map(counter=>counter.mock.calls.length)).toEqual([1,1,1,1,1,1])
  })
  it('preserves ordered raw value types and complete frozen metadata',async()=>{
    const {snapshot}=fixture(1),source=await loadSurveySource({...owner,includeWideSchema:true})
    expect(source.raw.map(({instrumentKey,itemKey,value,missingReason})=>[instrumentKey,itemKey,value,missingReason])).toEqual([
      ['form','zero',0,null],['form','blank',null,'SHOWN_MISSING'],['form','note','private text',null],
      ['form','multi','["b","a"]',null],['form','rank','["b","a"]',null],['form','total','{"a":0,"b":10}',null],
      ['form','time','09:30',null],['form','grid:first','a',null],['form','grid:second',null,'SHOWN_MISSING'],
      ['form','grid_first',7,null],['form','matrix:row','["a","b"]',null],['form','choose','b',null],
      ['form','choose:other','private other',null],['form','choose_other',8,null],['form','missing',null,'SHOWN_MISSING'],
      ['form','refused',null,'REFUSED'],['scale','one','a',null],['scale','two','b',null],['scale','three','a',null],
      ['sjt','single','b',null],['sjt','multiple','["a","b"]',null],
    ])
    for(const row of source.codebook){
      const unit=snapshot.units.find(u=>u.instrumentKey===row.instrumentKey)!
      expect(row).toMatchObject({waveId:owner.waveIds[0],waveOrdinal:1,title:unit.title,kind:unit.kind,
        definitionDigest:unit.sourceDigest,scoringDigest:unit.scoringDigest,publicationVersion:4,instrumentRevision:unit.draftRevision})
    }
    expect(source.codebook.find(r=>r.itemKey==='grid:first')).toMatchObject({prompt:'grid／First',responseType:'MATRIX',options:[{code:'a',label:'A'},{code:'b',label:'B'}]})
    expect(source.codebook.find(r=>r.itemKey==='choose:other')).toMatchObject({prompt:'choose／其他填写',responseType:'OTHER_TEXT',options:[],valueEncoding:'TEXT'})
    expect(source.codebook.find(r=>r.itemKey==='time')).toMatchObject({timeZone:'Asia/Shanghai',formSchemaVersion:2})
    expect(source.codebook.find(r=>r.itemKey==='matrix:row')?.valueEncoding).toBe('JSON_STRING_ARRAY')
    expect(source.codebook.find(r=>r.itemKey==='total')?.valueEncoding).toBe('JSON_NUMBER_OBJECT')
    expect(source.codebook.find(r=>r.itemKey==='one')).toMatchObject({scalePresentationMode:'ALL_AT_ONCE',timingContract:'NOT_COLLECTED'})
  })
  it('shares only static metadata while keeping participant values and missing reasons independent',async()=>{
    const {result,finals}=fixture(2)
    const second=structuredClone(result)
    second.units[0].rawAnswers.zero=23
    second.units[0].rawAnswers.grid={second:'b'}
    second.units[0].missing=second.units[0].missing.filter(row=>row.itemKey!=='grid:second')
    second.units[0].missing.push({itemKey:'grid:first',reason:'REFUSED'})
    second.units[1].rawAnswers.one='b'
    finals[1].resultsHash=canonicalHash(second)
    finals[1].resultsCipher=security.encryptUnifiedRuntimePayload(second)
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    const values=(attemptId:string)=>source.raw.filter(row=>row.attemptId===attemptId&&
      ['zero','grid:first','grid:second','one'].includes(row.itemKey))
      .map(({itemKey,value,missingReason})=>({itemKey,value,missingReason}))
    expect(values('attempt-0')).toEqual([
      {itemKey:'zero',value:0,missingReason:null},{itemKey:'grid:first',value:'a',missingReason:null},
      {itemKey:'grid:second',value:null,missingReason:'SHOWN_MISSING'},{itemKey:'one',value:'a',missingReason:null},
    ])
    expect(values('attempt-1')).toEqual([
      {itemKey:'zero',value:23,missingReason:null},{itemKey:'grid:first',value:null,missingReason:'REFUSED'},
      {itemKey:'grid:second',value:'b',missingReason:null},{itemKey:'one',value:'b',missingReason:null},
    ])
  })
  it('keeps selected row values and full-schema collision IDs identical to complete output',async()=>{
    fixture(1)
    const all=await loadSurveySource({...owner,includeWideSchema:true})
    for(const itemKey of ['grid:first','grid_first','choose:other','choose_other','matrix:row']){
      const selected=await loadSurveySource({...owner,selectRaw:{instrumentKey:'form',itemKey},selectScore:false})
      expect(selected.raw).toEqual(all.raw.filter(r=>r.instrumentKey==='form'&&r.itemKey===itemKey))
      expect(selected.codebook).toEqual(all.codebook.filter(r=>r.instrumentKey==='form'&&r.itemKey===itemKey))
    }
  })
  it('keeps descriptors and option storage within one request',async()=>{
    const {snapshot,publication}=fixture(0)
    const first=await loadSurveySource({...owner,includeWideSchema:true})
    first.codebook.find(r=>r.itemKey==='one')!.options[0].label='caller mutation'
    const unchanged=await loadSurveySource({...owner,includeWideSchema:true})
    expect(unchanged.codebook.find(r=>r.itemKey==='one')!.options[0].label).toBe('A')
    const scale=snapshot.units[1].displayDefinition as ScaleDraft
    scale.items[0].prompt='new request prompt';scale.responseOptions[0].label='new request option'
    publication.definitionDigest=canonicalHash(snapshot)
    const changed=await loadSurveySource({...owner,includeWideSchema:true})
    expect(changed.codebook.find(r=>r.itemKey==='one')).toMatchObject({prompt:'new request prompt',options:[{code:'a',label:'new request option'},{code:'b',label:'B'}]})
  })
  it.each(['raw','dictionary'])('retains the exact post-compute publication fence for %s',async(path)=>{
    const {snapshot,state}=fixture(1)
    state.beforeRead=read=>{if(read===2)(snapshot.units[0].displayDefinition as FormDraft).pages[0].questions[0].prompt='changed after projection'}
    await expect(path==='raw'?loadSurveySource({...owner,includeWideSchema:true}):loadSurveyItemDictionary(dictionaryInput))
      .rejects.toMatchObject({statusCode:409})
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  })
})
