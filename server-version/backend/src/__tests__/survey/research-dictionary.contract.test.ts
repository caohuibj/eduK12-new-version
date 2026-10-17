import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {selectSurveyFixtureRecord,surveyFixtureSql} from './survey-source-select.fixture'
import type {NextFunction,Request,Response} from 'express'
import {prisma} from '../../config/database'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import * as security from '../../modules/assessment-runtime/security'
import {compileFrozenResearchUnit,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {loadSurveySource} from '../../modules/survey/analytics.source'
import {surveyAnalyticsRouter} from '../../modules/survey/analytics.routes'
import {generateToken} from '../../utils/jwt'
import {SURVEY_AUTH_COOKIE_NAME} from '../../utils/authCookies'
import type {FormDraft,FormQuestion} from '../../modules/survey/builder.definition'

vi.mock('../../config/database',()=>({prisma:{$transaction:vi.fn()}}))
vi.mock('../../middleware/auth',()=>({authenticateSurvey:vi.fn()}))
const projectId='00000000-0000-4000-8000-000000000001'
const waveId='00000000-0000-4000-8000-000000000002'
const owner='00000000-0000-4000-8000-000000000003'
const question=(itemKey:string,extra:Partial<FormQuestion>={}):FormQuestion=>({
  itemKey,type:'NUMBER',prompt:itemKey,required:false,options:[],rows:[],...extra,
})
const options=[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'}]
function fixture(){
  const prefix='q'+'a'.repeat(37)
  const definition:FormDraft={schemaVersion:2,pages:[{pageKey:'page',title:'Synthetic',questions:[
    question('q-a'),question('q_a'),question(prefix+'x'),question(prefix+'y'),
    question('grid',{type:'MATRIX',options,rows:[{rowKey:'row',label:'Row'}]}),question('grid_row'),
    question('choose',{type:'SINGLE',options,otherOptionKey:'b'}),question('choose_other'),
    question('short',{type:'SHORT_TEXT'}),question('long',{type:'LONG_TEXT'}),
  ]}]}
  const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId,waveId,
    collectionMode:'LINKED_WAVES',consentVersion:1,linkageNoticeConfirmed:true,consentDigest:'consent',
    runtimeStatus:'SURVEY_FINAL_V1',units:['form-a','form_a'].map(instrumentKey=>
      compileFrozenResearchUnit({id:instrumentKey,instrumentKey,kind:'FORM',title:'Synthetic',revision:1,definition}))}
  const publication={id:'publication',projectId,version:1,purpose:'RESEARCH_ONLY',consentVersion:1,
    createdAt:new Date('2026-10-17T00:00:00Z'),compiledSnapshot:snapshot,definitionDigest:canonicalHash(snapshot)}
  const wave={id:waveId,projectId,ordinal:1,status:'OPEN',revision:1,publicationId:publication.id as string|null}
  const state={authorized:true,sourceRevision:1,publication:publication as typeof publication|null,
    wave:wave as typeof wave|null,frozenBytes:0n,corruptFinal:false,beforeRead:(_read:number)=>{},reads:0}
  const tx={
    $queryRaw:vi.fn(async(parts:TemplateStringsArray|{strings:string[];values:unknown[]},...values:unknown[])=>{
      const query=surveyFixtureSql(parts)
      if(query.includes('FROM "survey_projects"'))return state.authorized&&('strings' in parts?parts.values:values).includes(owner)
        ?[{collectionMode:'LINKED_WAVES',sourceRevision:state.sourceRevision,
          sourceCutOff:new Date('2026-10-17T00:01:00Z')}]:[]
      return query.includes('finalCipherBytes')?[{finalCipherBytes:0n,frozenBytes:state.frozenBytes}]
        :[{bytes:query.includes('compiled_snapshot')?state.frozenBytes:0n}]
    }),
    surveyWave:{
      count:vi.fn(async()=>state.wave?1:0),
      findFirst:vi.fn(async()=>structuredClone(state.wave)),
      findMany:vi.fn(async()=>state.wave&&['OPEN','PAUSED','CLOSED'].includes(state.wave.status)
        &&state.wave.publicationId?[structuredClone(state.wave)]:[]),
    },
    surveyPublication:{
      findUnique:vi.fn(async()=>structuredClone(state.publication)),
      findMany:vi.fn(async()=>state.publication?[structuredClone(state.publication)]:[]),
    },
    surveyWaveFinal:{
      count:vi.fn(async()=>state.corruptFinal?1:0),
      findMany:vi.fn(async(args:{select?:unknown})=>!state.corruptFinal?[]:[selectSurveyFixtureRecord({id:'unrelated-final',publicationId:publication.id,definitionDigest:publication.definitionDigest,
          resultsHash:'invalid',resultsCipher:'unrelated-corrupt-cipher',completedAt:new Date('2026-10-17T00:00:00Z'),
          wave,attempt:{id:'unrelated-attempt',projectId,waveId,startedAt:new Date('2026-10-17T00:00:00Z'),
            flowAssignmentCipher:null,participant:null}},args.select)]),
    },
    surveyWaveAttempt:{count:vi.fn(),findMany:vi.fn()},
  }
  vi.mocked(prisma.$transaction).mockImplementation((async(fn:(client:typeof tx)=>Promise<unknown>)=>{
    state.beforeRead(++state.reads)
    return fn(tx)
  }) as never)
  return {state,tx,snapshot,wave,publication}
}
// Invoke the registered wrapped handler without starting an HTTP server. The
// signed-session MFA gate is real; ownership/credential SQL is inspected below.
async function dictionary(overrides:{actor?:string;mfaAge?:number;tokenVersion?:number;tokenActor?:string;domain?:string}={}){
  const actor=overrides.actor??owner
  const token=generateToken({userId:overrides.tokenActor??actor,role:'STUDENT',accountDomain:overrides.domain??'SURVEY',
    tokenVersion:overrides.tokenVersion??1,mfaVerifiedAt:Math.floor(Date.now()/1000)-(overrides.mfaAge??0)} as never)
  const req={params:{pid:projectId,wid:waveId},user:{userId:actor,tokenVersion:1},
    headers:{cookie:SURVEY_AUTH_COOKIE_NAME+'='+token}} as unknown as Request
  const response:{status:number;body:any}={status:200,body:null}
  const res={status:(status:number)=>{response.status=status;return res},json:(body:unknown)=>{response.body=body;return res}} as unknown as Response
  const layer=(surveyAnalyticsRouter as unknown as {stack:{route?:{path:string;stack:{handle:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>}[]}}[]})
    .stack.find(item=>item.route?.path==='/:pid/analytics/waves/:wid/items/dictionary')!
  await layer.route!.stack[0].handle(req,res,((error:unknown)=>{throw error}) as NextFunction)
  return response
}
const noParticipantWork=(tx:ReturnType<typeof fixture>['tx'])=>{
  expect(tx.surveyWaveFinal.count).not.toHaveBeenCalled()
  expect(tx.surveyWaveFinal.findMany).not.toHaveBeenCalled()
  expect(tx.surveyWaveAttempt.count).not.toHaveBeenCalled()
  expect(tx.surveyWaveAttempt.findMany).not.toHaveBeenCalled()
  expect(tx.$queryRaw.mock.calls.map(([parts])=>surveyFixtureSql(parts)).join('\n')).not.toMatch(/survey_wave_finals|survey_wave_attempts/)
}
beforeEach(()=>{
  vi.clearAllMocks()
  vi.stubEnv('DATA_ENCRYPTION_KEY','ab'.repeat(32))
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})

describe('Publication-only Survey item dictionary',()=>{
  it('reads a valid empty-wave dictionary without FINAL/attempt loading, counting or decrypting',async()=>{
    const {tx}=fixture(),decrypt=vi.spyOn(security,'decryptUnifiedRuntimePayload')
    const response=await dictionary()
    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({waveId,source:'FROZEN_CODEBOOK'})
    expect(response.body.data.variables).toHaveLength(16)
    noParticipantWork(tx)
    expect(decrypt).not.toHaveBeenCalled()
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  })
  it('does not let an unrelated corrupt FINAL block the frozen dictionary',async()=>{
    const {state,tx}=fixture(),decrypt=vi.spyOn(security,'decryptUnifiedRuntimePayload')
    state.corruptFinal=true
    const response=await dictionary()
    expect(response.status).toBe(200)
    expect(response.body.data.variables).toHaveLength(16)
    noParticipantWork(tx)
    expect(decrypt).not.toHaveBeenCalled()
  })
  it('keeps full-schema collision IDs equal to export columns and excludes all free-text variables',async()=>{
    fixture()
    const response=await dictionary()
    const source=await loadSurveySource({actorUserId:owner,projectId,waveIds:[waveId],
      includeWideSchema:true,includeAttendance:false,pageMode:true})
    const expected=source.codebook.filter(c=>!['SHORT_TEXT','LONG_TEXT','OTHER_TEXT'].includes(c.responseType))
      .map(c=>({instrumentKey:c.instrumentKey,itemKey:c.itemKey,prompt:c.prompt,responseType:c.responseType,
        kind:c.kind,columnKey:c.columnKey,definitionDigest:c.definitionDigest}))
    expect(response.body.data.variables).toEqual(expected)
    expect(new Set(expected.map(c=>c.columnKey)).size).toBe(expected.length)
    // choose_other collides with excluded choose:other: filtering before key
    // construction would silently break dictionary versus export identity.
    expect(expected.filter(c=>c.itemKey==='choose_other').every(c=>c.columnKey.includes('__K'))).toBe(true)
    expect(response.body.data.variables.every((c:{responseType:string})=>!['SHORT_TEXT','LONG_TEXT','OTHER_TEXT'].includes(c.responseType))).toBe(true)
  })
  it.each(['PAUSED','CLOSED'])('continues to expose an existing %s wave dictionary',async(status)=>{
    const {wave}=fixture();wave.status=status
    expect((await dictionary()).status).toBe(200)
  })
  it('keeps an unreleased DRAFT wave empty',async()=>{
    const {wave}=fixture();wave.status='DRAFT';wave.publicationId=null
    expect((await dictionary()).body.data.variables).toEqual([])
  })
  it('denies a different actor even when they have a recent Survey MFA token',async()=>{
    const {tx}=fixture()
    expect((await dictionary({actor:'00000000-0000-4000-8000-000000000099'})).status).toBe(404)
    expect(tx.surveyPublication.findMany).not.toHaveBeenCalled()
    expect(tx.surveyPublication.findUnique).not.toHaveBeenCalled()
  })
  it.each([
    {mfaAge:301},{mfaAge:-60},{tokenVersion:2},{tokenActor:'another-user'},{domain:'LEGACY'},
  ])('rejects stale, mismatched or wrong-domain MFA before source access: %j',async(overrides)=>{
    fixture()
    expect((await dictionary(overrides)).status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
  it('rechecks current owner, account, grant and enabled MFA after projection',async()=>{
    const {state,tx}=fixture()
    state.beforeRead=read=>{if(read===2)state.authorized=false}
    expect((await dictionary()).status).toBe(404)
    const queries=tx.$queryRaw.mock.calls.map(([parts])=>surveyFixtureSql(parts)).filter(sql=>sql.includes('FROM "survey_projects"'))
    expect(queries).toHaveLength(2)
    for(const sql of queries){
      expect(sql).toContain('p.owner_user_id=')
      expect(sql).toContain("u.account_domain='SURVEY'")
      expect(sql).toContain('u.is_active AND NOT u.is_frozen')
      expect(sql).toContain('u.expires_at>statement_timestamp()')
      expect(sql).toContain("g.status='ACTIVE' AND m.enabled")
      expect(sql).toContain('FOR SHARE OF p,u,g,m')
    }
  })
  it.each(['revision','publication-id','publication-bytes','publication-version','wave-ordinal','wave-status'])
    ('rejects %s changing between the two reads',async(change)=>{
      const {state,wave,publication}=fixture()
      state.beforeRead=read=>{
        if(read!==2)return
        if(change==='revision')state.sourceRevision++
        if(change==='publication-id')wave.publicationId=publication.id='replacement-publication'
        if(change==='publication-bytes')(publication.compiledSnapshot.units[0].displayDefinition as FormDraft).pages[0].title='Changed without a new digest'
        if(change==='publication-version')publication.version++
        if(change==='wave-ordinal')wave.ordinal++
        if(change==='wave-status')wave.status='DRAFT'
      }
      expect((await dictionary()).status).toBe(409)
    })
  it('denies a wave removed from the current project during projection',async()=>{
    const {state}=fixture()
    state.beforeRead=read=>{if(read===2)state.wave=null}
    expect((await dictionary()).status).toBe(404)
  })
  it.each(['digest','wrong-project','wrong-wave','missing-publication'])('rejects invalid frozen source: %s',async(change)=>{
    const {state,publication}=fixture()
    if(change==='digest')publication.definitionDigest='bad-digest'
    if(change==='wrong-project')publication.projectId='other-project'
    if(change==='wrong-wave'){
      publication.compiledSnapshot.waveId='other-wave'
      publication.definitionDigest=canonicalHash(publication.compiledSnapshot)
    }
    if(change==='missing-publication')state.publication=null
    expect((await dictionary()).status).toBe(409)
  })
  it('enforces the frozen-byte budget before loading Publication JSON',async()=>{
    const {state,tx}=fixture();state.frozenBytes=8n*1024n*1024n+1n
    expect((await dictionary()).status).toBe(413)
    expect(tx.surveyPublication.findMany).not.toHaveBeenCalled()
    expect(tx.surveyPublication.findUnique).not.toHaveBeenCalled()
  })
})
