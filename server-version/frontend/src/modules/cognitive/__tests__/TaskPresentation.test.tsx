import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import CognitiveSingleTaskReportCard from '../CognitiveSingleTaskReportCard'
import CognitiveV2ReportCard from '../CognitiveV2ReportCard'
import type { CognitiveSingleTaskReport, CognitiveV2Report } from '../types'
import { cognitiveRunnerEntries } from '../generated/runners'
import identities from '../../../../../backend/src/modules/cognitive/generated/identities.json'
afterEach(cleanup)
const metric = { key:'correctCount',label:'Execution label',participantLabel:'Unknown task successes',presentationVersion:'1.0.0',value:5,formatted:'5' }
const method = {testType:'TEST_ONBOARDING_UNKNOWN_V1',engineVersion:'1.0.0',scoringVersion:'1.0.0',configVersion:'1.0.0',profile:'standard' as const,protocolSignature:'test'}
const single: CognitiveSingleTaskReport = {testType:method.testType,profile:'standard',profileLabel:null,title:'Unknown',interpretable:true,qualityState:'interpretable',qualityFlags:[],interpretationSummary:null,headline:metric,productIndex:null,showProductIndex:false,primaryMetrics:[],secondaryMetrics:[],caveats:[],practicalTips:[],method,disclaimer:'test',reference:null}
const v2: CognitiveV2Report = {title:'Unknown',qualityState:'interpretable',conclusion:'test',headline:[{...metric,category:'test',unit:'count',direction:'higher_is_better'}],user:[],detail:[],quality:[],method,disclaimer:'test',practicalTips:[]}
describe('task-owned frontend presentation',()=>{
  it('matches the generated runner identity projection with actual exports',()=>{
    expect(cognitiveRunnerEntries.map(e=>`${e.testType}/${e.engineVersion}`)).toEqual(identities.runners.map(e=>`${e.testType}/${e.engineVersion}`))
  })
  it.each(['single','v2'])('does not apply a historical same-key label or explanation to a versioned %s report',(kind)=>{
    render(kind==='single'?<CognitiveSingleTaskReportCard report={single}/>:<CognitiveV2ReportCard report={v2}/>)
    expect(screen.getByText('Unknown task successes')).toBeInTheDocument()
    expect(screen.queryByText('正确比较次数')).not.toBeInTheDocument()
    expect(screen.queryByText(/本次正式计时内完成并判断正确/)).not.toBeInTheDocument()
  })
  it('preserves historical labels on an unversioned report',()=>{
    render(<CognitiveSingleTaskReportCard report={{...single,headline:{key:'correctCount',label:'old',value:5,formatted:'5'}}}/>)
    expect(screen.getByText('正确比较次数')).toBeInTheDocument()
  })
})
