import { describe, expect, it } from 'vitest'
import { reportingAudienceForContext } from '../../modules/reporting/governedDisclosure'
import type { OrganizationAccessContext } from '../../modules/organization/access'

const audience = (patch: Partial<Pick<OrganizationAccessContext,
  'productDomain'|'personas'|'capabilities'|'explicitDenies'>>) =>
  reportingAudienceForContext({
    productDomain:'SCHOOL', personas:['COUNSELOR'],capabilities:['PSYCHOLOGY_STAFF'],explicitDenies:[],
    ...patch,
  })

describe('SCHOOL governed disclosure audience cannot be inferred from job titles', () => {
  it('permits professional only with current psychology grant AND counselor persona', () => {
    expect(audience({})).toBe('PROFESSIONAL')
    expect(audience({capabilities:[]})).toBe('ORGANIZATION')
    expect(audience({personas:[]})).toBe('ORGANIZATION')
    expect(audience({personas:['TEACHER']})).toBe('TEACHER')
  })
  it('explicitly denied professional access fails closed', () => {
    expect(audience({explicitDenies:['PSYCHOLOGY_STAFF']})).toBe('ORGANIZATION')
    expect(audience({explicitDenies:['*']})).toBe('ORGANIZATION')
  })
  it('does not change established LEGACY audience semantics', () => {
    expect(audience({productDomain:'LEGACY',capabilities:[]})).toBe('PROFESSIONAL')
    expect(audience({productDomain:'LEGACY',personas:[]})).toBe('PROFESSIONAL')
  })
})
