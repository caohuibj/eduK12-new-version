import React from 'react'
import {afterEach,describe,it,expect} from 'vitest'
import {render,screen,cleanup} from '@testing-library/react'
import reports from '../../../../../../docs/cognitive-library/onboarding-content-20261028/batch-2/evidence/report-public-fixtures.json'
import {BlinkReport} from '../tasks/attentional-blink/BlinkReport'
import {DualReport} from '../tasks/dual-arrow/DualReport'
import {GradReport} from '../tasks/gradcpt/GradReport'
import {HFReport} from '../tasks/hearts-flowers/HFReport'
import {HorizonReport} from '../tasks/horizon-exploration/HorizonReport'
import {SpatialReport} from '../tasks/precision-working-memory/SpatialReport'
import {SearchReport} from '../tasks/visual-search/SearchReport'
afterEach(cleanup)
const entries=[{key:'blink',Component:BlinkReport},{key:'dual',Component:DualReport},{key:'grad',Component:GradReport},{key:'hf',Component:HFReport},{key:'horizon',Component:HorizonReport},{key:'spatial',Component:SpatialReport},{key:'search',Component:SearchReport}] as const
describe('remaining public report visuals',()=>{
 it.each(entries)('$key uses actual public data in one chart, retains limited/missing state, and hides invalid performance',({key,Component})=>{
  const data=reports[key],View=Component as React.ComponentType<{report:any;language?:'zh'|'en'}>
  const {rerender}=render(<View report={data.complete}/>)
  expect(screen.getAllByRole('img')).toHaveLength(1)
  expect(screen.getByRole('img')).toHaveAccessibleDescription(/EDUK12.TOP/)
  expect(screen.getByText('查看图表数据')).toBeInTheDocument()
  if(key==='grad')expect(screen.getByRole('img').textContent).toContain('0%')
  if(key==='horizon')expect(document.body.textContent).toContain('-100')
  if(key==='dual')expect(document.body.textContent).toContain('-100')
  rerender(<View report={data.limited} language="en"/>)
  expect(screen.getAllByRole('img')).toHaveLength(1)
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(screen.getByText('View chart data')).toBeInTheDocument()
  if(['blink','dual','hf','spatial','search','horizon'].includes(key))expect(screen.getByRole('img').textContent).toContain('—')
  rerender(<View report={data.invalid}/>)
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.queryByText('查看图表数据')).toBeNull()
 })
})
