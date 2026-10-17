import { beforeEach,afterEach,describe,expect,it,vi } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { freezeGroupIpPolicy,GROUP_IP_MAX_WINDOW_MS } from '../../modules/survey/group-ip-policy'

const mocks=vi.hoisted(()=>({tx:{
  $queryRaw:vi.fn(),
  surveyWave:{findUniqueOrThrow:vi.fn(),updateMany:vi.fn()},
  surveyPublication:{findFirst:vi.fn()},
  surveyProject:{update:vi.fn()},
  surveyEntryToken:{create:vi.fn(),updateMany:vi.fn()},
  surveyEvent:{create:vi.fn()},
  surveyAttemptCheckpoint:{deleteMany:vi.fn()},
},transaction:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/survey/publication.service',()=>({freezeResearchWaveDraft:vi.fn()}))
vi.mock('../../modules/survey/waves.service',()=>({
  MAX_WAVE_FINISH_GRACE_MS:2*3600000,
  SurveyWaveError:class extends Error{constructor(readonly statusCode:number,message:string){super(message)}},
}))
import { openWave,transitionWave,updateWaveEntryToken } from '../../modules/survey/waves.publish'

const now=new Date('2026-10-17T02:00:00.000Z')
const draft={schemaVersion:1 as const,timeZone:'Asia/Shanghai'}
const policy=freezeGroupIpPolicy(draft,now)!
const close=new Date(now.getTime()+GROUP_IP_MAX_WINDOW_MS)
const makeWave=()=>({id:'wave',projectId:'project',status:'DRAFT',revision:3,publicationId:'publication',
  groupIpPolicy:policy as unknown,groupIpActivatedAt:null as Date|null,
  opensAt:null as Date|null,closesAt:null as Date|null,finishUntil:null as Date|null,hardStopAt:null as Date|null})
let wave=makeWave()
const setPublication=(groupIpPolicy:unknown=policy)=>{
  const compiledSnapshot={schemaVersion:1,purpose:'RESEARCH_ONLY',runtimeStatus:'SURVEY_FINAL_V1',
    projectId:'project',waveId:'wave',units:[{instrumentKey:'test'}],
    ...(groupIpPolicy?{groupIpPolicy}:{})}
  mocks.tx.surveyPublication.findFirst.mockResolvedValue({compiledSnapshot,definitionDigest:canonicalHash(compiledSnapshot)})
}
const activated=()=>{Object.assign(wave,{status:'OPEN',groupIpActivatedAt:now,opensAt:now,closesAt:close,finishUntil:close})}
beforeEach(()=>{
  vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true')
  wave=makeWave()
  mocks.transaction.mockImplementation((fn:(tx:typeof mocks.tx)=>Promise<unknown>)=>fn(mocks.tx))
  mocks.tx.$queryRaw.mockResolvedValue([{id:'project',status:'ACTIVE',publicId:'public-id'}])
  mocks.tx.surveyWave.findUniqueOrThrow.mockImplementation(async()=>wave)
  mocks.tx.surveyWave.updateMany.mockResolvedValue({count:1})
  setPublication()
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()})

describe('Survey group IP open and lifecycle persistence contracts (mocked transaction)',()=>{
  it('sets activation only at open and uses the same exact 48h close for entry expiry and finish',async()=>{
    const result=await openWave('owner','project','wave',3)
    expect(mocks.tx.surveyWave.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
      status:'OPEN',groupIpActivatedAt:now,opensAt:now,closesAt:close,finishUntil:close,
    })}))
    expect(mocks.tx.surveyEntryToken.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({expiresAt:close})}))
    expect(result.expiresAt).toEqual(close)
  })
  it('keeps ordinary default 30-day collection, two-hour finishing grace and scheduled opening',async()=>{
    wave.groupIpPolicy=null;setPublication(null)
    wave.opensAt=new Date(now.getTime()+3600000)
    await openWave('owner','project','wave',3)
    const data=mocks.tx.surveyWave.updateMany.mock.calls[0][0].data
    expect(data.opensAt).toEqual(wave.opensAt)
    expect(data.closesAt).toEqual(new Date(now.getTime()+30*86400000))
    expect(data.finishUntil).toEqual(new Date(now.getTime()+30*86400000+2*3600000))
    expect(data).not.toHaveProperty('groupIpActivatedAt')
  })
  it.each(['old-day','future-open','too-long','grace','already-activated'])(
    'rejects unusable group opening before issuing tokens: %s',async kind=>{
      if(kind==='old-day'){wave.groupIpPolicy=freezeGroupIpPolicy(draft,new Date('2026-10-16T02:00:00Z'));setPublication(wave.groupIpPolicy)}
      if(kind==='future-open')wave.opensAt=new Date(now.getTime()+1)
      if(kind==='too-long')wave.closesAt=new Date(close.getTime()+1)
      if(kind==='grace'){wave.closesAt=close;wave.finishUntil=new Date(close.getTime()+1)}
      if(kind==='already-activated')wave.groupIpActivatedAt=now
      await expect(openWave('owner','project','wave',3)).rejects.toThrow()
      expect(mocks.tx.surveyEntryToken.create).not.toHaveBeenCalled()
      expect(mocks.tx.surveyWave.updateMany).not.toHaveBeenCalled()
    })
  it('rejects a wave policy absent from or different to its immutable publication',async()=>{
    setPublication(null)
    await expect(openWave('owner','project','wave',3)).rejects.toThrow(/冻结发布定义不一致/)
    expect(mocks.tx.surveyEntryToken.create).not.toHaveBeenCalled()
  })
  it('cannot revive an expired group wave on resume or rotate a fresh entry token',async()=>{
    activated();wave.status='PAUSED';vi.setSystemTime(close)
    await expect(transitionWave('owner','project','wave',3,'RESUME')).rejects.toThrow(/不能恢复或延长/)
    await expect(updateWaveEntryToken({actorUserId:'owner',projectId:'project',waveId:'wave',revision:3,action:'ROTATE'})).rejects.toThrow(/不能恢复或延长/)
    expect(mocks.tx.surveyWave.updateMany).not.toHaveBeenCalled()
    expect(mocks.tx.surveyEntryToken.create).not.toHaveBeenCalled()
  })
  it('leaves activation and all deadlines unchanged on pause, resume and token rotation',async()=>{
    activated()
    await transitionWave('owner','project','wave',3,'PAUSE')
    wave.status='PAUSED'
    await transitionWave('owner','project','wave',3,'RESUME')
    await updateWaveEntryToken({actorUserId:'owner',projectId:'project',waveId:'wave',revision:3,action:'ROTATE'})
    for(const [call] of mocks.tx.surveyWave.updateMany.mock.calls){
      for(const key of ['groupIpPolicy','groupIpActivatedAt','opensAt','closesAt','finishUntil'])expect(call.data).not.toHaveProperty(key)
    }
    expect(mocks.tx.surveyEntryToken.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({expiresAt:close})}))
  })
  it('closes a group immediately and hard-stops after expiry without extending its persisted finish',async()=>{
    activated();const beforeClose=new Date(now.getTime()+3600000);vi.setSystemTime(beforeClose)
    await transitionWave('owner','project','wave',3,'CLOSE')
    expect(mocks.tx.surveyWave.updateMany.mock.calls[0][0].data.finishUntil).toEqual(beforeClose)
    vi.setSystemTime(new Date(close.getTime()+3600000))
    await transitionWave('owner','project','wave',3,'HARD_STOP')
    expect(mocks.tx.surveyWave.updateMany.mock.calls[1][0].data.finishUntil).toEqual(close)
    expect(mocks.tx.surveyWave.updateMany.mock.calls[1][0].data.hardStopAt).toEqual(new Date(close.getTime()+3600000))
  })
  it('keeps ordinary close grace and existing ordinary resume behavior unchanged',async()=>{
    activated();wave.groupIpPolicy=null;wave.groupIpActivatedAt=null;setPublication(null)
    await transitionWave('owner','project','wave',3,'CLOSE')
    expect(mocks.tx.surveyWave.updateMany.mock.calls[0][0].data.finishUntil).toEqual(new Date(now.getTime()+2*3600000))
    wave.status='PAUSED';vi.setSystemTime(new Date(close.getTime()+1))
    await expect(transitionWave('owner','project','wave',3,'RESUME')).resolves.toMatchObject({status:'OPEN'})
  })
})
