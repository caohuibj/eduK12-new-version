import React from 'react'
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {render,screen,fireEvent,waitFor,act,cleanup} from '@testing-library/react'
import {freezeCandidate} from '../../../../../../backend/src/modules/cognitive/content-candidates/continuous-recognition/protocol'
import {sealDigest} from './digest'
import type {RecognitionContext,RecognitionPorts} from './contracts'
vi.mock('./assets',async()=>{const real=await vi.importActual<typeof import('./assets')>('./assets');return {...real,
 decodeAssets:vi.fn(async(c:RecognitionContext)=>new Map(c.assetManifest.assets.map(a=>{const image=document.createElement('img');Object.defineProperties(image,{complete:{value:true},naturalWidth:{value:512}});return[a.assetId,image]}))),releaseDecodedAssets:vi.fn()}})
import {RecognitionTask} from './RecognitionTask'
function fixture(){const request={profile:'experience' as const,seed:'recognition-golden',formalAssetIds:Array.from({length:184},(_,i)=>'logic-'+i),practiceAssetIds:Array.from({length:6},(_,i)=>'practice-'+i)},f=freezeCandidate(request)
 const context:RecognitionContext={contextKey:'stable-attempt',configHash:'a'.repeat(64),protocolSignature:'b'.repeat(64),manifestHash:f.snapshotHash,randomSeed:request.seed,
 config:{profile:request.profile,formalAssetIds:request.formalAssetIds,practiceAssetIds:request.practiceAssetIds,imageMs:750,isiMs:800,responseRule:'image-and-following-isi-half-open-0.1.0',generatorVersion:'seeded-blocks-0.1.0',qualityRule:'product-session-descriptive-0.2.0',assetManifestBinding:{status:'synthetic-review-only',manifestHash:'c'.repeat(64),evidenceRef:'synthetic'}},manifest:f.manifest,presentationApproval:'recognition-300-css-single-seen-20261026',assetManifest:{status:'synthetic-review-only',manifestHash:'c'.repeat(64),evidenceRef:'synthetic',assets:[...new Set([...f.manifest.formal.map(r=>r.assetId),...request.practiceAssetIds])].map(assetId=>({assetId,sha256:'d'.repeat(64),url:'data:image/svg+xml,fixture',width:512,height:512}))}}
 const ports:RecognitionPorts={prepareLocalAttempt:vi.fn(async c=>({contextKey:c.contextKey,bindingDigest:sealDigest(c),fresh:true as const})),persistLocalDraft:vi.fn(async r=>({contextKey:r.contextKey,recordKey:r.recordKey,recordDigest:r.recordDigest,retained:true as const})),finalize:vi.fn()}
 return{context,ports}}
let frames:FrameRequestCallback[]=[]
beforeEach(()=>{frames=[];vi.stubGlobal('requestAnimationFrame',vi.fn((cb:FrameRequestCallback)=>{frames.push(cb);return frames.length}));vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.spyOn(performance,'now').mockReturnValue(100);vi.stubGlobal('innerWidth',390);vi.stubGlobal('innerHeight',844)})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
async function ready(p:ReturnType<typeof fixture>){const rendered=render(<RecognitionTask {...p} syntheticReview/>);await screen.findByRole('button',{name:'准备练习'});fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始练习'});return rendered}
describe('recognition component frozen lifecycle',()=>{
 it('does not schedule animation frames while intro/reading/ready is idle',async()=>{const p=fixture();await ready(p);expect(frames).toHaveLength(0)})
 it.each(['language','synthetic','ports','context'])('terminates pending start when frozen %s identity changes',(async which=>{
  const p=fixture(),view=await ready(p);fireEvent.click(screen.getByRole('button',{name:'开始练习'}));const stale=frames[0]
  const props={...p,language:'zh' as 'zh'|'en',syntheticReview:true}
  if(which==='language')props.language='en'
  if(which==='synthetic')props.syntheticReview=false
  if(which==='ports')props.ports={...p.ports}
  if(which==='context')props.context={...p.context,contextKey:'replacement'}
  view.rerender(<RecognitionTask {...props}/>);await act(async()=>stale(100));expect(document.querySelector('.recognition-board')).toBeNull()
  expect(screen.getByRole('alert')).toBeTruthy();expect(screen.getByText('合成审阅始终为非正式测验')).toBeTruthy();expect(p.ports.persistLocalDraft).not.toHaveBeenCalled()
 }))
 it('cancels a scheduled start after unmount instead of exposing via a stale rAF callback',async()=>{const p=fixture(),view=await ready(p);fireEvent.click(screen.getByRole('button',{name:'开始练习'}));const stale=frames[0];view.unmount();await act(async()=>stale(100));expect(p.ports.persistLocalDraft).not.toHaveBeenCalled();expect(cancelAnimationFrame).toHaveBeenCalled()})
 it('interrupts active old port and never writes captured old data into a replacement port',async()=>{
  const p=fixture(),view=await ready(p);fireEvent.click(screen.getByRole('button',{name:'开始练习'}));await act(async()=>frames[0](100));expect(document.querySelector('.recognition-board')).not.toBeNull()
  const replacement={...p.ports,persistLocalDraft:vi.fn()};view.rerender(<RecognitionTask context={p.context} ports={replacement} syntheticReview/>);await waitFor(()=>expect(p.ports.persistLocalDraft).toHaveBeenCalledTimes(1));expect(replacement.persistLocalDraft).not.toHaveBeenCalled()
 })
})
