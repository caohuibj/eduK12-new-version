import React,{useState} from 'react'
import {render,screen,fireEvent} from '@testing-library/react'
import {describe,it,expect} from 'vitest'
import {ResearchCognitiveEditor} from './ResearchCognitiveEditor'
import type {CognitiveDraft} from './builder.types'
describe('Simon controlled authoring choice',()=>{
 it('switches exact protocols and resets old feedback keys instead of carrying Go metrics to Simon',()=>{
  function Host(){const [value,setValue]=useState<CognitiveDraft>({schemaVersion:1,templateKey:'gonogo-software-frame-v1',feedback:{mode:'DESCRIPTIVE',metricKeys:['hitRate'],release:'AFTER_FINAL'}});return <><ResearchCognitiveEditor value={value} onChange={setValue}/><output data-testid="draft">{JSON.stringify(value)}</output></>}
  render(<Host/>);fireEvent.change(screen.getByLabelText('任务模板'),{target:{value:'simon-software-frame-v1'}})
  expect(JSON.parse(screen.getByTestId('draft').textContent!)).toMatchObject({templateKey:'simon-software-frame-v1',feedback:{mode:'GENERAL',metricKeys:[]}})
  expect(screen.getByText(/20 个练习、100 个正式试次/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('反馈内容'),{target:{value:'DESCRIPTIVE'}})
  expect(screen.queryByText('Go 命中率（比例）')).toBeNull()
  expect(screen.getByText(/有符号/)).toBeTruthy()
 })
})
