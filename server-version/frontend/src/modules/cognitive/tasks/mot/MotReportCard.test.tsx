import React from 'react'
import { describe,it,expect } from 'vitest'
import { render,screen } from '@testing-library/react'
import { MotReportCard } from './MotReportCard'
import type { MotPublicResult } from './generated/protocol'

const result=(state:'interpretable'|'limited'|'invalid'='interpretable'):MotPublicResult=>({
 quality:{state,flags:{unreliableSpeed1:false,unreliableSpeed4:state!=='interpretable',unreliableSpeed8:false},reasons:[]},
 metrics:{meanTrackedTargets:3.4,meanTargetsSpeed1:4.2,meanTargetsSpeed4:3.4,meanTargetsSpeed8:2.6,
 validTrialsSpeed1:15,totalTrialsSpeed1:15,validTrialsSpeed4:15,totalTrialsSpeed4:15,
 validTrialsSpeed8:15,totalTrialsSpeed8:15,secretInternal:99999},
})
describe('MOT user report gate',()=>{
 it('renders allowed descriptive values and effective denominators without an ability score',()=>{
  const {container}=render(<MotReportCard result={result()} profile="research"/>)
  expect(screen.getByRole('img')).toBeInTheDocument()
  expect(screen.getByRole('columnheader',{name:'速度'})).toBeInTheDocument()
  expect(container.querySelector('.mot-number')?.textContent).toContain('3.4')
  expect(container.textContent).not.toContain('99999')
  expect(container.textContent).not.toContain('百分位')
  expect(screen.getAllByRole('img')).toHaveLength(1)
  expect(screen.getByRole('img').textContent).toContain('EDUK12.TOP')
 })
 it('hides affected internal metrics and the aggregate in a limited result',()=>{
  const {container}=render(<MotReportCard result={result('limited')} profile="research"/>)
  expect(screen.getByRole('heading',{name:'部分记录可以查看'})).toBeInTheDocument()
  expect(screen.queryByRole('rowheader',{name:'中速'})).not.toBeInTheDocument()
  expect(container.querySelector('.mot-number')).not.toBeInTheDocument()
  expect(container.textContent).not.toContain('3.4')
  expect(screen.queryByRole('img')?.getAttribute('aria-label')??'').not.toContain('3.4')
  expect(screen.getByRole('rowheader',{name:'快速'})).toBeInTheDocument()
 })
 it('does not show performance values when all records are invalid, even if internal numbers exist',()=>{
  const {container}=render(<MotReportCard result={result('invalid')} profile="experience"/>)
  expect(screen.getByRole('heading',{name:'这次记录暂时无法解读'})).toBeInTheDocument()
  expect(container.querySelector('.mot-number')).toBeNull()
  expect(container.querySelectorAll('.mot-report-rows')).toHaveLength(0)
  expect(container.textContent).not.toContain('3.4')
  expect(screen.queryByRole('img')?.getAttribute('aria-label')??'').not.toContain('3.4')
  expect(container.textContent).not.toContain('4.2')
 })
 it('allows a concise text report without a decorative image',()=>{
  render(<MotReportCard result={result()} profile="research" showTakeHome={false}/>)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
 })
 it('fails closed when quality flags or the headline value are missing',()=>{
  const data=result();data.quality.flags={};data.metrics.meanTrackedTargets=null
  const {container}=render(<MotReportCard result={data} profile="experience"/>)
  expect(container.querySelector('.mot-number')).toBeNull()
  expect(screen.getByRole('img').textContent).not.toContain('0 / 5')
  expect(screen.getByRole('img').textContent).not.toContain('4.2')
 })
 it('supports English and preserves a genuine zero in the experience version',()=>{
  const data=result()
  data.metrics.meanTrackedTargets=0
  data.metrics.meanTargetsSpeed1=0
  data.metrics.validTrialsSpeed1=3;data.metrics.totalTrialsSpeed1=3
  const {container}=render(<MotReportCard result={data} profile="experience" language="en"/>)
  expect(screen.getByRole('img')).toBeInTheDocument()
  expect(container.querySelector('.mot-number')?.textContent).toMatch(/^0/)
  expect(container.textContent).toContain('only 3 trials per speed')
  expect(container.textContent).toContain('3 / 3')
 })
})
