import {describe,it,expect,vi} from 'vitest'
import type {EducationReportApi} from '../components/education-tools/EducationScalePersonalReport'
import type {CompositeCurrentItem} from '../modules/composite/types'
import {createTeacherCognitiveClient,createTeacherSituationalClient,createTeacherAssessmentMediaTransport} from './assessmentRuntime.client'

describe('Teacher frozen runtime transport (synthetic API)',()=>{
 it('uses only the injected Teacher API for Cognitive read, FINAL and binary assets',async()=>{
  const image=new Blob(['image'],{type:'image/png'}),api=vi.fn(async(path:string)=>path.includes('/assets/')?image:{sessionId:'session'})
  const client=createTeacherCognitiveClient(api as EducationReportApi,'parent','item','session')
  await client.getSession('session')
  const payload={submissionId:'final',attemptEpoch:1,definitionHash:'hash',trials:[{}]}
  await client.submitFinal!('session',payload)
  expect(await client.loadAsset!('session','asset')).toBe(image)
  expect(api.mock.calls.map(call=>call[0])).toEqual([
   '/assessment-composite-attempts/parent/items/item/cognitive/session',
   '/assessment-composite-attempts/parent/items/item/cognitive/session/submit',
   '/assessment-composite-attempts/parent/items/item/cognitive/session/assets/asset/content',
  ])
  expect(api).toHaveBeenLastCalledWith(expect.any(String),'GET',undefined,{responseType:'blob'})
  const before=api.mock.calls.length
  await expect(client.getSession('foreign')).rejects.toThrow()
  await expect(client.submitFinal!('foreign',payload)).rejects.toThrow()
  await expect(client.appendTrial('session',0,{})).rejects.toThrow('FINAL')
  await expect(client.completeSession('session')).rejects.toThrow('FINAL')
  expect(api.mock.calls.length).toBe(before)
 })
 it('binds SJT resume/result/FINAL to one parent slot and forbids standalone start',async()=>{
  const api=vi.fn(async()=>({attemptId:'child'})),client=createTeacherSituationalClient(api as EducationReportApi,'parent','slot','child')
  await client.resume('child');await client.result('child')
  await expect(client.resume('foreign')).rejects.toThrow()
  await expect(client.start({instrumentKey:'another'})).rejects.toThrow()
  expect(api.mock.calls).toEqual([
   ['/assessment-composite-attempts/parent/items/slot/situational/child'],
   ['/assessment-composite-attempts/parent/items/slot/situational/child'],
  ])
 })
 it.each(['SCALE','FORM_SECTION'] as const)('maps only the current %s unit image path',async type=>{
  const image=new Blob(['fixture']),api=vi.fn(async()=>image)
  const item={id:'slot',type,position:0,required:true,...(type==='FORM_SECTION'?{formSectionId:'section'}:{})} as CompositeCurrentItem
  const client=createTeacherAssessmentMediaTransport(api as EducationReportApi,'parent',item)
  const unit=type==='SCALE'?'/items/slot/scale/':'/form-sections/section/'
  const input='/api/composite-assessments/attempts/parent'+unit+'assets/asset/content'
  expect(await client.loadImage(input)).toBe(image)
  expect(api).toHaveBeenCalledWith('/assessment-composite-attempts/parent'+unit+'assets/asset/content','GET',undefined,{responseType:'blob'})
  for(const path of [input.replace('/parent/','/foreign/'),input.replace('/slot/','/foreign/').replace('/section/','/foreign/'),
   input.replace('/asset/','/%2e%2e/'),input+'?redirect=/api/cognitive',input.replace('/asset/','/%252f/'),
   'https://training.example'+input,'/api/cognitive/sessions/session/assets/asset/content']){
   await expect(client.loadImage(path)).rejects.toThrow()
  }
  expect(api).toHaveBeenCalledTimes(1)
 })
})
