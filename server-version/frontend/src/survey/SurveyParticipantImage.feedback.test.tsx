import { render,screen,waitFor } from '@testing-library/react'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { SurveyParticipantImage } from './SurveyParticipantImage'
afterEach(()=>vi.unstubAllGlobals())
describe('Survey frozen feedback image access',()=>{
 it('posts private proof to dedicated report route, never a URL credential, and revokes bytes',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(new Blob(['image']),{headers:{'Content-Type':'image/png'}}))
  vi.stubGlobal('fetch',fetcher)
  const create=vi.fn(()=> 'blob:feedback'),revoke=vi.fn()
  vi.stubGlobal('URL',Object.assign(class extends URL {},{createObjectURL:create,revokeObjectURL:revoke}))
  const {unmount}=render(<SurveyParticipantImage purpose="report" image={{asset:{assetId:'asset',contentHash:'a'.repeat(64),mimeType:'image/png'},altText:'区间反馈图',caption:'研究图示'}} proof={{publicId:'public',attemptId:'attempt',accessCredential:'secret',researchCode:'CODE'}}/>)
  expect(await screen.findByAltText('区间反馈图')).toHaveAttribute('src','blob:feedback')
  expect(fetcher.mock.calls[0][0]).toBe('/api/public/survey/r/public/attempts/attempt/report-images/asset')
  expect(fetcher.mock.calls[0][1]).toMatchObject({method:'POST',credentials:'omit',cache:'no-store',body:JSON.stringify({accessCredential:'secret',researchCode:'CODE'})})
  unmount();expect(revoke).toHaveBeenCalledWith('blob:feedback')
 })
 it('does not render unauthorized report image bytes',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:403})))
  render(<SurveyParticipantImage purpose="report" image={{asset:{assetId:'asset',contentHash:'a'.repeat(64),mimeType:'image/png'},altText:'反馈'}} proof={{publicId:'public',attemptId:'attempt',accessCredential:'secret'}}/>)
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('无读取权限'))
  expect(screen.queryByRole('img')).toBeNull()
 })
})
