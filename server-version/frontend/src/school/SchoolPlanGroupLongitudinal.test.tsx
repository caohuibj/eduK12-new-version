import {render,screen,fireEvent,waitFor} from '@testing-library/react'
import {it,expect,vi} from 'vitest'
import {SchoolPlanGroupLongitudinal} from './SchoolPlanGroupLongitudinal'
vi.mock('../modules/reporting/GroupLongitudinalPanel',()=>({GroupLongitudinalPanel:({base,request}:{base:string;request:(...args:any[])=>Promise<unknown>})=><button onClick={()=>void request(base,'POST',{planId:'plan',sourceKey:'A',throughWaveId:'T2'})}>adapt selected group</button>}))
it('adds the existing School GROUP spec and frozen subgroup choice to the shared command',async()=>{
 const api=vi.fn().mockResolvedValue({})
 render(<SchoolPlanGroupLongitudinal api={api} organizationId="org" runId="run" specId="published-spec" selection={{kind:'CLASSES',ids:['class-b','class-a']}}/>)
 fireEvent.click(screen.getByRole('button',{name:'adapt selected group'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/reports/groups/plans/org/run','POST',{planId:'plan',sourceKey:'A',throughWaveId:'T2',specId:'published-spec',selection:{kind:'CLASSES',ids:['class-a','class-b']}}))
})
