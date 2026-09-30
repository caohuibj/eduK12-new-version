import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { assessmentRunController } from '../assessment-run/run.controller'
import { reportingController } from '../reporting/reporting.controller'
import { reportingDiscoveryController } from '../reporting/discovery.controller'
import { reportingAnalysisGuard, reportingExportBudget } from '../reporting/runtimeLimit'
import {
  requireAssessmentDeliveryAuthority,
  requireOrganizationDenyGovernance,
  requireOrganizationGovernance,
} from './access'
import { organizationAdminController } from './organization.admin.controller'
import { organizationController } from './organization.controller'

const router = Router()
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next() })

// Platform-governed ReportingAnalysisSpec lifecycle. These handlers enforce
// current PlatformRole=SYSTEM_ADMIN themselves; Organization admins cannot
// fork or weaken the platform spec contract.
router.post('/reporting-specs', authenticate, reportingController.createSpec)
router.post('/reporting-specs/:specId/review', authenticate, reportingController.reviewSpec)
router.post('/reporting-specs/:specId/publish', authenticate, reportingController.publishSpec)
router.post('/reporting-specs/:specId/retire', authenticate, reportingController.retireSpec)

// Organization product discovery is a read-only authority projection. It is
// deliberately separate from legacy User.role and does not grant authority:
// every downstream Organization operation re-authorizes current DB facts.
router.get('/assigned-tasks', authenticate, assessmentRunController.assignedTasks)
router.get('/', authenticate, organizationController.listAccessible)
router.get('/:organizationId/context', authenticate, organizationController.readContext)

// Platform lifecycle handlers require current SYSTEM_ADMIN; tenant governance
// and legacy User.role never grant create/suspend/resume authority.
router.post('/', authenticate, organizationController.create)

router.get('/:organizationId/delivery-policy', authenticate, requireOrganizationGovernance, organizationAdminController.readDeliveryPolicy)
router.put('/:organizationId/delivery-policy', authenticate, requireOrganizationGovernance, organizationAdminController.updateDeliveryPolicy)
router.get('/:organizationId/memberships', authenticate, requireOrganizationGovernance, organizationController.listMemberships)
router.get('/:organizationId/memberships/:membershipId/access-history', authenticate, requireOrganizationGovernance, organizationAdminController.membershipAccessHistory)
router.post('/:organizationId/suspend', authenticate, requireOrganizationGovernance, organizationController.suspend)
router.post('/:organizationId/resume', authenticate, requireOrganizationGovernance, organizationController.resume)
router.post('/:organizationId/memberships', authenticate, requireOrganizationGovernance, organizationController.createMembership)
router.post('/:organizationId/memberships/:membershipId/end', authenticate, requireOrganizationGovernance, organizationController.endMembership)
router.post('/:organizationId/memberships/:membershipId/role', authenticate, requireOrganizationGovernance, organizationController.setMembershipRole)
router.post('/:organizationId/memberships/:membershipId/personas', authenticate, requireOrganizationGovernance, organizationController.grantPersona)
router.post('/:organizationId/memberships/:membershipId/personas/revoke', authenticate, requireOrganizationGovernance, organizationController.revokePersona)
router.post('/:organizationId/memberships/:membershipId/capabilities', authenticate, requireOrganizationGovernance, organizationController.grantCapability)
router.post('/:organizationId/memberships/:membershipId/capabilities/revoke', authenticate, requireOrganizationGovernance, organizationController.revokeCapability)
// Explicit deny outranks ordinary SYSTEM_ADMIN access, so deny management has a
// narrow platform break-glass guard. All other governance routes remain under
// requireOrganizationGovernance and continue to honor explicit deny first.
router.post('/:organizationId/access-denies', authenticate, requireOrganizationDenyGovernance, organizationController.deny)
router.post('/:organizationId/access-denies/lift', authenticate, requireOrganizationDenyGovernance, organizationController.liftDeny)

// Thin product adapters over the already-tested Organization structure and
// class-relationship services. All reads and writes remain governance-scoped;
// temporal episodes are returned as history rather than collapsed into flags.
router.get('/:organizationId/classification', authenticate, requireOrganizationGovernance, organizationAdminController.listClassification)
router.post('/:organizationId/classification', authenticate, requireOrganizationGovernance, organizationAdminController.classificationCommand)
router.get('/:organizationId/audit', authenticate, requireOrganizationGovernance, organizationAdminController.listAudit)
router.get('/:organizationId/units', authenticate, requireOrganizationGovernance, organizationAdminController.listUnits)
router.post('/:organizationId/units', authenticate, requireOrganizationGovernance, organizationAdminController.createUnit)
router.delete('/:organizationId/units/:unitId', authenticate, requireOrganizationGovernance, organizationAdminController.deleteUnit)
router.get('/:organizationId/student-class-assignments', authenticate, requireOrganizationGovernance, organizationAdminController.listStudentClassAssignments)
router.post('/:organizationId/student-class-assignments', authenticate, requireOrganizationGovernance, organizationAdminController.assignStudent)
router.post('/:organizationId/student-class-assignments/:assignmentId/end', authenticate, requireOrganizationGovernance, organizationAdminController.endStudentAssignment)
router.get('/:organizationId/staff-class-assignments', authenticate, requireOrganizationGovernance, organizationAdminController.listStaffClassAssignments)
router.post('/:organizationId/staff-class-assignments', authenticate, requireOrganizationGovernance, organizationAdminController.assignStaff)
router.post('/:organizationId/staff-class-assignments/:assignmentId/end', authenticate, requireOrganizationGovernance, organizationAdminController.endStaffAssignment)
router.get('/:organizationId/assessment-delivery-grants', authenticate, requireOrganizationGovernance, organizationAdminController.listAssessmentDeliveryGrants)
router.post('/:organizationId/assessment-delivery-grants', authenticate, requireOrganizationGovernance, organizationAdminController.grantAssessmentDelivery)
router.post('/:organizationId/assessment-delivery-grants/:grantId/revoke', authenticate, requireOrganizationGovernance, organizationAdminController.revokeAssessmentDelivery)

// Organization Run delivery is intentionally separate from Organization
// governance. ORG_ADMIN gets organization scope; TEACHER/COUNSELOR personas get
// relationship-scoped delivery. Exact Run ownership and every resolved actor
// pair are re-authorized in the domain layer.
router.get('/:organizationId/run-resources', authenticate, requireAssessmentDeliveryAuthority, assessmentRunController.resources)
router.get('/:organizationId/runs', authenticate, requireAssessmentDeliveryAuthority, assessmentRunController.list)
router.get('/:organizationId/runs/:runId', authenticate, requireAssessmentDeliveryAuthority, assessmentRunController.detail)
router.post('/:organizationId/runs', authenticate, requireAssessmentDeliveryAuthority, assessmentRunController.create)
router.post('/:organizationId/runs/:runId/tracks', authenticate, requireAssessmentDeliveryAuthority, assessmentRunController.addTrack)
router.post('/:organizationId/runs/:runId/preview', authenticate, requireAssessmentDeliveryAuthority, assessmentRunController.preview)
router.post('/:organizationId/runs/:runId/publish', authenticate, requireAssessmentDeliveryAuthority, assessmentRunController.publish)
router.get('/:organizationId/runs/:runId/progress', authenticate, requireAssessmentDeliveryAuthority, assessmentRunController.progress)
router.post('/:organizationId/runs/:runId/close', authenticate, requireAssessmentDeliveryAuthority, assessmentRunController.close)
router.post('/:organizationId/runs/:runId/cancel', authenticate, requireAssessmentDeliveryAuthority, assessmentRunController.cancel)
router.post('/:organizationId/runs/:runId/executions/:executionId/consent/accept', authenticate, assessmentRunController.acceptConsent)
router.post('/:organizationId/runs/:runId/executions/:executionId/start', authenticate, assessmentRunController.startExecution)

// Reporting keeps one analysis/artifact authority. Product discovery is a
// bounded, server-authorized summary over published Specs, eligible frozen
// Run/Track sources, protected subject-scoped sources, and Organization
// Series/Waves; it never exposes raw observations or expands report authority.
router.get('/:organizationId/reporting/specs', authenticate, reportingDiscoveryController.listSpecs)
router.get('/:organizationId/reporting/individual-subjects', authenticate, reportingDiscoveryController.individualSubjects)
router.get('/:organizationId/reporting/individual-sources', authenticate, reportingDiscoveryController.individualSources)
router.get('/:organizationId/reporting/cohort-members', authenticate, reportingDiscoveryController.cohortMembers)
router.get('/:organizationId/reporting/cohort-options', authenticate, reportingDiscoveryController.cohortOptions)
router.get('/:organizationId/reporting/sources', authenticate, reportingDiscoveryController.listSources)
router.get('/:organizationId/reporting/protected-sources', authenticate, reportingDiscoveryController.listProtectedSources)
router.get('/:organizationId/reporting/series', authenticate, reportingDiscoveryController.listSeries)
router.post('/:organizationId/reporting/series', authenticate, reportingController.createSeries)
router.post('/:organizationId/reporting/series/:seriesId/waves', authenticate, reportingController.bindWave)
router.post('/:organizationId/reporting/exports', authenticate, reportingExportBudget, reportingController.createExport)
router.get('/:organizationId/reporting/exports/:exportId', authenticate, reportingController.downloadExport)

// Safety remains server-authoritative. The inbox is an already-filtered product
// projection that exposes no subject/trigger/owner detail; exact case reads still
// decide FULL/ACTION/SUMMARY on every request.
router.get('/:organizationId/safety/cases', authenticate, reportingController.listSafetyCases)
router.get('/:organizationId/safety/cases/:caseId', authenticate, reportingController.readSafetyCase)
router.post('/:organizationId/reporting/analyses', authenticate, reportingAnalysisGuard, reportingController.analyze)
router.get('/:organizationId/reporting/artifacts/:artifactId', authenticate, reportingController.readArtifact)

export default router
