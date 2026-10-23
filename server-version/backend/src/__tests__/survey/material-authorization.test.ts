import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({snapshot:vi.fn(),attempt:vi.fn(),report:vi.fn(),pin:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{assetReference:{findFirst:mocks.pin}}}))
vi.mock('../../modules/survey/public-scale-media',()=>({authorizedSurveyMediaSnapshot:mocks.snapshot}))
vi.mock('../../modules/survey/admission.service',()=>({verifiedSurveyAttempt:mocks.attempt}))
vi.mock('../../modules/survey/final.service',()=>({readGeneralForOwnAttempt:mocks.report}))
vi.mock('../../modules/survey/media.references',()=>({SurveyMediaError:class extends Error{constructor(readonly statusCode:number,message:string){super(message)}}}))
import {authorizeSurveyMaterial} from '../../modules/survey/material.authorization'
const item={asset:{assetId:'198e278f-f993-44fa-9eaa-223693fa4db3',contentHash:'a'.repeat(64),mimeType:'video/mp4' as const},name:'合成视频',rightsStatus:'authorized',rightsNote:'合成授权'}
const proof={publicId:'study',attemptId:'attempt',accessCredential:'private-secret'}
beforeEach(()=>{vi.resetAllMocks();mocks.snapshot.mockResolvedValue({own:{publicationId:'frozen-publication'},selected:{units:[{displayDefinition:{materials:[item],rawScoreFeedback:{private:true}}}]}});mocks.pin.mockResolvedValue({id:'pin'});mocks.report.mockResolvedValue({measurements:[]});mocks.attempt.mockResolvedValue({publicationId:'frozen-publication'})})
describe('Survey material participant boundaries',()=>{
  it('uses the assigned frozen snapshot and requires a matching publication retention pin',async()=>{
    expect(await authorizeSurveyMaterial(proof,item.asset.assetId,'materials')).toEqual(item.asset)
    expect(mocks.snapshot).toHaveBeenCalledWith(proof)
    expect(mocks.pin).toHaveBeenCalledWith({where:{assetId:item.asset.assetId,entityType:'SurveyResearchPublication',entityId:'frozen-publication',field:'media'},select:{id:true}})
    mocks.pin.mockResolvedValue(null);await expect(authorizeSurveyMaterial(proof,item.asset.assetId,'materials')).rejects.toMatchObject({statusCode:404})
  })
  it('does not expose an unassigned asset or a report attachment through the stimulus path',async()=>{
    await expect(authorizeSurveyMaterial(proof,'unassigned','materials')).rejects.toMatchObject({statusCode:404})
    mocks.snapshot.mockResolvedValue({own:{publicationId:'pub'},selected:{units:[{displayDefinition:{rawScoreFeedback:{rules:[{materials:[item]}]}}}]}})
    await expect(authorizeSurveyMaterial(proof,item.asset.assetId,'materials')).rejects.toMatchObject({statusCode:404})
  })
  it('allows report media only from actually disclosed saved feedback, preserving the report release gate',async()=>{
    await expect(authorizeSurveyMaterial(proof,item.asset.assetId,'report-materials')).rejects.toMatchObject({statusCode:404})
    mocks.report.mockResolvedValue({measurements:[{rawScoreFeedback:[{materials:[item]}]}]})
    expect(await authorizeSurveyMaterial(proof,item.asset.assetId,'report-materials')).toEqual(item.asset)
    expect(mocks.report).toHaveBeenCalledWith(proof);expect(mocks.snapshot).not.toHaveBeenCalled()
    mocks.pin.mockResolvedValue(null)
    await expect(authorizeSurveyMaterial(proof,item.asset.assetId,'report-materials')).rejects.toMatchObject({statusCode:404})
    mocks.report.mockRejectedValue(new Error('withdrawn'))
    await expect(authorizeSurveyMaterial(proof,item.asset.assetId,'report-materials')).rejects.toThrow('withdrawn')
  })
  it('propagates invalid or revoked attempt proof without returning any identity',async()=>{
    mocks.snapshot.mockRejectedValue(new Error('invalid proof'))
    await expect(authorizeSurveyMaterial(proof,item.asset.assetId,'materials')).rejects.toThrow('invalid proof')
    expect(mocks.pin).not.toHaveBeenCalled()
  })
})
