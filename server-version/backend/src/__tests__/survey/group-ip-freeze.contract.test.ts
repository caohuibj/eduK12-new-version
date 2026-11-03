import { beforeEach,afterEach,describe,expect,it,vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const mocks=vi.hoisted(()=>({tx:{
  $queryRaw:vi.fn(),$executeRaw:vi.fn(),
  surveyWave:{findUniqueOrThrow:vi.fn(),updateMany:vi.fn()},
  surveyInstrumentDraft:{findMany:vi.fn()},
  surveyPublication:{aggregate:vi.fn(),create:vi.fn()},
  surveyProject:{findUniqueOrThrow:vi.fn(),update:vi.fn()},
  surveyEvent:{create:vi.fn()},
},transaction:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/survey/media.references',()=>({retainSurveyMedia:vi.fn()}))
vi.mock('../../modules/survey/catalog.service',()=>({catalogSnapshotsForDrafts:vi.fn(async()=>new Map()),compileCatalogUnit:vi.fn()}))
vi.mock('../../modules/survey/waves.service',()=>({
  SurveyWaveError:class extends Error{constructor(readonly statusCode:number,message:string){super(message)}},
}))
import { freezeResearchWaveDraft } from '../../modules/survey/publication.service'

const now=new Date('2026-10-16T16:00:00.000Z')
const draftPolicy={schemaVersion:1 as const,timeZone:'Asia/Shanghai'}
const makeWave=()=>({id:'wave',projectId:'project',status:'DRAFT',revision:3,publicationId:null,
  consentText:'This synthetic consent is long enough for the publication contract.',consentVersion:1,
  linkageNoticeConfirmed:false,instrumentIds:['draft'],flowDefinition:null,quotaPolicy:null,checkpointPolicy:null,
  groupIpPolicy:draftPolicy as unknown,groupIpActivatedAt:null as Date|null,
  opensAt:null as Date|null,closesAt:null as Date|null,finishUntil:null as Date|null})
let wave=makeWave()
// Publication persistence binds the serialized snapshot directly to JSONB.
const writtenPublication=()=>{
  expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1)
  const [strings,id,projectId,version,definitionDigest,serial,consentVersion,createdAt]=mocks.tx.$executeRaw.mock.calls[0]
  expect(strings.join('?').replace(/\s+/g,' ').trim()).toBe(
    'INSERT INTO survey_publications (id,project_id,version,definition_digest,compiled_snapshot,consent_version,purpose,created_at) VALUES (?,?,?,?,?::jsonb, ?,\'RESEARCH_ONLY\',?)')
  expect({projectId,version,consentVersion}).toEqual({projectId:'project',version:1,consentVersion:1})
  expect(typeof serial).toBe('string')
  expect(mocks.tx.surveyPublication.create).not.toHaveBeenCalled()
  return {id,definitionDigest,compiledSnapshot:JSON.parse(serial),createdAt}
}
const freeze=()=>freezeResearchWaveDraft({actorUserId:'owner',projectId:'project',waveId:'wave',revision:3})
beforeEach(()=>{
  vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(now);wave=makeWave()
  mocks.transaction.mockImplementation((fn:(tx:typeof mocks.tx)=>Promise<unknown>)=>fn(mocks.tx))
  mocks.tx.$queryRaw.mockResolvedValue([{id:'project',status:'ACTIVE',collectionMode:'SINGLE_UNLINKED'}])
  mocks.tx.surveyWave.findUniqueOrThrow.mockImplementation(async()=>wave)
  mocks.tx.surveyWave.updateMany.mockResolvedValue({count:1})
  mocks.tx.surveyInstrumentDraft.findMany.mockResolvedValue([{
    id:'draft',instrumentKey:'form',kind:'FORM',title:'Synthetic form',revision:0,catalogGrantId:null,
    definition:{schemaVersion:1,pages:[{pageKey:'page',title:'Page',questions:[{
      itemKey:'q',type:'SINGLE',prompt:'Choose',required:true,rows:[],
      options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],
    }]}]},
  }])
  mocks.tx.surveyPublication.aggregate.mockResolvedValue({_max:{version:null}})
  mocks.tx.surveyProject.findUniqueOrThrow.mockResolvedValue({firstPublishedAt:new Date('2026-10-01T00:00:00Z')})
})
afterEach(()=>vi.useRealTimers())

describe('Survey group IP policy freezing contracts (mocked transaction)',()=>{
  it('freezes the server local day into both immutable snapshot and wave, without activating',async()=>{
    const result=await freeze()
    const publication=writtenPublication()
    const update=mocks.tx.surveyWave.updateMany.mock.calls[0][0].data
    const policy={...draftPolicy,activationDate:'2026-10-17'}
    expect(publication.compiledSnapshot.groupIpPolicy).toEqual(policy)
    expect(publication.createdAt).toEqual(now)
    expect(publication.definitionDigest).toBe(canonicalHash(publication.compiledSnapshot))
    expect(update.groupIpPolicy).toEqual(policy)
    expect(update).not.toHaveProperty('groupIpActivatedAt')
    expect(result).toMatchObject({publicationId:publication.id,digest:publication.definitionDigest})
    expect(update.publicationId).toBe(publication.id)
    const queries=mocks.tx.$queryRaw.mock.calls.map(call=>call[0].join(' '))
    expect(queries[0]).toContain('FOR UPDATE OF p')
    expect(queries[1]).toContain('FOR UPDATE')
  })
  it('keeps ordinary snapshot shape unchanged with the new policy absent',async()=>{
    wave.groupIpPolicy=null
    await freeze()
    const publication=writtenPublication()
    expect(publication.compiledSnapshot).not.toHaveProperty('groupIpPolicy')
    expect(mocks.tx.surveyWave.updateMany.mock.calls[0][0].data).not.toHaveProperty('groupIpActivatedAt')
  })
  it.each(['future-open','other-day-open','too-long','finish-grace','injected-day'])(
    'rejects %s before creating an uneditable publication',async kind=>{
      if(kind==='future-open')wave.opensAt=new Date(now.getTime()+1)
      if(kind==='other-day-open')wave.opensAt=new Date(now.getTime()-1)
      if(kind==='too-long')wave.closesAt=new Date(now.getTime()+48*3600000+1)
      if(kind==='finish-grace'){
        wave.closesAt=new Date(now.getTime()+3600000);wave.finishUntil=new Date(now.getTime()+2*3600000)
      }
      if(kind==='injected-day')wave.groupIpPolicy={...draftPolicy,activationDate:'2026-10-18'}
      await expect(freeze()).rejects.toThrow()
      expect(mocks.tx.surveyPublication.create).not.toHaveBeenCalled()
      expect(mocks.tx.$executeRaw).not.toHaveBeenCalled()
      expect(mocks.tx.surveyWave.updateMany).not.toHaveBeenCalled()
    })
})
