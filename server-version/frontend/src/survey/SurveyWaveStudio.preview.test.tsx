import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SurveyWaveStudio } from './SurveyWaveStudio'
const previewModule=vi.hoisted(()=>vi.fn())
vi.mock('./SurveyFlowStudio',()=>({SurveyFlowStudio:()=>null}))
vi.mock('./SurveyStudyPreview',()=>{previewModule();return {SurveyStudyPreview:({consentText,onClose}:{consentText:string;onClose:()=>void})=>{
  const [step,setStep]=useState(0)
  return <section aria-label="test study preview"><p>Preview consent: {consentText}</p><p>Preview step: {step}</p>
    <button type="button" onClick={()=>setStep(step+1)}>Advance test preview</button><button type="button" onClick={onClose}>Close test preview</button></section>
}}})
const draft={id:'tool1',projectId:'p1',kind:'FORM',instrumentKey:'form',title:'Test tool',status:'DRAFT',revision:1,
  definition:{schemaVersion:1,pages:[]}}
const wave=(id='w1')=>({id,projectId:'p1',title:id==='w1'?'First wave':'Second wave',ordinal:id==='w1'?1:2,status:'DRAFT',revision:1,
  instrumentIds:['tool1'],publicationId:null,consentText:'Original consent snapshot',generalText:'Thank you',consentVersion:1,
  linkageNoticeConfirmed:false,opensAt:null,closesAt:null,finishUntil:null,quotaStarts:null,startsCount:0,allowNewParticipants:false,hardStopAt:null})
function fixture(){
  let pending:Promise<unknown>|null=null
  const response=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
  const fetcher=vi.fn(async(input:RequestInfo|URL)=>{
    if(String(input).includes('/package-memberships?'))return {ok:true,status:200,json:async()=>({code:0,data:{list:[]}})} as Response
  const url=String(input)
    if(url.endsWith('/instruments/tool1')){const request=pending;pending=null;return request?await request:response(draft)}
    if(url.includes('/waves?page='))return response({list:[wave(),wave('w2')]})
    if(url.includes('/instruments?page='))return response({list:[draft]})
    if(url.endsWith('/waves/w1'))return response(wave())
    if(url.endsWith('/waves/w2'))return response(wave('w2'))
    if(url.endsWith('/projects/p1'))return response({id:'p1',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1})
    throw new Error('Unexpected test request '+url)
  })
  vi.stubGlobal('fetch',fetcher)
  return {defer(){let resolve!:(value:unknown)=>void;pending=new Promise(done=>{resolve=done});return ()=>resolve(response(draft))}}
}
async function selectFirst(){
  fireEvent.click(await screen.findByRole('button',{name:/T1 · First wave/}))
  await waitFor(()=>expect(screen.getByLabelText('波次标题')).toHaveValue('First wave'))
  await waitFor(()=>expect(screen.getByRole('button',{name:'预览整轮研究流程'})).toBeEnabled())
}
async function preview(){fireEvent.click(screen.getByRole('button',{name:'预览整轮研究流程'}));await screen.findByRole('region',{name:'test study preview'})}
afterEach(()=>vi.unstubAllGlobals())
describe('wave preview lifecycle',()=>{
  it('unmounts an old preview before rerun and mounts a fresh snapshot after loading',async()=>{
    const api=fixture();render(<SurveyWaveStudio projectId="p1"/>);await selectFirst();expect(previewModule).not.toHaveBeenCalled();await preview();expect(previewModule).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button',{name:'Advance test preview'}))
    expect(screen.getByText('Preview step: 1')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('参与说明与知情同意'),{target:{value:'Consent captured at rerun'}})
    const resolve=api.defer();fireEvent.click(screen.getByRole('button',{name:'预览整轮研究流程'}))
    expect(screen.queryByRole('region',{name:'test study preview'})).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('参与说明与知情同意'),{target:{value:'Later unsaved consent'}})
    await act(async()=>resolve())
    expect(await screen.findByText('Preview step: 0')).toBeInTheDocument()
    expect(screen.getByText('Preview consent: Consent captured at rerun')).toBeInTheDocument()
    expect(screen.queryByText('Preview consent: Later unsaved consent')).not.toBeInTheDocument()
  })
  it('clears a preview on wave selection and on New wave',async()=>{
    fixture();render(<SurveyWaveStudio projectId="p1"/>);await selectFirst();await preview()
    fireEvent.click(screen.getByRole('button',{name:/T2 · Second wave/}))
    expect(screen.queryByRole('region',{name:'test study preview'})).not.toBeInTheDocument()
    await waitFor(()=>expect(screen.getByLabelText('波次标题')).toHaveValue('Second wave'))
    await waitFor(()=>expect(screen.getByRole('button',{name:'预览整轮研究流程'})).toBeEnabled())
    await preview();fireEvent.click(screen.getByRole('button',{name:'新建波次'}))
    expect(screen.queryByRole('region',{name:'test study preview'})).not.toBeInTheDocument()
    expect(screen.getByLabelText('波次标题')).toHaveValue('')
  })
  it('does not resurrect an in-flight preview after New wave invalidates it',async()=>{
    const api=fixture();render(<SurveyWaveStudio projectId="p1"/>);await selectFirst()
    const resolve=api.defer();fireEvent.click(screen.getByRole('button',{name:'预览整轮研究流程'}))
    expect(screen.getByRole('button',{name:'预览整轮研究流程'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'新建波次'}))
    await act(async()=>resolve())
    expect(screen.queryByRole('region',{name:'test study preview'})).not.toBeInTheDocument()
    expect(screen.getByLabelText('波次标题')).toHaveValue('')
    expect(screen.getByRole('button',{name:'预览整轮研究流程'})).toBeDisabled()
  })
})
