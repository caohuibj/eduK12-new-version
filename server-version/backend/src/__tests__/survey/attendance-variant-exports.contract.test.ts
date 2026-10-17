import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {prisma} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import * as security from '../../modules/assessment-runtime/security'
import {compileFrozenResearchUnit,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {compileSurveyFlow,surveyVariantProvenance} from '../../modules/survey/flow.definition'
import type {SurveyFlowAssignment} from '../../modules/survey/flow.assignment'
import {computeSurveyFinal} from '../../modules/survey/final.compute'
import {loadSurveySource} from '../../modules/survey/analytics.source'
import {compactSurveyAttendanceExport,rawLongExport,rawWideExport} from '../../modules/survey/analytics.raw-export'
import {exportLong,exportWide} from '../../modules/survey/analytics.export-format'
import {variantAuditColumns,variantAuditValues,type SurveyVariantAudit} from '../../modules/survey/analytics.variant'

vi.mock('../../config/database',()=>({prisma:{$transaction:vi.fn()}}))
vi.mock('../../modules/assessment-runtime/canonical',async importOriginal=>{
  const actual=await importOriginal<typeof import('../../modules/assessment-runtime/canonical')>()
  return {...actual,canonicalHash:vi.fn(actual.canonicalHash)}
})
const projectId='attendance-project',waveId='attendance-wave',otherWaveId='other-wave'
const instant='2026-10-17T00:00:00.000Z',cutOff='2026-10-17T00:20:00.000Z'
const owner={actorUserId:'owner',projectId,waveIds:[waveId],includeWideSchema:true}
type Selection={select?:Record<string,true|Selection>;include?:Record<string,true|Selection>;where?:Record<string,unknown>;take?:number}
// Respect the requested projection. Returning complete mock records would hide
// the original bug, which omitted assignment ciphertext from the selected fields.
function selected(value:Record<string,unknown>,selection:Selection):Record<string,unknown>{
  if(!selection.select)return structuredClone(value)
  return Object.fromEntries(Object.entries(selection.select).map(([key,spec])=>[key,
    spec===true?structuredClone(value[key]):value[key]===null?null:selected(value[key] as Record<string,unknown>,spec)]))
}
function matches(value:unknown,where:unknown):boolean{
  if(where===null||typeof where!=='object'||where instanceof Date)return value===where
  const record=value as Record<string,unknown>|null
  return Object.entries(where as Record<string,unknown>).every(([key,test])=>{
    if(key==='AND')return (Array.isArray(test)?test:[test]).every(condition=>matches(value,condition))
    if(key==='OR')return (test as unknown[]).some(condition=>matches(value,condition))
    if(key==='is')return matches(value,test)
    if(key==='not')return !matches(value,test)
    if(key==='in')return (test as unknown[]).includes(value)
    if(key==='lt')return value!==(null as unknown)&&(value as Date)<(test as Date)
    if(key==='gt')return (value as string)>(test as string)
    return matches(record?.[key],test)
  })
}
/** Same real frozen-flow/encrypted-assignment path as variant-analytics, but
 * linked attendance has no retained FINAL from which serializers can infer an arm. */
function persistedAttendanceFixture(options:{count?:number;legacy?:boolean}={}){
  const unit=compileFrozenResearchUnit({id:'draft',instrumentKey:'scale',kind:'SCALE',title:'Scale',revision:1,
    definition:{schemaVersion:1,respondentType:'participant_self_report',aggregation:'sum',
      responseOptions:[{optionKey:'yes',label:'Yes',score:1},{optionKey:'no',label:'No',score:0}],
      dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
      items:[{itemKey:'question',prompt:'Question',required:true,reverse:false,dimensionKeys:['total']}]}})
  const flow=compileSurveyFlow({schemaVersion:1,embeddedData:[],blocks:[{blockKey:'scale',kind:'INSTRUMENT',instrumentKey:'scale'}],
    experiment:{mode:'QUESTIONNAIRE_VARIANTS',experimentKey:'experiment',linkedPolicy:'RERANDOMIZE',groups:[
      {groupKey:'a',variantLabel:'A',weight:1,instrumentKeys:['scale'],materialTitle:'',materialBody:''},
      {groupKey:'b',variantLabel:'B',weight:3,instrumentKeys:['scale'],materialTitle:'',materialBody:''},
    ]}},[unit],'LINKED_WAVES')
  const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId,waveId,collectionMode:'LINKED_WAVES',
    consentVersion:1,linkageNoticeConfirmed:true,consentDigest:'consent',runtimeStatus:'SURVEY_FINAL_V1',units:[unit],
    ...(!options.legacy?{flow}:{})}
  const publication={id:'publication',projectId,version:1,compiledSnapshot:snapshot,definitionDigest:canonicalHash(snapshot)}
  const otherSnapshot={...snapshot,waveId:otherWaveId,flow:undefined}
  delete otherSnapshot.flow
  const otherPublication={id:'other-publication',projectId,version:1,compiledSnapshot:otherSnapshot,definitionDigest:canonicalHash(otherSnapshot)}
  const wave={id:waveId,projectId,ordinal:1,status:'OPEN',revision:1,publicationId:publication.id}
  const otherWave={...wave,id:otherWaveId,ordinal:2,publicationId:otherPublication.id}
  const assignments=new Map<string,SurveyFlowAssignment>()
  function attempt(id:string,researchCode:string,status:string,groupKey:'a'|'b',extra:Record<string,unknown>={}){
    const assignment:SurveyFlowAssignment={schemaVersion:1,flowDigest:flow.flowDigest,experimentKey:'experiment',groupKey,
      algorithm:'CRYPTO_RANDOM_INT_V1',assignedAt:instant,variant:surveyVariantProvenance(flow,groupKey)}
    assignments.set(researchCode,assignment)
    return {id,projectId,waveId,startedAt:new Date(instant),status,excludedAt:null,
      flowAssignmentCipher:options.legacy?null:security.encryptUnifiedRuntimePayload(assignment),
      participantId:'participant-'+researchCode,participant:{researchCode,status:'ACTIVE'},sampleReview:null,wave,...extra}
  }
  const attempts=options.count!==undefined
    ?Array.from({length:options.count},(_,i)=>attempt('attempt-'+String(i).padStart(3,'0'),'R-'+i,'STARTED',i%2?'b':'a'))
    :[attempt('attempt-1','R-started','STARTED','a'),attempt('attempt-2','R-screened','SCREENED_OUT','b'),
      attempt('attempt-3','R-quality','COMPLETED','a',{sampleReview:{verdict:'EXCLUDED'}}),
      attempt('attempt-4','R-none','STARTED','a',{waveId:otherWaveId,wave:otherWave,flowAssignmentCipher:null}),
      attempt('attempt-5','R-withdrawn','WITHDRAWN','b',{excludedAt:new Date(instant),flowAssignmentCipher:null,
        participant:{researchCode:'R-withdrawn',status:'WITHDRAWN'}}),
      attempt('attempt-6','R-withdrawn-participant','STARTED','b',{flowAssignmentCipher:null,
        participant:{researchCode:'R-withdrawn-participant',status:'WITHDRAWN'}})]
  const quality=attempts.find(row=>row.status==='COMPLETED')
  const result=computeSurveyFinal(snapshot,{scale:{question:'yes'}},options.legacy?undefined:assignments.get('R-quality')??assignments.values().next().value,['scale'])
  const finals=quality?[{id:'excluded-final',projectId,waveId,publicationId:publication.id,definitionDigest:publication.definitionDigest,
    completedAt:new Date('2026-10-17T00:10:00.000Z'),resultsHash:canonicalHash(result),resultsCipher:security.encryptUnifiedRuntimePayload(result),attempt:quality,wave}]:[]
  const publications=[publication,otherPublication],waves=[wave,otherWave]
  const state={reads:0,assignmentBytes:0n,publicationBytes:0n,beforeRead:(_read:number)=>{},events:[] as string[]}
  const tx={
    $queryRaw:vi.fn(async(parts:TemplateStringsArray|{strings:string[]})=>{
      const query=('strings' in parts?parts.strings:parts).join('')
      if(query.includes('FROM "survey_projects"'))return [{collectionMode:'LINKED_WAVES',sourceRevision:1,sourceCutOff:new Date(cutOff)}]
      if(query.includes('flow_assignment_cipher')){state.events.push('assignment-budget');return [{bytes:state.assignmentBytes}]}
      if(query.includes('compiled_snapshot')){state.events.push('publication-budget');return [{bytes:state.publicationBytes}]}
      return [{bytes:0n}]
    }),
    surveyWave:{count:vi.fn(async(args:Selection)=>waves.filter(row=>matches(row,args.where)).length),
      findMany:vi.fn(async(args:Selection)=>waves.filter(row=>matches(row,args.where)).map(row=>selected(row,args)))},
    surveyWaveFinal:{count:vi.fn(async(args:Selection)=>finals.filter(row=>matches(row,args.where)).length),
      findMany:vi.fn(async(args:Selection)=>finals.filter(row=>matches(row,args.where)).map(row=>selected(row,args)))},
    surveyPublication:{findMany:vi.fn(async(args:Selection)=>{
      state.events.push('publication-load');return publications.filter(row=>matches(row,args.where)).map(row=>structuredClone(row))
    })},
    surveyWaveAttempt:{count:vi.fn(async(args:Selection)=>attempts.filter(row=>matches(row,args.where)).length),
      findMany:vi.fn(async(args:Selection)=>{
        if(args.select?.flowAssignmentCipher)state.events.push('assignment-load')
        return attempts.filter(row=>matches(row,args.where)).slice(0,args.take).map(row=>selected(row,args))
      })},
  }
  vi.mocked(prisma.$transaction).mockImplementation((async(fn:(value:typeof tx)=>Promise<unknown>)=>{
    state.beforeRead(++state.reads);return fn(tx)
  }) as never)
  const audit=(researchCode:string):SurveyVariantAudit=>{
    const assignment=assignments.get(researchCode)!
    return {variant:assignment.variant,assignmentAlgorithm:assignment.algorithm,assignmentDigest:canonicalHash(assignment),assignedAt:assignment.assignedAt}
  }
  const rewrite=(researchCode:string)=>{attempts.find(row=>row.participant.researchCode===researchCode)!.flowAssignmentCipher=
    security.encryptUnifiedRuntimePayload(assignments.get(researchCode)!)}
  return {snapshot,publication,publications,wave,waves,assignments,attempts,finals,state,tx,audit,rewrite}
}
// Independent CSV oracle: quoted cells, escaped quotes, CRLF, and empty/null
// cells are decoded before exact per-row assertions, never substring matches.
function csvRecords(csv:string):Record<string,string>[] {
  const records:string[][]=[],row:string[]=[]
  let cell='',quoted=false
  for(let i=0;i<csv.length;i++){
    const char=csv[i]
    if(char==='"'){
      if(quoted&&csv[i+1]==='"'){cell+='"';i++}else quoted=!quoted
    }else if(!quoted&&(char===','||char==='\n')){
      row.push(cell);cell=''
      if(char==='\n'){records.push([...row]);row.length=0}
    }else if(!quoted&&char==='\r')continue
    else cell+=char
  }
  const [headers,...rows]=records
  return rows.map(values=>{expect(values).toHaveLength(headers.length);return Object.fromEntries(headers.map((name,index)=>[name,values[index]]))})
}
function expectAudit(row:Record<string,string>,audit:SurveyVariantAudit,prefix=''){
  expect(variantAuditColumns.map(column=>row[prefix+column])).toEqual(variantAuditValues(audit).map(value=>value===null?'':String(value)))
}
const compactLoad=()=>loadSurveySource({...owner,includeWideSchema:false,pageMode:true,attendanceOnly:true,includeAttendance:false})
const allLoad=()=>loadSurveySource({...owner,waveIds:[waveId,otherWaveId]})
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64))})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})

describe('linked non-FINAL attendance retains verified questionnaire variant audit',()=>{
  it('loads durable encrypted assignments, excluding withdrawn identities and excluded FINAL answer content',async()=>{
    const f=persistedAttendanceFixture(),decrypt=vi.spyOn(security,'decryptUnifiedRuntimePayload')
    const source=await allLoad()
    expect(source.raw).toEqual([]);expect(source.scores).toEqual([]);expect(source.completeAttempts).toBe(0)
    expect(source.attendance.map(row=>row.researchCode)).toEqual(['R-started','R-screened','R-quality','R-none'])
    for(const code of ['R-started','R-screened','R-quality'])expect(source.attendance.find(row=>row.researchCode===code)).toMatchObject(f.audit(code))
    expect(source.attendance.find(row=>row.researchCode==='R-none')).not.toHaveProperty('variant')
    const assignmentCiphers=f.attempts.slice(0,3).map(row=>row.flowAssignmentCipher)
    expect(decrypt.mock.calls.map(([cipher])=>cipher).sort()).toEqual(assignmentCiphers.sort())
    expect(f.tx.surveyWaveFinal.findMany.mock.calls.every(([args])=>!!args.select)).toBe(true)
  })

  it('serializes exact assignment cells in compact, wave/all Raw Long, Raw Wide, Score Long and Score Wide',async()=>{
    const f=persistedAttendanceFixture(),source=await allLoad()
    const compact=compactSurveyAttendanceExport(projectId,await compactLoad(),waveId)
    expect(compact.manifest.format).toBe('ATTENDANCE_COMPACT_V2')
    expect(compact.manifest.variantConfigurations).toEqual(source.variantConfigurations)
    expect(compact.codebook).toEqual([])
    const exports=[
      {csv:compact.csv,code:'research_code',prefix:'',missing:'missing_reason',wave:waveId},
      {csv:rawLongExport(projectId,source,waveId).csv,code:'research_code_or_attempt',prefix:'',missing:'missing_reason',wave:waveId},
      {csv:rawLongExport(projectId,source).csv,code:'research_code_or_attempt',prefix:'',missing:'missing_reason',wave:waveId},
      {csv:rawWideExport(projectId,source).csv,code:'research_code',prefix:'W001__',missing:source.codebook.find(c=>c.waveId===waveId)!.columnKey+'__missing'},
      {csv:exportLong(projectId,source.scores,source.attendance,source.scoreColumns).csv,code:'research_code_or_attempt',prefix:'',missing:'missing_reason',wave:waveId},
      {csv:exportWide(projectId,source.scores,source.attendance,source.scoreColumns).csv,code:'research_code',prefix:'W001__',missing:exportWide(projectId,[],[],source.scoreColumns).codebook.find(c=>c.waveId===waveId)!.column+'__missing'},
    ]
    for(const artifact of exports){
      const records=csvRecords(artifact.csv).filter(row=>!artifact.wave||!row.wave_id||row.wave_id===artifact.wave)
      for(const [code,missing] of [['R-started','ABANDONED'],['R-screened','ABANDONED'],['R-quality','QUALITY_EXCLUDED']]){
        const row=records.find(row=>row[artifact.code]===code)!
        expect(row,artifact.csv).toBeDefined();expect(row[artifact.missing]).toBe(missing);expectAudit(row,f.audit(code),artifact.prefix)
        if('source_final_hash' in row)expect(row.source_final_hash).toBe('')
        if('value' in row)expect(row.value).toBe('')
      }
      if(artifact.csv!==compact.csv){
        const noWave=records.find(row=>row[artifact.code]==='R-none')!
        expect(noWave[artifact.missing]).toBe('NO_WAVE');expectAudit(noWave,{},artifact.prefix)
      }
      expect(records.some(row=>String(row[artifact.code]).includes('withdrawn'))).toBe(false)
      expect(artifact.csv).not.toContain('attempt-');expect(artifact.csv).not.toContain('excluded-final')
    }
    expect(csvRecords(compact.csv).map(row=>row.participation_status)).toEqual(['STARTED','SCREENED_OUT','QUALITY_EXCLUDED'])
  })

  it.each(['variantDigest','flowDigest','algorithm','assignedAt'] as const)('fails closed for rewritten persisted assignment %s',async field=>{
    const f=persistedAttendanceFixture(),assignment=f.assignments.get('R-started')!
    if(field==='variantDigest')assignment.variant!.variantDigest='forged'
    else if(field==='algorithm')assignment.algorithm='LINKED_INHERIT_V1'
    else if(field==='assignedAt')assignment.assignedAt='invalid-time'
    else assignment.flowDigest='another-publication'
    f.rewrite('R-started')
    await expect(compactLoad()).rejects.toMatchObject({statusCode:409})
  })

  it('rejects missing or undecipherable assignments instead of inventing an arm',async()=>{
    for(const cipher of [null,'corrupt-encrypted-assignment']){
      const f=persistedAttendanceFixture();f.attempts[0].flowAssignmentCipher=cipher
      await expect(compactLoad()).rejects.toMatchObject({statusCode:409})
    }
  })

  it.each(['snapshotHash','snapshotWave','missingPublication','wavePublication'] as const)('fails closed for exact frozen publication mismatch: %s',async field=>{
    const f=persistedAttendanceFixture()
    if(field==='snapshotHash')f.publication.definitionDigest='forged'
    else if(field==='snapshotWave'){f.snapshot.waveId='another-wave';f.publication.definitionDigest=canonicalHash(f.snapshot)}
    else if(field==='missingPublication')f.publications.splice(0,1)
    else f.wave.publicationId='missing-publication'
    await expect(compactLoad()).rejects.toMatchObject({statusCode:409})
  })

  it.each(['assignment','publication','withdrawal'] as const)('fences %s changes between source read and release',async field=>{
    const f=persistedAttendanceFixture()
    f.state.beforeRead=read=>{
      if(read!==2)return
      if(field==='assignment'){f.assignments.get('R-started')!.assignedAt='2026-10-17T00:01:00.000Z';f.rewrite('R-started')}
      else if(field==='publication'){f.snapshot.consentDigest='changed';f.publication.definitionDigest=canonicalHash(f.snapshot)}
      else f.attempts[0].participant.status='WITHDRAWN'
    }
    await expect(compactLoad()).rejects.toMatchObject({statusCode:409})
    expect(f.state.reads).toBe(2)
  })

  it('keeps publication verification and batched queries constant from one to 100 attendance rows',async()=>{
    const samples=[]
    for(const count of [1,100]){
      const f=persistedAttendanceFixture({count});vi.mocked(canonicalHash).mockClear()
      const source=await compactLoad()
      expect(source.attendance).toHaveLength(count)
      const publicationHashes=vi.mocked(canonicalHash).mock.calls.filter(([value])=>value&&typeof value==='object'&&'purpose' in value&&'units' in value)
      const assignmentReads=f.tx.surveyWaveAttempt.findMany.mock.calls.filter(([args])=>args.select?.flowAssignmentCipher)
      const provenanceHashes=vi.mocked(canonicalHash).mock.calls.filter(([value])=>value&&typeof value==='object'&&'variantKey' in value&&'allocationConfigId' in value)
      const assignmentHashes=vi.mocked(canonicalHash).mock.calls.filter(([value])=>value&&typeof value==='object'&&'algorithm' in value&&'assignedAt' in value)
      // Stored audit hashes are necessarily per row; only the two immutable
      // expected arm hashes may be prepared, independent of cohort size.
      expect(provenanceHashes).toHaveLength(count+2);expect(assignmentHashes).toHaveLength(count)
      expect(publicationHashes).toHaveLength(1);expect(f.tx.surveyPublication.findMany).toHaveBeenCalledTimes(2)
      expect(assignmentReads).toHaveLength(2)
      expect(f.state.events.filter(event=>event==='assignment-budget')).toHaveLength(2)
      for(const [args] of assignmentReads){
        expect(args.where?.id).toEqual({in:f.attempts.map(row=>row.id)})
        expect(args.select).not.toHaveProperty('checkpoint');expect(args.select).not.toHaveProperty('final')
      }
      samples.push({publications:f.tx.surveyPublication.findMany.mock.calls.length,hashes:publicationHashes.length,
        queries:f.tx.$queryRaw.mock.calls.length,attempts:f.tx.surveyWaveAttempt.findMany.mock.calls.length,
        waves:f.tx.surveyWave.findMany.mock.calls.length})
    }
    expect(samples[1]).toEqual(samples[0])
  })

  it('keeps compact pages bounded at 250 and pins candidate attendance to the original cutoff',async()=>{
    const f=persistedAttendanceFixture({count:252})
    f.attempts[251].startedAt=new Date('2026-10-17T00:21:00.000Z')
    const first=await compactLoad()
    expect(first.attendance).toHaveLength(250);expect(first.sourceAttendanceCount).toBe(251)
    expect(first.nextAttendanceCursor).toBe('attempt-249')
    expect(first.codebook).toEqual([]);expect(first.scoreColumns).toEqual([])
    const second=await loadSurveySource({...owner,includeWideSchema:false,pageMode:true,attendanceOnly:true,includeAttendance:false,
      attendanceAfterId:first.nextAttendanceCursor!,snapshotCutOff:new Date(first.cutOff),expectedAttendanceCount:251})
    expect(second.attendance.map(row=>row.researchCode)).toEqual(['R-250']);expect(second.nextAttendanceCursor).toBeNull()
    expect(second.sourceAttendanceCount).toBe(251)
    const selectedCipherReads=f.tx.surveyWaveAttempt.findMany.mock.calls.filter(([args])=>args.select?.flowAssignmentCipher)
    expect(selectedCipherReads.map(([args])=>(args.where?.id as {in:string[]}).in.length)).toEqual([251,251,1,1])
  })

  it.each(['assignment','publication'] as const)('enforces the %s byte budget before fetching ciphertext or frozen JSON',async kind=>{
    const f=persistedAttendanceFixture()
    if(kind==='assignment')f.state.assignmentBytes=8n*1024n*1024n+1n
    else f.state.publicationBytes=8n*1024n*1024n+1n
    await expect(compactLoad()).rejects.toMatchObject({statusCode:413})
    expect(f.state.events).not.toContain('assignment-load')
    if(kind==='publication')expect(f.state.events).not.toContain('publication-load')
  })

  it('retains byte-for-byte compact V1 output and conditional headers for legacy publications',async()=>{
    const f=persistedAttendanceFixture({legacy:true}),source=await compactLoad()
    const artifact=compactSurveyAttendanceExport(projectId,source,waveId)
    expect(artifact.csv).toBe('"research_code","wave_id","participation_status","missing_reason"\r\n'+
      '"R-started","attendance-wave","STARTED","ABANDONED"\r\n'+
      '"R-screened","attendance-wave","SCREENED_OUT","ABANDONED"\r\n'+
      '"R-quality","attendance-wave","QUALITY_EXCLUDED","QUALITY_EXCLUDED"\r\n')
    expect(artifact.manifest.format).toBe('ATTENDANCE_COMPACT_V1')
    expect(artifact.manifest).not.toHaveProperty('variantConfigurations')
    expect(f.tx.surveyWaveAttempt.findMany.mock.calls.filter(([args])=>args.select?.flowAssignmentCipher)).toHaveLength(0)
    const full=await allLoad()
    for(const csv of [rawLongExport(projectId,full).csv,rawWideExport(projectId,full).csv,
      exportLong(projectId,full.scores,full.attendance,full.scoreColumns).csv,
      exportWide(projectId,full.scores,full.attendance,full.scoreColumns).csv])expect(csv.split('\r\n')[0]).not.toContain('variant_key')
  })
})
