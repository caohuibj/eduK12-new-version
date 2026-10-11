import { afterEach,describe,expect,it,vi } from 'vitest'
import type { NextFunction,Request,Response } from 'express'
import { projectPublicSurveyImage } from '../../modules/survey/task.public'
import { platformSurveyOriginGuard,surveyOriginGuard } from '../../modules/survey/originGuard'

const beforeNodeEnv=process.env.NODE_ENV
afterEach(()=>{process.env.NODE_ENV=beforeNodeEnv})
const request=(origin:string|null)=>({
  method:'POST',
  get:(header:string)=>header.toLowerCase()==='origin'?origin:undefined,
}) as unknown as Request
const response=()=>{
  const res={status:vi.fn(),json:vi.fn()}
  res.status.mockReturnValue(res)
  return res as unknown as Response&{status:ReturnType<typeof vi.fn>;json:ReturnType<typeof vi.fn>}
}

describe('Survey cross-product origin and public projection regression',()=>{
  it('never exposes Researcher copyright proof to anonymous task readers',()=>{
    const image={asset:{
      assetId:'a8d5f8ce-4c34-4be0-96d6-9a3100030303',
      contentHash:'a'.repeat(64),mimeType:'image/png' as const,
    },altText:'课堂示意图',caption:'合作学习',
      rightsStatus:'authorized' as const,
      rightsNote:'内部授权联系人信息与合同编号，禁止公开',
    }
    const projected=projectPublicSurveyImage(image)
    expect(projected).toEqual({
      asset:image.asset,altText:image.altText,caption:image.caption,
    })
    expect(JSON.stringify(projected)).not.toContain('rightsNote')
    expect(projectPublicSurveyImage(undefined)).toBeUndefined()
  })
  it('allows legacy Training admin management while rejecting cross-product Survey writes',()=>{
    process.env.NODE_ENV='production'
    const accepted=vi.fn()
    const admin=response()
    platformSurveyOriginGuard(request('https://training.eduk12.top'),admin,accepted as NextFunction)
    expect(accepted).toHaveBeenCalledTimes(1)
    expect(admin.status).not.toHaveBeenCalled()
    const wrong=response()
    const denied=vi.fn()
    platformSurveyOriginGuard(request('https://survey.eduk12.top'),wrong,denied as NextFunction)
    expect(wrong.status).toHaveBeenCalledWith(403)
    expect(denied).not.toHaveBeenCalled()
    const research=response()
    surveyOriginGuard(request('https://training.eduk12.top'),research,vi.fn())
    expect(research.status).toHaveBeenCalledWith(403)
    const originless=response()
    platformSurveyOriginGuard(request(null),originless,vi.fn())
    expect(originless.status).toHaveBeenCalledWith(403)
  })
})
