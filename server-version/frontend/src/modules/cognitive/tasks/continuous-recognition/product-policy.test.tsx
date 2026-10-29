import React from 'react'
import {describe,it,expect} from 'vitest'
import {render,screen,cleanup} from '@testing-library/react'
import {isNativeRecognitionProjection} from './report-projection'
import {RecognitionReport} from './RecognitionReport'
import type {NativeReport} from './contracts'
function report():NativeReport{return{state:'interpretable',profile:'experience',reportVersion:'0.2.0',scoringVersion:'0.2.0',qualityRule:'product-session-descriptive-0.2.0',configHash:'a'.repeat(64),protocolSignature:'b'.repeat(64),assetManifestHash:'c'.repeat(64),hitRate:.8,falseAlarmRate:.25,correctedRecognitionRate:.55,targetHits:16,targetFalseAlarms:5,denominator:20,completeTargetPairs:20,plannedTargetPairs:20,receivedTrialCount:100,expectedTrialCount:100,reasons:[],canGenerateTakeHomeImage:false,logo:'EDUK12.TOP',interpretationScope:'this-session-descriptive-only'}}
describe('recognition descriptive product projection',()=>{
 it('accepts an exact host-bound normal report, never treats synthetic/pending host as licensed',()=>{
  const r=report(),bound={configHash:r.configHash!,protocolSignature:r.protocolSignature!,assetManifestHash:r.assetManifestHash!,formalCount:100,assetStatus:'authorized',synthetic:false}
  expect(isNativeRecognitionProjection(r,bound)).toBe(true)
  expect(isNativeRecognitionProjection(r,{...bound,synthetic:true})).toBe(false)
  expect(isNativeRecognitionProjection(r,{...bound,assetStatus:'pending'})).toBe(false)
  expect(isNativeRecognitionProjection(r,{...bound,configHash:'d'.repeat(64)})).toBe(false)
 })
 it('renders HR/FAR/CRR and actual denominator, including signed negative difference',()=>{
  const r=report();render(<RecognitionReport report={r}/>);expect(screen.getByText('本轮纳入计分的20张目标重复图片中，你认出了16张。')).toBeTruthy();expect(screen.getByText('目标重复图片识别率')).toBeTruthy();expect(screen.getByText('80% · 16/20')).toBeTruthy();expect(screen.getByText(/填充图及其短间隔重复单独记录，不进入这两个分母/)).toBeTruthy();cleanup()
  r.targetHits=6;r.targetFalseAlarms=10;r.hitRate=.3;r.falseAlarmRate=.5;r.correctedRecognitionRate=-.2
  render(<RecognitionReport report={r}/>);expect(screen.getByText('-20 个百分点')).toBeTruthy();cleanup()
  render(<RecognitionReport report={r} language="en"/>);expect(screen.getByText('Repeated target pictures identified')).toBeTruthy();expect(screen.getByText(/Filler pictures and their short-gap repeats are recorded separately and excluded from these two denominators/)).toBeTruthy();expect(screen.getByText('-20 percentage points')).toBeTruthy();cleanup()
 })
 it.each(['bad-rate','old-version','partial','missing-binding'])('does not expose inconsistent %s metrics',(kind)=>{
  const r=report();if(kind==='bad-rate')r.hitRate=.99;if(kind==='old-version')(r as any).scoringVersion='0.1.0';if(kind==='partial')r.completeTargetPairs=19;if(kind==='missing-binding')r.assetManifestHash=null
  expect(isNativeRecognitionProjection(r)).toBe(false);render(<RecognitionReport report={r}/>);expect(screen.queryByText('80% · 16/20')).toBeNull();cleanup()
 })
 it('limited/invalid retains null and hides performance without inventing zero',()=>{
  const r=report();r.state='limited';r.hitRate=null;r.falseAlarmRate=null;r.correctedRecognitionRate=null;r.targetHits=null;r.targetFalseAlarms=null;r.denominator=null;r.reasons=['incomplete-records']
  expect(isNativeRecognitionProjection(r)).toBe(true);render(<RecognitionReport report={r}/>);expect(screen.queryByText('目标重复图片识别率')).toBeNull();cleanup()
 })
})
