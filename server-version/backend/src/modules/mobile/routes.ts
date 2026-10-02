import { config } from '../../config'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { authenticate, requireTeacher, requireAdmin } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { success, forbidden, notFound, error } from '../../utils/response'
import { canAccessCourseContent, canAccessCourseRoster, hasActiveCourseMembership } from '../../utils/courseAccess'
import { canManageClassroom, findClassroomAccess } from '../../middleware/classroomAccess'
import { requireOrganizationGovernance } from '../organization/access'
import { UserRole } from '../../types'

// Discovery only. Mutations use existing product controllers and re-authorize
// current principal, ownership, lifecycle invariants and submission revisions.
export const mobileRouter = Router()
mobileRouter.use(authenticate, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const domains = z.enum(['courses','assignments','checkins','classrooms','users','teacherCodes','profile'])
function collectionActions(domain: string, role: UserRole) {
  const staff = role === UserRole.TEACHER || role === UserRole.ADMIN
  if (domain === 'profile') return ['edit']
  if (domain === 'courses') return staff ? ['create'] : role === UserRole.STUDENT ? ['join'] : []
  if (['assignments','checkins','classrooms'].includes(domain)) return staff ? ['create'] : []
  if (['users','teacherCodes'].includes(domain)) return role === UserRole.ADMIN ? ['create'] : []
  return []
}
mobileRouter.get('/context/:domain', asyncHandler(async (req, res) => {
  const domain = domains.parse(req.params.domain)
  return success(res, { allowedActions: collectionActions(domain, req.user!.role), commandKey: randomUUID() })
}))
mobileRouter.get('/context/:domain/:id', asyncHandler(async (req, res) => {
  const domain = domains.parse(req.params.domain), id = idSchema.parse(req.params.id)
  const actor = req.user!, staff = actor.role === UserRole.TEACHER || actor.role === UserRole.ADMIN
  const actions: string[] = []
  let fields: Record<string, unknown> = {}
  if (domain === 'courses' || domain === 'assignments' || domain === 'checkins') {
    const task = domain === 'assignments' ? await prisma.assignment.findUnique({ where: { id } })
      : domain === 'checkins' ? await prisma.checkin.findUnique({ where: { id } }) : null
    if (domain !== 'courses' && !task) return notFound(res)
    const course = await prisma.course.findUnique({ where: { id: task?.courseId ?? id }, include: { shares: { select: { sharedTo: true } } } })
    if (!course) return notFound(res)
    if (actor.role === UserRole.STUDENT) {
      if (course.isLibrary || !(await hasActiveCourseMembership(course.id, actor.userId))) return forbidden(res)
      if (domain === 'assignments' && (task as any).status !== 'PUBLISHED') return forbidden(res)
      if (domain === 'courses') actions.push('assignments','checkins')
      if (domain === 'assignments' && (!(task as any).deadline || (task as any).deadline >= new Date())) actions.push('submit')
      if (domain === 'checkins' && (!(task as any).endTime || (task as any).endTime >= new Date())) actions.push('submit')
      if (domain === 'checkins' && (task as any).allowViewOthers) actions.push('others')
    } else {
      if (!canAccessCourseContent(course, actor.userId, actor.role)) return forbidden(res)
      if (domain === 'courses') actions.push('assignments','checkins')
      if (staff && canAccessCourseRoster(course, actor.userId, actor.role)) {
        if (domain === 'courses') {
          actions.push('edit','cover','students','createAssignment','createCheckin','createClassroom','clone','rotateCode')
          if (actor.role === UserRole.ADMIN) actions.push('share')
          if (course.status !== 'COMPLETED') actions.push('end')
          if (course.isRecruiting && course.status === 'PUBLISHED') actions.push('stopRecruiting')
          if (!course.isRecruiting && !course.isLibrary && course.status !== 'COMPLETED') actions.push('resumeRecruiting')
        } else {
          actions.push('edit','submissions')
          if (domain === 'assignments') actions.push('batchGrade')
          if (domain === 'checkins' && course.creatorId === actor.userId) { actions.push('tokens','anonymous'); if ((task as any).allowAnonymous) actions.push('createToken') }
        }
      }
    }
    fields = { courseId: course.id }
  } else if (domain === 'classrooms') {
    const classroom = await findClassroomAccess(id)
    if (!classroom) return notFound(res)
    if (!canManageClassroom(classroom, actor.userId, actor.role)) return forbidden(res)
    actions.push('questions','qrcode','duplicate')
    if(config.miniClassroomEnabled)actions.push('live')
    if (classroom.status !== 'ENDED') actions.push('edit','addQuestion')
    fields = { courseId: classroom.courseId }
  } else if (domain === 'users' || domain === 'profile') {
    if (actor.userId !== id && actor.role !== UserRole.ADMIN) return forbidden(res)
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, teacherApproved: true, isActive: true } })
    if (!target) return notFound(res)
    actions.push('edit')
    if (domain === 'users' && actor.role === UserRole.ADMIN && target.role === UserRole.TEACHER) actions.push('extendAccount')
    if (domain === 'users' && actor.role === UserRole.ADMIN && target.role === UserRole.TEACHER && !target.teacherApproved) actions.push('approveTeacher')
    if (domain === 'users' && actor.platformRole === 'SYSTEM_ADMIN') actions.push(target.isActive ? 'deactivate' : 'activate','resetPassword')
    fields = target
  } else if (domain === 'teacherCodes') {
    if (actor.role !== UserRole.ADMIN) return forbidden(res)
    const code = await prisma.teacherCode.findUnique({ where: { id } })
    if (!code) return notFound(res)
    // Destructive removal requires explicit confirmation in the mobile client.
    actions.push('delete')
    fields = code
  }
  return success(res, { allowedActions: actions, commandKey: randomUUID(), fields })
}))
// One bounded roster query across owned courses, never per-course requests or
// shared-course identities. Legacy ADMIN has the existing roster authority.
mobileRouter.get('/courses/:id/share-options',requireAdmin,asyncHandler(async(req,res)=>{
  const course=await prisma.course.findUnique({where:{id:idSchema.parse(req.params.id)}})
  if(!course)return notFound(res)
  if(!canAccessCourseRoster(course,req.user!.userId,req.user!.role))return forbidden(res)
  const {page,pageSize,keyword}=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20),keyword:z.string().max(100).optional()}).parse(req.query)
  const where={role:{in:[UserRole.TEACHER,UserRole.ADMIN]},isActive:true,isFrozen:false,...(keyword?{OR:[{username:{contains:keyword}},{nickname:{contains:keyword}}]}:{})}
  const [list,total]=await Promise.all([prisma.user.findMany({where,select:{id:true,nickname:true,username:true},orderBy:{id:'asc'},skip:(page-1)*pageSize,take:pageSize}),prisma.user.count({where})])
  return success(res,{list,total,page,pageSize})
}))
mobileRouter.get('/classrooms/:id/questions/:questionId/context', requireTeacher, asyncHandler(async(req,res)=>{
  const classroom=await findClassroomAccess(idSchema.parse(req.params.id))
  if(!classroom)return notFound(res)
  if(!canManageClassroom(classroom,req.user!.userId,req.user!.role))return forbidden(res)
  const question=await prisma.classroomQuestion.findFirst({where:{id:idSchema.parse(req.params.questionId),classroomId:classroom.id},select:{id:true,startedAt:true}})
  if(!question)return notFound(res)
  const count=await prisma.classroomAnswer.count({where:{questionId:question.id}})
  return success(res,{allowedActions:classroom.status==='ENDED'?[]:[...(!question.startedAt?['edit']:[]),...(count===0?['delete']:[])]})
}))
mobileRouter.get('/students', requireTeacher, asyncHandler(async (req, res) => {
  const pagination = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20), keyword: z.string().max(100).optional() }).parse(req.query)
  const where = { courseStudents: { some: { status: { in: ['ACTIVE','APPROVED'] as any }, course: req.user!.role === UserRole.ADMIN ? {} : { creatorId: req.user!.userId } } },
    ...(pagination.keyword ? { OR: [{ username: { contains: pagination.keyword } }, { nickname: { contains: pagination.keyword } }] } : {}) }
  const [list,total] = await Promise.all([
    prisma.user.findMany({ where, select: { id: true, nickname: true, username: true, isActive: true, isFrozen: true }, orderBy: { id: 'asc' }, skip: (pagination.page-1)*pagination.pageSize, take: pagination.pageSize }),
    prisma.user.count({ where }),
  ])
  return success(res, { list, total, page: pagination.page, pageSize: pagination.pageSize })
}))

// Lightweight mobile lists omit media bodies; detail adapters hydrate them once.
// Query count stays constant as the page grows, and every page is bounded.
mobileRouter.get('/lists/:domain', asyncHandler(async (req, res) => {
  const domain = z.enum(['courses','assignments','checkins','classrooms','teacherCodes']).parse(req.params.domain)
  const {page,pageSize,courseId,keyword} = z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20),courseId:idSchema.optional(),keyword:z.string().max(100).optional()}).parse(req.query)
  const actor=req.user!, staff=actor.role===UserRole.TEACHER||actor.role===UserRole.ADMIN
  if(!staff&&actor.role!==UserRole.STUDENT)return forbidden(res)
  if((domain==='classrooms'&&!staff)||(domain==='teacherCodes'&&actor.role!==UserRole.ADMIN))return forbidden(res)
  let courseWhere:any=actor.role===UserRole.ADMIN?{}:actor.role===UserRole.TEACHER?{creatorId:actor.userId}:{isLibrary:false,students:{some:{studentId:actor.userId,status:{in:['ACTIVE','APPROVED']}}}}
  let allowedActions=collectionActions(domain,actor.role)
  if(courseId){
    const course=await prisma.course.findUnique({where:{id:courseId},include:{shares:{select:{sharedTo:true}}}})
    if(!course)return notFound(res)
    if(actor.role===UserRole.STUDENT){if(course.isLibrary||!await hasActiveCourseMembership(courseId,actor.userId))return forbidden(res)}
    else if(!canAccessCourseContent(course,actor.userId,actor.role))return forbidden(res)
    courseWhere={id:courseId};allowedActions=staff&&canAccessCourseRoster(course,actor.userId,actor.role)?['create']:[]
  }
  const title=keyword?{contains:keyword}:undefined
  const paging={skip:(page-1)*pageSize,take:pageSize,orderBy:{createdAt:'desc' as const}}
  let list:unknown[],total:number
  if(domain==='courses'){
    const where={...courseWhere,...(title?{title}: {})}
    ;[list,total]=await Promise.all([prisma.course.findMany({where,...paging,select:{id:true,title:true,description:true,status:true,isRecruiting:true}}),prisma.course.count({where})])
  }else if(domain==='assignments'){
    const where={course:courseWhere,...(title?{title}: {}),...(actor.role===UserRole.STUDENT?{status:'PUBLISHED' as const}:{})}
    ;[list,total]=await Promise.all([prisma.assignment.findMany({where,...paging,select:{id:true,title:true,description:true,status:true,deadline:true,courseId:true}}),prisma.assignment.count({where})])
  }else if(domain==='checkins'){
    const where={course:courseWhere,...(title?{title}: {})}
    ;[list,total]=await Promise.all([prisma.checkin.findMany({where,...paging,select:{id:true,title:true,description:true,endTime:true,courseId:true}}),prisma.checkin.count({where})])
  }else if(domain==='classrooms'){
    const where={...(actor.role===UserRole.ADMIN?{}:{creatorId:actor.userId}),...(courseId?{courseId}:{})}
    ;[list,total]=await Promise.all([prisma.classroom.findMany({where,...paging,select:{id:true,name:true,status:true,courseId:true}}),prisma.classroom.count({where})])
  }else{
    ;[list,total]=await Promise.all([prisma.teacherCode.findMany({...paging,select:{id:true,code:true,isActive:true,maxUses:true,usedCount:true,expiresAt:true}}),prisma.teacherCode.count()])
  }
  return success(res,{list,total,page,pageSize,allowedActions,commandKey:randomUUID()})
}))

mobileRouter.get('/platform-user-options', asyncHandler(async (req,res) => {
  if(req.user!.platformRole!=='SYSTEM_ADMIN')return forbidden(res)
  const {page,pageSize,keyword}=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20),keyword:z.string().max(100).optional()}).parse(req.query)
  const where={isActive:true,isFrozen:false,...(keyword?{OR:[{username:{contains:keyword}},{nickname:{contains:keyword}}]}:{})}
  const [list,total]=await Promise.all([prisma.user.findMany({where,select:{id:true,nickname:true,username:true},orderBy:{id:'asc'},skip:(page-1)*pageSize,take:pageSize}),prisma.user.count({where})])
  return success(res,{list,total,page,pageSize})
}))
mobileRouter.get('/organizations/:organizationId/memberships', requireOrganizationGovernance, asyncHandler(async (req,res)=>{
  const {page,pageSize}=z.object({page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20)}).parse(req.query)
  const where={organizationId:req.params.organizationId}
  const [list,total]=await Promise.all([prisma.organizationMembership.findMany({where,select:{id:true,userId:true,orgRole:true,validFrom:true,validUntil:true,user:{select:{username:true,nickname:true}}},orderBy:[{validFrom:'desc'},{id:'desc'}],skip:(page-1)*pageSize,take:pageSize}),prisma.organizationMembership.count({where})])
  return success(res,{list,total,page,pageSize})
}))
mobileRouter.use((err:unknown,_req:any,res:any,next:any)=>{if(err instanceof z.ZodError)return error(res,'请求参数无效',-1,400);next(err)})
