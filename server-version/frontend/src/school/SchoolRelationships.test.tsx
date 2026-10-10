import { describe,expect,it,vi } from 'vitest'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { SchoolRelationships } from './SchoolRelationships'
import type { SchoolApi } from './SchoolRecovery'

const org='00000000-0000-4000-8000-000000000001'
const cls='00000000-0000-4000-8000-000000000002'
const teacher='00000000-0000-4000-8000-000000000003'
const counselor='00000000-0000-4000-8000-000000000004'
const student='00000000-0000-4000-8000-000000000005'
const directory={
  staff:[
    {membershipId:teacher,displayName:'任课教师',canTeach:true,canCounsel:false,hasPsychology:false},
    {membershipId:counselor,displayName:'心理教师',canTeach:false,canCounsel:true,hasPsychology:true},
  ],
  students:[{membershipId:student,reference:'林-123456789ABC'}],
  staffAssignments:[],clientRelationships:[],
  truncated:{staff:false,students:false,staffAssignments:false,clientRelationships:false},
}
describe('Huischool admin relationship management UI',()=>{
  it('requires a deliberate directory load before showing pseudonymous student choices',async()=>{
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path===`/organizations/${org}/relationship-directory?classUnitId=${cls}`
        &&method==='GET')return directory
      if(path===`/organizations/${org}/staff-class-assignments`&&method==='POST')
        return {id:'assignment-1'}
      throw Error('unexpected '+method+' '+path)
    })
    render(<SchoolRelationships api={api as unknown as SchoolApi} organizationId={org}
      classes={[{id:cls,name:'一班',unitKind:'CLASS'}]}/>)
    expect(screen.queryByText('林-123456789ABC')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('选择班级'),{target:{value:cls}})
    fireEvent.click(screen.getByRole('button',{name:'经二次验证读取关系'}))
    expect(await screen.findByText('林-123456789ABC')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('教师'),{target:{value:teacher}})
    fireEvent.click(screen.getByRole('button',{name:'登记任教关系'}))
    await waitFor(()=>expect(api).toHaveBeenCalledWith(
      `/organizations/${org}/staff-class-assignments`,'POST',
      {membershipId:teacher,classUnitId:cls,staffRole:'TEACHING'},
    ))
    expect(document.body.textContent).not.toContain('private_student_login')
  })
  it('requires a current psychology counselor and explicit confirmation for a client case',async()=>{
    const api=vi.fn(async(path:string,method='GET')=>{
      if(path.startsWith(`/organizations/${org}/relationship-directory`)&&method==='GET')
        return directory
      if(path===`/organizations/${org}/counselor-client-relationships`&&method==='POST')
        return {id:'relation-1',status:'ACTIVE'}
      throw Error('unexpected '+path)
    })
    const confirm=window.confirm
    window.confirm=vi.fn(()=>true)
    try{
      render(<SchoolRelationships api={api as unknown as SchoolApi} organizationId={org}
        classes={[{id:cls,name:'一班',unitKind:'CLASS'}]}/>)
      fireEvent.change(screen.getByLabelText('选择班级'),{target:{value:cls}})
      fireEvent.click(screen.getByRole('button',{name:'经二次验证读取关系'}))
      await screen.findByText('林-123456789ABC')
      fireEvent.change(screen.getByLabelText('心理教师（须持有专业能力）'),
        {target:{value:counselor}})
      fireEvent.change(screen.getByLabelText('获批学生的校园观察编号'),
        {target:{value:student}})
      fireEvent.click(screen.getByRole('button',{name:'建立独立个案关系'}))
      await waitFor(()=>expect(api).toHaveBeenCalledWith(
        `/organizations/${org}/counselor-client-relationships`,'POST',
        {counselorMembershipId:counselor,clientMembershipId:student},
      ))
    }finally{window.confirm=confirm}
  })
})
