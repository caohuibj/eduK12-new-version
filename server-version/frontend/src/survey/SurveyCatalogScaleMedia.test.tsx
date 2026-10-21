import {afterEach,describe,expect,it,vi} from 'vitest'
import {render,screen,waitFor} from '@testing-library/react'
import {SurveyCatalogScaleMedia} from './SurveyCatalogScaleMedia'
import type {AssessmentVideoPresentationV1} from '../modules/assessment-media/types'
vi.mock('../modules/assessment-media/AssessmentVideoPlayer',()=>({AssessmentVideoPlayer:({presentation,sources,requiredViewing}:{presentation:AssessmentVideoPresentationV1;sources:{videoUrl:string};requiredViewing:boolean})=><div data-testid="video" data-source={sources.videoUrl} data-required={String(requiredViewing)}>{presentation.title}</div>}))
const proof={publicId:'public',attemptId:'attempt',accessCredential:'private-proof'}
const video:AssessmentVideoPresentationV1={schemaVersion:1,title:'Frozen source video',video:{assetId:'asset',contentHash:'a'.repeat(64),mimeType:'video/mp4'}}
afterEach(()=>vi.unstubAllGlobals())
describe('Survey canonical Scale media consumer',()=>{
  it('exchanges participant proof for the existing capability player without placing secrets in URLs',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({code:0,data:{videoUrl:'/api/assets/assessment-media/content?cap=signed'}})})
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyCatalogScaleMedia item={{video}} proof={proof} instrumentKey="scale" itemKey="i_0"/>)
    await waitFor(()=>expect(screen.getByTestId('video')).toHaveAttribute('data-required','true'))
    expect(fetcher.mock.calls[0][0]).toBe('/api/public/survey/r/public/attempts/attempt/scale-media/scale/i_0/video-capabilities')
    expect(fetcher.mock.calls[0][1]).toMatchObject({method:'POST',credentials:'omit',cache:'no-store',body:JSON.stringify({accessCredential:'private-proof'})})
    expect(screen.getByTestId('video')).toHaveAttribute('data-source','/api/assets/assessment-media/content?cap=signed')
  })
  it('does not attempt arbitrary unauthenticated asset URLs when capability authorization fails',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({code:-1,message:'Unavailable'})}))
    render(<SurveyCatalogScaleMedia item={{video}} proof={proof} instrumentKey="scale" itemKey="i_0"/>)
    await screen.findByText('Unavailable')
    expect(screen.queryByTestId('video')).toBeNull()
  })
})
