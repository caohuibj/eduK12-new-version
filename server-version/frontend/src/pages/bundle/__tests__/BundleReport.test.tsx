import { describe,it,expect,vi } from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import BundleReport from '../BundleReport'
vi.mock('../../../api/client',()=>({default:{get:vi.fn(),post:vi.fn()}}))
const base:any={schemaVersion:1,snapshotFamily:'ASSESSMENT_BUNDLE',analysisId:'fixture',status:'READY',purpose:'INITIAL',factsHash:'hash',definitionHash:'hash',retryCount:1,reportDefinition:{title:'陌生包',sections:{summary:'摘要',quality:'质量',evidence:'证据',limitations:'限制'}},view:{identity:{bundleKey:'unknown'},quality:{overall:'interpretable'},evidence:[],limitations:[],blocks:[]}}
describe('generic declarative report rendering',()=>{
  it('renders an unknown package without HTML execution or a package branch',()=>{
    const report=structuredClone(base);report.view.blocks=[{blockId:'new',kind:'conclusions',title:'新结构',conclusions:[{ruleId:'rule',text:'<script>danger()</script>'}]}]
    const {container}=render(<BundleReport report={report} attemptId="a" staff={false} reload={()=>{}} />)
    expect(screen.getByText('新结构')).toBeInTheDocument();expect(screen.getByText('<script>danger()</script>')).toBeInTheDocument();expect(container.querySelector('script')).toBeNull()
  })
  it('reports unsupported blocks explicitly',()=>{
    const report=structuredClone(base);report.view.blocks=[{blockId:'new',kind:'unsupported'}]
    render(<BundleReport report={report} attemptId="a" staff={false} reload={()=>{}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('报告结构不受支持')
  })
  it('exports a cross-respondent report through its authorized saved-report reader',async()=>{
    const download=vi.fn(async()=>structuredClone(base))
    const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL
    URL.createObjectURL=vi.fn(()=> 'blob:synthetic');URL.revokeObjectURL=vi.fn()
    const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
    try {
      render(<BundleReport report={structuredClone(base)} attemptId="" staff={false} reload={()=>{}} downloadReport={download} />)
      fireEvent.click(screen.getByRole('button',{name:'导出综合报告 JSON'}))
      await waitFor(()=>expect(download).toHaveBeenCalledTimes(1))
      expect((await import('../../../api/client')).default.get).not.toHaveBeenCalled()
    } finally {click.mockRestore();URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke}
  })
})
