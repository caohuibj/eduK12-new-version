import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SchoolApi } from './SchoolRecovery'
import { finalDraftStore } from '../services/persistence/finalDraftStore'

// ONLY the already-reviewed Composite parent presentation is stubbed. This
// test intentionally mounts the REAL CognitiveRunner, its frozen task registry,
// useCognitiveSession FINAL draft/recovery hook and media loading hooks.
vi.mock('../components/FinalCompositeAssessment',()=>({
  default:({state,onEnterCognitive}:any)=>(
    <section>
      <p>正式 Composite 父级测评</p>
      {state.currentItem&&<button onClick={()=>onEnterCognitive(state.currentItem)}>
        进入冻结认知子测评
      </button>}
    </section>
  ),
}))
vi.mock('../modules/situational/pages/SituationalRunner',()=>({default:()=>null}))
import { SchoolCompositeRunner } from './SchoolCompositeRunner'

const execution={
  organizationId:'school-A',courseId:'activity-A',runId:'run-A',executionId:'execution-A',
}
const parent='/composite-attempts/parent-A'
const child=parent+'/items/slot-cognitive-A/cognitive/cog-A'
const draftKey='cognitive:cog-A'
const startUrl='/organizations/school-A/activities/activity-A/runs/run-A/executions/execution-A/start'
const frozenSession=(trialCount=1,presentation?:unknown)=>({
  sessionId:'cog-A',assignmentId:'assignment-A',testType:'fake',
  status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',
  engineVersion:'1.0.0',scoringVersion:'1.0.0',configVersion:'1.0.0',
  definitionHash:'a'.repeat(64),contextSnapshotHash:null,
  attemptEpoch:1,attemptNo:1,randomSeed:'campus-frozen-seed',
  config:{trialCount,trialDurationMs:1000,allowPractice:false,maxRtMs:60000},
  ...(presentation?{presentation}:{}),
})
const makeApi=(trialCount=1,presentation?:unknown)=>{
  let submitted=false
  const submit=vi.fn<(payload:unknown)=>void>()
  const api=vi.fn(async(path:string,method='GET',payload?:unknown):Promise<any>=>{
    if(path===startUrl&&method==='POST')return {
      state:'STARTED',runtimeBindingKind:'COMPOSITE',runtimeBindingRef:'parent-A',
    }
    if(path===parent&&method==='GET')return {
      id:'parent-A',status:submitted?'COMPLETED':'IN_PROGRESS',
      deliveryMode:'FINAL_ONLY',
      currentItem:submitted?null:{id:'slot-cognitive-A',type:'COGNITIVE',position:1,
        cognitiveSession:{sessionId:'cog-A'}},
    }
    if(path===child&&method==='GET')return {
      ...frozenSession(trialCount,presentation),
      status:submitted?'COMPLETED':'IN_PROGRESS',
    }
    if(path===child+'/video-capabilities'&&method==='POST')return {
      videoUrl:'https://media.example.invalid/campus-tokenized-video',
      mimeType:'video/mp4',
    }
    if(path===child+'/submit'&&method==='POST'){
      submit(payload)
      submitted=true
      return {completed:true,feedbackDeferred:true,replayed:false}
    }
    throw Error('unexpected campus API: '+method+' '+path)
  })
  return {api,submit}
}
const create=async(api:ReturnType<typeof makeApi>['api'])=>{
  const onFinished=vi.fn()
  const ui=render(<SchoolCompositeRunner api={api as unknown as SchoolApi}
    execution={execution} onExit={vi.fn()} onFinished={onFinished}/>)
  fireEvent.click(screen.getByRole('button',{name:'开始或继续正式测评'}))
  const enter=await screen.findByRole('button',{name:'进入冻结认知子测评'})
  fireEvent.click(enter)
  return {ui,onFinished}
}
afterEach(async()=>{
  await finalDraftStore.delete(draftKey)
  vi.unstubAllGlobals()
})

describe('real Huischool CognitiveRunner in a SCHOOL Composite parent (no Cognitive mock)',()=>{
  it('START → frozen image/video route → REAL trial draft → exactly one FINAL → parent completion',async()=>{
    const originalCreate=URL.createObjectURL
    const originalRevoke=URL.revokeObjectURL
    Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>'blob:school-approved-image')})
    Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:vi.fn()})
    try{
      const presentation={
        schemaVersion:1,
        instruction:[{
          asset:{assetId:'image-A',contentHash:'a'.repeat(64),mimeType:'image/png'},
          altText:'冻结校园测评说明',
        }],
        videos:{example:[{
          schemaVersion:1,
          video:{assetId:'video-A',contentHash:'b'.repeat(64),mimeType:'video/mp4'},
        }]},
      }
      const {api,submit}=makeApi(1,presentation)
      const blobRequests:string[]=[]
      vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
        blobRequests.push(String(url))
        if(String(url)!=='/api/campus'+child+'/assets/image-A/content')
          throw new Error('Cross-domain or unexpected media URL')
        return new Response(new Blob(['synthetic-school-image'],{type:'image/png'}),{status:200})
      }))
      const {onFinished}=await create(api)
      // This would synchronously throw "useNavigate() may be used only in a
      // Router" under PR266. The real task must now mount and load media.
      expect(await screen.findByRole('img',{name:'冻结校园测评说明'})).toBeInTheDocument()
      expect(blobRequests).toEqual(['/api/campus'+child+'/assets/image-A/content'])
      await waitFor(()=>expect(api).toHaveBeenCalledWith(
        child+'/video-capabilities','POST',{videoKey:'example:0'},
      ))
      const start=await screen.findByRole('button',{name:'开始测评'})
      await waitFor(()=>expect(start).toBeEnabled())
      fireEvent.click(start)
      fireEvent.click(await screen.findByRole('button',{name:'trial 0'}))
      await waitFor(async()=>{
        expect((await finalDraftStore.listTrials(draftKey))).toHaveLength(1)
      })
      expect(submit).not.toHaveBeenCalled()
      fireEvent.click(await screen.findByRole('button',{name:'完成测评'}))
      await waitFor(()=>expect(submit).toHaveBeenCalledTimes(1))
      expect(submit.mock.calls[0][0]).toMatchObject({
        attemptEpoch:1,definitionHash:'a'.repeat(64),
        contextSnapshotHash:null,
        trials:[expect.objectContaining({correct:expect.any(Boolean),rtMs:expect.any(Number)})],
      })
      expect(JSON.stringify(submit.mock.calls[0][0])).not.toMatch(/score|metrics|cutoff/)
      expect(api.mock.calls.every(call=>call[0].startsWith('/'))).toBe(true)
      expect(api.mock.calls.some(call=>call[0].startsWith('/cognitive/'))).toBe(false)
      expect(await screen.findByText('校园认知测评已完成')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button',{name:'返回校园活动'}))
      expect(await screen.findByText('本次测评已完成')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button',{name:'返回我的校园活动'}))
      expect(onFinished).toHaveBeenCalledTimes(1)
      expect(await finalDraftStore.get(draftKey)).toBeNull()
    }finally{
      if(originalCreate===undefined)delete (URL as any).createObjectURL
      else Object.defineProperty(URL,'createObjectURL',{configurable:true,value:originalCreate})
      if(originalRevoke===undefined)delete (URL as any).revokeObjectURL
      else Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:originalRevoke})
    }
  })

  it('refreshes an unsealed mid-task draft fail-closed without redoing exposed trials or inventing a FINAL',async()=>{
    const {api,submit}=makeApi(2)
    const first=await create(api)
    fireEvent.click(await screen.findByRole('button',{name:'开始测评'}))
    fireEvent.click(await screen.findByRole('button',{name:'trial 0'}))
    await waitFor(async()=>expect(await finalDraftStore.listTrials(draftKey)).toHaveLength(1))
    first.ui.unmount()
    const second=await create(api)
    expect(await screen.findByText(/本机已保存 1 个试次/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'trial 0'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'开始测评'})).not.toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
    expect(await finalDraftStore.listTrials(draftKey)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button',{name:'返回上层测评'}))
    expect(await screen.findByText('正式 Composite 父级测评')).toBeInTheDocument()
    expect(second.onFinished).not.toHaveBeenCalled()
  })
})
