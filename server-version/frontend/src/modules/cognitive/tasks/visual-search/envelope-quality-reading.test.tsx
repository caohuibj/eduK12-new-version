import React from 'react'
import {describe,it,expect,afterEach} from 'vitest'
import {render,screen,cleanup} from '@testing-library/react'
import records from '../../../../../../../docs/cognitive-library/onboarding-content-20261028/parallel-review/visual-search/representative-records.json'
import {SearchReport} from './SearchReport'
import {isSearchReport,type SearchReport as Report} from './generated/report'

afterEach(cleanup)
describe('visual search affected-envelope public reading',()=>{
 it.each(['zh','en'] as const)('preserves a limited record and hides the all-excluded performance in %s',language=>{
  const en=language==='en',partial=records.report as Report
  expect(isSearchReport(partial)).toBe(true)
  const view=render(<SearchReport report={partial} language={language}/>)
  expect(view.container.querySelectorAll('figure')).toHaveLength(1)
  expect(screen.getByText(en?/In 3 valid trials.*2 times/:/本次3个有效轮次中，你有2轮/)).toBeTruthy()
  expect(view.container.querySelector('figcaption')?.textContent).toContain('0/1')
  expect(view.container.querySelector('figcaption')?.textContent).toContain('0/0')
  expect(screen.getByText(en?/Only usable, fully completed/:/仅描述完整且有效的轮次/)).toBeTruthy()
  view.rerender(<SearchReport report={records.zeroReport as Report} language={language}/>)
  expect(screen.getAllByText('0 ms').length).toBeGreaterThan(0)
  view.rerender(<SearchReport report={records.markedOnlyReport as Report} language={language}/>)
  expect(view.container.querySelector('figure')).toBeNull()
  expect(view.container.querySelector('table')).toBeNull()
  expect(screen.getByText(en?/No usable, fully completed/:/尚无完整且有效的正式轮次可描述/)).toBeTruthy()
  expect(screen.queryByText(en?'A practical reminder':'一个可用的提醒')).toBeNull()
 })
})
