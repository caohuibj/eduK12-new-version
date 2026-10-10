import { beforeEach,describe,expect,it,vi } from 'vitest'
const state=vi.hoisted(()=>({
  read:vi.fn(),write:vi.fn(),transaction:vi.fn(),personaRead:vi.fn(),personaWrite:vi.fn(),
  context:vi.fn(),audit:vi.fn(),reference:vi.fn(),
}))
vi.mock('../../config/database',()=>({prisma:{
  $queryRaw:state.read,
  $transaction:state.transaction,
  organizationPersonaGrant:{findFirst:state.personaRead,create:state.personaWrite},
}}))
vi.mock('../../modules/organization/access',()=>({
  resolveOrganizationAccessContext:state.context,
}))
vi.mock('../../modules/organization/service',()=>({appendAudit:state.audit}))
vi.mock('../../modules/campus/studentReference',()=>({
  campusStudentReference:state.reference,
}))
import { readCampusRelationshipDirectory, appointCampusCounselorClient } from '../../modules/campus/relationships.service'

const actor={userId:'school-admin',accountDomain:'SCHOOL',role:'ADMIN',platformRole:'STANDARD'}
const org='00000000-0000-4000-8000-000000000001'
const access={productDomain:'SCHOOL',organizationStatus:'ACTIVE',membershipId:'admin-m',
  orgRole:'ORG_ADMIN',canGovern:true}
describe('Huischool role and counseling relationship authority',()=>{
  beforeEach(()=>{
    vi.clearAllMocks()
    state.context.mockResolvedValue(access)
    state.reference.mockImplementation((_org:string,student:string)=>'林-'+student)
    state.transaction.mockImplementation(async(callback:(tx:any)=>Promise<unknown>)=>
      callback({
        $queryRaw:state.read,$executeRaw:state.write,
        organizationPersonaGrant:{findFirst:state.personaRead,create:state.personaWrite},
      }))
    state.audit.mockResolvedValue(undefined)
    state.write.mockResolvedValue(1)
    state.personaRead.mockResolvedValue(null)
    state.personaWrite.mockResolvedValue({id:'grant'})
  })
  it('does not let cross-realm actors or non-governors enumerate student membership',async()=>{
    await expect(readCampusRelationshipDirectory({
      actor:{...actor,accountDomain:'TRAINING'} as any,organizationId:org,
    })).rejects.toMatchObject({statusCode:403})
    state.context.mockResolvedValueOnce({...access,orgRole:'MEMBER',canGovern:false})
    await expect(readCampusRelationshipDirectory({actor:actor as any,organizationId:org}))
      .rejects.toMatchObject({statusCode:403})
    expect(state.read).not.toHaveBeenCalled()
  })
  it('pseudonymizes school students rather than disclosing their login',async()=>{
    state.read.mockResolvedValueOnce([{
      membershipId:'staff-1',displayName:'心理教师',canTeach:false,canCounsel:true,hasPsychology:true,
    }]).mockResolvedValueOnce([{membershipId:'student-1',userId:'student-a'}])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const result=await readCampusRelationshipDirectory({
      actor:actor as any,organizationId:org,classUnitId:'class-1',
    })
    expect(result.students).toEqual([{membershipId:'student-1',reference:'林-student-a'}])
    expect(JSON.stringify(result)).not.toContain('"userId"')
    const queries=state.read.mock.calls.map(call=>call[0].join('')).join('\n')
    expect(queries).toContain("u.account_domain='SCHOOL'")
    expect(queries).toContain("e.status='APPROVED'")
    expect(queries).not.toContain('campus_accounts student_alias')
  })
  it('atomically provisions CLIENT only for a current counselor with psychology grant and approved student',async()=>{
    state.read.mockResolvedValueOnce([{id:'counselor-1'}])
      .mockResolvedValueOnce([{userId:'student-a'}])
    const result=await appointCampusCounselorClient({actor:actor as any,organizationId:org,
      counselorMembershipId:'counselor-1',clientMembershipId:'student-1'})
    expect(result).toMatchObject({status:'ACTIVE',studentReference:'林-student-a'})
    expect(state.personaWrite).toHaveBeenCalledWith({data:expect.objectContaining({
      persona:'CLIENT',membershipId:'student-1',grantedByUserId:'school-admin',
    })})
    expect(state.write).toHaveBeenCalledTimes(1)
    expect(state.audit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({
      action:'CAMPUS_COUNSELOR_CLIENT_APPOINTED',
    }))
    const sql=state.read.mock.calls.map(call=>call[0].join('')).join('\n')
    expect(sql).toContain("cap.capability='PSYCHOLOGY_STAFF'")
    expect(sql).toContain("e.status='APPROVED'")
  })
  it('denies an unqualified counselor before creating student CLIENT grants',async()=>{
    state.read.mockResolvedValueOnce([])
    await expect(appointCampusCounselorClient({
      actor:actor as any,organizationId:org,
      counselorMembershipId:'not-psychology',clientMembershipId:'student-1',
    })).rejects.toMatchObject({statusCode:403})
    expect(state.personaWrite).not.toHaveBeenCalled()
    expect(state.write).not.toHaveBeenCalled()
  })
})
