import { describe, expect, it } from 'vitest'
import { productOrigins, surveyAdminLoginUrl, surveyInvitationUrl, surveyRecruitmentUrl } from './origins'
import { surveyGovernanceNavigation } from '../components/app-shell/navigation'

describe('trusted product origin links', () => {
  it.each(['https://survey.eduk12.top','https://training.eduk12.top','http://TRAINING.EDUK12.TOP.:8080'])(
    'uses canonical HTTPS production origins for %s', origin => {
      expect(productOrigins(origin, false)).toEqual({admin:'https://training.eduk12.top',survey:'https://survey.eduk12.top'})
      expect(surveyAdminLoginUrl(origin, false)).toBe('https://training.eduk12.top/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers')
    })
  it.each(['localhost','127.0.0.1','survey.localhost','training.localhost'])(
    'preserves local protocol and port with an allowed admin cookie host: %s', host => {
      for (const scheme of ['http','https']) {
        const origin=`${scheme}://${host}:5173`
        const admin=`${scheme}://${host==='127.0.0.1'?host:'localhost'}:5173`
        expect(productOrigins(origin,true)).toEqual({admin,survey:`${scheme}://survey.localhost:5173`})
        expect(surveyAdminLoginUrl(origin,true)).toBe(admin+'/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers')
        expect(productOrigins(origin,false)).toBeNull()
      }
    })
  it.each(['','/','//training.eduk12.top','javascript:alert(1)','file:///tmp','https://training.eduk12.top.evil.test',
    'https://eviltraining.eduk12.top','http://evil.localhost:5173','http://evillocalhost','http://[::1]:5173',
    'https://evil.test@training.eduk12.top','https://training.eduk12.top/path','https://training.eduk12.top?token=x',
    'https://training.eduk12.top#token=x'])(
    'fails closed for %s', origin => {
      expect(productOrigins(origin,true)).toBeNull()
      expect(surveyAdminLoginUrl(origin,true)).toBeNull()
      expect(surveyInvitationUrl('claim','synthetic-token',origin,true)).toBeNull()
      expect(surveyRecruitmentUrl('https://survey.eduk12.top/r/public-id#entry=synthetic-token',origin,true)).toBeNull()
    })
  it.each(['claim','reset-password'] as const)('keeps %s capabilities only in the matching origin fragment', kind => {
    const local=surveyInvitationUrl(kind,'synthetic&?#/token','http://localhost:5173',true)!
    const url=new URL(local)
    expect(url.origin).toBe('http://survey.localhost:5173')
    expect(url.pathname).toBe('/'+kind);expect(url.search).toBe('')
    expect(new URLSearchParams(url.hash.slice(1)).get('token')).toBe('synthetic&?#/token')
    expect(surveyInvitationUrl(kind,'synthetic-token','https://training.eduk12.top',false)).toBe(`https://survey.eduk12.top/${kind}#token=synthetic-token`)
  })
  it('maps only the exact server recruitment URL contract to the local environment', () => {
    const source='https://survey.eduk12.top/r/0fc1aafe-fb69-4c89-a33a-c9092388fd20#entry=synthetic_token-1'
    expect(surveyRecruitmentUrl(source,'http://survey.localhost:5173',true)).toBe(source.replace('https://survey.eduk12.top','http://survey.localhost:5173'))
    expect(surveyRecruitmentUrl(source,'https://survey.eduk12.top',false)).toBe(source)
  })
  it.each(['https://evil.test/r/id#entry=x','http://survey.eduk12.top/r/id#entry=x','https://survey.eduk12.top:123/r/id#entry=x',
    'https://user@survey.eduk12.top/r/id#entry=x','https://survey.eduk12.top/r/id?x=1#entry=x',
    'https://survey.eduk12.top/r/%2f%2fevil#entry=x','https://survey.eduk12.top/r/id#entry=x&next=y',
    'https://survey.eduk12.top/r/id#entry=','https://survey.eduk12.top/r/id#entry=%3Cscript%3E',
    'javascript:alert(1)','/r/id#entry=x'])(
    'rejects malformed or untrusted recruitment URL %s', source => {
      expect(surveyRecruitmentUrl(source,'http://survey.localhost:5173',true)).toBeNull()
    })
  it.each(['https://training.eduk12.top','http://localhost:5173','http://127.0.0.1:5173','http://training.localhost:5173','https://unknown.test'])(
    'requires an independent entry grant for navigation at %s', origin => {
      for(const role of ['ADMIN','TEACHER','STUDENT','PARENT',undefined] as const)
        for(const platformRole of ['SYSTEM_ADMIN','STANDARD',null,undefined])
          expect(surveyGovernanceNavigation(Boolean(productOrigins(origin,true)),role,platformRole,[{entry:'SURVEY'}]).length)
            .toBe(origin!=='https://unknown.test'?1:0)
    })
})
