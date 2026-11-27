import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import OwnToolLicense, { type OwnToolLicenseView } from './OwnToolLicense'

it('loads only after opening and shows the frozen period, remaining quota and assignment state', async () => {
  const view: OwnToolLicenseView = {
    enforcing: true,
    license: {
      product:'SCHOOL', subjectId:'11260000-0000-4000-8000-000000000001',
      startsAt: '2027-01-01T01:00:00Z', expiresAt: '2027-07-01T01:00:00Z', status: 'ACTIVE',
      tools: [{ key: 'FORM:fixture', name: '公开表单', limit: 20, used: 6, reserved: 4, assignment: 'PENDING' },
        {key:'SCALE:fixture',name:'公开量表',limit:null,used:0,reserved:0,assignment:'PENDING'}],
    },
  }
  const load = vi.fn().mockResolvedValue(view), openSources = vi.fn()
  render(<OwnToolLicense title="本校可用工具" load={load} onOpenSources={openSources}/>)
  expect(load).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('本校可用工具'))
  expect(await screen.findByText('公开表单')).toBeVisible()
  expect(screen.getByText('可用 14 · 活动预留 4 · 已结算使用 2')).toBeVisible()
  expect(screen.getAllByText('待入口管理员分配')).toHaveLength(2)
  expect(screen.getByRole('link',{name:'由 School 入口管理员分配版本'})).toHaveAttribute('href',
    expect.stringMatching(/\/admin\/huischool\?standardTool=fixture&subjectId=11260000-0000-4000-8000-000000000001$/))
  fireEvent.click(screen.getByRole('button', {name:'查看已分配版本'}))
  expect(openSources).toHaveBeenCalledOnce()
})


it('shows displaced bindings and quota recovery without asserting that any draft exists',async()=>{
  const subjectId='11260000-0000-4000-8000-000000000002'
  const view:OwnToolLicenseView={
    enforcing:true,enrollment:{mode:'REQUIRED',effectiveAt:'2027-01-01T00:00:00.000Z'},
    license:{product:'TEACHER',subjectId,startsAt:'2027-01-01T00:00:00.000Z',expiresAt:'2027-07-01T00:00:00.000Z',status:'ACTIVE',
      tools:[{key:'SCALE:fixture',name:'受影响量表',limit:2,used:2,reserved:2,
        assignment:'AUTHORITY_LOST',canAssignVersion:true,reselectIfPinned:true}]},
  }
  render(<OwnToolLicense title="本校可用工具" load={vi.fn().mockResolvedValue(view)}/>)
  fireEvent.click(screen.getByText('本校可用工具'))
  expect(await screen.findByText(/原签发资格或委托已失效/)).toBeVisible()
  expect(screen.getByText(/若草稿仍绑定原配置/)).toBeVisible()
  expect(screen.getByText(/起发布须有有效许可/)).toBeVisible()
  expect(screen.getByRole('link',{name:'由 Teacher 入口管理员分配版本'})).toHaveAttribute('href',
    expect.stringContaining('/admin/huiteacher?standardTool=fixture&subjectId='+subjectId))
  expect(screen.getByRole('link',{name:'查看对应工具许可'})).toHaveAttribute('href',
    expect.stringContaining('/admin/permissions?view=tools&product=TEACHER&subjectId='+subjectId+'&toolKey=SCALE%3Afixture'))
})
