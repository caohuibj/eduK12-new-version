import {beforeEach,describe,expect,it,vi} from 'vitest'
import {
  assertSurveyDraft,formWorstCaseAnswerBytes,type FormDraft,
} from '../../modules/survey/builder.definition'
import {
  assertCanonicalSubmissionPayloadSize,prepareCanonicalSubmission,
} from '../../services/instrumentFinalSubmit'

const mocks=vi.hoisted(()=>({tx:{
  $queryRaw:vi.fn(),$executeRaw:vi.fn(),
  surveyWave:{findUniqueOrThrow:vi.fn(),updateMany:vi.fn()},
  surveyInstrumentDraft:{findMany:vi.fn()},
  surveyPublication:{aggregate:vi.fn()},
  surveyProject:{findUniqueOrThrow:vi.fn(),update:vi.fn()},
  surveyEvent:{create:vi.fn()},
},transaction:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/survey/media.references',()=>({retainSurveyMedia:vi.fn()}))
vi.mock('../../modules/survey/catalog.service',()=>({
  catalogSnapshotsForDrafts:vi.fn(async()=>new Map()),compileCatalogUnit:vi.fn(),
}))
vi.mock('../../modules/survey/waves.service',()=>({
  SurveyWaveError:class extends Error{constructor(readonly statusCode:number,message:string){super(message)}},
}))
import {freezeResearchWaveDraft} from '../../modules/survey/publication.service'

const form=(questionCount:number,maxLength:number):FormDraft=>({
  schemaVersion:1,pages:[{pageKey:'page',title:'Synthetic page',questions:
    Array.from({length:questionCount},(_,i)=>({
      itemKey:'text'+i,type:'LONG_TEXT',prompt:'Synthetic text',required:false,
      options:[],rows:[],maxLength,
    })),
  }],
})
let wave:{instrumentIds:string[];checkpointPolicy:unknown}
const setup=(count:number,questionCount:number,maxLength:number,checkpoint:boolean)=>{
  const definition=form(questionCount,maxLength)
  // Each tool must remain independently publishable through the real validator.
  expect(assertSurveyDraft('FORM',definition,true)).toEqual(definition)
  expect(formWorstCaseAnswerBytes(definition)).toBeLessThan(480000)
  const drafts=Array.from({length:count},(_,i)=>({
    id:'draft'+i,instrumentKey:'form'+i,kind:'FORM',title:'Synthetic form '+i,
    revision:0,catalogGrantId:null,definition,
  }))
  wave.instrumentIds=drafts.map(d=>d.id)
  wave.checkpointPolicy=checkpoint?{schemaVersion:1,enabled:true,ttlHours:24}:null
  mocks.tx.surveyInstrumentDraft.findMany.mockResolvedValue(drafts)
  // Escaped control characters are legal text and exercise the documented
  // six-byte JSON expansion, without exceeding any question's maxLength.
  return Object.fromEntries(drafts.map(d=>[d.instrumentKey,
    Object.fromEntries(definition.pages[0].questions.map(q=>[q.itemKey,'\u0001'.repeat(maxLength)])),
  ]))
}
const freeze=()=>freezeResearchWaveDraft({
  actorUserId:'owner',projectId:'project',waveId:'wave',revision:0,
})
beforeEach(()=>{
  vi.clearAllMocks()
  wave={
    id:'wave',projectId:'project',status:'DRAFT',revision:0,publicationId:null,
    consentText:'Synthetic consent long enough for the publication contract.',consentVersion:1,
    linkageNoticeConfirmed:false,instrumentIds:[],flowDefinition:null,
    quotaPolicy:null,checkpointPolicy:null,groupIpPolicy:null,
  } as typeof wave
  mocks.transaction.mockImplementation((fn:(tx:typeof mocks.tx)=>Promise<unknown>)=>fn(mocks.tx))
  mocks.tx.$queryRaw.mockImplementation(async(strings:TemplateStringsArray)=>
    strings.join('').includes('FROM "survey_instrument_drafts"')
      ?wave.instrumentIds.map(id=>({id}))
      :[{id:'project',status:'ACTIVE',collectionMode:'SINGLE_UNLINKED'}])
  mocks.tx.surveyWave.findUniqueOrThrow.mockImplementation(async()=>wave)
  mocks.tx.surveyWave.updateMany.mockResolvedValue({count:1})
  mocks.tx.surveyPublication.aggregate.mockResolvedValue({_max:{version:null}})
  mocks.tx.surveyProject.findUniqueOrThrow.mockResolvedValue({
    firstPublishedAt:new Date('2026-11-26T00:00:00Z'),
  })
})

describe('Survey FORM-only wave answer budgets (mocked transaction, real compilation)',()=>{
  it('rejects individually legal forms whose combined checkpoint exceeds 64 KiB',async()=>{
    const answers=setup(2,1,6000,true)
    expect(formWorstCaseAnswerBytes(form(1,6000))).toBeLessThan(65536)
    expect(Buffer.byteLength(JSON.stringify(answers),'utf8')).toBeGreaterThan(65536)
    await expect(freeze()).rejects.toMatchObject({statusCode:409,message:expect.stringContaining('64KB')})
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled()
    expect(mocks.tx.surveyWave.updateMany).not.toHaveBeenCalled()
  })
  it('rejects individually legal forms whose combined FINAL exceeds one MiB',async()=>{
    const answers=setup(3,7,10000,false)
    const canonical=prepareCanonicalSubmission({
      publicationId:'publication',definitionDigest:'a'.repeat(64),answers,
    })
    expect(canonical.bytes).toBeGreaterThan(1024*1024)
    expect(()=>assertCanonicalSubmissionPayloadSize(canonical,1024*1024)).toThrow()
    await expect(freeze()).rejects.toMatchObject({statusCode:409,message:expect.stringContaining('900 KB')})
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled()
    expect(mocks.tx.surveyWave.updateMany).not.toHaveBeenCalled()
  })
  it.each([
    {count:2,questions:1,maxLength:4000,checkpoint:true},
    {count:2,questions:1,maxLength:6000,checkpoint:false},
    {count:2,questions:7,maxLength:10000,checkpoint:false},
  ])('keeps a publishable FORM wave within its enabled budgets: %j',async config=>{
    setup(config.count,config.questions,config.maxLength,config.checkpoint)
    await expect(freeze()).resolves.toMatchObject({runtimeReady:true})
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(mocks.tx.surveyWave.updateMany).toHaveBeenCalledTimes(1)
    const snapshot=JSON.parse(mocks.tx.$executeRaw.mock.calls[0][5])
    expect(snapshot.units).toHaveLength(config.count)
    expect(snapshot.checkpointPolicy?.enabled??false).toBe(config.checkpoint)
  })
})
