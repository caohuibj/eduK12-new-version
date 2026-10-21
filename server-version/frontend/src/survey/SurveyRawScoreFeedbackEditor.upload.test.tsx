import { useState } from 'react'
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { SurveyRawScoreFeedbackEditor } from './SurveyRawScoreFeedbackEditor'
import type { ScaleDraft } from './builder.types'
import type { RawScoreFeedbackImage } from '../modules/scale/rawScoreFeedback'
const image=(order:number):RawScoreFeedbackImage=>({asset:{assetId:'original-'+order,contentHash:'a'.repeat(64),mimeType:'image/png'},altText:'图片 '+order,order})
const draft=(images?:RawScoreFeedbackImage[]):ScaleDraft=>({schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[],items:[],dimensions:[{dimensionKey:'d',label:'维度',direction:'descriptive'}],totalScore:{key:'total',label:'总分',itemKeys:[],aggregation:'sum'},rawScoreFeedback:{schemaVersion:1,rules:[{scoreKey:'d',ranges:[{key:'first',min:0,max:1,includeMax:true,text:'原反馈',images}]},{scoreKey:'total',ranges:[{key:'other',min:0,max:1,includeMax:true,text:'另一指标'}]}]}})
function Host({initial=draft()}:{initial?:ScaleDraft}){const [value,onChange]=useState(initial);return <><SurveyRawScoreFeedbackEditor value={value} onChange={onChange} projectId="project"/><output data-testid="draft">{JSON.stringify(value)}</output></>}
const state=()=>JSON.parse(screen.getByTestId('draft').textContent!) as ScaleDraft
function pendingUpload(){
 let finish!:(value:Response)=>void
 const pending=new Promise<Response>(resolve=>{finish=resolve})
 const fetcher=vi.fn((url:string)=>url.endsWith('/csrf')?Promise.resolve(new Response(JSON.stringify({code:0,data:{csrfToken:'test'}}))):pending)
 vi.stubGlobal('fetch',fetcher)
 return {fetcher,finish:async()=>act(async()=>{finish(new Response(JSON.stringify({code:0,data:{assetId:'uploaded',contentHash:'b'.repeat(64),mimeType:'image/png',originalName:'upload.png',sizeBytes:20}})));await pending})}
}
const start=async(index:number,fetcher:ReturnType<typeof vi.fn>)=>{
 fireEvent.change(screen.getAllByLabelText('选择图片上传')[index],{target:{files:[new File(['bytes'],'upload.png',{type:'image/png'})]}})
 await waitFor(()=>expect(fetcher.mock.calls.some(call=>call[0].endsWith('/assets'))).toBe(true))
}
afterEach(()=>vi.unstubAllGlobals())
describe('Survey feedback asynchronous image edits',()=>{
 it('retains concurrent range text and another score edit when upload completes',async()=>{
  const upload=pendingUpload();render(<Host/>);await start(0,upload.fetcher)
  fireEvent.change(screen.getByLabelText('反馈 1 区间 1 文字'),{target:{value:'最新文字'}})
  fireEvent.change(screen.getByLabelText('反馈 2 区间 1 文字'),{target:{value:'另一指标最新文字'}})
  await upload.finish()
  await waitFor(()=>expect(state().rawScoreFeedback!.rules[0].ranges[0].images?.[0].asset.assetId).toBe('uploaded'))
  expect(state().rawScoreFeedback!.rules.map(r=>r.ranges[0].text)).toEqual(['最新文字','另一指标最新文字'])
 })
 it.each(['rule','range'])('ignores pending upload after target %s deletion',async target=>{
  const upload=pendingUpload();render(<Host/>);await start(0,upload.fetcher)
  fireEvent.click(screen.getAllByRole('button',{name:target==='rule'?'删除此指标反馈':'删除区间'})[0])
  await upload.finish()
  expect(JSON.stringify(state())).not.toContain('uploaded')
  expect(state().rawScoreFeedback!.rules.find(r=>r.scoreKey==='total')?.ranges[0].text).toBe('另一指标')
 })
 it('keeps upload attached to its image after an earlier image is deleted',async()=>{
  const upload=pendingUpload();render(<Host initial={draft([image(0),image(1)])}/>);await start(1,upload.fetcher)
  fireEvent.click(screen.getAllByRole('button',{name:'从此题移除图片引用'})[0])
  await upload.finish()
  await waitFor(()=>expect(state().rawScoreFeedback!.rules[0].ranges[0].images?.[0].asset.assetId).toBe('uploaded'))
  expect(state().rawScoreFeedback!.rules[0].ranges[0].images).toHaveLength(1)
  expect(state().rawScoreFeedback!.rules[0].ranges[0].images![0].order).toBe(1)
 })
 it('ignores a deleted image upload rather than replacing its next sibling',async()=>{
  const upload=pendingUpload();render(<Host initial={draft([image(0),image(1)])}/>);await start(0,upload.fetcher)
  fireEvent.click(screen.getAllByRole('button',{name:'从此题移除图片引用'})[0])
  await upload.finish()
  expect(state().rawScoreFeedback!.rules[0].ranges[0].images).toEqual([image(1)])
 })
})
