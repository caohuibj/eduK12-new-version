import {render,screen} from '@testing-library/react'
import {expect,it} from 'vitest'
import {SurveyDeclaredReportView,type SurveyDeclaredReport} from '../../survey/SurveyDeclaredReportView'

const report = (band:string):SurveyDeclaredReport => ({
  generatorVersion:'DECLARATIVE_REPORT_V1', illustrationKey:'who5-fortnight-v1',
  blocks:[{type:'REFERENCE_BAND',metricKey:'raw_total',referenceKind:'criterion_threshold',bandKey:band,text:'近况反馈'}],
})
it('shows each WHO-5 illustration only for the corresponding returned criterion band', () => {
  const {rerender}=render(<SurveyDeclaredReportView report={report('who5_under_13')}/>)
  expect(screen.getAllByRole('img')).toHaveLength(1)
  expect(screen.getByAltText(/长椅/)).toBeInTheDocument()
  rerender(<SurveyDeclaredReportView report={report('who5_from_13')}/>)
  expect(screen.getAllByRole('img')).toHaveLength(1)
  expect(screen.getByAltText(/便笺/)).toBeInTheDocument()
  const wrong = {...report('who5_from_13'), illustrationKey:'chinese-self-concept-door-v1'}
  rerender(<SurveyDeclaredReportView report={wrong}/>)
  expect(screen.queryByAltText(/便笺/)).toBeNull()
  rerender(<SurveyDeclaredReportView report={{...report('who5_from_13'),blocks:[]}}/>)
  expect(screen.queryByRole('img')).toBeNull()
})
