import {expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const {db,resolve}=vi.hoisted(()=>({db:{$queryRaw:vi.fn()},resolve:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:db}))
vi.mock('../../modules/huiteacher/groupReportAuthority',()=>({assertTeacherGroupAuthority:vi.fn(async()=>({productAdmin:true}))}))
vi.mock('../../modules/assessment-run/registeredResources',()=>({resolveHistoricalRelationalEntry:resolve}))
import {generateTeacherNumericGroup} from '../../modules/huiteacher/numericGroupReport.service'
it('rejects an unimplemented native family before generic leaf resolution, despite an explicit GROUP parent',async()=>{
 const policy={subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],analysisMode:'COHORT_AGGREGATE',resultDisclosure:{policyKey:'EDUCATION_SELF_GROUP_V2'}}
 db.$queryRaw.mockResolvedValueOnce([{runId:'run',name:'Synthetic',eventClosed:true,runClosed:true}])
  .mockResolvedValueOnce([{family:'COGNITIVE',key:'education-assessment:TEACHER:org:source',version:'2.0.0',policy,hash:canonicalHash(policy)}])
 await expect(generateTeacherNumericGroup({organizationId:'org',eventId:'event',actorUserId:'manager',trackId:'track',specId:'spec',selection:{kind:'ALL'},leaf:{unitType:'COGNITIVE',slotKey:'cognitive:item',instrumentKey:'reaction',instrumentVersion:'1.0.0',compiledRuntimeHash:'a'.repeat(64)}})).rejects.toMatchObject({statusCode:404})
 expect(resolve).not.toHaveBeenCalled()
})
