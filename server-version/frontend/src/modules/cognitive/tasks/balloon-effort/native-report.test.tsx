import React from 'react'
import {afterEach,describe,expect,it} from 'vitest'
import {cleanup,render,screen,within} from '@testing-library/react'
import {NativeContentReport} from './NativeEffortRunner'
import type {NativePublicReportSnapshot} from '../../types'
import saved from '../../../../../../../docs/cognitive-library/onboarding-content-20261028/evidence/effort-synthetic-public-reports.json'

afterEach(cleanup)
type SavedReport=typeof saved.complete|typeof saved.limited|typeof saved.invalid
const snapshot=(report:SavedReport):NativePublicReportSnapshot&{report:SavedReport}=>({schemaVersion:1,...report,report} as NativePublicReportSnapshot&{report:SavedReport})
describe('effort saved native report consumer',()=>{
 it('reads all three frozen public states and preserves zero versus missing at the native entry',()=>{
  const view=render(<NativeContentReport snapshot={snapshot(saved.complete)}/> )
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('哪些条件下')
  expect(within(screen.getByRole('img')).getByText('0%')).toBeInTheDocument()
  view.rerender(<NativeContentReport snapshot={snapshot(saved.limited)}/> )
  expect(screen.getByRole('status')).toHaveTextContent('仅描述本次可用部分')
  expect(within(screen.getByRole('img')).getAllByText('—')).toHaveLength(2)
  view.rerender(<NativeContentReport snapshot={snapshot(saved.invalid)}/> )
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('本次暂时无法形成选择结论')
  expect(screen.queryByText('实际执行另看')).toBeNull()
 })
 it('rejects mismatched saved identity and never renders arbitrary internal metric fields',()=>{
  const valid=snapshot(saved.complete),view=render(<NativeContentReport snapshot={{...valid,configHash:'a'.repeat(64)}}/> )
  expect(screen.getByRole('alert')).toHaveTextContent('已保存公开报告暂时无法核对')
  const withInternal={...valid,report:{...valid.report,choicesByEffort:{sentinel:'PRIVATE_RESEARCH_SENTINEL'},reportBinding:'PRIVATE_BINDING_SENTINEL'}}
  view.rerender(<NativeContentReport snapshot={withInternal}/> )
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('哪些条件下')
  expect(view.container.textContent).not.toContain('PRIVATE_')
 })
})
