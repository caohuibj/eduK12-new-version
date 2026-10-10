import { Router } from 'express'
import { z, ZodError } from 'zod'
import { prisma } from '../../config/database'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success } from '../../utils/response'
import { authenticateSchool } from '../../middleware/auth'
import { requireOrganizationGovernance } from '../organization/access'
import { organizationController } from '../organization/organization.controller'
import { organizationAdminController } from '../organization/organization.admin.controller'
import { requireRecentSchoolMfa } from './mfa.middleware'
import { guardCampusCapabilityGrant } from './capabilityGuard'
import { requireCampusClassRead } from './classRead.middleware'
import { CampusAdmissionError } from './admission.service'
import { readCampusRelationshipDirectory, appointCampusCounselorClient, endCampusCounselorClient, assignCampusStaffClass, endCampusStaffClass } from './relationships.service'

// Reuse the existing Organization structure and relationship services, never
// the legacy /api/organizations entrypoint or its training session cookie.
const router=Router()
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
router.get('/organizations',authenticateSchool,organizationController.listAccessible)
router.get('/organizations/:organizationId/context',authenticateSchool,organizationController.readContext)
router.get('/organizations/:organizationId/units',authenticateSchool,requireCampusClassRead,organizationAdminController.listUnits)
router.post('/organizations/:organizationId/units',authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,organizationAdminController.createUnit)
router.delete('/organizations/:organizationId/units/:unitId',authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,organizationAdminController.deleteUnit)
router.get('/organizations/:organizationId/staff-class-assignments',authenticateSchool,requireOrganizationGovernance,organizationAdminController.listStaffClassAssignments)

// Narrow campus-only officer discovery. Never return the student membership
// register merely to support assignment of a reporting disclosure capability.
router.get('/organizations/:organizationId/disclosure-officers',authenticateSchool,requireOrganizationGovernance,
  asyncHandler(async(req,res)=>{
    const organizationId=z.string().uuid().parse(req.params.organizationId)
    const rows=await prisma.$queryRaw<Array<{
      membershipId:string;displayName:string;hasPsychology:boolean;hasDisclosure:boolean;
    }>>`
      SELECT m.id AS "membershipId",ca.login_name AS "displayName",
        EXISTS(SELECT 1 FROM organization_capability_grants cap
          WHERE cap.organization_id=m.organization_id AND cap.membership_id=m.id
            AND cap.capability='PSYCHOLOGY_STAFF' AND cap.revoked_at IS NULL) AS "hasPsychology",
        EXISTS(SELECT 1 FROM organization_capability_grants cap
          WHERE cap.organization_id=m.organization_id AND cap.membership_id=m.id
            AND cap.capability='PARENT_REPORT_DISCLOSURE' AND cap.revoked_at IS NULL) AS "hasDisclosure"
      FROM organization_memberships m
      JOIN users u ON u.id=m.user_id AND u.account_domain='SCHOOL' AND u.role IN ('TEACHER','ADMIN')
        AND u.is_active=true AND u.is_frozen=false
      JOIN campus_accounts ca ON ca.user_id=m.user_id
      JOIN organization_persona_grants persona ON persona.organization_id=m.organization_id
        AND persona.membership_id=m.id AND persona.persona='COUNSELOR' AND persona.revoked_at IS NULL
      WHERE m.organization_id=${organizationId}
        AND m.valid_from<=statement_timestamp()
        AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
      ORDER BY ca.login_name,m.id LIMIT 101
    `
    return success(res,{list:rows.slice(0,100),hasMore:rows.length>100})
  }))

router.post('/organizations/:organizationId/memberships/:membershipId/capabilities',authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,guardCampusCapabilityGrant,organizationController.grantCapability)
router.post('/organizations/:organizationId/memberships/:membershipId/capabilities/revoke',authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,organizationController.revokeCapability)
const relationId=z.string().uuid()
const relations=(handler:(req:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return success(res,await handler(req))}
  catch(error){
    if(error instanceof CampusAdmissionError)return res.status(error.statusCode).json({
      code:error.code,message:'校园关系管理操作未取得当前授权',data:null,
    })
    if(error instanceof ZodError)return res.status(400).json({
      code:'CAMPUS_RELATION_INPUT_INVALID',message:'关系管理参数不正确',data:null,
    })
    throw error
  }
})
// SCHOOL teacher/class mutations must record their governance actor atomically;
// legacy organization routines retain their original semantics.
router.post('/organizations/:organizationId/staff-class-assignments',
  authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,
  relations(req=>{
    const organizationId=relationId.parse(req.params.organizationId)
    const body=z.object({
      membershipId:relationId,classUnitId:relationId,staffRole:z.enum(['HOMEROOM','TEACHING']),
    }).strict().parse(req.body)
    return assignCampusStaffClass({actor:req.user!,organizationId,...body})
  }))
router.post('/organizations/:organizationId/staff-class-assignments/:assignmentId/end',
  authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,
  relations(req=>{
    const organizationId=relationId.parse(req.params.organizationId)
    const assignmentId=relationId.parse(req.params.assignmentId)
    z.object({}).strict().parse(req.body)
    return endCampusStaffClass({actor:req.user!,organizationId,assignmentId})
  }))
router.get('/organizations/:organizationId/relationship-directory',
  authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,
  relations(req=>{
    const organizationId=relationId.parse(req.params.organizationId)
    const query=z.object({classUnitId:relationId.optional()}).strict().parse(req.query)
    return readCampusRelationshipDirectory({actor:req.user!,organizationId,...query})
  }))
router.post('/organizations/:organizationId/counselor-client-relationships',
  authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,
  relations(req=>{
    const organizationId=relationId.parse(req.params.organizationId)
    const values=z.object({counselorMembershipId:relationId,clientMembershipId:relationId}).strict().parse(req.body)
    return appointCampusCounselorClient({actor:req.user!,organizationId,...values})
  }))
router.post('/organizations/:organizationId/counselor-client-relationships/:relationshipId/end',
  authenticateSchool,requireRecentSchoolMfa,requireOrganizationGovernance,
  relations(req=>{
    const organizationId=relationId.parse(req.params.organizationId)
    const relationshipId=relationId.parse(req.params.relationshipId)
    const values=z.object({reason:z.string().trim().min(4).max(200)}).strict().parse(req.body)
    return endCampusCounselorClient({actor:req.user!,organizationId,relationshipId,...values})
  }))
export default router
