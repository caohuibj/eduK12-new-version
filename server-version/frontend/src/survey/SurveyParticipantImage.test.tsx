// @vitest-environment jsdom
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyParticipantImage} from './SurveyParticipantImage'
const image={asset:{assetId:'stimulus',contentHash:'a'.repeat(64),mimeType:'image/png' as const},altText:'Frozen picture'}
const proof={publicId:'study',attemptId:'attempt',accessCredential:'secret'}
afterEach(()=>vi.unstubAllGlobals())
describe('participant image readiness',()=>{
  it('does not mark fetched bytes ready before decode; decode failure can retry without changing answers',async()=>{
    vi.stubGlobal('URL',{createObjectURL:vi.fn().mockReturnValue('blob:stimulus'),revokeObjectURL:vi.fn()})
    const fetcher=vi.fn().mockResolvedValue({ok:true,headers:{get:()=> 'image/png'},blob:async()=>new Blob(['image'])})
    vi.stubGlobal('fetch',fetcher)
    const ready=vi.fn()
    render(<SurveyParticipantImage image={image} proof={proof} onReadyChange={ready}/>)
    const picture=await screen.findByAltText('Frozen picture')
    expect(ready).not.toHaveBeenCalledWith(true)
    fireEvent.error(picture)
    expect(ready).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button',{name:'重试图片'}))
    const retried=await screen.findByAltText('Frozen picture')
    fireEvent.load(retried)
    expect(ready).toHaveBeenLastCalledWith(true)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('reports unavailable on HTTP failure and allows authorized retry',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}))
    const ready=vi.fn()
    render(<SurveyParticipantImage image={image} proof={proof} onReadyChange={ready}/>)
    await screen.findByRole('button',{name:'重试图片'})
    expect(ready).not.toHaveBeenCalledWith(true)
    expect(ready).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button',{name:'重试图片'}))
    await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2))
  })
})
