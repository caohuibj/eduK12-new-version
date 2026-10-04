import { Prisma, type ParentInviteCodeStatus } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import {
  mintParentInvitePlaintext,
  hashParentInviteCode,
} from '../assessment-identity/identity'
import { fail } from './contracts'

type Tx = Prisma.TransactionClient
export type InviteSource =
  | { courseId: string; organizationId?: never }
  | { organizationId: string; courseId?: never }
export interface InviteRecord {
  id: string
  codeHash: string
  studentUserId: string
  courseId: string | null
  organizationId: string | null
  membershipId: string | null
  createdByUserId: string
  status: ParentInviteCodeStatus
  expiresAt: Date
  consumedAt: Date | null
  consumedByParentUserId: string | null
}

/** The source authorizes invitation only; report disclosure is always independent. */
export async function assertInviteSource(
  tx: Tx,
  studentUserId: string,
  source: {
    courseId: string | null
    organizationId: string | null
    membershipId?: string | null
  },
) {
  if (source.courseId && !source.organizationId) {
    const membership = await tx.courseStudent.findUnique({
      where: {
        courseId_studentId: {
          courseId: source.courseId,
          studentId: studentUserId,
        },
      },
      include: { course: { select: { isLibrary: true } } },
    })
    if (
      !membership ||
      membership.course.isLibrary ||
      !['ACTIVE', 'APPROVED'].includes(membership.status)
    )
      fail()
    return null
  }
  if (!source.organizationId || source.courseId) fail()
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT m.id FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
    JOIN organization_persona_grants p ON p.organization_id=m.organization_id AND p.membership_id=m.id
    JOIN users u ON u.id=m.user_id
    WHERE m.organization_id=${source.organizationId} AND m.user_id=${studentUserId}
      AND (${source.membershipId ?? null}::text IS NULL OR m.id=${source.membershipId ?? null})
      AND o.status='ACTIVE' AND u.role='STUDENT' AND u.is_active=true AND u.is_frozen=false
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
      AND p.persona='STUDENT' AND p.revoked_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM organization_access_denies d WHERE d.organization_id=m.organization_id AND d.user_id=m.user_id AND d.lifted_at IS NULL AND d.permission IN ('*','PARENT_LINK'))
    LIMIT 1 FOR SHARE OF m,o,u,p
  `
  return rows[0]?.id ?? fail()
}

export async function createInvite(
  tx: Tx,
  studentUserId: string,
  source: InviteSource,
) {
  const normalized = {
    courseId: source.courseId ?? null,
    organizationId: source.organizationId ?? null,
  }
  const membershipId = await assertInviteSource(tx, studentUserId, normalized)
  const inviteCode = mintParentInvitePlaintext(),
    expiresAt = new Date(Date.now() + 15 * 60 * 1000)
  await tx.parentInviteCode.create({
    data: {
      id: randomUUID(),
      codeHash: hashParentInviteCode(inviteCode),
      studentUserId,
      createdByUserId: studentUserId,
      ...normalized,
      membershipId,
      expiresAt,
      status: 'ACTIVE',
    },
  })
  return { inviteCode, expiresAt }
}

export async function invitationSources(tx: Tx, studentUserId: string) {
  const courses = await tx.courseStudent.findMany({
    where: {
      studentId: studentUserId,
      status: { in: ['ACTIVE', 'APPROVED'] },
      course: { isLibrary: false },
    },
    orderBy: { joinedAt: 'desc' },
    take: 101,
    select: { course: { select: { id: true, title: true } } },
  })
  const organizations = await tx.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT o.id,o.name FROM organizations o JOIN organization_memberships m ON m.organization_id=o.id
    JOIN organization_persona_grants p ON p.organization_id=o.id AND p.membership_id=m.id
    WHERE m.user_id=${studentUserId} AND o.status='ACTIVE' AND p.persona='STUDENT' AND p.revoked_at IS NULL
      AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
      AND NOT EXISTS (SELECT 1 FROM organization_access_denies d WHERE d.organization_id=o.id AND d.user_id=m.user_id AND d.lifted_at IS NULL AND d.permission IN ('*','PARENT_LINK'))
    ORDER BY o.name,o.id LIMIT 101
  `
  return {
    list: [
      ...organizations
        .slice(0, 100)
        .map((o) => ({
          kind: 'ORGANIZATION' as const,
          id: o.id,
          title: o.name,
        })),
      ...courses
        .slice(0, 100)
        .map((c) => ({
          kind: 'COURSE' as const,
          id: c.course.id,
          title: c.course.title,
        })),
    ],
    truncated: organizations.length > 100 || courses.length > 100,
  }
}
