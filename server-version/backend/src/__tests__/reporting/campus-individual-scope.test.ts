import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ context: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {} }))
vi.mock('../../modules/organization/access', () => ({
  resolveOrganizationAccessContext: state.context,
  contextHasCapability: (context: { capabilities:string[]; explicitDenies:string[] }, capability:string) =>
    context.capabilities.includes(capability) && !context.explicitDenies.includes(capability),
}))
import { individualSubjectScope } from '../../modules/reporting/individualAuthorization'

const principal = { userId:'counselor-user', platformRole:'STANDARD' as const }
const input = { principal, organizationId:'campus-org' }
const school = {
  membershipId:'counselor-membership', productDomain:'SCHOOL',
  organizationStatus:'ACTIVE', capabilities:['PSYCHOLOGY_STAFF'],
  personas:['COUNSELOR'], explicitDenies:[],
}
describe('SCHOOL individual report deep-link authority',()=>{
  it('requires the currently valid CLIENT persona in the exact counselor relationship SQL',async()=>{
    state.context.mockResolvedValue(school)
    const query=await individualSubjectScope(input)
    const statement=query.strings.join(' ')
    expect(statement).toContain('organization_counselor_client_relationships')
    expect(statement).toContain('organization_persona_grants client_persona')
    expect(statement).toContain("client_persona.persona = 'CLIENT'")
    expect(statement).toContain('client_persona.revoked_at IS NULL')
    expect(statement).toContain('r.client_membership_id = m.id')
  })
  it('does not let governance, teacher persona or a revoked professional ability provide private report scope',async()=>{
    for(const update of [
      {capabilities:[]}, {personas:['TEACHER']},
      {explicitDenies:['PSYCHOLOGY_STAFF']},
    ]){
      state.context.mockResolvedValueOnce({...school,...update})
      await expect(individualSubjectScope(input)).rejects.toMatchObject({statusCode:404})
    }
  })
  it('leaves the LEGACY professional relationship model unchanged',async()=>{
    state.context.mockResolvedValue({...school,productDomain:'LEGACY'})
    const query=await individualSubjectScope(input)
    const statement=query.strings.join(' ')
    expect(statement).not.toContain('client_persona.persona')
  })
})
