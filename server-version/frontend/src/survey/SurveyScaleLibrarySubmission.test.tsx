import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SurveyScaleLibrarySubmission } from './SurveyScaleLibrarySubmission'
const mocks=vi.hoisted(()=>({use:vi.fn(),submit:vi.fn(),withdraw:vi.fn(),refresh:vi.fn()}))
vi.mock('../components/scale-governance/useScaleLibrarySubmission',()=>({useScaleLibrarySubmission:mocks.use}))
vi.mock('../components/scale-governance/ScaleLibraryMediaPreview',()=>({ScaleLibraryMediaPreview:()=> <span>受控附件预览</span>}))
const emptyManifest={schemaVersion:1,releaseIds:['frozen-1'],items:[],manifestHash:'empty-manifest'}
afterEach(()=>{cleanup();vi.clearAllMocks()})
function fixture(mediaManifest:unknown=emptyManifest){
  mocks.use.mockReturnValue({source:{sourceId:'scale',product:'SURVEY',releases:[
    {mediaManifest,defaults:{title:'我的量表',author:'作者',copyright:'',applicability:'研究',scoringDescription:'求和',reportDescription:'描述性报告'},releaseId:'frozen-1',title:'我的量表',version:'1',contentHash:'hash1',eligible:true},
    {releaseId:'blocked-2',title:'我的量表',version:'2',contentHash:'hash2',eligible:false,unavailableReason:'来源授权不允许共享'},
  ],defaults:{title:'我的量表',author:'作者',copyright:'',applicability:'研究',scoringDescription:'求和',reportDescription:'描述性报告'}},
  submissions:[],loading:false,busy:false,error:'',status:'',refresh:mocks.refresh,submit:mocks.submit,withdraw:mocks.withdraw})
  render(<SurveyScaleLibrarySubmission sourceId="scale"/>)
}
describe('Survey exact-version library application',()=>{
  it('requires an exact release and missing rights metadata, retaining existing defaults as read-only',()=>{
    fixture()
    expect(mocks.use).toHaveBeenCalledWith('SURVEY','scale')
    expect(screen.getByLabelText('量表名称')).toHaveValue('')
    expect(screen.getByLabelText('量表名称')).toBeDisabled()
    expect(screen.getByRole('option',{name:'我的量表 · 2 · 不可申请'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'提交此版本的入库申请'})).toBeDisabled()
    fireEvent.change(screen.getByLabelText('申请的测量发布版本'),{target:{value:'frozen-1'}})
    expect(screen.getByLabelText('量表名称')).toHaveAttribute('readonly')
    fireEvent.change(screen.getByLabelText('版权与共享许可'),{target:{value:'本人原创，允许按授权使用'}})
    fireEvent.click(screen.getByRole('button',{name:'提交此版本的入库申请'}))
    expect(mocks.submit).toHaveBeenCalledWith('frozen-1',expect.objectContaining({title:'我的量表',copyright:'本人原创，允许按授权使用'}))
    expect(screen.getByText(/批准入库不代表全员可用/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('申请的测量发布版本'),{target:{value:''}})
    fireEvent.change(screen.getByLabelText('申请的测量发布版本'),{target:{value:'frozen-1'}})
    expect(screen.getByLabelText('版权与共享许可')).toHaveValue('')
  })
  it('requires consent bound to the exact image/video manifest and resets it on selection changes',()=>{
    fixture({schemaVersion:1,releaseIds:['frozen-1'],manifestHash:'media-hash',items:[{assetId:'asset-image',assetVersion:'1',contentHash:'image-hash',mimeType:'image/png',sizeBytes:123,usages:['题目图片'],rights:'AUTHOR_SHARED_FOR_BOUND_SCALE',dependencyReleaseIds:[]}]})
    fireEvent.change(screen.getByLabelText('申请的测量发布版本'),{target:{value:'frozen-1'}})
    fireEvent.change(screen.getByLabelText('版权与共享许可'),{target:{value:'本人原创'}})
    expect(screen.getByText('附件：asset-image · 版本 1')).toBeInTheDocument()
    expect(screen.getByText('受控附件预览')).toBeInTheDocument()
    expect(screen.getByText(/共享范围：仅随此批准量表供获授权使用者\/对应任务使用，不允许脱离量表独立复用/)).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'提交此版本的入库申请'})).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox',{name:/我确认有权/}))
    fireEvent.click(screen.getByRole('button',{name:'提交此版本的入库申请'}))
    expect(mocks.submit).toHaveBeenCalledWith('frozen-1',expect.any(Object),{manifestHash:'media-hash',shareWithAuthorizedUsers:true})
    fireEvent.change(screen.getByLabelText('申请的测量发布版本'),{target:{value:''}})
    fireEvent.change(screen.getByLabelText('申请的测量发布版本'),{target:{value:'frozen-1'}})
    expect(screen.getByRole('checkbox',{name:/我确认有权/})).not.toBeChecked()
  })
  it('blocks submission when the server has not supplied an exact media manifest',()=>{
    fixture(null)
    fireEvent.change(screen.getByLabelText('申请的测量发布版本'),{target:{value:'frozen-1'}})
    fireEvent.change(screen.getByLabelText('版权与共享许可'),{target:{value:'本人原创'}})
    expect(screen.getByText(/媒体清单尚未确认/)).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'提交此版本的入库申请'})).toBeDisabled()
  })
  it('does not allow another pending application for the same release',()=>{
    mocks.use.mockReturnValue({source:{releases:[{releaseId:'r1',title:'量表',version:'1',contentHash:'h',eligible:true}],defaults:{title:'量表',author:'作者',copyright:'版权',applicability:'范围',scoringDescription:'计分',reportDescription:'报告'}},submissions:[{id:'s1',releaseId:'r1',metadata:{title:'量表'},status:'SUBMITTED'}],loading:false,busy:false,error:'',status:'',refresh:mocks.refresh,submit:mocks.submit,withdraw:mocks.withdraw})
    render(<SurveyScaleLibrarySubmission sourceId="scale"/>)
    fireEvent.change(screen.getByLabelText('申请的测量发布版本'),{target:{value:'r1'}})
    expect(screen.getByRole('button',{name:'提交此版本的入库申请'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'撤回申请'})).toBeDisabled()
    fireEvent.change(screen.getByLabelText('撤回说明'),{target:{value:'需要修订'}})
    fireEvent.click(screen.getByRole('button',{name:'撤回申请'}))
    expect(mocks.withdraw).toHaveBeenCalledWith(expect.objectContaining({id:'s1'}),'需要修订')
  })
})
