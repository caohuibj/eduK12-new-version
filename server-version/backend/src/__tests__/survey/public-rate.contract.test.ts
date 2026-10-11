import { describe,expect,it } from 'vitest'
import { surveyPublicRateLimits } from '../../modules/survey/public-rate.config'

describe('Survey simple school-NAT limiter configuration',()=>{
  it('defaults to one 5000-request shared-IP budget per 900 seconds',()=>{
    expect(surveyPublicRateLimits({})).toEqual({limit:5000,windowSeconds:900})
  })
  it('accepts explicit positive, bounded overrides independently',()=>{
    expect(surveyPublicRateLimits({
      SURVEY_PUBLIC_IP_LIMIT:'7200',SURVEY_PUBLIC_WINDOW_SECONDS:'600',
    })).toEqual({limit:7200,windowSeconds:600})
  })
  it('fails fast for zero, negative, fractional, unbounded or nonsensical values',()=>{
    for(const bad of ['0','-1','1.5','NaN','100001','Infinity']){
      expect(()=>surveyPublicRateLimits({SURVEY_PUBLIC_IP_LIMIT:bad})).toThrow()
    }
    for(const bad of ['0','-10','3601','1.5','not-a-number']){
      expect(()=>surveyPublicRateLimits({SURVEY_PUBLIC_WINDOW_SECONDS:bad})).toThrow()
    }
  })
})
