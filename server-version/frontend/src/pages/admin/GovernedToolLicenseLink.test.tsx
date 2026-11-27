import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import type {GovernedItem,ToolFamily} from '../../api/surveyGovernance'
import GovernedToolLicenseLink from './GovernedToolLicenseLink'
import GovernedToolsWorkspace from './GovernedToolsWorkspace'

const admin=vi.hoisted(()=>vi.fn())
vi.mock('../../api/surveyGovernance',async()=>({...await vi.importActual('../../api/surveyGovernance'),governedRequest:admin}))
vi.mock('../../admin/AdminStepUp',()=>({default:()=>null}))
const families:ToolFamily[]=['SCALE','FORM','COGNITIVE','SJT','COMBINATION','BUNDLE']
const catalogRow=(family:ToolFamily,state='ONLINE',toolKey='audit1127_'+family.toLowerCase()):GovernedItem=>({
 id:'00000000-0000-4000-8000-000000000027',family,toolKey,toolVersion:'1.2.3',title:'AUDIT1127 '+family,hash:'a'.repeat(64),state,version:1,
 blockers:[],submittedBy:'synthetic',approvedBy:'synthetic-system',approvedAt:'2026-11-27T00:00:00Z',reason:'合成目录',
 versions:{content:'C1',parameters:null,report:null},metrics:[],components:[],policyIdentity:{resourceKey:'governed-release:00000000-0000-4000-8000-000000000027',fingerprint:'a'.repeat(64)}
})
afterEach(cleanup)
beforeEach(()=>{admin.mockReset()})
it.each(families)('opens the %s commercial license search using the stable catalog identity',family=>{
 const row=catalogRow(family);render(<GovernedToolLicenseLink row={row}/>)
 const link=screen.getByRole('link',{name:'管理工具许可'}),url=new URL(link.getAttribute('href')!,'http://test.local')
 expect(url.pathname).toBe('/admin/permissions')
 expect(Object.fromEntries(url.searchParams)).toEqual({view:'tools',product:'SURVEY',toolKey:family+':'+row.toolKey})
 expect(url.search).not.toContain(row.id);expect(url.search).not.toContain(row.hash)
 expect(screen.getByText(/不自动选择或签发/)).toBeVisible()
 expect(screen.getByText(/商业许可按工具系列管理，不锁定为当前精确版本/)).toHaveTextContent(row.toolVersion)
 if(family==='COMBINATION'||family==='BUNDLE')expect(screen.getByText('整包许可不授予组件拆用权限。')).toBeVisible()
 expect(screen.queryByRole('button')).toBeNull()
})
it('preserves an already-prefixed key and safely encodes every query delimiter',()=>{
 const key='FORM:audit1127&view=content#fragment/题本'
 render(<GovernedToolLicenseLink row={catalogRow('FORM','ONLINE',key)}/>)
 const url=new URL(screen.getByRole('link').getAttribute('href')!,'http://test.local')
 expect(url.searchParams.get('toolKey')).toBe(key)
 expect(url.searchParams.get('view')).toBe('tools');expect(url.hash).toBe('')
 expect([...url.searchParams.keys()]).toEqual(['view','product','toolKey'])
})
it('offers history lookup for withdrawal without claiming the old version can be licensed anew',()=>{
 render(<GovernedToolLicenseLink row={catalogRow('BUNDLE','WITHDRAWN')}/>)
 expect(screen.queryByRole('link',{name:'管理工具许可'})).toBeNull()
 expect(screen.getByRole('link',{name:'查看已有工具许可'})).toHaveAttribute('href',expect.stringContaining('toolKey=BUNDLE%3A'))
 expect(screen.getByText(/历史许可不使此版本恢复可用/)).toBeVisible()
})
it.each(['SUBMITTED','APPROVED','TRIAL_RUNNING','TRIAL_FAILED','RETURNED'])('does not expose a license action for the %s state',state=>{
 render(<GovernedToolLicenseLink row={catalogRow('FORM',state)}/>)
 expect(screen.queryByRole('link')).toBeNull()
})
it.each(['','has space','line\nbreak','a'.repeat(301)])('does not invent a commercial identity from the untrusted catalog key %j',key=>{
 render(<GovernedToolLicenseLink row={catalogRow('FORM','ONLINE',key)}/>)
 expect(screen.queryByRole('link')).toBeNull()
})
it('exposes the entry inside actual governed catalog detail without invoking a write or exact delegation',async()=>{
 const online=catalogRow('COGNITIVE'),pending={...catalogRow('COGNITIVE','SUBMITTED','pending'),id:'pending',title:'Pending tool'}
 admin.mockImplementation(async(_scope:string,path:string)=>path.startsWith('/catalog')?{list:[online,pending],hasMore:false}:{...online,snapshot:{},reference:{},trials:[]})
 render(<GovernedToolsWorkspace/>)
 const title=await screen.findByText(online.title,{selector:'strong'})
 const article=title.closest('article')!
 fireEvent.click(title.closest('summary')!)
 const entry=within(article).getByRole('region',{name:'工具许可 · '+online.title})
 expect(within(entry).getByRole('link',{name:'管理工具许可'})).toHaveAttribute('href','/admin/permissions?view=tools&product=SURVEY&toolKey=COGNITIVE%3Aaudit1127_cognitive')
 expect(within(screen.getByText('Pending tool',{selector:'strong'}).closest('article')!).queryByRole('link',{name:/工具许可/})).toBeNull()
 await waitFor(()=>expect(admin).toHaveBeenCalled())
 expect(admin.mock.calls.every(([scope,path,body])=>scope==='survey-tools'&&body===undefined&&!path.includes('standard-delegations'))).toBe(true)
})

it('blocks license navigation during an existing governance mutation',()=>{
 render(<GovernedToolLicenseLink row={catalogRow('FORM')} disabled/>)
 const link=screen.getByRole('link',{name:'管理工具许可'})
 expect(link).toHaveAttribute('aria-disabled','true');expect(link).toHaveAttribute('tabindex','-1')
 expect(fireEvent.click(link)).toBe(false)
 expect(admin).not.toHaveBeenCalled()
})
