import { useState } from 'react'
import { fireEvent,render,screen } from '@testing-library/react'
import { describe,expect,it } from 'vitest'
import { SurveyFlowStudio } from './SurveyFlowStudio'
import type { FlowDraft } from './flow.client'
const initial:FlowDraft={schemaVersion:1,embeddedData:[],blocks:[
  {blockKey:'a',kind:'INSTRUMENT',instrumentKey:'tool-a'},
  {blockKey:'b',kind:'INSTRUMENT',instrumentKey:'tool-b'},
],experiment:{experimentKey:'exp',linkedPolicy:'KEEP_LINKED',groups:[
  {groupKey:'a',weight:1,materialTitle:'A材料',materialBody:'A正文'},
  {groupKey:'b',weight:3,materialTitle:'B材料',materialBody:'B正文'},
]}}
function Editor(){
  const [value,onChange]=useState<FlowDraft|null>(initial)
  return <><SurveyFlowStudio value={value} onChange={onChange} collectionMode="LINKED_WAVES"
    questions={[]} selectedIds={['a','b']} tools={[
      {id:'a',instrumentKey:'tool-a',title:'工具甲',kind:'FORM'},
      {id:'b',instrumentKey:'tool-b',title:'工具乙',kind:'FORM'},
    ]}/><output aria-label="draft">{JSON.stringify(value)}</output></>
}
describe('A/B questionnaire variant editor',()=>{
  it('keeps legacy material design until explicitly selected, then normalizes weights and forces per-wave randomization',()=>{
    render(<Editor/>)
    expect(screen.queryByLabelText('子版本名称')).not.toBeInTheDocument()
    expect(screen.getByLabelText('跨波次分组政策')).toHaveValue('KEEP_LINKED')
    fireEvent.change(screen.getByLabelText('实验设计方式'),{target:{value:'QUESTIONNAIRE_VARIANTS'}})
    expect(screen.getByLabelText('跨波次分组政策')).toBeDisabled()
    expect(screen.getByLabelText('跨波次分组政策')).toHaveValue('RERANDOMIZE')
    expect(screen.getByText('分配概率：25.0%')).toBeInTheDocument()
    expect(screen.getByText('分配概率：75.0%')).toBeInTheDocument()
    expect(screen.getByText(/不保证精确人数或配额/)).toBeInTheDocument()
    expect(screen.getAllByLabelText('子版本名称')).toHaveLength(2)
  })
  it('edits arm membership independently and warns about uncovered tools and empty arms',()=>{
    render(<Editor/>)
    fireEvent.change(screen.getByLabelText('实验设计方式'),{target:{value:'QUESTIONNAIRE_VARIANTS'}})
    const memberships=screen.getAllByRole('checkbox',{name:'工具甲（tool-a）'})
    fireEvent.click(memberships[0])
    expect(memberships[1]).toBeChecked()
    fireEvent.click(memberships[1])
    expect(screen.getByText('以下工具尚未分配给任何子版本：工具甲')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('checkbox',{name:'工具乙（tool-b）'})[0])
    expect(screen.getByText('每个子版本至少需要一个研究工具。')).toBeInTheDocument()
    const draft=JSON.parse(screen.getByLabelText('draft').textContent!) as FlowDraft
    expect(draft.experiment!.groups[0].instrumentKeys).toEqual([])
    expect(draft.experiment!.groups[1].instrumentKeys).toEqual(['tool-b'])
  })
})
