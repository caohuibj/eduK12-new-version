import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ResearchCatalog, SourceProvenance, type CatalogApi, type CatalogGrant } from './ResearchCatalog'
import { SurveyCatalogGrants } from '../pages/admin/SurveyCatalogGrants'
import { SurveyBuilder } from './SurveyBuilder'
const source={kind:'SCALE' as const,sourceId:'scale-key',sourceVersion:3}
const grant:CatalogGrant={id:'grant-1',title:'授权量表',kind:'SCALE',status:'ACTIVE',sourceRef:source,
  sourceProvenance:{source,definitionDigest:'sha256-original',adapterVersion:'survey-catalog-v1'}}
afterEach(()=>vi.unstubAllGlobals())
describe('original source catalog grants',()=>{
  it.each(['catalog','imported'] as const)('wraps the complete long version in %s source metadata',view=>{
    const longSource={kind:'FORM' as const,sourceId:'questionnaire:synthetic-source',sourceVersion:'a'.repeat(64),organizationId:'synthetic-organization'}
    const provenance={source:longSource,definitionDigest:'b'.repeat(64),adapterVersion:'survey-catalog-v1'}
    render(<SourceProvenance source={view==='catalog'?longSource:undefined} provenance={provenance}/>)
    const metadata=screen.getByText(`FORM · ${longSource.sourceId} · 版本 ${longSource.sourceVersion} · 组织 ${longSource.organizationId}`)
    expect(metadata.textContent).toBe(`FORM · ${longSource.sourceId} · 版本 ${longSource.sourceVersion} · 组织 ${longSource.organizationId}`)
    expect(metadata).toHaveClass('break-all')
    expect(screen.getByText(provenance.definitionDigest)).toHaveTextContent(provenance.definitionDigest)
  })
  it('lists exact versions and imports the chosen grant only',async()=>{
    const api=vi.fn(async()=>({list:[grant]}))
    const onImport=vi.fn(async()=>{})
    render(<ResearchCatalog api={api as CatalogApi} projectId="project-1" busy={false} onImport={onImport}/>)
    expect(await screen.findByRole('button',{name:'导入此版本：授权量表'})).toBeEnabled()
    expect(api).toHaveBeenCalledWith('/projects/project-1/catalog?page=1')
    expect(screen.getByText(/SCALE · scale-key · 版本 3/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'导入此版本：授权量表'}))
    expect(onImport).toHaveBeenCalledWith(grant)
  })
  it('looks up only administrator-owned published Form sections without requesting institution access',async()=>{
    const api=vi.fn(async()=>({list:[],page:1,hasMore:false,terminalReason:'END_OF_CATALOG'}))
    render(<SurveyCatalogGrants api={api as CatalogApi} password="test-password" researchers={[]}/>)
    fireEvent.change(screen.getByLabelText('来源类型'),{target:{value:'FORM'}})
    expect(screen.getByRole('button',{name:'查询可授权版本'})).toBeEnabled()
    expect(screen.getByText(/仅显示本管理员创建并已发布/)).toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'查询可授权版本'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/source-catalog?kind=FORM&page=1'))
  })
  it('grants an exact source version and confirms revocation consequences',async()=>{
    const revokeName='撤销版本授权：researcher · 授权量表 · 3'
    const api=vi.fn(async(path:string)=>path.startsWith('/source-catalog')
      ?{list:[{ref:source,title:'授权量表',available:true}],page:1,hasMore:false,terminalReason:'END_OF_CATALOG'}:{list:[grant]})
    vi.stubGlobal('confirm',vi.fn(()=>true))
    render(<SurveyCatalogGrants api={api as CatalogApi} password="test-password" researchers={[{id:'r1',username:'researcher',status:'ACTIVE'}]}/>)
    fireEvent.change(screen.getByLabelText('授权给研究者'),{target:{value:'r1'}})
    await screen.findByRole('button',{name:revokeName})
    fireEvent.click(screen.getByRole('button',{name:'查询可授权版本'}))
    fireEvent.click(await screen.findByRole('button',{name:'授权此版本：授权量表 · 3 → researcher'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/researchers/r1/tool-grants','POST',{currentPassword:'test-password',source}))
    await waitFor(()=>expect(screen.getByRole('button',{name:revokeName})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:revokeName}))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('既有已发布和进行中的研究不受影响'))
    await waitFor(()=>expect(api).toHaveBeenCalledWith('/tool-grants/grant-1/revoke','POST',{currentPassword:'test-password'}))
  })
  it('renders imported native snapshots without editable adapted scoring or bulk controls',async()=>{
    // Native source definitions need not have the editable ResearchScale shape.
    const draft={id:'d1',projectId:'p1',instrumentKey:'original',kind:'SCALE',title:'只读原版',revision:1,status:'DRAFT',
      definition:{nativeSource:true},catalogGrantId:grant.id,readOnly:true,sourceProvenance:grant.sourceProvenance}
    const fetcher=vi.fn(async(input:RequestInfo|URL)=>({ok:true,json:async()=>({code:0,data:String(input).includes('/catalog?')?{list:[]}:String(input).endsWith('/d1')?draft:{list:[draft]}})}))
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyBuilder projectId="p1"/>)
    fireEvent.click(await screen.findByRole('button',{name:/只读原版/}))
    expect(await screen.findByLabelText('研究工具名称')).toHaveAttribute('readonly')
    expect(screen.getByText(/sha256-original/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'保存草稿'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'结构检查与编译预览'})).not.toBeInTheDocument()
    expect(screen.queryByText('批量录入')).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'增加 Likert 题目'})).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'复制为新工具'})).toBeEnabled()
    expect(screen.getByRole('button',{name:'归档'})).toBeEnabled()
  })
})
