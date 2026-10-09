import { Router } from 'express'
import { authenticateSchool } from '../../middleware/auth'
import { requireOrganizationGovernance } from '../organization/access'
import { organizationController } from '../organization/organization.controller'
import { organizationAdminController } from '../organization/organization.admin.controller'
import { requireRecentSchoolMfa } from './mfa.middleware'

// Reuse the existing Organization structure and relationship services, never
// the legacy /api/organizations entrypoint or its training session cookie.
const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
router.get('/organizations',authenticateSchool,organizationController.listAccessible)
router.get('/organizations/:organizationId/context',authenticateSchool,organizationController.readContext)
router.get('/organizations/:organizationId/units',authenticateSchool,requireOrganizationGovernance,organizationAdminController.listUnits)
router.post('/organizations/:organizationId/units',authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,organizationAdminController.createUnit)
router.delete('/organizations/:organizationId/units/:unitId',authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,organizationAdminController.deleteUnit)
router.get('/organizations/:organizationId/staff-class-assignments',authenticateSchool,requireOrganizationGovernance,organizationAdminController.listStaffClassAssignments)
router.post('/organizations/:organizationId/staff-class-assignments',authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,organizationAdminController.assignStaff)
router.post('/organizations/:organizationId/staff-class-assignments/:assignmentId/end',authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,organizationAdminController.endStaffAssignment)
router.post('/organizations/:organizationId/memberships/:membershipId/capabilities',authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,organizationController.grantCapability)
router.post('/organizations/:organizationId/memberships/:membershipId/capabilities/revoke',authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,organizationController.revokeCapability)
export default router
