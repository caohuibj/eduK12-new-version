import React from 'react'
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react'
import {createGuidedRecognitionSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/continuous-recognition/package'
import {freezeGuidedRecognitionManifest} from '../../../../../../backend/src/modules/cognitive/content-candidates/continuous-recognition/native'
import {RecognitionSession} from './session'
import {sealDigest} from './digest'
import {validateContext} from './assets'
import type {RecognitionContext,RecognitionPorts,SealedRecord,NativeReport} from './contracts'
vi.mock('./assets',async()=>{const actual=await vi.importActual<typeof import('./assets')>('./assets');return {...actual,
  decodeAssets:vi.fn(async(c:RecognitionContext)=>new Map(c.assetManifest.assets.map(a=>{const img=document.createElement('img');Object.defineProperties(img,{complete:{value:true},naturalWidth:{value:512}});return[a.assetId,img]}))),releaseDecodedAssets:vi.fn()}})
import {RecognitionTask} from './RecognitionTask'
import {RecognitionReport} from './RecognitionReport'
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve()}
function fixture(){
  const formal=Array.from({length:184},(_,i)=>'logic-'+i),practice=Array.from({length:6},(_,i)=>'practice-'+i),seed='guided-component'
  const session=createGuidedRecognitionSnapshot('experience',formal,practice,undefined,{status:'synthetic-review-only',manifestHash:'c'.repeat(64),evidenceRef:'SYNTHETIC UNIT FIXTURE ONLY'}),f=freezeGuidedRecognitionManifest(session.config,seed)
  const context:RecognitionContext={contextKey:'guided-attempt',configHash:session.configHash,protocolSignature:session.protocolSignature,randomSeed:seed,manifestHash:f.manifestHash,
    config:session.config,manifest:f.manifest,presentationApproval:'recognition-300-css-single-seen-20261026',assetManifest:{status:'synthetic-review-only',manifestHash:'c'.repeat(64),evidenceRef:session.config.assetManifestBinding.evidenceRef!,
      assets:[...new Set([...f.manifest.formal.map(p=>p.assetId),...practice])].map(assetId=>({assetId,sha256:'d'.repeat(64),url:'data:image/svg+xml,fixture',width:512,height:512}))}}
  const ports:RecognitionPorts={prepareLocalAttempt:vi.fn(async c=>({contextKey:c.contextKey,bindingDigest:sealDigest(c),fresh:true as const})),
    persistLocalDraft:vi.fn(async r=>({contextKey:r.contextKey,recordKey:r.recordKey,recordDigest:r.recordDigest,retained:true as const})),finalize:vi.fn()}
  return {context,ports}
}
async function round(s:RecognitionSession,answers:boolean[],base=100){
  s.begin(base)
  for(let i=0;i<8;i++){const now=base+i*2500
    if(answers[i])s.input(now+1000,'touch')
    s.tick(now+1199);expect(s.capture?.stage).toBe('image');s.tick(now+1200);s.tick(now+2000);await flush()
    if(i<7){expect(s.view).toBe('practice-item-feedback');s.nextPractice(now+2500)}
  }
  expect(s.view).toBe('practice-feedback')
}
describe('recognition guided practice flow',()=>{
  it('accepts slower practice, requires 7 of 8, preserves raw policy and restores formal timing',async()=>{
    const {context,ports}=fixture();expect(()=>validateContext(context)).toThrow();expect(validateContext(context,true)).toEqual(context)
    const s=new RecognitionSession(context,ports,true,()=>{});await s.prepare()
    await round(s,[false,true,true,false,true,false,false,false]);expect(s.practiceCorrect).toBe(7);expect(s.practicePassed).toBe(true)
    s.acceptPractice();s.begin(30000);expect(s.phase).toBe('formal');s.tick(30749);expect(s.capture?.stage).toBe('image');s.tick(30750);expect(s.capture?.stage).toBe('isi');s.tick(31550)
    await flush();const records=s.queue.retained;expect(records).toHaveLength(9);expect(records[0].note.practice).toEqual({policyVersion:'recognition-guided-practice-v1',round:0,imageMs:1200,isiMs:800})
    expect(records[8].recordKey).toBe('formal:0');expect(records[8].note.practice).toBeUndefined();expect(ports.prepareLocalAttempt).toHaveBeenCalledTimes(1)
  })
  it('does not pass silence, requires instructions before retry, and retains separate original rounds',async()=>{
    const {context,ports}=fixture(),s=new RecognitionSession(context,ports,true,()=>{});await s.prepare();await round(s,[])
    expect(s.practiceCorrect).toBe(6);expect(s.practicePassed).toBe(false);const original=s.queue.retained
    s.acceptPractice();s.begin(30000);expect(s.capture).toBeNull();expect(s.view).toBe('practice-feedback')
    s.reviewPracticeInstructions();expect(s.view).toBe('practice-instructions');await round(s,[false,false,true,false,true,false,false,false],30000)
    expect(s.practicePassed).toBe(true);expect(s.practiceRound).toBe(1);expect(s.queue.retained.slice(0,8)).toEqual(original)
    expect(s.queue.retained.map(r=>r.recordKey)).toEqual([...Array.from({length:8},(_,i)=>'practice:0:'+i),...Array.from({length:8},(_,i)=>'practice:1:'+i)])
    expect(ports.prepareLocalAttempt).toHaveBeenCalledTimes(1);expect(ports.finalize).not.toHaveBeenCalled()
  })
  it('bounds failed practice to three rounds and rejects changed frozen policy before exposure',async()=>{
    const {context,ports}=fixture(),s=new RecognitionSession(context,ports,true,()=>{});await s.prepare()
    for(let n=0;n<3;n++){await round(s,[],100+n*30000);if(n<2)s.reviewPracticeInstructions()}
    expect(s.canRetryPractice).toBe(false);s.reviewPracticeInstructions();s.begin(100000);expect(s.capture).toBeNull();s.endPractice();expect(s.view).toBe('practice-ended');expect(s.queue.retained).toHaveLength(24)
    const bad=structuredClone(context);if('practicePolicy' in bad.config)(bad.config.practicePolicy as unknown as {minimumCorrect:number}).minimumCorrect=0
    expect(()=>validateContext(bad,true)).toThrow('practice policy');expect(()=>new RecognitionSession(bad,ports,true,()=>{})).toThrow('practice policy')
  })
  it('on local save failure retries the exact sealed record without feedback, re-exposure or false pass',async()=>{
    const {context,ports}=fixture(),writes:SealedRecord[]=[];let fail=true
    ports.persistLocalDraft=vi.fn(async r=>{writes.push(r);if(fail)throw Error('local failed');return{contextKey:r.contextKey,recordKey:r.recordKey,recordDigest:r.recordDigest,retained:true as const}})
    const s=new RecognitionSession(context,ports,true,()=>{},()=>2100);await s.prepare();s.begin(100);s.tick(1300);s.tick(2100);await flush()
    expect(s.view).toBe('retry');expect(s.capture).toBeNull();expect(s.practicePassed).toBe(false)
    fail=false;await s.retry();expect(writes[1]).toEqual(writes[0]);expect(s.view).toBe('blocked');expect(s.queue.retained).toHaveLength(1);s.begin(30000);expect(s.capture).toBeNull();expect(ports.finalize).not.toHaveBeenCalled()
  })
})
let now=100,nextFrame=0,frames=new Map<number,FrameRequestCallback>()
beforeEach(()=>{now=100;nextFrame=0;frames=new Map();vi.spyOn(performance,'now').mockImplementation(()=>now)
  vi.stubGlobal('requestAnimationFrame',vi.fn((cb:FrameRequestCallback)=>{frames.set(++nextFrame,cb);return nextFrame}));vi.stubGlobal('cancelAnimationFrame',vi.fn((id:number)=>frames.delete(id)))
  vi.stubGlobal('innerWidth',390);vi.stubGlobal('innerHeight',844)})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
async function frame(at:number){now=at;const callbacks=[...frames.values()];frames.clear();await act(async()=>{for(const cb of callbacks)cb(at);await flush()})}
describe('recognition guided participant component',()=>{
  it('shows full examples before practice and again after a failed real component round',async()=>{
    const p=fixture();render(<RecognitionTask {...p} syntheticReview/>);await screen.findByRole('button',{name:'准备练习'})
    expect(screen.getByText(/例2：A → B → A/)).toBeTruthy();expect(screen.getByText(/例4：A消失后/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'准备练习'}));await screen.findByRole('button',{name:'开始练习'});fireEvent.click(screen.getByRole('button',{name:'开始练习'}));await frame(100)
    for(let i=0;i<8;i++){const start=100+i*2500;await frame(start+1200);await frame(start+2000)
      if(i<7){fireEvent.click(screen.getByRole('button',{name:'下一张练习图片'}));await frame(start+2500)}}
    expect(screen.getByText('第1轮：答对6/8次，需要至少7次。')).toBeTruthy();expect(screen.queryByRole('button',{name:'准备正式作答'})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'重新查看说明与例子'}));expect(screen.getByRole('region',{name:'操作说明与例子'})).toBeTruthy();expect(screen.getByText(/例3：C → C/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'开始下一轮练习'}));await frame(30000);await frame(31200);await frame(32000)
    expect(p.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1);expect(p.ports.persistLocalDraft).toHaveBeenCalledTimes(9)
    const mock=vi.mocked(p.ports.persistLocalDraft);expect(mock.mock.calls[0][0].recordKey).toBe('practice:0:0');expect(mock.mock.calls[8][0].recordKey).toBe('practice:1:0')
  })
  it('uses the new practical label only with its frozen teaching context while retaining the report gate',()=>{
    const report:NativeReport={state:'interpretable',profile:'experience',reportVersion:'0.2.0',scoringVersion:'0.2.0',qualityRule:'product-session-descriptive-0.2.0',configHash:'a'.repeat(64),protocolSignature:'b'.repeat(64),assetManifestHash:'c'.repeat(64),hitRate:.8,falseAlarmRate:.25,correctedRecognitionRate:.55,targetHits:16,targetFalseAlarms:5,denominator:20,completeTargetPairs:20,plannedTargetPairs:20,receivedTrialCount:100,expectedTrialCount:100,reasons:[],canGenerateTakeHomeImage:false,logo:'EDUK12.TOP',interpretationScope:'this-session-descriptive-only'}
    const view=render(<RecognitionReport report={report} guidedPractice/>);expect(screen.getByText('实用版')).toBeTruthy();expect(screen.queryByText(/体验版记录/)).toBeNull()
    view.rerender(<RecognitionReport report={report}/>);expect(screen.getByText(/体验版记录/)).toBeTruthy()
    view.rerender(<RecognitionReport report={{...report,state:'limited',hitRate:null,falseAlarmRate:null,correctedRecognitionRate:null,targetHits:null,targetFalseAlarms:null,denominator:null}} guidedPractice/>);expect(screen.queryByText('重复图片识别率')).toBeNull()
  })
})
