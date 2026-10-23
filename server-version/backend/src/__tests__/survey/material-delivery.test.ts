import {beforeEach,describe,it,expect,vi} from 'vitest'
import type {Response} from 'express'
const mocks=vi.hoisted(()=>({find:vi.fn(),serve:vi.fn(),signed:vi.fn(),stream:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{storedAsset:{findUnique:mocks.find}}}))
vi.mock('../../services/assetStorage',()=>({serveStoredAssetContent:mocks.serve}))
vi.mock('../../utils/cos',()=>({getCOSSignedUrl:mocks.signed}))
vi.mock('../../utils/streamResponse',()=>({streamResponse:mocks.stream}))
vi.mock('../../modules/survey/media.references',()=>({SurveyMediaError:class extends Error{constructor(readonly statusCode:number,message:string){super(message)}}}))
import {serveSurveyMaterial} from '../../modules/survey/material.delivery'
const ref={assetId:'198e278f-f993-44fa-9eaa-223693fa4db3',contentHash:'a'.repeat(64),mimeType:'video/mp4' as const}
const asset={id:ref.assetId,sha256:ref.contentHash,mimeType:ref.mimeType,sizeBytes:100,provider:'local',objectKey:'synthetic/video',deletedAt:null}
beforeEach(()=>vi.resetAllMocks())
describe('Survey frozen material byte delivery',()=>{
  it('rejects changed identity, oversized files, deletion and unsupported providers',async()=>{
    const res={setHeader:vi.fn()} as unknown as Response
    for(const patch of [{sha256:'b'.repeat(64)},{mimeType:'text/html'},{sizeBytes:51*1024*1024},{deletedAt:new Date()},{provider:'external'}]){
      mocks.find.mockResolvedValue({...asset,...patch});await expect(serveSurveyMaterial(ref,res)).rejects.toMatchObject({statusCode:404})
    }
    expect(mocks.serve).not.toHaveBeenCalled()
  })
  it('streams local bytes only after frozen identity checks and marks the response private',async()=>{
    mocks.find.mockResolvedValue(asset);const res={setHeader:vi.fn()} as unknown as Response
    await serveSurveyMaterial(ref,res);expect(mocks.serve).toHaveBeenCalledWith(asset,res)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store, max-age=0')
  })
  it('proxies COS server-side with a timeout and never redirects a participant credential to storage',async()=>{
    mocks.find.mockResolvedValue({...asset,provider:'cos'});mocks.signed.mockResolvedValue('https://trusted-cos.example/signed')
    const fetcher=vi.fn().mockResolvedValue(new globalThis.Response('video'));vi.stubGlobal('fetch',fetcher)
    const res={setHeader:vi.fn(),redirect:vi.fn()} as unknown as Response
    try{await serveSurveyMaterial(ref,res);expect(fetcher).toHaveBeenCalledWith('https://trusted-cos.example/signed',expect.objectContaining({redirect:'error',signal:expect.any(AbortSignal)}));expect(res.redirect).not.toHaveBeenCalled();expect(mocks.stream).toHaveBeenCalled()}finally{vi.unstubAllGlobals()}
  })
})
