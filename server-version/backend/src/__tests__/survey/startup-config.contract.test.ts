import { describe,expect,it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateSurveyStartupConfig } from '../../modules/survey/startup.config'

describe('Survey production enablement configuration',()=>{
  const production={NODE_ENV:'production'}
  it('stays disabled by default and never requires a key until Survey is enabled',()=>{
    expect(()=>validateSurveyStartupConfig(production)).not.toThrow()
    expect(()=>validateSurveyStartupConfig({NODE_ENV:'test',SURVEY_WORKSPACE_ENABLED:'true'})).not.toThrow()
  })
  it('refuses publication or analytics without workspace',()=>{
    expect(()=>validateSurveyStartupConfig({...production,SURVEY_PUBLICATION_ENABLED:'true'})).toThrow(/WORKSPACE/)
    expect(()=>validateSurveyStartupConfig({...production,SURVEY_ANALYTICS_ENABLED:'true'})).toThrow(/WORKSPACE/)
  })
  it('refuses enabled workspace without valid distinct-format encryption key',()=>{
    expect(()=>validateSurveyStartupConfig({...production,SURVEY_WORKSPACE_ENABLED:'true'})).toThrow(/MFA/)
    expect(()=>validateSurveyStartupConfig({...production,SURVEY_WORKSPACE_ENABLED:'true',
      SURVEY_MFA_ENCRYPTION_KEY:'short'})).toThrow(/MFA/)
    expect(()=>validateSurveyStartupConfig({...production,SURVEY_WORKSPACE_ENABLED:'true',
      SURVEY_PUBLICATION_ENABLED:'true',SURVEY_ANALYTICS_ENABLED:'true',
      SURVEY_MFA_ENCRYPTION_KEY:'ab'.repeat(32)})).not.toThrow()
  })
  it('explicitly forwards all flags and dedicated MFA secret in production Compose',()=>{
    const compose=readFileSync(resolve(process.cwd(),'../docker-compose.yml'),'utf8')
    for(const key of ['SURVEY_WORKSPACE_ENABLED','SURVEY_PUBLICATION_ENABLED',
      'SURVEY_ANALYTICS_ENABLED','SURVEY_MFA_ENCRYPTION_KEY']){
      expect(compose).toContain(key+': ${'+key)
    }
  })
})
