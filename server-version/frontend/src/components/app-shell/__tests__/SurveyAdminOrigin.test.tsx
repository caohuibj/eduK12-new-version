import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SurveyAdminOrigin from '../SurveyAdminOrigin'

function location(origin:string,search='') {
  const replace=vi.fn(), original=window
  vi.stubGlobal('window',new Proxy(original,{get(target,key){return key==='location'?{origin,search,replace}:Reflect.get(target,key)}}))
  return replace
}
afterEach(() => vi.unstubAllGlobals())
describe('Survey administration canonical origin boundary', () => {
  it.each(['auto','light','dark'])('carries only the validated %s appearance alongside the fixed admin target', mode => {
    const replace=location('http://survey.localhost:5173','?returnTo=%2Fadmin%2Fsurvey-researchers&appearance='+mode+'&password=do-not-copy&token=do-not-copy')
    render(<SurveyAdminOrigin login><div>credentials</div></SurveyAdminOrigin>)
    expect(replace).toHaveBeenCalledExactlyOnceWith('http://localhost:5173/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers&appearance='+mode)
    expect(screen.queryByText('credentials')).not.toBeInTheDocument()
  })
  it('drops an invalid appearance hint during canonicalization', () => {
    const replace=location('http://survey.localhost:5173','?returnTo=%2Fadmin%2Fsurvey-researchers&appearance=unknown')
    render(<SurveyAdminOrigin login><div>credentials</div></SurveyAdminOrigin>)
    expect(replace).toHaveBeenCalledExactlyOnceWith('http://localhost:5173/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers')
  })
  it.each([false,true])('does not mount credentials or APIs on training.localhost (login=%s)', login => {
    const replace=location('http://training.localhost:5173','?returnTo=%2Fadmin%2Fsurvey-researchers&password=do-not-copy&token=do-not-copy')
    const child=vi.fn(()=><div>protected child</div>)
    const Child=child
    render(<SurveyAdminOrigin login={login}><Child/></SurveyAdminOrigin>)
    expect(child).not.toHaveBeenCalled()
    expect(screen.queryByText('protected child')).not.toBeInTheDocument()
    expect(replace).toHaveBeenCalledExactlyOnceWith(login?'http://localhost:5173/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers':'http://localhost:5173/admin/survey-researchers')
  })
  it.each(['?returnTo=https://evil.test','?returnTo=%2F%2Fevil.test','?returnTo=%2F%5Cevil.test','?returnTo=%2Fadmin%2Flogin','?returnTo=%2Fadmin%2Fsurvey-researchers%3Ftoken%3Dsecret',''])(
    'drops unsafe or unrecognized return parameters %s', search => {
      const replace=location('http://training.localhost:5173',search)
      render(<SurveyAdminOrigin login><div>credentials</div></SurveyAdminOrigin>)
      expect(replace).toHaveBeenCalledExactlyOnceWith('http://localhost:5173/admin/login?returnTo=%2Fusers')
    })
  it.each(['http://localhost:5173','http://127.0.0.1:5173','https://training.eduk12.top'])(
    'mounts once without a navigation loop at %s', origin => {
      const replace=location(origin)
      render(<SurveyAdminOrigin><div>protected child</div></SurveyAdminOrigin>)
      expect(screen.getByText('protected child')).toBeInTheDocument()
      expect(replace).not.toHaveBeenCalled()
    })
  it('does not mount or navigate from an unknown origin',()=>{
    const replace=location('https://unknown.test')
    render(<SurveyAdminOrigin><div>protected child</div></SurveyAdminOrigin>)
    expect(screen.getByRole('alert')).toHaveTextContent('当前地址不支持')
    expect(screen.queryByText('protected child')).not.toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })
})
