import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
const {get,put,auth}=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),auth:{user:{mobile:{capabilities:{canManageParentToolDisclosure:true}}} as any}}))
vi.mock('../../api/client',()=>({default:{get,put}}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>auth}))
import {ParentToolDisclosureSettings} from '../ParentToolDisclosureSettings'
const snapshot=()=>({data:{version:4,commandKey:'synthetic-server-command',allowedActions:['UPDATE'],policy:{mode:'COMPLETION_ONLY',metricKeys:[],longitudinalMetricKeys:[]}}})
describe('parent tool disclosure settings',()=>{
 beforeEach(()=>{get.mockReset();put.mockReset();auth.user={mobile:{capabilities:{canManageParentToolDisclosure:true}}};get.mockResolvedValue(snapshot())})
 it('hides settings without current server discovery',()=>{auth.user={mobile:{capabilities:{canManageParentToolDisclosure:false}}};const {container}=render(<ParentToolDisclosureSettings instrumentKey="tool" instrumentVersion="1.0.0"/>);expect(container.textContent).toBe('');expect(get).not.toHaveBeenCalled()})
 it('confirms exact tool version and retries the same sealed command after lost response',async()=>{put.mockRejectedValueOnce(new Error('lost')).mockResolvedValue({});render(<ParentToolDisclosureSettings instrumentKey="tool" instrumentVersion="1.0.0"/>);await screen.findByText('核对并保存');fireEvent.click(screen.getByText('核对并保存'));expect(put).not.toHaveBeenCalled();fireEvent.click(screen.getByText('确认保存'));await screen.findByRole('alert');fireEvent.click(screen.getByText('核对并保存'));fireEvent.click(screen.getByText('确认保存'));await waitFor(()=>expect(put).toHaveBeenCalledTimes(2));expect(put.mock.calls[0]).toEqual(put.mock.calls[1]);expect(put.mock.calls[0][0]).toBe('/parent-tool-policies/SCALE/tool/1.0.0');expect(put.mock.calls[0][1]).toMatchObject({expectedVersion:4,commandKey:'synthetic-server-command'})})
 it('version conflict requires a fresh snapshot before saving again',async()=>{put.mockRejectedValue({message:'conflict',status:409});render(<ParentToolDisclosureSettings instrumentKey="tool" instrumentVersion="1"/>);await screen.findByText('核对并保存');fireEvent.click(screen.getByText('核对并保存'));fireEvent.click(screen.getByText('确认保存'));await screen.findByText('刷新披露设置');expect(screen.queryByText('核对并保存')).toBeNull();fireEvent.click(screen.getByText('刷新披露设置'));await screen.findByText('核对并保存');expect(get).toHaveBeenCalledTimes(2)})
})
