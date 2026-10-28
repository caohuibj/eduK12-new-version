import React from 'react'
import {afterEach,describe,it,expect} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import archive from '../../../../../../../docs/cognitive-library/onboarding-content-20261028/batch-3/ant-browser/archived-fixture.json'
import {NativeContentReport} from './NativeAntRunner'
import type {NativePublicReportSnapshot} from '../../types'

function saved(current=false){
 const value=structuredClone(archive[0].authority.resultSnapshot.report.nativeReport) as NativePublicReportSnapshot
 if(current){value.participantPresentationVersion='1.0.0';(value.report as Record<string,unknown>).presentationVersion='1.0.0'}
 return value
}
afterEach(cleanup)
describe('ANT native report frozen snapshot consumer',()=>{
 it.each([false,true])('retains the existing %s presentation combination without rewriting saved bytes',current=>{
  const snapshot=saved(current),before=JSON.stringify(snapshot)
  render(<NativeContentReport snapshot={snapshot}/> )
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('本轮答对比例')).toBeTruthy()
  expect(JSON.stringify(snapshot)).toBe(before)
 })
 it.each([
  ['configHash','a'.repeat(64)],['protocolSignature','b'.repeat(64)],['state','invalid'],
  ['presentationVersion','next'],['participantPresentationVersion','next'],['engineVersion','1.0.0'],['configVersion','1.0.0'],
 ] as const)('rejects mismatched or unsupported outer %s before exposing performance', (key,value)=>{
  const snapshot={...saved(),[key]:value} as NativePublicReportSnapshot
  render(<NativeContentReport snapshot={snapshot}/> )
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.queryByText('本轮答对比例')).toBeNull()
 })
})
