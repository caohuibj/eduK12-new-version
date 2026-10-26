import {educationPersonnelRouter} from '../campus/personnel.routes'
import {educationRosterFileRouter} from '../education-roster/files.routes'
import { educationPrivateToolRouter } from '../education-tools/private-tool.routes'
import { educationToolAuthoringCapabilitiesHandler } from '../education-tools/capabilities.handler'
import { Router } from 'express'
import { z, ZodError } from 'zod'
import { prisma } from '../../config/database'
import { asyncHandler } from '../../middleware/asyncHandler'
import { authenticateHuiteacher } from '../../middleware/auth'
import { success } from '../../utils/response'
import { organizationAdminController } from '../organization/organization.admin.controller'
import { listEducationProductMemberships } from '../organization/educationProductAccess'
import { requireTeacherProductAdmin, requireRecentTeacherMfa, requireTeacherProductMember } from './authority'

const router=Router()
router.use(educationRosterFileRouter('TEACHER'))
router.use(educationPersonnelRouter('TEACHER'))
router.use('/organizations/:organizationId/private-tools',authenticateHuiteacher,educationPrivateToolRouter('TEACHER'))
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next()})
const id=z.string().guid()
const wrap=(fn:(req:any,res:any)=>Promise<unknown>)=>asyncHandler(async(req,res)=>{
  try{return await fn(req,res)}
  catch(e){
    if(e instanceof ZodError)return res.status(400).json({
      code:'BAD_REQUEST',message:'学校组织参数无效',data:null,
    })
    throw e
  }
})
router.get('/organizations/:organizationId/tool-authoring-capabilities', authenticateHuiteacher,
  educationToolAuthoringCapabilitiesHandler('TEACHER'))
router.get('/organizations',authenticateHuiteacher,wrap(async(req,res)=>{
  return success(res,{
    list:await listEducationProductMemberships(req.user!.userId,'HUITEACHER'),
  })
}))
router.get('/organizations/:organizationId/units',authenticateHuiteacher,
  requireTeacherProductMember,organizationAdminController.listUnits)
router.post('/organizations/:organizationId/units',authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,
  organizationAdminController.createUnit)
router.delete('/organizations/:organizationId/units/:unitId',authenticateHuiteacher,
  requireTeacherProductAdmin,requireRecentTeacherMfa,
  organizationAdminController.deleteUnit)
router.get('/organizations/:organizationId/members',authenticateHuiteacher,
  requireTeacherProductAdmin,wrap(async(req,res)=>{
    const org=id.parse(req.params.organizationId)
    const rows=await prisma.$queryRaw<Array<{
      membershipId:string;loginName:string;role:string;joinedAt:Date;
    }>>`
      SELECT m."id" AS "membershipId",ca."login_name" AS "loginName",
        u."role"::text AS "role",m."valid_from" AS "joinedAt"
      FROM "organization_memberships" m
      JOIN "users" u ON u."id"=m."user_id"
        AND u."account_domain"='SCHOOL'
      JOIN "campus_accounts" ca ON ca."user_id"=m."user_id"
      WHERE m."organization_id"=${org}
        AND m."valid_from"<=statement_timestamp()
        AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
      ORDER BY ca."normalized_login",m."id" LIMIT 201
    `
    return success(res,{list:rows.slice(0,200),truncated:rows.length>200})
  }))
router.get('/organizations/:organizationId/staff-class-assignments',
  authenticateHuiteacher,requireTeacherProductAdmin,
  organizationAdminController.listStaffClassAssignments)
router.post('/organizations/:organizationId/staff-class-assignments',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  organizationAdminController.assignStaff)
router.post('/organizations/:organizationId/staff-class-assignments/:assignmentId/end',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  organizationAdminController.endStaffAssignment)
router.get('/organizations/:organizationId/student-class-assignments',
  authenticateHuiteacher,requireTeacherProductAdmin,
  organizationAdminController.listStudentClassAssignments)
router.post('/organizations/:organizationId/student-class-assignments',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  organizationAdminController.assignStudent)
router.post('/organizations/:organizationId/student-class-assignments/:assignmentId/end',
  authenticateHuiteacher,requireTeacherProductAdmin,requireRecentTeacherMfa,
  organizationAdminController.endStudentAssignment)
export default router
