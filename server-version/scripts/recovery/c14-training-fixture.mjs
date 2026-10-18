/** Reusable fresh Training scaffold for isolated recovery qualifications.
 * Existing course product domains are immutable; never update a LEGACY course.
 * This helper creates only a synthetic course and copies its source membership.
 * It does not create products, attempts, allocations, submissions or jobs.
 */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
export async function createTrainingCourseFixture({prisma, sourceCourseId, sourceCreatorId, creatorId, title='C14 fresh Training qualification'}) {
  assert.equal(process.env.NODE_ENV,'test')
  const database=new URL(process.env.DATABASE_URL)
  assert.equal(database.hostname,'127.0.0.1')
  assert.equal(database.username,'eduk12_runtime')
  assert.equal(database.pathname,'/eduk12_recovery')
  const source=await prisma.course.findUniqueOrThrow({where:{id:sourceCourseId},select:{id:true,creatorId:true,courseType:true}})
  assert.ok(sourceCreatorId,'separately verified source owner required')
  assert.equal(source.creatorId,sourceCreatorId)
  const creator=await prisma.user.findUniqueOrThrow({where:{id:creatorId},select:{role:true,accountDomain:true,isActive:true,isFrozen:true,teacherApproved:true,expiresAt:true}})
  assert.equal(creator.role,'TEACHER')
  assert.ok(['TRAINING','LEGACY'].includes(creator.accountDomain))
  assert.equal(creator.isActive,true);assert.equal(creator.isFrozen,false);assert.equal(creator.teacherApproved,true)
  assert.ok(!creator.expiresAt || creator.expiresAt>new Date())
  const memberships=await prisma.courseStudent.findMany({where:{courseId:sourceCourseId},select:{studentId:true,status:true}})
  assert.ok(memberships.length,'source synthetic membership required')
  const course=await prisma.$transaction(async tx=>{
    const created=await tx.course.create({data:{creatorId,title,courseCode:'C14-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
    await tx.courseStudent.createMany({data:memberships.map(member=>({...member,courseId:created.id}))})
    return created
  })
  assert.equal((await prisma.course.findUniqueOrThrow({where:{id:sourceCourseId}})).courseType,source.courseType)
  return {course,membershipCount:memberships.length}
}
