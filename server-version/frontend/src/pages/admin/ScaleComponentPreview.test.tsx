import {describe,it,expect} from 'vitest'
import {render,screen} from '@testing-library/react'
import ScaleComponentPreview from './ScaleComponentPreview'
import type {ComponentPreview} from '../../api/scaleComponentImport'
import {SCALE_BATCH_TEMPLATE} from '../../../../backend/src/modules/scale/component-import/synthetic-template'

describe('exact component preview presentation',()=>{
 it('shows the selected P version and avoids presenting legacy prose as a custom report',()=>{
  const definition=JSON.parse(JSON.stringify(SCALE_BATCH_TEMPLATE.sources[0].executable.definition))
  definition.referencePolicy={type:'declared',selections:[{scoreKey:'total',referenceKind:'criterion_threshold',referenceVersion:'P1'}]}
  const ref=(version:string,label:string)=>({referenceVersion:version,entries:[{scoreKey:'total',referenceKind:'criterion_threshold',statistics:{thresholds:[{key:'band',label,minInclusive:0,maxInclusive:1}]}}]})
  const preview:ComponentPreview={draftId:'synthetic',revision:1,previewHash:'a'.repeat(64),configurationName:'合成配置',baseCombination:null,changedParts:['REPORT'],inheritedParts:['CONTENT','PARAMETERS'],blockers:[],reviewNotice:'合成核对',
   triplet:{combinationHash:'b'.repeat(64),definition,template:null},parts:{PARAMETERS:{version:'P1',hash:'c'.repeat(64),payload:{references:[ref('P1','已选分档'),ref('P2','未选分档')]}},REPORT:{version:'1.0.0',hash:'d'.repeat(64),payload:definition.report}}}
  const {rerender}=render(<ScaleComponentPreview preview={preview}/>)
  expect(screen.getByText('已选分档')).toBeVisible();expect(screen.queryByText('未选分档')).not.toBeInTheDocument()
  expect(screen.getByText(definition.report.interpretations[0].summary)).toBeVisible()
  const template={blocks:[{type:'TEXT' as const,text:'自定义结构实际内容'}],limitations:[]}
  rerender(<ScaleComponentPreview preview={{...preview,triplet:{...preview.triplet!,template},parts:{...preview.parts,REPORT:{...preview.parts.REPORT!,payload:{definition:definition.report,template}}}}}/>)
  expect(screen.getByText(/此报告使用自定义结构/)).toBeVisible()
  expect(screen.queryByText(definition.report.interpretations[0].summary)).not.toBeInTheDocument()
 })
})
