import React from 'react'
import {afterEach,describe,expect,it} from 'vitest'
import {cleanup,render,screen} from '@testing-library/react'
import {createHorizonSnapshot} from '../../../../../../backend/src/modules/cognitive/content-candidates/horizon-exploration/package'
import {scoreHorizon} from '../../../../../../backend/src/modules/cognitive/content-candidates/horizon-exploration/scorer'
import {projectHorizonReport} from '../../../../../../backend/src/modules/cognitive/content-candidates/horizon-exploration/report'
import {NativeContentReport} from './NativeHorizonRunner'

function frozenReport(){
 const session=createHorizonSnapshot('experience')
 const report=projectHorizonReport(scoreHorizon({session,config:session.config,randomSeed:'horizon-frozen-presentation-review',trials:[]}))
 return {schemaVersion:1 as const,testType:session.testType,engineVersion:session.engineVersion,scoringVersion:session.scoringVersion,configVersion:session.configVersion,configHash:session.configHash,protocolSignature:session.protocolSignature,profile:'experience' as const,state:report.state,reportDefinitionVersion:report.reportDefinitionVersion,presentationVersion:report.presentationVersion,participantPresentationVersion:'0.1.0',report}
}

afterEach(cleanup)
describe('Horizon saved native presentation identity',()=>{
 it('renders the known frozen native and participant presentation combination',()=>{
  render(<NativeContentReport snapshot={frozenReport()}/> )
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('本次暂时无法形成选择结论')).toBeTruthy()
 })
 it('rejects an unknown native presentation even when the task report is otherwise valid',()=>{
  render(<NativeContentReport snapshot={{...frozenReport(),presentationVersion:'next'}}/> )
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.queryByText('本次暂时无法形成选择结论')).toBeNull()
 })
 it('rejects an unknown participant presentation without replacing the frozen task presentation',()=>{
  const snapshot={...frozenReport(),participantPresentationVersion:'next'}
  render(<NativeContentReport snapshot={snapshot}/> )
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.queryByText('本次暂时无法形成选择结论')).toBeNull()
 })
})
