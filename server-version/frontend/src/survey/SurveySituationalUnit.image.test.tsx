import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {MemoryRouter} from 'react-router-dom'
import {SurveySituationalUnit} from './SurveySituationalUnit'
import {finalDraftStore} from '../services/persistence/finalDraftStore'
import type {SituationalAttemptResponse} from '../modules/situational/types'
const id='11111111-1111-4111-8111-111111111111',proof='x'.repeat(43)
const source={attemptId:id,attempt:{id,instrumentKey:'synthetic-image',instrumentVersion:'1.0.0',attemptNo:1,
  status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,progress:0,
  definitionHash:'a'.repeat(64),compiledRuntimeHash:'b'.repeat(64),scorerKey:'situational.default',scoringVersion:'synthetic',
  submissionId:null,submissionPayloadHash:null,submittedAt:null,startedAt:'2026-10-24T00:00:00.000Z',completedAt:null,
  totalTime:null,createdAt:'2026-10-24T00:00:00.000Z',updatedAt:'2026-10-24T00:00:00.000Z'},
  instrument:{key:'synthetic-image',version:'1.0.0',releaseStatus:'PUBLISHED',scienceMaturity:'PILOT',
    definitionHash:'a'.repeat(64),compiledRuntimeHash:'b'.repeat(64),scorerKey:'situational.default',scoringVersion:'synthetic',
    frozenAt:'2026-10-24T00:00:00.000Z',sampling:{strategy:'ALL'},
    definition:{schemaVersion:1,respondentType:'student_self_report',sampling:{strategy:'ALL'},scenes:[{
      sceneKey:'ONE',title:'Original synthetic image',sortOrder:0,stimulus:{type:'IMAGE',text:'Synthetic fallback',
        asset:{assetId:'image-id',contentHash:'c'.repeat(64),mimeType:'image/png'},altText:'Original synthetic panel'},
      channels:[{channelKey:'ACTION',responseType:'SINGLE_CHOICE',prompt:'Synthetic choice',options:[{optionKey:'A',label:'Choose A'}]}]}]},
    report:{reportVersion:'synthetic',primaryMetricKeys:['score'],metricOrder:['score'],interpretations:[],limitations:[],disclaimer:'Synthetic only'},
    referencePolicy:{type:'none'},runtimeCapabilities:{standalone:true,embedded:true,aggregateEligible:true,collectionFacts:true,supported:true}}} as SituationalAttemptResponse
const json=(data:unknown)=>({ok:true,status:200,json:async()=>({code:0,message:'ok',data})})
afterEach(()=>vi.unstubAllGlobals())
describe('real Survey host and shared image runner UI contract with synthetic API',()=>{
  it.each(['403','decode'])('blocks on %s failure, retries with POST proof, then submits only scientific answers and consumes the server receipt',async failure=>{
    await finalDraftStore.delete('situational:'+id)
    if(!URL.createObjectURL)Object.defineProperty(URL,'createObjectURL',{value:vi.fn(()=> 'blob:synthetic-private-image'),configurable:true})
    if(!URL.revokeObjectURL)Object.defineProperty(URL,'revokeObjectURL',{value:vi.fn(),configurable:true})
    const decode=vi.fn().mockResolvedValue(undefined)
    if(failure==='decode')decode.mockRejectedValueOnce(new Error('Synthetic HTTP 200 image cannot decode'))
    vi.stubGlobal('Image',class {src='';onload=null;onerror=null;decode=decode})
    let imageCalls=0,accepted=false
    const receipt={protocol:'SITUATIONAL_NATIVE_V1',attemptId:id,submissionId:'22222222-2222-4222-8222-222222222222',payloadHash:'d'.repeat(64)}
    const fetch=vi.fn(async(url:RequestInfo|URL,_options?:RequestInit)=>{
      const path=String(url)
      if(path.includes('/images/'))return ++imageCalls===1&&failure==='403'?{ok:false,status:403}:{ok:true,status:200,blob:async()=>new Blob(['synthetic bytes'],{type:'image/png'})}
      if(path.endsWith('/final'))accepted=true
      return json(accepted?{...source,attempt:{...source.attempt,status:'COMPLETED'},receipt}:source)
    })
    vi.stubGlobal('fetch',fetch)
    const onCommitted=vi.fn()
    render(<MemoryRouter><SurveySituationalUnit publicId="public" attemptId="parent" slotKey="image" title="Synthetic native image" accessCredential={proof} onCommitted={onCommitted}/></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('视觉内容加载失败')
    expect(screen.getByLabelText('Choose A')).toBeDisabled()
    expect(screen.getByRole('button',{name:'提交测评'})).toBeDisabled()
    expect(accepted).toBe(false)
    if(failure==='decode')expect(decode).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button',{name:'重试'}))
    expect(await screen.findByAltText('Original synthetic panel')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Choose A'))
    await waitFor(()=>expect(screen.getByRole('button',{name:'提交测评'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'提交测评'}))
    await waitFor(()=>expect(onCommitted).toHaveBeenCalledWith(receipt))
    const images=fetch.mock.calls.filter(([url])=>String(url).includes('/images/'))
    expect(images).toHaveLength(2)
    for(const [url,options]of images){expect(String(url)).not.toContain(proof);expect(options).toMatchObject({method:'POST',credentials:'omit',cache:'no-store'});expect(JSON.parse(options!.body as string)).toEqual({accessCredential:proof})}
    const submission=JSON.parse(fetch.mock.calls.find(([url])=>String(url).endsWith('/final'))![1]!.body as string).submission
    expect(submission.responses).toEqual([expect.objectContaining({sceneKey:'ONE',channelKey:'ACTION',responseValue:'A'})])
    expect(JSON.stringify(submission)).not.toMatch(/blob:|image-id|synthetic-private-image/)
    expect(JSON.stringify(submission)).not.toContain(proof)
  })
})
