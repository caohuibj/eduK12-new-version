import {beforeEach,describe,expect,it,vi} from 'vitest'
const h=vi.hoisted(()=>({authorize:vi.fn(),serve:vi.fn()}))
vi.mock('../../modules/survey/situational-native.service',async original=>({...await original<object>(),authorizeSurveySituationalImage:h.authorize}))
vi.mock('../../modules/situational/situational-asset.service',async original=>({...await original<object>(),serveFrozenSituationalAsset:h.serve}))
import {surveySituationalRouter} from '../../modules/survey/situational-native.public.routes'
import {SurveySituationalError} from '../../modules/survey/situational-native.service'
const ids={publicId:'11111111-1111-4111-8111-111111111111',attemptId:'22222222-2222-4222-8222-222222222222',
  childId:'33333333-3333-4333-8333-333333333333',assetId:'44444444-4444-4444-8444-444444444444',slotKey:'image'}
const handler=surveySituationalRouter.stack.find(layer=>layer.route?.path==='/:slotKey/:childId/images/:assetId')!.route.stack[0].handle
function response(){const res={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res);return res}
beforeEach(()=>vi.resetAllMocks())
describe('Survey native image route binary contract, not a DB authority mock proof',()=>{
  it('uses host proof and fixed child membership before shared no-store byte delivery',async()=>{
    const snapshot={synthetic:'server frozen snapshot'},res=response(),next=vi.fn(),accessCredential='x'.repeat(43)
    h.authorize.mockResolvedValue(snapshot)
    await handler({params:ids,body:{accessCredential}} as never,res as never,next)
    expect(h.authorize).toHaveBeenCalledWith({publicId:ids.publicId,attemptId:ids.attemptId,accessCredential,researchCode:undefined},'image',ids.childId,ids.assetId)
    expect(h.serve).toHaveBeenCalledWith({snapshot,assetId:ids.assetId,res})
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store, max-age=0')
    expect(next).not.toHaveBeenCalled()
  })
  it('returns authority refusal without invoking delivery or reflecting the secret',async()=>{
    const res=response(),next=vi.fn(),accessCredential='y'.repeat(43)
    h.authorize.mockRejectedValue(new SurveySituationalError(403,'图片不可访问'))
    await handler({params:ids,body:{accessCredential}} as never,res as never,next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(h.serve).not.toHaveBeenCalled()
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(accessCredential)
    expect(next).not.toHaveBeenCalled()
  })
})
