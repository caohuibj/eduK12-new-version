import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({prefetch:vi.fn(),paused:vi.fn(),identity:vi.fn(),collection:vi.fn()}))
vi.mock('../../modules/assessment-governance/tool-entry-policy',async original=>({
  ...await original<typeof import('../../modules/assessment-governance/tool-entry-policy')>(),
  prefetchToolPolicyAdmission:mocks.prefetch,
}))
vi.mock('../../modules/survey/tool-policy',async original=>({
  ...await original<typeof import('../../modules/survey/tool-policy')>(),
  assertSurveyPublicationNotPaused:mocks.paused,
  snapshotPolicyIdentity:mocks.identity,
}))
vi.mock('../../modules/scale-library-governance/collection-guard',()=>({assertScaleLibraryCollectionAllowed:mocks.collection}))
import {assertSurveyScaleCollectionAllowed} from '../../modules/survey/scale-collection-guard'

const unit=(sourceId:string,extra:Record<string,unknown>={})=>({
  kind:'SCALE',draftId:sourceId,sourceDigest:sourceId,sourceProvenance:{
    source:{kind:'SCALE',sourceId,sourceVersion:'v1'},...extra,
  },
})
beforeEach(()=>{
  vi.clearAllMocks()
  mocks.prefetch.mockResolvedValue(undefined)
  mocks.paused.mockResolvedValue(undefined)
  mocks.collection.mockResolvedValue(undefined)
  mocks.identity.mockImplementation(async(_tx:unknown,snapshot:{ref:{sourceId:string;sourceVersion:string}})=> (
    {resourceKey:snapshot.ref.sourceId,fingerprint:snapshot.ref.sourceVersion}
  ))
})

describe('Survey parent collection prefetches SURVEY tool-policy admission',()=>{
  it('batches non-library identities once before publication admission',async()=>{
    const tx={$queryRaw:vi.fn()}
    const order:string[]=[]
    mocks.prefetch.mockImplementation(async()=>{order.push('prefetch')})
    mocks.paused.mockImplementation(async()=>{order.push('paused')})
    await assertSurveyScaleCollectionAllowed(tx as never,{units:[unit('a'),unit('b'),unit('lib',{libraryEntryId:'entry'})]} as never)
    expect(mocks.identity).toHaveBeenCalledTimes(2)
    expect(mocks.prefetch).toHaveBeenCalledExactlyOnceWith(tx,[
      {resourceKey:'a',fingerprint:'v1'},
      {resourceKey:'b',fingerprint:'v1'},
    ],'SURVEY')
    expect(order).toEqual(['prefetch','paused'])
    const known=mocks.paused.mock.calls[0][2] as Map<string,{resourceKey:string;fingerprint:string}>
    expect([...known.keys()].sort()).toEqual(['a','b'])
    expect(known.get('a')).toEqual({resourceKey:'a',fingerprint:'v1'})
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })
  it('still admits a publication with no prefetchable identities',async()=>{
    const tx={}
    await assertSurveyScaleCollectionAllowed(tx as never,{units:[{kind:'SCALE',draftId:'legacy'}]} as never)
    expect(mocks.identity).not.toHaveBeenCalled()
    expect(mocks.prefetch).toHaveBeenCalledExactlyOnceWith(tx,[],'SURVEY')
    expect(mocks.paused).toHaveBeenCalledTimes(1)
  })
})
