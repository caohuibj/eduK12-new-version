import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { assessmentRunController } from '../assessment-run/run.controller'
import { reportingController } from '../reporting/reporting.controller'
import { requireOrganizationDenyGovernance, requireOrganizationGovernance } from './access'
import { organizationController } from './organization.controller'

const router = Router()

// Platform-governed ReportingAnalysisSpec lifecycle. These handlers enforce
// current PlatformRole=SYSTEM_ADMIN themselves; Organization admins cannot
// fork or weaken the platform spec contract.
router.post('/reporting-specs', authenticate, reportingController.createSpec)
router.post('/reporting-specs/:specId/review', authenticate, reportingController.reviewSpec)
router.post('/reporting-specs/:specId/publish', authenticate, reportingController.publishSpec)
router.post('/reporting-specs/:specId/retire', authenticate, reportingController.retireSpec)

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
// Explicit deny outranks ordinary SYSTEM_ADMIN access, so deny management has a
// narrow platform break-glass guard. All other governance routes remain under
// requireOrganizationGovernance and continue to honor explicit deny first.
router.post('/:organizationId/access-denies', authenticate, requireOrganizationDenyGovernance, organizationController.deny)
router.post('/:organizationId/access-denies/lift', authenticate, requireOrganizationDenyGovernance, organizationController.liftDeny)

// Organization Run V1. Draft governance and lifecycle management are tenant-governance
// operations. Publish intentionally delegates scoped TEACHER/COUNSELOR authority to
// the domain service; START is respondent-scoped by frozen actor identity.
router.post('/:organizationId/runs', authenticate, requireOrganizationGovernance, assessmentRunController.create)
router.post('/:organizationId/runs/:runId/tracks', authenticate, requireOrganizationGovernance, assessmentRunController.addTrack)
router.post('/:organizationId/runs/:runId/publish', authenticate, assessmentRunController.publish)
router.get('/:organizationId/runs/:runId/progress', authenticate, requireOrganizationGovernance, assessmentRunController.progress)
router.post('/:organizationId/runs/:runId/close', authenticate, requireOrganizationGovernance, assessmentRunController.close)
router.post('/:organizationId/runs/:runId/cancel', authenticate, requireOrganizationGovernance, assessmentRunController.cancel)
router.post('/:organizationId/runs/:runId/executions/:executionId/consent/accept', authenticate, assessmentRunController.acceptConsent)
router.post('/:organizationId/runs/:runId/executions/:executionId/start', authenticate, assessmentRunController.startExecution)

// Reporting keeps one analysis/artifact authority. Series/Wave bindings are
// immutable scoped resources; analysis/read dispatches server-side by governed
// analysisKind/policyDomain. Protected requests never accept actor-role or
// privacy overrides from clients.
router.post('/:organizationId/reporting/series', authenticate, reportingController.createSeries)
router.post('/:organizationId/reporting/series/:seriesId/waves', authenticate, reportingController.bindWave)
router.post('/:organizationId/reporting/analyses', authenticate, reportingController.analyze)
router.get('/:organizationId/reporting/artifacts/:artifactId', authenticate, reportingController.readArtifact)

export default router
