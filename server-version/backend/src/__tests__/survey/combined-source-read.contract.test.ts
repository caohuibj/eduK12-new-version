import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {prisma} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {compileFrozenResearchUnit,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {compileSurveyFlow,surveyVariantProvenance} from '../../modules/survey/flow.definition'
import type {SurveyFlowAssignment} from '../../modules/survey/flow.assignment'
import {computeSurveyFinal} from '../../modules/survey/final.compute'
import {loadSurveySource} from '../../modules/survey/analytics.source'
import {selectSurveyFixtureRecord,surveyFixtureSql} from './survey-source-select.fixture'

vi.mock('../../config/database',()=>({prisma:{$transaction:vi.fn()}}))
const projectId='read-project',waveId='read-wave',publicationId='read-publication'
const instant='2026-10-17T00:00:00.000Z',cutOff='2026-10-17T00:20:00.000Z'
const owner={actorUserId:'owner',projectId,waveIds:[waveId],includeAttendance:false,includeWideSchema:true}
const budget=8n*1024n*1024n
type Selection={select?:Record<string,unknown>;where?:Record<string,unknown>;take?:number;include?:unknown}
function matches(value:unknown,where:unknown):boolean{
  if(where===null||typeof where!=='object'||where instanceof Date)return value===where
  const record=value as Record<string,unknown>|null
  return Object.entries(where as Record<string,unknown>).every(([key,test])=>{
    if(key==='AND')return (Array.isArray(test)?test:[test]).every(condition=>matches(value,condition))
    if(key==='OR')return (test as unknown[]).some(condition=>matches(value,condition))
    if(key==='is')return matches(value,test)
    if(key==='not')return !matches(value,test)
    if(key==='in')return (test as unknown[]).includes(value)
    if(key==='lt')return value!==null&&(value as Date)<(test as Date)
    if(key==='gte')return value!==null&&(value as Date)>=(test as Date)
    if(key==='gt')return (value as string)>(test as string)
    return matches(record?.[key],test)
  })
}
function fixture(options:{attendance?:boolean;variant?:boolean}={}){
  const units=[
    compileFrozenResearchUnit({id:'form',instrumentKey:'form',kind:'FORM',title:'Form',revision:1,
      definition:{schemaVersion:1,pages:[{pageKey:'page',title:'Page',questions:[{itemKey:'question',prompt:'Question',type:'NUMBER',required:true,options:[],rows:[]}]}]}}),
    compileFrozenResearchUnit({id:'scale',instrumentKey:'scale',kind:'SCALE',title:'Scale',revision:1,
      definition:{schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',
        responseOptions:[{optionKey:'yes',label:'Yes',score:1},{optionKey:'no',label:'No',score:0}],
        dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
        items:[{itemKey:'question',prompt:'Question',required:true,reverse:false,dimensionKeys:['total']}]}}),
  ]
  const flow=compileSurveyFlow({schemaVersion:1,embeddedData:[],blocks:units.map(unit=>({blockKey:unit.instrumentKey,kind:'INSTRUMENT' as const,instrumentKey:unit.instrumentKey})),
    experiment:{mode:'QUESTIONNAIRE_VARIANTS',experimentKey:'experiment',linkedPolicy:'RERANDOMIZE',groups:[
      {groupKey:'a',variantLabel:'A',weight:1,instrumentKeys:['form','scale'],materialTitle:'',materialBody:''},
      {groupKey:'b',variantLabel:'B',weight:1,instrumentKeys:['form','scale'],materialTitle:'',materialBody:''},
    ]}},units,'LINKED_WAVES')
  const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId,waveId,collectionMode:'LINKED_WAVES',
    consentVersion:1,linkageNoticeConfirmed:true,consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',units,
    ...(options.variant?{flow}:{})}
  const assignment:SurveyFlowAssignment={schemaVersion:1,flowDigest:flow.flowDigest,experimentKey:'experiment',groupKey:'a',
    algorithm:'CRYPTO_RANDOM_INT_V1',assignedAt:instant,variant:surveyVariantProvenance(flow,'a')}
  const publication={id:publicationId,projectId,version:1,compiledSnapshot:snapshot,definitionDigest:canonicalHash(snapshot)}
  const wave={id:waveId,projectId,ordinal:1,status:'OPEN',publicationId:publicationId as string|null,
    consentText:'unused private consent',generalText:'unused general text',flowDefinition:{unused:'x'.repeat(8192)},
    quotaPolicy:{unused:true},checkpointPolicy:{unused:true}}
  const attempt={id:'read-attempt',projectId,waveId,status:options.attendance?'STARTED':'COMPLETED',startedAt:new Date(instant),
    excludedAt:null as Date|null,participantId:'read-participant',sampleReview:null as null|{verdict:string},
    flowAssignmentCipher:options.variant?encryptUnifiedRuntimePayload(assignment):null,
    sessionHash:'unused-session-credential',runtimeAttemptId:'unused-runtime-attempt',
    participant:{status:'ACTIVE',researchCode:'R-READ',credentialHash:'unused-participant-credential'}}
  const result=computeSurveyFinal(snapshot,{form:{question:7},scale:{question:'yes'}},
    options.variant?assignment:undefined,options.variant?['form','scale']:undefined)
  const final={id:'read-final',projectId,waveId,publicationId,definitionDigest:publication.definitionDigest,
    completedAt:new Date('2026-10-17T00:10:00.000Z'),resultsHash:canonicalHash(result),resultsCipher:encryptUnifiedRuntimePayload(result),
    submissionId:'unused-submission-id',payloadHash:'unused-payload-hash',attempt,wave}
  const state={hasFinal:!options.attendance,allow:true,sourceRevision:1,reads:0,
    expiresAt:null as Date|null,afterLockNow:new Date(cutOff),
    finalCipherBytes:0n,frozenBytes:0n,assignmentBytes:0n,beforeRead:(_read:number)=>{},events:[] as string[]}
  const publications=[publication],waves=[wave],attempts=[attempt]
  const tx={
    $queryRaw:vi.fn(async(parts:TemplateStringsArray|{strings:string[]})=>{
      const sql=surveyFixtureSql(parts)
      if(sql.includes('FROM "survey_projects"')){
        if(state.expiresAt){
          expect(sql).toContain('WITH authorized AS MATERIALIZED')
          expect(sql.indexOf('expires_at>clock_timestamp()')).toBeGreaterThan(sql.indexOf('FOR SHARE OF p,u,g,m'))
          expect(sql).not.toContain('expires_at>statement_timestamp()')
        }
        return state.allow&&(!state.expiresAt||state.expiresAt>state.afterLockNow)
        ?[{collectionMode:'LINKED_WAVES',sourceRevision:state.sourceRevision,sourceCutOff:new Date(cutOff)}]:[]
      }
      if(sql.includes('"finalCipherBytes"')){state.events.push('source-budget');return [{finalCipherBytes:state.finalCipherBytes,frozenBytes:state.frozenBytes}]}
      if(sql.includes('flow_assignment_cipher')){state.events.push('assignment-budget');return [{bytes:state.assignmentBytes}]}
      throw new Error('Unexpected source SQL: '+sql)
    }),
    surveyWave:{count:vi.fn(async(args:Selection)=>waves.filter(row=>matches(row,args.where)).length),
      findMany:vi.fn(async(args:Selection)=>waves.filter(row=>matches(row,args.where)).slice(0,args.take).map(row=>selectSurveyFixtureRecord(row,args.select)))},
    surveyWaveFinal:{count:vi.fn(async(args:Selection)=>state.hasFinal&&matches(final,args.where)?1:0),
      findMany:vi.fn(async(args:Selection)=>{
        if(args.select?.resultsCipher)state.events.push('final-load')
        return state.hasFinal&&matches(final,args.where)?[selectSurveyFixtureRecord(final,args.select)]:[]
      })},
    surveyPublication:{findMany:vi.fn(async(args:Selection)=>{
      state.events.push('publication-load');return publications.filter(row=>matches(row,args.where)).map(row=>structuredClone(row))
    })},
    surveyWaveAttempt:{count:vi.fn(async(args:Selection)=>attempts.filter(row=>matches(row,args.where)).length),
      findMany:vi.fn(async(args:Selection)=>{
        if(args.select?.flowAssignmentCipher)state.events.push('assignment-load')
        return attempts.filter(row=>matches(row,args.where)).slice(0,args.take).map(row=>selectSurveyFixtureRecord(row,args.select))
      })},
  }
  vi.mocked(prisma.$transaction).mockImplementation((async(fn:(client:typeof tx)=>Promise<unknown>)=>{
    state.beforeRead(++state.reads);return fn(tx)
  }) as never)
  return {snapshot,publication,wave,attempt,final,state,tx,assignment,publications,waves}
}
const compactLoad=()=>loadSurveySource({...owner,includeWideSchema:false,pageMode:true,attendanceOnly:true})
const materialReads=(f:ReturnType<typeof fixture>)=>f.tx.surveyWaveFinal.findMany.mock.calls.filter(([args])=>args.select?.resultsCipher)
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64))})
afterEach(()=>vi.unstubAllEnvs())

describe('Survey exact source material and independent read budgets',()=>{
  it('projects only the exact FINAL, Attempt, Participant and Wave fields at both source fences',async()=>{
    const f=fixture(),source=await loadSurveySource(owner)
    expect(source.raw.map(row=>[row.instrumentKey,row.value])).toEqual([['form',7],['scale','yes']])
    expect(source.scores.map(row=>row.value)).toEqual([1])
    expect(materialReads(f)).toHaveLength(2)
    for(const [args] of materialReads(f)){
      expect(args.include).toBeUndefined()
      expect(args.select).toEqual({id:true,completedAt:true,publicationId:true,definitionDigest:true,resultsHash:true,resultsCipher:true,
        attempt:{select:{id:true,projectId:true,waveId:true,startedAt:true,flowAssignmentCipher:true,
          participant:{select:{status:true,researchCode:true}}}},
        wave:{select:{id:true,projectId:true,ordinal:true,publicationId:true}}})
      expect(JSON.stringify(selectSurveyFixtureRecord(f.final,args.select))).not.toMatch(/unused-|unused private|unused general|flowDefinition|quotaPolicy|checkpointPolicy/)
    }
    expect(f.state.reads).toBe(2)
  })

  it('uses one independent scalar budget query per fence, including a publication-only empty cohort',async()=>{
    for(const hasFinal of [true,false]){
      const f=fixture();f.state.hasFinal=hasFinal
      await loadSurveySource(owner)
      const queries=f.tx.$queryRaw.mock.calls.filter(([parts])=>surveyFixtureSql(parts).includes('"finalCipherBytes"'))
      expect(queries).toHaveLength(2)
      for(const [parts] of queries){
        const sql=surveyFixtureSql(parts)
        expect(sql).toContain('FROM survey_publications');expect(sql).not.toMatch(/\bJOIN\b/i)
        expect(sql.includes('FROM survey_wave_finals')).toBe(hasFinal)
        if(!hasFinal)expect(sql).toContain('0::bigint')
      }
      expect(f.state.events.indexOf('source-budget')).toBeLessThan(f.state.events.indexOf('publication-load'))
      if(hasFinal)expect(f.state.events.indexOf('source-budget')).toBeLessThan(f.state.events.indexOf('final-load'))
      expect(f.state.events).toEqual(hasFinal
        ?['source-budget','final-load','publication-load','source-budget','final-load','publication-load']
        :['source-budget','publication-load','source-budget','publication-load'])
    }
  })

  it.each(['finalCipherBytes','frozenBytes'] as const)('rejects %s over 8 MiB before any source data fetch',async field=>{
    const f=fixture();f.state[field]=budget+1n
    await expect(loadSurveySource(owner)).rejects.toMatchObject({statusCode:413})
    expect(materialReads(f)).toHaveLength(0);expect(f.tx.surveyPublication.findMany).not.toHaveBeenCalled()
  })

  it('retains separate inclusive 8 MiB FINAL and publication limits rather than a new combined cap',async()=>{
    const f=fixture();f.state.finalCipherBytes=budget;f.state.frozenBytes=budget
    expect((await loadSurveySource(owner)).completeAttempts).toBe(1)
    expect(materialReads(f)).toHaveLength(2)
  })

  it('budgets variant attendance assignments before ciphertext and retains the exact inclusive boundary',async()=>{
    let f=fixture({attendance:true,variant:true});f.state.assignmentBytes=budget+1n
    await expect(compactLoad()).rejects.toMatchObject({statusCode:413})
    expect(f.state.events).toContain('assignment-budget');expect(f.state.events).not.toContain('assignment-load')
    f=fixture({attendance:true,variant:true});f.state.assignmentBytes=budget
    const source=await compactLoad()
    expect(source.attendance[0].assignmentDigest).toBe(canonicalHash(f.assignment))
    expect(f.state.events.filter(event=>event==='assignment-load')).toHaveLength(2)
  })

  it.each(['first','second'] as const)('checks current researcher authorization on the %s read',async phase=>{
    const f=fixture();f.state.beforeRead=read=>{if(read===(phase==='first'?1:2))f.state.allow=false}
    await expect(loadSurveySource(owner)).rejects.toMatchObject({statusCode:404})
    expect(f.state.reads).toBe(phase==='first'?1:2)
    expect(materialReads(f)).toHaveLength(phase==='first'?0:1)
    const sql=surveyFixtureSql(f.tx.$queryRaw.mock.calls[0][0])
    for(const guard of ['p.owner_user_id=','u.account_domain=','u.is_active','NOT u.is_frozen','u.expires_at',"g.status='ACTIVE'",'m.enabled','FOR SHARE OF p,u,g,m'])
      expect(sql).toContain(guard)
  })

  it.each([1,2])('rejects expiry crossed while acquiring source fence %s',async phase=>{
    const f=fixture()
    f.state.expiresAt=new Date('2026-10-17T00:21:00Z')
    f.state.beforeRead=read=>{if(read===phase)f.state.afterLockNow=new Date('2026-10-17T00:21:01Z')}
    await expect(loadSurveySource(owner)).rejects.toMatchObject({statusCode:404})
    expect(f.state.reads).toBe(phase)
    expect(materialReads(f)).toHaveLength(phase-1)
  })

  it.each(['revision','publication','finalCipher','finalHash','wavePublication','waveProject','attemptProject','attemptWave','attemptStatus','exclusion','quality','participantStatus','participantCode','assignment'] as const)
    ('retains the exact %s post-compute source fence',async field=>{
      const f=fixture({variant:true})
      f.state.beforeRead=read=>{
        if(read!==2)return
        if(field==='revision')f.state.sourceRevision++
        else if(field==='publication')f.snapshot.consentDigest='changed'
        else if(field==='finalCipher')f.final.resultsCipher='changed'
        else if(field==='finalHash')f.final.resultsHash='changed'
        else if(field==='wavePublication')f.wave.publicationId='other-publication'
        else if(field==='waveProject')f.wave.projectId='other-project'
        else if(field==='attemptProject')f.attempt.projectId='other-project'
        else if(field==='attemptWave')f.attempt.waveId='other-wave'
        else if(field==='attemptStatus')f.attempt.status='STARTED'
        else if(field==='exclusion')f.attempt.excludedAt=new Date(cutOff)
        else if(field==='quality')f.attempt.sampleReview={verdict:'EXCLUDED'}
        else if(field==='participantStatus')f.attempt.participant.status='WITHDRAWN'
        else if(field==='participantCode')f.attempt.participant.researchCode='R-CHANGED'
        else f.attempt.flowAssignmentCipher=encryptUnifiedRuntimePayload({...f.assignment,assignedAt:cutOff})
      }
      await expect(loadSurveySource(owner)).rejects.toMatchObject({statusCode:field==='waveProject'?404:409})
      expect(f.state.reads).toBe(2)
    })
})

describe('Survey compact attendance shared ownership headers',()=>{
  it('uses one scoped header read at each fence without loading a raw/score matrix',async()=>{
    const f=fixture({attendance:true,variant:true}),source=await compactLoad()
    expect(source.attendance).toHaveLength(1);expect(source.codebook).toEqual([]);expect(source.scoreColumns).toEqual([])
    expect(f.tx.surveyWave.count).not.toHaveBeenCalled()
    expect(f.tx.surveyWave.findMany).toHaveBeenCalledTimes(2)
    for(const [args] of f.tx.surveyWave.findMany.mock.calls)
      expect(args.where).toEqual({projectId,id:{in:[waveId]}})
  })

  it.each(['DRAFT','OPEN'] as const)('proves ownership of %s waves before deciding whether they have collected schema',async status=>{
    const f=fixture({attendance:true});f.wave.status=status;f.wave.publicationId=null
    const source=await compactLoad()
    expect(source.codebook).toEqual([]);expect(source.scoreColumns).toEqual([])
    expect(f.tx.surveyWave.count).not.toHaveBeenCalled()
    expect(f.tx.surveyWave.findMany).toHaveBeenCalledTimes(2)
    expect(f.tx.surveyPublication.findMany).not.toHaveBeenCalled()
    expect(f.tx.$queryRaw.mock.calls.some(([parts])=>surveyFixtureSql(parts).includes('"finalCipherBytes"'))).toBe(false)
    f.wave.projectId='foreign-project'
    await expect(compactLoad()).rejects.toMatchObject({statusCode:404})
  })

  it('does not treat a prepared DRAFT publication as collected attendance schema',async()=>{
    const f=fixture({attendance:true});f.wave.status='DRAFT'
    const source=await compactLoad()
    expect(source.variantConfigurations).toEqual([]);expect(source.codebook).toEqual([])
    expect(f.tx.surveyPublication.findMany).not.toHaveBeenCalled()
    expect(f.tx.surveyWave.findMany).toHaveBeenCalledTimes(2)
  })
})
