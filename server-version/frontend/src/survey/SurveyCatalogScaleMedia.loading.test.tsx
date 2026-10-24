import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyCatalogScaleMedia} from './SurveyCatalogScaleMedia'
const player=vi.hoisted(()=>vi.fn())
vi.mock('../modules/assessment-media/AssessmentVideoPlayer',()=>({AssessmentVideoPlayer:(props:Record<string,unknown>)=>{player(props);return <button onClick={()=>{(props.onViewingComplete as ()=>void)()}}>完成视频</button>}}))
const proof={publicId:'public',attemptId:'attempt',accessCredential:'synthetic-private-proof'}
const video={schemaVersion:1 as const,video:{assetId:'video',contentHash:'a'.repeat(64),mimeType:'video/mp4' as const},title:'合成视频'}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();player.mockClear()})
describe('Survey loads media only for a media question',()=>{
  it('does not request capabilities or mount a player for text-only questions',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
    const view=render(<SurveyCatalogScaleMedia item={{}} proof={proof} instrumentKey="scale" itemKey="text"/>)
    await Promise.resolve();expect(view.container).toBeEmptyDOMElement();expect(fetcher).not.toHaveBeenCalled();expect(player).not.toHaveBeenCalled()
  })
  it('loads the existing video with the same proof and viewing requirement',async()=>{
    const complete=vi.fn(),fetcher=vi.fn(async()=>({ok:true,json:async()=>({code:0,data:{videoUrl:'/synthetic-video'}})} as Response))
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyCatalogScaleMedia item={{video}} proof={proof} instrumentKey="scale" itemKey="item" onComplete={complete}/>)
    fireEvent.click(await screen.findByRole('button',{name:'完成视频'}))
    expect(complete).toHaveBeenCalledOnce()
    expect(player).toHaveBeenLastCalledWith(expect.objectContaining({presentation:video,requiredViewing:true,viewingComplete:false}))
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]).toEqual(['/api/public/survey/r/public/attempts/attempt/scale-media/scale/item/video-capabilities',expect.objectContaining({method:'POST',credentials:'omit',cache:'no-store',body:JSON.stringify({accessCredential:proof.accessCredential})})])
  })
  it('keeps a failed capability closed and permits a deliberate retry',async()=>{
    let succeeds=false
    const fetcher=vi.fn(async()=>({ok:succeeds,json:async()=>succeeds?{code:0,data:{videoUrl:'/synthetic-video'}}:{code:1,message:'授权尚不可用'}} as Response))
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyCatalogScaleMedia item={{video}} proof={proof} instrumentKey="scale" itemKey="item"/>)
    await screen.findByText('授权尚不可用');expect(player).not.toHaveBeenCalled()
    succeeds=true;fireEvent.click(screen.getByRole('button',{name:'重试'}))
    await screen.findByRole('button',{name:'完成视频'})
    await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2))
  })
})
