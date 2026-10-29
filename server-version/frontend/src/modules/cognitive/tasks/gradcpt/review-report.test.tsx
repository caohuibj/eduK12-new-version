import React from 'react'
import {afterEach,describe,expect,it} from 'vitest'
import {cleanup,render,screen,within} from '@testing-library/react'
import {NativeContentReport} from './NativeGradRunner'
import {GradReport} from './GradReport'
import {isGradReport,type GradReport as Report} from './generated/report'
import type {NativePublicReportSnapshot} from '../../types'
import records from '../../../../../../../docs/cognitive-library/onboarding-content-20261028/parallel-review/gradcpt/representative-records.json'
import prior from '../../../../../../../docs/cognitive-library/onboarding-content-20261028/batch-2/evidence/report-public-fixtures.json'

afterEach(cleanup)
const report=(name:string):Report=>{
 const value=records.cases.find(c=>c.spec.name===name)?.report
 if(!isGradReport(value))throw Error('Invalid synthetic review report')
 return value
}
const native=(r:Report):NativePublicReportSnapshot=>({schemaVersion:1,...r,configVersion:'0.1.0',report:r})
describe('gradCPT continuous record public reading',()=>{
 it('keeps presented and settled images distinct through the saved native consumer',()=>{
  const view=render(<NativeContentReport snapshot={native(report('first-picture-closed-successor-open'))}/> )
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('本次暂时无法形成表现结论')
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByText(/完整呈现 \/ 计划/)).toHaveTextContent('1 / 100')
  view.rerender(<NativeContentReport snapshot={native(report('first-picture-settled-open-response'))}/> )
  expect(screen.getByRole('status')).toHaveTextContent('仅描述实际呈现且反应归属已确定的部分')
  expect(screen.getByText(/本次1张城市中有0张漏按/)).toBeInTheDocument()
  expect(within(screen.getByRole('img')).getByText('0%')).toBeInTheDocument()
  expect(within(screen.getByRole('img')).getByText('—')).toBeInTheDocument()
  if(!isGradReport(prior.grad.complete))throw Error('Invalid retained complete report')
  view.rerender(<NativeContentReport snapshot={native(prior.grad.complete)}/> )
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('这次，你怎样跟上连续图片')
 })
 it('preserves signed statistics, zero variation and unavailable response times in both languages',()=>{
  const view=render(<GradReport report={report('negative-dprime')}/> )
  expect(screen.getByText(/d′：/)).toHaveTextContent('d′：-0.67')
  expect(screen.getByText(/正确城市均值 \/ 样本标准差 \/ CV/)).toHaveTextContent('— ms / — ms / —')
  view.rerender(<GradReport report={report('negative-criterion-zero-omissions')} language="en"/> )
  expect(screen.getByText(/d′：/)).toHaveTextContent('criterion：-0.34')
  expect(screen.getByText(/Correct-city mean \/ sample SD \/ CV/)).toHaveTextContent('721 ms / 0 ms / 0')
  expect(screen.getByText('0 / 2')).toBeInTheDocument()
 })
 it('explains why assigned input counts may include pictures outside settled performance denominators',()=>{
  const partial=report('first-picture-settled-open-response')
  expect(partial.inputResponses.keyboard).toBe(2)
  expect(partial.statistics).toMatchObject({city:1,hits:1,mountain:0})
  const view=render(<GradReport report={partial}/> )
  expect(screen.getByText(/已归属的输入（含未完成部分）/)).toHaveTextContent('键盘 2')
  expect(screen.getByText(/中断时，尚未结束的图片回应也可能计入这里/)).toHaveTextContent('上方表现只使用反应归属窗口已闭合的图片')
  view.rerender(<GradReport report={partial} language="en"/> )
  expect(screen.getByText(/Assigned inputs \(including unfinished parts\)/)).toHaveTextContent('keyboard 2')
  expect(screen.getByText(/After an interruption, this count may include responses to unfinished pictures/)).toHaveTextContent('Performance above uses only pictures with closed response-assignment windows')
 })
})
