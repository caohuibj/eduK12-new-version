import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ReportingMemberPicker } from '../ReportingMemberPicker'
import type { CohortSelector } from '../../../api/reporting'
const api=vi.hoisted(()=>({cohortMembers:vi.fn()}))
vi.mock('../../../api/reporting',()=>({reportingApi:api}))
const changed=vi.fn()
function Harness(){const[value,setValue]=useState<CohortSelector>({schemaVersion:2,combine:'ALL',clauses:[{kind:'CLASS_UNITS',classUnitIds:['class']}]});return <ReportingMemberPicker organizationId="org" value={value} onChange={v=>{changed(v);setValue(v)}} />}
beforeEach(()=>{vi.clearAllMocks();api.cohortMembers.mockResolvedValue({list:[{userId:'u',name:'小明',membershipIds:['old','new']}],nextPage:2})})
it('selects historical membership episodes and preserves class intersections across pages',async()=>{
 render(<Harness />)
 await userEvent.click(screen.getByRole('button',{name:'选择指定成员'}))
 await userEvent.click(await screen.findByRole('checkbox',{name:'小明'}))
 expect(changed).toHaveBeenLastCalledWith({schemaVersion:2,combine:'ALL',clauses:[{kind:'CLASS_UNITS',classUnitIds:['class']},{kind:'MEMBERSHIP_IDS',membershipIds:['old','new']}]})
 api.cohortMembers.mockResolvedValueOnce({list:[{userId:'v',name:'小红',membershipIds:['v']}],nextPage:null})
 await userEvent.click(screen.getByRole('button',{name:'更多成员'}))
 expect(api.cohortMembers).toHaveBeenLastCalledWith('org','',2)
 await userEvent.click(await screen.findByRole('checkbox',{name:'小红'}))
 expect(changed.mock.lastCall?.[0].clauses[1].membershipIds).toEqual(['old','new','v'])
 await userEvent.click(screen.getByRole('button',{name:'移除 小明'}))
 expect(changed.mock.lastCall?.[0].clauses[1].membershipIds).toEqual(['v'])
})
it('clears discovered names on revocation',async()=>{
 const view=render(<Harness />)
 await userEvent.click(screen.getByRole('button',{name:'选择指定成员'}))
 await screen.findByRole('checkbox',{name:'小明'})
 api.cohortMembers.mockRejectedValueOnce(new Error('无权访问'))
 await userEvent.click(screen.getByRole('button',{name:'搜索成员'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('无权访问')
 await waitFor(()=>expect(screen.queryByRole('checkbox')).not.toBeInTheDocument())
 view.unmount()
})

it('ignores a late failed search after unmount',async()=>{
 let reject!:(error:Error)=>void
 api.cohortMembers.mockReturnValue(new Promise((_resolve,fail)=>{reject=fail}))
 const view=render(<Harness />)
 await userEvent.click(screen.getByRole('button',{name:'选择指定成员'}))
 view.unmount()
 reject(new Error('late failure'))
 await Promise.resolve()
 expect(changed).not.toHaveBeenCalled()
})
