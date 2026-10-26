import React from 'react'
import { describe,it,expect } from 'vitest'
import { render,screen,fireEvent } from '@testing-library/react'
import { AntReportCard,type AntBoundReport } from './AntReportCard'
const configHash='a'.repeat(64),protocolSignature='b'.repeat(64)
function data():AntBoundReport{return {contextId:'product-report',configHash,protocolSignature,
 qualityFlags:{noInterpretableCondition:false,incompleteAccuracy:false,mixedInput:false,incompleteCue_none:false,
  incompleteFlanker_congruent:false,incompleteFlanker_incongruent:false,incompleteFlanker_neutral:false,
  unavailable_alerting:false,unavailable_orienting:false,unavailable_conflict:false},
 projection:{state:'interpretable',accuracy:1,reasons:[],description:'This session only',practicalTip:'Keep the device still.',
 cueRows:[{cue:'none',correct:12,total:12,accuracy:1,correctMeanRtMs:450,correctRtCount:12,input:'touch'}],
 flankerRows:[{flanker:'congruent',correct:16,total:16,accuracy:1,correctMeanRtMs:475,correctRtCount:16,input:'touch'},
  {flanker:'incongruent',correct:16,total:16,accuracy:1,correctMeanRtMs:425,correctRtCount:16,input:'touch'},
  {flanker:'neutral',correct:16,total:16,accuracy:1,correctMeanRtMs:525,correctRtCount:16,input:'touch'}],
 differences:[{key:'alerting',valueMs:-100,input:'touch',firstCorrectCount:12,secondCorrectCount:12},
  {key:'orienting',valueMs:0,input:'touch',firstCorrectCount:12,secondCorrectCount:12},
  {key:'conflict',valueMs:-50,input:'touch',firstCorrectCount:16,secondCorrectCount:16}]}}}
const renderCard=(d=data(),language:'zh'|'en'='zh')=>render(<AntReportCard data={d} contextId="product-report" configHash={configHash} protocolSignature={protocolSignature} language={language}/>)
describe('ANT participant descriptive feedback without normative requirements',()=>{
 it.each(['zh','en'] as const)('shows approved conditions, actual denominators and signed differences in %s',language=>{
  const {container}=renderCard(data(),language),en=language==='en'
  fireEvent.click(screen.getByText(en?'How the side arrows differed':'看看两侧箭头不同时的记录'))
  expect(screen.getByRole('rowheader',{name:en?'Side arrows point the same way':'两侧方向相同'})).toBeInTheDocument()
  expect(screen.getByRole('rowheader',{name:en?'Side arrows point the other way':'两侧方向相反'})).toBeInTheDocument()
  expect(container.textContent).toContain('16 / 16');expect(container.textContent).toContain('475 ms')
  expect(container.textContent).toContain('-50 ms');expect(container.textContent).toContain('0 ms')
  expect(container.textContent).not.toContain('百分位');expect(container.textContent).not.toContain('优秀')
  expect(screen.queryAllByRole('img')).toHaveLength(0)
 })
 it('limited/interrupted flankers stay hidden independently and invalid hides all new rows',()=>{
  const d=data();d.projection.state='limited';d.qualityFlags.incompleteFlanker_incongruent=true
  d.qualityFlags.unavailable_conflict=true
  const {rerender}=renderCard(d)
  fireEvent.click(screen.getByText('看看两侧箭头不同时的记录'))
  expect(screen.queryByRole('rowheader',{name:'两侧方向相反'})).toBeNull()
  expect(screen.getByRole('rowheader',{name:'两侧方向相同'})).toBeInTheDocument()
  expect(screen.queryByText(/-50 ms/)).toBeNull()
  d.projection.state='invalid';d.qualityFlags.noInterpretableCondition=true
  rerender(<AntReportCard data={d} contextId="product-report" configHash={configHash} protocolSignature={protocolSignature}/>)
  expect(screen.queryByRole('table')).toBeNull();expect(screen.queryByText(/475 ms/)).toBeNull()
 })
 it('mixed input keeps factual correct counts but hides all new RTs and differences',()=>{
  const d=data();d.qualityFlags.mixedInput=true;d.projection.state='limited'
  const {container}=renderCard(d);fireEvent.click(screen.getByText('看看两侧箭头不同时的记录'))
  expect(container.textContent).toContain('16 / 16');expect(container.textContent).not.toContain('475 ms')
  expect(container.textContent).not.toContain('-100 ms');expect(container.textContent).not.toContain('-50 ms')
 })
})
