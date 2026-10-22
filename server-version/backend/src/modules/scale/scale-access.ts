import { assertLibraryUseGrantCurrent } from '../scale-library-governance/usage'
import { ScaleLibraryError } from '../scale-library-governance/contracts'
import { ContentAuthorityError } from '../measurement-content/content-authority'
import { assertContentAuthority } from '../measurement-content/content-authority.repository'
import { publicScaleScope } from './scale-public-delivery'
import { CourseStudentStatus, type Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../../config/database'

export type StudentScaleAccessRecord = {
  id: string
  status: string
  visibility: string
}

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Standalone student scale access is intentionally narrower than the
 * composite/questionnaire authorization chains. A scale must be published,
 * and COURSE visibility additionally requires an active course membership.
 *
 * New-start callers may pass their transaction client so resource access and
 * deployment/admission freezing share the same Serializable snapshot.
 */
export const canStudentAccessScale = async (
  scale: StudentScaleAccessRecord,
  studentId: string,
  db: Db = prisma,
): Promise<boolean> => {
  if (scale.status !== 'PUBLISHED') return false
  if (scale.visibility === 'PUBLIC') {
    // Read persisted migration marker; clients cannot claim grandfathered status.
    const current=await db.scale.findUnique({where:{id:scale.id},select:{legacyPublicAccess:true,publicDistributionGrantId:true,instrumentClass:true}})
    if(current?.legacyPublicAccess||current?.instrumentClass==='STANDARD')return true
    if(!current?.publicDistributionGrantId)return false
    const grant=await db.contentCapabilityGrant.findUnique({where:{id:current.publicDistributionGrantId},select:{subjectId:true}})
    if(!grant)return false
    try { await assertContentAuthority(db as Prisma.TransactionClient,{actorId:grant.subjectId,grantId:current.publicDistributionGrantId,
      capability:'material.distribute',scope:publicScaleScope(scale.id)}); return true } catch { return false }
  }
  if (scale.visibility !== 'COURSE') return false

  const membership = await db.courseStudent.findFirst({
    where: {
      studentId,
      status: { in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED] },
      course: {
        courseScales: {
          some: { scaleId: scale.id },
        },
      },
    },
    select: { id: true },
  })

  return Boolean(membership)
}

/** New standalone collection is a new use, even when an old course link exists.
 * Existing attempts never call this; course ownership alone is not a grant. */
export async function canStartLibraryCourseScale(
  scale: StudentScaleAccessRecord & { libraryEntryId?: string | null }, studentId: string, db: Db,
): Promise<boolean> {
  if (!scale.libraryEntryId) return true
  if (scale.visibility !== 'COURSE') return false
  const memberships = await db.courseStudent.findMany({ where: { studentId,
    status: { in: [CourseStudentStatus.ACTIVE, CourseStudentStatus.APPROVED] },
    course: { courseScales: { some: { scaleId: scale.id } } },
  }, select: { course: { select: { creatorId: true } } } })
  for (const userId of new Set(memberships.map(row => row.course.creatorId))) {
    try {
      await assertLibraryUseGrantCurrent(db as Prisma.TransactionClient, { entryId: scale.libraryEntryId, userId, product: 'TRAINING' })
      return true
    } catch (err) {
      if (!(err instanceof ScaleLibraryError) && !(err instanceof ContentAuthorityError)) throw err
    }
  }
  return false
}
