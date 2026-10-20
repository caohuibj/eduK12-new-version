import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {selectSurveyFixtureRecord,surveyFixtureSql} from './survey-source-select.fixture'
import {prisma} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {encryptCompactField} from '../../modules/assessment-runtime/compact-field-codec'
import {compileFrozenResearchUnit,type ResearchFrozenPublication,type ResearchFrozenUnit} from '../../modules/survey/publication.service'
import {computeSurveyFinal} from '../../modules/survey/final.compute'
import {loadSurveySource} from '../../modules/survey/analytics.source'
import {rawLongExport,rawWideExport} from '../../modules/survey/analytics.raw-export'
import {exportLong} from '../../modules/survey/analytics.export-format'
import type {FormDraft,FormQuestion,ScaleDraft} from '../../modules/survey/builder.definition'

vi.mock('../../config/database',()=>({prisma:{$transaction:vi.fn()}}))
const question=(itemKey:string,extra:Partial<FormQuestion>={}):FormQuestion=>({
  itemKey,type:'NUMBER',prompt:itemKey,required:true,options:[],rows:[],...extra,
})
const formUnit=(instrumentKey:string,questions:FormQuestion[]):ResearchFrozenUnit=>{
  const definition:FormDraft={schemaVersion:2,pages:[{pageKey:'page',title:'Synthetic',questions}]}
  return compileFrozenResearchUnit({id:instrumentKey,instrumentKey,kind:'FORM',title:'Synthetic',revision:1,definition})
}
const legacyId=(unit:ResearchFrozenUnit,itemKey:string)=>'W001__'+
  unit.instrumentKey.replace(/[^a-z0-9_]/gi,'_').slice(0,38)+'__'+
  itemKey.replace(/[^a-z0-9_]/gi,'_').slice(0,38)+'__'+unit.sourceDigest.slice(0,16)
const owner={actorUserId:'synthetic-owner',projectId:'synthetic-project',waveIds:['synthetic-wave'],includeAttendance:false}

function fixture(units:ResearchFrozenUnit[],answers:Record<string,unknown>,itemTimings?:unknown){
  const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',
    projectId:owner.projectId,waveId:owner.waveIds[0],collectionMode:'LINKED_WAVES',
    consentVersion:1,linkageNoticeConfirmed:true,consentDigest:'synthetic-consent',
    runtimeStatus:'SURVEY_FINAL_V1',units}
  const result=computeSurveyFinal(snapshot,answers,undefined,undefined,'FINAL',itemTimings)
  const publication={id:'synthetic-publication',projectId:owner.projectId,version:1,
    compiledSnapshot:snapshot,definitionDigest:canonicalHash(snapshot)}
  const wave={id:owner.waveIds[0],projectId:owner.projectId,ordinal:1,publicationId:publication.id,status:'OPEN'}
  const completedAt=new Date('2026-10-17T00:00:00Z')
  const final={id:'00000000-0000-0000-0000-000000000001',publicationId:publication.id,
    definitionDigest:publication.definitionDigest,completedAt,
    resultsHash:canonicalHash(result),resultsCipher:encryptUnifiedRuntimePayload(result),wave,
    attempt:{id:'synthetic-attempt',projectId:owner.projectId,waveId:wave.id,
      startedAt:new Date('2026-10-16T23:59:00Z'),flowAssignmentCipher:null,
      participant:{status:'ACTIVE',researchCode:'R-SYNTHETIC'}}}
  const tx={
    $queryRaw:vi.fn(async (parts:TemplateStringsArray|{strings:string[]})=>surveyFixtureSql(parts).includes('FROM "survey_projects"')
      ?[{collectionMode:'LINKED_WAVES',sourceRevision:1,sourceCutOff:new Date('2026-10-17T00:01:00Z')}]
      :surveyFixtureSql(parts).includes('finalCipherBytes')?[{finalCipherBytes:0n,frozenBytes:0n}]:[{bytes:0n}]),
    surveyWave:{count:vi.fn(async()=>1),findMany:vi.fn(async()=>[wave])},
    surveyWaveFinal:{count:vi.fn(async()=>1),findMany:vi.fn(async(args:{select?:unknown})=>
      [selectSurveyFixtureRecord(final,args.select)])},
    surveyPublication:{findMany:vi.fn(async()=>[publication])},
  }
  vi.mocked(prisma.$transaction).mockImplementation((async(fn:(value:typeof tx)=>Promise<unknown>)=>fn(tx)) as never)
  return {snapshot,result,final,tx}
}

beforeEach(()=>{
  vi.clearAllMocks()
  vi.stubEnv('DATA_ENCRYPTION_KEY','ab'.repeat(32))
  vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','false')
})
afterEach(()=>vi.unstubAllEnvs())

describe('Frozen Survey raw variable identity',()=>{
  it('reuses bounded owned wave headers for empty-final schema and both release fences',async()=>{
    const {tx}=fixture([formUnit('form',[question('ordinary')])],{form:{ordinary:1}})
    await expect(loadSurveySource({...owner,waveIds:Array.from({length:101},(_,i)=>String(i)),includeWideSchema:true})).rejects.toMatchObject({statusCode:413})
    expect(tx.surveyWave.findMany).not.toHaveBeenCalled()
    tx.surveyWaveFinal.findMany.mockResolvedValue([])
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    expect(source.codebook).toHaveLength(1)
    expect(tx.surveyWave.count).not.toHaveBeenCalled()
    expect(tx.surveyWave.findMany).toHaveBeenCalledTimes(2)
    expect(tx.surveyWave.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{projectId:owner.projectId,id:{in:owner.waveIds}}}))
    tx.surveyWave.findMany.mockResolvedValue([])
    await expect(loadSurveySource({...owner,includeWideSchema:true})).rejects.toMatchObject({statusCode:404})
  })

  it('reads interpretation binding columns only on explicit opt-in and keeps legacy FINAL explicit',async()=>{
    const f=fixture([formUnit('form',[question('ordinary')])],{form:{ordinary:1}})
    const original=f.tx.$queryRaw.getMockImplementation()!
    f.tx.$queryRaw.mockImplementation(async parts=>surveyFixtureSql(parts).includes('content_binding_cipher AS cipher')
      ?[{id:'synthetic-attempt',cipher:null,hash:null}] as never:original(parts))
    const ordinary=await loadSurveySource({...owner,selectRaw:false,selectScore:false})
    expect(ordinary.interpretations).toBeUndefined()
    expect(f.tx.$queryRaw.mock.calls.some(([q])=>surveyFixtureSql(q).includes('content_binding'))).toBe(false)
    const interpreted=await loadSurveySource({...owner,selectRaw:false,selectScore:false,includeInterpretation:true})
    expect(interpreted.interpretations).toEqual([expect.objectContaining({sourceVerified:true,binding:null,interpretation:null,attemptId:'synthetic-attempt'})])
    expect(f.tx.$queryRaw.mock.calls.filter(([q])=>surveyFixtureSql(q).includes('content_binding_cipher AS cipher'))).toHaveLength(2)
    let reads=0
    f.tx.$queryRaw.mockImplementation(async parts=>surveyFixtureSql(parts).includes('content_binding_cipher AS cipher')
      ?[{id:'synthetic-attempt',cipher:null,hash:++reads===1?null:'f'.repeat(64)}] as never:original(parts))
    await expect(loadSurveySource({...owner,selectRaw:false,selectScore:false,includeInterpretation:true})).rejects.toMatchObject({statusCode:409})
  })
  it('projects saved interpretation from verified FINAL ciphertext and the matching exact Attempt binding',async()=>{
    const definition:ScaleDraft={schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',
      responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:3}],
      dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
      items:[{itemKey:'item',prompt:'Item',required:true,reverse:false,dimensionKeys:['total']}]}
    const unit=compileFrozenResearchUnit({id:'scale',instrumentKey:'scale',kind:'SCALE',title:'Scale',revision:1,definition})
    unit.measurementRelease={releaseId:'11111111-1111-4111-8111-111111111111',contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}
    const f=fixture([unit],{scale:{item:'b'}})
    const binding={schemaVersion:1,projectId:owner.projectId,waveId:owner.waveIds[0],attemptId:'synthetic-attempt',publicationId:f.final.publicationId,
      definitionDigest:f.final.definitionDigest,populationContext:{},units:[{instrumentKey:'scale',measurement:unit.measurementRelease,references:[]}]}
    f.result.interpretation={schemaVersion:1,contentBindingHash:canonicalHash(binding),units:[{instrumentKey:'scale',status:'INTERPRETED',references:[],report:{status:'NOT_SELECTED'}}]}
    f.final.resultsHash=canonicalHash(f.result);f.final.resultsCipher=encryptUnifiedRuntimePayload(f.result)
    const bindingCipher=encryptUnifiedRuntimePayload(binding)
    const original=f.tx.$queryRaw.getMockImplementation()!
    f.tx.$queryRaw.mockImplementation(async parts=>surveyFixtureSql(parts).includes('content_binding_cipher AS cipher')
      ?[{id:'synthetic-attempt',cipher:bindingCipher,hash:canonicalHash(binding)}] as never:original(parts))
    const observed=await loadSurveySource({...owner,selectRaw:false,selectScore:false,includeInterpretation:true})
    expect(observed.interpretations![0].interpretation).toEqual(f.result.interpretation)
    expect(observed.interpretations![0].binding).toEqual(binding)
    expect(observed.raw).toEqual([]);expect(observed.scores).toEqual([])
    expect(JSON.stringify(observed.interpretations)).not.toMatch(/privateScoring|responseOptions|compiledDefinition/)
    f.result.interpretation.contentBindingHash='f'.repeat(64);f.final.resultsHash=canonicalHash(f.result);f.final.resultsCipher=encryptUnifiedRuntimePayload(f.result)
    await expect(loadSurveySource({...owner,selectRaw:false,selectScore:false,includeInterpretation:true})).rejects.toMatchObject({statusCode:409})
  })
  it('internally filters a single FINAL under owner scope in both passes without weakening projection rules',async()=>{
    const f=fixture([formUnit('form',[question('ordinary')])],{form:{ordinary:1}})
    const original=f.tx.$queryRaw.getMockImplementation()!
    f.tx.$queryRaw.mockImplementation(async parts=>surveyFixtureSql(parts).includes('content_binding_cipher AS cipher')
      ?[{id:'synthetic-attempt',cipher:null,hash:null}] as never:original(parts))
    const exact={...owner,finalId:f.final.id,selectRaw:false as const,includeInterpretation:true,pageMode:true}
    const result=await loadSurveySource(exact)
    expect(result.completeAttempts).toBe(1);expect(result.raw).toEqual([])
    expect(result.interpretations).toHaveLength(1)
    const headers=f.tx.surveyWaveFinal.findMany.mock.calls.filter(([args])=>(args as any).select?.publicationId===true&&(args as any).select?.resultsCipher!==true)
    expect(headers).toHaveLength(2)
    for(const [args] of headers)expect((args as any).where).toMatchObject({id:f.final.id,projectId:owner.projectId,waveId:{in:owner.waveIds}})
    for(const [args] of f.tx.surveyWaveFinal.count.mock.calls)expect((args as any).where).toMatchObject({id:f.final.id,projectId:owner.projectId})
    for(const change of [{includeInterpretation:false},{selectRaw:undefined},{includeAttendance:true},{afterFinal:{id:f.final.id,completedAt:new Date()}}])
      await expect(loadSurveySource({...exact,...change})).rejects.toMatchObject({statusCode:400})
  })
  it('returns no match for an absent scoped FINAL and rejects unowned project before looking up its id',async()=>{
    const f=fixture([formUnit('form',[question('ordinary')])],{form:{ordinary:1}})
    f.tx.surveyWaveFinal.findMany.mockResolvedValue([]);f.tx.surveyWaveFinal.count.mockResolvedValue(0)
    const exact={...owner,finalId:'00000000-0000-0000-0000-000000000099',selectRaw:false as const,includeInterpretation:true,pageMode:true}
    const missing=await loadSurveySource(exact)
    expect(missing.completeAttempts).toBe(0);expect(missing.sourceFinalCount).toBe(0);expect(missing.interpretations).toEqual([])
    f.tx.surveyWaveFinal.findMany.mockClear();f.tx.surveyWaveFinal.count.mockClear()
    f.tx.$queryRaw.mockResolvedValue([])
    await expect(loadSurveySource(exact)).rejects.toMatchObject({statusCode:404})
    expect(f.tx.surveyWaveFinal.findMany).not.toHaveBeenCalled();expect(f.tx.surveyWaveFinal.count).not.toHaveBeenCalled()
  })
  it('exports valid hyphen and underscore item keys without collision',async()=>{
    const unit=formUnit('form',[question('q-a'),question('q_a')])
    fixture([unit],{form:{'q-a':1,q_a:2}})
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    expect(source.codebook).toHaveLength(2)
    expect(new Set(source.codebook.map(c=>c.columnKey)).size).toBe(2)
    expect(rawLongExport(owner.projectId,source).manifest.rowCount).toBe(2)
    expect(rawWideExport(owner.projectId,source).manifest.columnCount).toBe(5)
  })
  it('disambiguates truncation and stays bounded without changing unrelated legacy IDs',async()=>{
    const prefix='q'+'a'.repeat(37),keys=[prefix+'x',prefix+'y','q__k0123456789abcdef','ordinary']
    const unit=formUnit('form',keys.map(key=>question(key)))
    fixture([unit],{form:Object.fromEntries(keys.map((key,i)=>[key,i]))})
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    expect(new Set(source.codebook.map(c=>c.columnKey)).size).toBe(keys.length)
    for(const row of source.codebook){
      expect(row.columnKey.length).toBeLessThanOrEqual(121)
      expect(row.columnKey).toMatch(/^[A-Za-z0-9_]+$/)
      if(row.itemKey.startsWith(prefix))expect(row.columnKey).toContain('__K')
      else expect(row.columnKey).toBe(legacyId(unit,row.itemKey))
    }
  })
  it('keeps cross-instrument IDs consistent between full and selected-item pages',async()=>{
    const units=['form-a','form_a'].map(key=>formUnit(key,[question('same')]))
    expect(units[0].sourceDigest).toBe(units[1].sourceDigest)
    fixture(units,{'form-a':{same:10},form_a:{same:20}})
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    expect(new Set(source.codebook.map(c=>c.columnKey)).size).toBe(2)
    for(const unit of units){
      const selected=await loadSurveySource({...owner,pageMode:true,stableIdCursor:true,
        includeWideSchema:false,selectRaw:{instrumentKey:unit.instrumentKey,itemKey:'same'},selectScore:false})
      expect(selected.raw).toEqual(source.raw.filter(r=>r.instrumentKey===unit.instrumentKey))
      expect(selected.codebook).toEqual(source.codebook.filter(c=>c.instrumentKey===unit.instrumentKey))
    }
    expect(rawWideExport(owner.projectId,source).manifest.columnCount).toBe(5)
  })
  it('keeps matrix and other-text generated keys distinct from authored keys on every page',async()=>{
    const options=[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'}]
    const unit=formUnit('form',[
      question('grid',{type:'MATRIX',options,rows:[{rowKey:'row',label:'Row'}]}),question('grid_row'),
      question('choose',{type:'SINGLE',options,otherOptionKey:'b'}),question('choose_other'),
    ])
    fixture([unit],{form:{'grid:row':'a',grid_row:7,choose:'b','choose:other':'synthetic text',choose_other:8}})
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    expect(source.codebook).toHaveLength(5)
    expect(new Set(source.codebook.map(c=>c.columnKey)).size).toBe(5)
    for(const itemKey of ['grid:row','grid_row','choose:other','choose_other']){
      const selected=await loadSurveySource({...owner,pageMode:true,stableIdCursor:true,
        includeWideSchema:false,selectRaw:{instrumentKey:'form',itemKey},selectScore:false})
      expect(selected.raw).toEqual(source.raw.filter(r=>r.itemKey===itemKey))
      expect(selected.codebook).toEqual(source.codebook.filter(c=>c.itemKey===itemKey))
    }
    expect(source.codebook.find(c=>c.itemKey==='choose')!.columnKey).toBe(legacyId(unit,'choose'))
    const projected={...source,raw:source.raw.filter(r=>r.responseType!=='OTHER_TEXT'),
      codebook:source.codebook.filter(r=>r.responseType!=='OTHER_TEXT')}
    expect(rawLongExport(owner.projectId,projected).csv).not.toContain('synthetic text')
    expect(rawWideExport(owner.projectId,projected).manifest.columnCount).toBe(9)
  })
  it('preserves noncolliding legacy matrix and hyphen IDs byte-for-byte',async()=>{
    const unit=formUnit('form-a',[question('ordinary-key'),question('grid',{type:'MATRIX',
      options:[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'}],rows:[{rowKey:'row-a',label:'Row'}]})])
    fixture([unit],{'form-a':{'ordinary-key':0,'grid:row-a':'b'}})
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    expect(source.codebook.map(c=>c.columnKey)).toEqual(['ordinary-key','grid:row-a'].map(key=>legacyId(unit,key)))
  })
  it('binds timed Scale suffixes to disambiguated RAW IDs while retaining SCORE identities',async()=>{
    const definition:ScaleDraft={schemaVersion:1,presentationMode:'ONE_BY_ONE',
      respondentType:'participant_self_report',aggregation:'sum',
      responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:3}],
      dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
      items:['q-a','q_a'].map(itemKey=>({itemKey,prompt:itemKey,required:true,reverse:false,dimensionKeys:['total']}))}
    const unit=compileFrozenResearchUnit({id:'scale',instrumentKey:'scale',kind:'SCALE',title:'Scale',revision:1,definition})
    unit.measurementRelease={releaseId:'11111111-1111-4111-8111-111111111111',contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}
    const timing={schemaVersion:1,firstResponseMs:100,activeTimeMs:250,changeCount:0,revisitCount:0,
      visits:1,interrupted:false,recoveredWithoutClock:false}
    fixture([unit],{scale:{'q-a':'a',q_a:'b'}},{scale:{'q-a':timing,q_a:{...timing,firstResponseMs:150}}})
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    const wide=rawWideExport(owner.projectId,source)
    expect(wide.manifest.columnCount).toBe(15)
    for(const row of source.raw){
      expect(wide.csv).toContain('"'+row.columnKey+'__first_response_ms"')
      expect(wide.csv).toContain('"'+row.columnKey+'__timing_status"')
      expect(row.itemTiming?.activeTimeMs).toBe(250)
    }
    expect(source.sourceVersions).toEqual([expect.objectContaining({waveId:owner.waveIds[0],instrumentKey:'scale',measurementRelease:unit.measurementRelease})])
    expect(source.scores[0].value).toBe(4)
    expect(source.scores[0]).toMatchObject({status:'calculated',quality:{status:'interpretable',flags:{}}})
    const measurement=source.scores[0].measurement
    expect(exportLong(owner.projectId,source.scores).codebook[0].column)
      .toBe('W001__scale__total__'+canonicalHash(measurement).slice(0,12))
    // Native Scale FINAL creation rejects incomplete answers before persistence.
    expect(()=>fixture([unit],{scale:{'q-a':'a'}})).toThrow('研究量表必须完整选择有效的响应选项')
  })
  it('does not infer a release for old frozen sources and rejects a tampered frozen pointer',async()=>{
    const unit=formUnit('form',[question('ordinary')])
    fixture([unit],{form:{ordinary:1}})
    expect((await loadSurveySource({...owner,includeWideSchema:true})).sourceVersions).toBeUndefined()
    // A database snapshot mutation without its frozen digest must not become trusted metadata.
    unit.measurementRelease={releaseId:'forged',contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}
    await expect(loadSurveySource({...owner,includeWideSchema:true})).rejects.toThrow()
  })
  it('still denies ownership revoked after colliding-source projection',async()=>{
    const unit=formUnit('form',[question('q-a'),question('q_a')])
    const {tx}=fixture([unit],{form:{'q-a':1,q_a:2}})
    let ownerReads=0
    tx.$queryRaw.mockImplementation(async(parts:TemplateStringsArray|{strings:string[]})=>{
      if(!surveyFixtureSql(parts).includes('FROM "survey_projects"'))return (surveyFixtureSql(parts).includes('finalCipherBytes')
        ?[{finalCipherBytes:0n,frozenBytes:0n}]:[{bytes:0n}]) as never
      return (++ownerReads===1?[{collectionMode:'LINKED_WAVES',sourceRevision:1,
        sourceCutOff:new Date('2026-10-17T00:01:00Z')}]:[]) as never
    })
    await expect(loadSurveySource({...owner,includeWideSchema:true})).rejects.toMatchObject({statusCode:404})
    expect(ownerReads).toBe(2)
  })
  it('fails closed if a frozen publication repeats the exact original item identity',async()=>{
    const unit=formUnit('form',[question('ordinary')])
    const {snapshot,tx}=fixture([unit],{form:{ordinary:1}})
    const malformed=structuredClone(snapshot)
    const questions=(malformed.units[0].displayDefinition as FormDraft).pages[0].questions
    questions.push(structuredClone(questions[0]))
    tx.surveyPublication.findMany.mockResolvedValue([{id:'synthetic-publication',projectId:owner.projectId,version:1,
      compiledSnapshot:malformed,definitionDigest:canonicalHash(malformed)}])
    await expect(loadSurveySource({...owner,includeWideSchema:true})).rejects.toThrow('冻结研究变量编码重复')
  })
  it('derives collision-safe dictionaries before any FINAL exists',async()=>{
    const unit=formUnit('form',[question('q-a'),question('q_a')])
    const {tx}=fixture([unit],{form:{'q-a':1,q_a:2}})
    tx.surveyWaveFinal.findMany.mockResolvedValue([])
    tx.surveyWaveFinal.count.mockResolvedValue(0)
    const source=await loadSurveySource({...owner,includeWideSchema:true,pageMode:true})
    expect(source.raw).toEqual([])
    expect(source.completeAttempts).toBe(0)
    expect(new Set(source.codebook.map(c=>c.columnKey)).size).toBe(2)
    expect(rawWideExport(owner.projectId,source).manifest).toMatchObject({rowCount:0,columnCount:5})
  })
  it('reads existing compact FINALs with the compact write flag still false',async()=>{
    const unit=formUnit('form',[question('q-a'),question('q_a')])
    const {result,final}=fixture([unit],{form:{'q-a':1,q_a:2}})
    expect(final.resultsCipher).not.toMatch(/^ekc1:/)
    final.resultsCipher=encryptCompactField({schemaVersion:1,value:result})
    const source=await loadSurveySource({...owner,includeWideSchema:true})
    expect(source.raw.map(r=>r.value)).toEqual([1,2])
    expect(new Set(source.codebook.map(c=>c.columnKey)).size).toBe(2)
    expect(process.env.ASSESSMENT_COMPACT_FACTS_ENABLED).toBe('false')
    expect(encryptUnifiedRuntimePayload(result)).not.toMatch(/^ekc1:/)
  })
})
