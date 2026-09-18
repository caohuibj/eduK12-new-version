import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { requireOrganizationGovernance } from './access'
import { organizationController } from './organization.controller'

const router = Router()

// Any authenticated account may create an organization and becomes its first
// ORG_ADMIN. Organization authority after creation is never derived from
// legacy User.role.
router.post('/', authenticate, organizationController.create)

router.get('/:organizationId/memberships', authenticate, requireOrganizationGovernance, organizationController.listMemberships)
router.post('/:organizationId/suspend', authenticate, requireOrganizationGovernance, organizationController.suspend)
router.post('/:organizationId/resume', authenticate, requireOrganizationGovernance, organizationController.resume)
router.post('/:organizationId/memberships', authenticate, requireOrganizationGovernance, organizationController.createMembership)
router.post('/:organizationId/memberships/:membershipId/end', authenticate, requireOrganizationGovernance, organizationController.endMembership)
router.post('/:organizationId/memberships/:membershipId/role', authenticate, requireOrganizationGovernance, organizationController.setMembershipRole)
router.post('/:organizationId/memberships/:membershipId/personas', authenticate, requireOrganizationGovernance, organizationController.grantPersona)
router.post('/:organizationId/memberships/:membershipId/personas/revoke', authenticate, requireOrganizationGovernance, organizationController.revokePersona)
router.post('/:organizationId/memberships/:membershipId/capabilities', authenticate, requireOrganizationGovernance, organizationController.grantCapability)
router.post('/:organizationId/memberships/:membershipId/capabilities/revoke', authenticate, requireOrganizationGovernance, organizationController.revokeCapability)
router.post('/:organizationId/access-denies', authenticate, requireOrganizationGovernance, organizationController.deny)
router.post('/:organizationId/access-denies/lift', authenticate, requireOrganizationGovernance, organizationController.liftDeny)

export default router
