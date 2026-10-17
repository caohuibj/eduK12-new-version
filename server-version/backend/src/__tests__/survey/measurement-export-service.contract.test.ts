import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import type {Request} from 'express'
import {prisma} from '../../config/database'
import {verifyToken} from '../../utils/jwt'
import {loadSurveySource,type SurveySourceProjection} from '../../modules/survey/analytics.source'
import {createSurveyExport,downloadSurveyExport} from '../../modules/survey/analytics.export.service'
import {decodeSurveyExportCursor} from '../../modules/survey/analytics.export-cursor'
import type {CognitiveTrialObservation} from '../../modules/survey/analytics.cognitive'

vi.mock('../../config/database',()=>({prisma:{$transaction:vi.fn()}}))
vi.mock('../../modules/survey/analytics.source',()=>({loadSurveySource:vi.fn()}))
vi.mock('../../utils/authCookies',()=>({getSurveySessionToken:vi.fn(()=> 'signed-survey-session')}))
vi.mock('../../utils/jwt',()=>({verifyToken:vi.fn()}))
const projectId='11111111-1111-4111-8111-111111111111',waveId='22222222-2222-4222-8222-222222222222'
const firstFinal='33333333-3333-4333-8333-333333333333',secondFinal='44444444-4444-4444-8444-444444444444'
const instant='2026-10-17T00:00:00.000Z',sourceHash='a'.repeat(64)
const req={user:{userId:'owner',tokenVersion:7}} as Request
const input={projectId,waveId,format:'COGNITIVE_TRIAL_LONG' as const}
function row(trialIndex=0):CognitiveTrialObservation{return {projectId,waveId,waveOrdinal:1,attemptId:'internal-parent-id',
  researchCode:null,publicationId:'publication',publicationVersion:1,sourceFinalHash:sourceHash,completedAt:instant,
  completionStatus:'COMPLETE',sourceVerified:true,instrumentKey:'gonogo',sourceResultHash:'b'.repeat(64),epoch:1,
  measurementDigest:'c'.repeat(64),configHash:'d'.repeat(64),protocolSignature:'e'.repeat(64),engineVersion:'1.0.0',
  scoringVersion:'1.0.0',configVersion:'1.1.0',timingPolicy:'software-frame-v1',randomSeed:'research-seed',
  randomizationVersion:'seq-v1.0.0',restartCount:0,childCompletedAt:instant,phase:'test',trialIndex,condition:null,
  stimulusCode:'go',responded:true,response:'SPACE',rtMs:350,rtMissingReason:null,startedAtPerfMs:0,endedAtPerfMs:800,
  durationMs:800,timeout:false,premature:false,interrupted:false,qualityEvents:[],qualityStatus:'interpretable',
  qualityFlags:{},qualityReasons:[],administrationProvenance:{device:'desktop'}}}
function source(offset=0,nextOffset:number|null=null,finalId=firstFinal,nextFinal=true):SurveySourceProjection{
  return {projectId,collectionMode:'SINGLE_UNLINKED',completeAttempts:1,fullCompletionAttempts:1,earlyCompletionAttempts:0,
    sourceRevision:1,cutOff:instant,sourceFinalCount:2,nextFinalCursor:nextFinal?{id:finalId,completedAt:instant}:null,
    scores:[],scoreColumns:[],raw:[],codebook:[],attendance:[],cognitiveTrials:[row(offset)],
    cognitivePage:{finalId,sourceFinalHash:sourceHash,offset,nextOffset,estimatedBytes:2000}}
}
function database(){
  const state={revision:1,owner:true},tickets:Record<string,unknown>[]=[]
  const tx={$queryRaw:vi.fn(async()=>state.owner?[{id:projectId,revision:state.revision}]:[]),
    surveyExportTicket:{create:vi.fn(async({data}:{data:Record<string,unknown>})=>{tickets.push(data);return data}),
      findFirst:vi.fn(async({where}:{where:{id:string;actorUserId:string}})=>tickets.find(t=>t.id===where.id&&t.actorUserId===where.actorUserId)??null)},
    surveyEvent:{create:vi.fn(async()=>({}))}}
  vi.mocked(prisma.$transaction).mockImplementation((async(fn:(value:typeof tx)=>unknown)=>fn(tx)) as never)
  return {state,tx,tickets}
}
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','ab'.repeat(32))
  vi.stubEnv('ASSET_SIGNING_SECRET','measurement-export-secret-that-is-at-least-32-characters')
  vi.mocked(verifyToken).mockReturnValue({userId:'owner',tokenVersion:7,accountDomain:'SURVEY',mfaVerifiedAt:Math.floor(Date.now()/1000)} as never)
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})
describe('Cognitive trial export uses existing MFA, ticket and revocation boundaries',()=>{
  it.each(['RAW_WAVE','SCORE_LONG','COGNITIVE_TRIAL_LONG'] as const)('retains frozen sourced cognitive provenance in %s manifests without raw item columns',async format=>{
    database()
    const frozenSource={waveId,instrumentKey:'gonogo',publicationVersion:1,instrumentRevision:2,
      definitionDigest:'frozen-native-definition',scoringDigest:'frozen-native-scoring',
      sourceProvenance:{source:{kind:'COGNITIVE',sourceId:'native-task',sourceVersion:'1'},
        definitionDigest:'frozen-native-definition',adapterVersion:'SURVEY_CATALOG_V1'},
      sourceAnswerMapping:{type:'SCALE_TYPED_V1' as const,items:{i_0:'Native.Item'},options:{o_0:'001',o_1:1}}}
    vi.mocked(loadSurveySource).mockResolvedValue({...source(0,null,firstFinal,false),sourceVersions:[frozenSource]})
    const created=await createSurveyExport(req,{projectId,waveId,format})
    expect(created.manifest.selectedVersions).toEqual([frozenSource])
    const downloaded=await downloadSurveyExport(req,{projectId,exportId:created.id})
    expect((downloaded.manifest as {selectedVersions:unknown[]}).selectedVersions).toEqual([frozenSource])
  })

  it('advances within one FINAL before advancing the exact existing FINAL keyset',async()=>{
    const db=database()
    vi.mocked(loadSurveySource).mockResolvedValueOnce(source(0,40)).mockResolvedValueOnce(source(40,null))
      .mockResolvedValueOnce(source(0,null,secondFinal,false))
    const first=await createSurveyExport(req,input)
    expect(first.manifest.selectedVersions).toEqual([])
    const firstCursor=decodeSurveyExportCursor(first.nextCursor!,projectId,input.format,waveId)
    expect(firstCursor).toMatchObject({v:5,pageLimit:1,trial:{finalId:firstFinal,finalHash:sourceHash,offset:40},
      after:{id:'00000000-0000-0000-0000-000000000000'}})
    const second=await createSurveyExport(req,{...input,cursor:first.nextCursor!})
    const secondCursor=decodeSurveyExportCursor(second.nextCursor!,projectId,input.format,waveId)
    expect(secondCursor.trial).toBeUndefined();expect(secondCursor.after.id).toBe(firstFinal)
    const third=await createSurveyExport(req,{...input,cursor:second.nextCursor!})
    expect(third.nextCursor).toBeNull()
    expect([first,second,third].map(p=>p.manifest.completedFinalCount)).toEqual([1,0,1])
    expect(vi.mocked(loadSurveySource).mock.calls[1][0]).toMatchObject({maxFinals:1,pageMode:true,stableIdCursor:true,
      includeAttendance:false,selectRaw:false,selectScore:false,expectedSourceRevision:1,expectedFinalCount:2,
      cognitiveTrials:{offset:40,expectedFinalId:firstFinal,expectedFinalHash:sourceHash}})
    expect(vi.mocked(loadSurveySource).mock.calls[2][0]).toMatchObject({afterFinal:{id:firstFinal},cognitiveTrials:{offset:0}})
    expect(db.tickets).toHaveLength(3)
    const artifact=await downloadSurveyExport(req,{projectId,exportId:first.id})
    expect(artifact.csv).toContain('"research-seed"');expect(artifact.csv).not.toContain('internal-parent-id')
    expect(artifact.csv).toContain('"rt","rt_unit","rt_missing_reason"')
  })
  it('requires recent signed Survey MFA before source reads or ticket downloads',async()=>{
    database();vi.mocked(verifyToken).mockReturnValue({userId:'owner',tokenVersion:7,accountDomain:'SURVEY',
      mfaVerifiedAt:Math.floor(Date.now()/1000)-301} as never)
    await expect(createSurveyExport(req,input)).rejects.toMatchObject({statusCode:403})
    await expect(downloadSurveyExport(req,{projectId,exportId:'anything'})).rejects.toMatchObject({statusCode:403})
    expect(loadSurveySource).not.toHaveBeenCalled();expect(prisma.$transaction).not.toHaveBeenCalled()
  })
  it('rejects missing wave, free-text option, or signed continuation selection changes before reads',async()=>{
    database()
    await expect(createSurveyExport(req,{...input,waveId:undefined})).rejects.toMatchObject({statusCode:400})
    await expect(createSurveyExport(req,{...input,includeFreeText:true})).rejects.toMatchObject({statusCode:400})
    expect(loadSurveySource).not.toHaveBeenCalled()
    vi.mocked(loadSurveySource).mockResolvedValue(source(0,40))
    const first=await createSurveyExport(req,input),calls=vi.mocked(loadSurveySource).mock.calls.length
    await expect(createSurveyExport(req,{...input,cursor:first.nextCursor!,completedFrom:instant})).rejects.toMatchObject({statusCode:400})
    expect(loadSurveySource).toHaveBeenCalledTimes(calls)
  })
  it('fences owner/revision again before creating a ticket and never retries an integrity failure',async()=>{
    const db=database();vi.mocked(loadSurveySource).mockResolvedValue(source())
    db.state.owner=false
    await expect(createSurveyExport(req,input)).rejects.toMatchObject({statusCode:404})
    db.state.owner=true;db.state.revision=2
    await expect(createSurveyExport(req,input)).rejects.toMatchObject({statusCode:409})
    expect(db.tx.surveyExportTicket.create).not.toHaveBeenCalled()
    expect(loadSurveySource).toHaveBeenCalledTimes(2)
  })
  it('revokes an already prepared encrypted artifact when current project revision changes',async()=>{
    const db=database();vi.mocked(loadSurveySource).mockResolvedValue(source(0,null,firstFinal,false))
    const ticket=await createSurveyExport(req,input)
    await expect(downloadSurveyExport(req,{projectId,exportId:ticket.id})).resolves.toMatchObject({id:ticket.id})
    db.state.revision++
    await expect(downloadSurveyExport(req,{projectId,exportId:ticket.id})).rejects.toMatchObject({statusCode:409})
    expect(db.tx.surveyEvent.create).toHaveBeenCalledTimes(2)
  })
})
