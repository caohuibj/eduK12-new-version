import {render,screen,within} from '@testing-library/react'
import {describe,expect,it} from 'vitest'
import {SelectedToolOutline} from './SelectedToolOutline'

describe('SelectedToolOutline read-only presentation',()=>{
  it('shows fixed metadata without mutation or execution-order controls',()=>{
    render(<SelectedToolOutline className="hs-selected-tool-outline" items={[
      {id:'track-a',title:'已配置表单',kind:'FORM',version:'sha256:fixed-v1'},
      {id:'track-b',title:'已配置量表',kind:'SCALE',version:'2'},
    ]}/>)
    const outline=screen.getByRole('region',{name:'已选工具大纲'})
    expect(within(outline).getByText('已配置表单')).toBeInTheDocument()
    expect(within(outline).getByText('FORM · 固定版本：sha256:fixed-v1')).toBeInTheDocument()
    expect(within(outline).getAllByRole('listitem')).toHaveLength(2)
    expect(within(outline).queryByRole('button')).not.toBeInTheDocument()
    expect(within(outline).getByText(/不代表强制作答顺序/)).toBeInTheDocument()
  })
  it('distinguishes unavailable details from a confirmed empty configuration',()=>{
    const {rerender}=render(<SelectedToolOutline items={undefined}/>)
    expect(screen.getByRole('status')).toHaveTextContent('工具明细暂不可用')
    expect(screen.queryByText('尚未配置工具。')).not.toBeInTheDocument()
    rerender(<SelectedToolOutline items={[]}/>)
    expect(screen.getByText('尚未配置工具。')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
