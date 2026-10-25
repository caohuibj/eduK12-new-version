import {fireEvent,render,screen} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
const read=vi.hoisted(()=>vi.fn())
vi.mock('../../api/surveyStandard',()=>({standardRequest:read}))
import LibraryPreflightPanel from './LibraryPreflightPanel'
it('reads on demand, distinguishes scientific scope from self-authorship and clears stale success after a failed read',async()=>{
 read.mockResolvedValueOnce({identity:{instrumentKey:'exact',instrumentVersion:'1.0.0'},title:'synthetic',readOnly:true,facts:{authorship:'SELF_AUTHORED',scientificMaturity:'RESEARCH_READY',contentLocale:'zh-CN',scientificTerritory:'CN',deploymentTerritory:'ZZ',scaleStatus:'DRAFT',visibility:'HIDDEN'},stages:[{key:'publication',label:'测量正式发布',state:'BLOCKED',reasons:['SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH'],nextAction:'通过正规修订处理'}],targetUseGrant:'NOT_EVALUATED',generatedAt:'2026-10-25T00:00:00Z'}).mockRejectedValueOnce(new Error('synthetic unavailable'))
 render(<LibraryPreflightPanel instrumentKey="exact" instrumentVersion="1.0.0"/>)
 expect(read).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'读取当前阶段（只读）'}))
 await screen.findByText('可信自编来源');expect(screen.getByText(/部署地域与已有科学参考适用范围不一致/)).toBeInTheDocument()
 expect(screen.getByText(/目标用户使用授权尚未评估/)).toBeInTheDocument()
 expect(read).toHaveBeenCalledWith('/preflight/exact/1.0.0')
 fireEvent.click(screen.getByRole('button',{name:'刷新当前阶段（只读）'}));await screen.findByRole('alert')
 expect(screen.queryByText('可信自编来源')).not.toBeInTheDocument()
 expect(read.mock.calls.every(call=>call.length===1)).toBe(true)
})
