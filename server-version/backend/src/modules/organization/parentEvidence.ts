import { prisma } from '../../config/database'

export type HistoricalParentArtifactType = 'ASSESSMENT' | 'COMPOSITE_ATTEMPT' | 'RELATIONAL_ASSIGNMENT'

/**
 * Current tenant scope is intentionally recomputed from current evidence.
 * A global parent↔student relationship alone never preserves access to an old
 * organization after the child's membership episode ends.
 */
export async function hasCurrentParentOrganizationEvidence(input: {
  parentUserId: string
  studentUserId: string
  organizationId: string
}): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "parent_student_relationships" r
      JOIN "organization_memberships" m
        ON m."user_id" = r."student_user_id"
       AND m."organization_id" = ${input.organizationId}
       AND m."valid_from" <= statement_timestamp()
       AND (m."valid_until" IS NULL OR statement_timestamp() < m."valid_until")
      JOIN "organizations" o
        ON o."id" = m."organization_id"
       AND o."status" = 'ACTIVE'
      WHERE r."parent_user_id" = ${input.parentUserId}
        AND r."student_user_id" = ${input.studentUserId}
        AND r."status" = 'ACTIVE'
        AND r."approved_at" IS NOT NULL
    ) AS "allowed"
  `
  return rows[0]?.allowed === true
}

async function artifactTimestamp(input: {
  artifactType: HistoricalParentArtifactType
  artifactId: string
  studentUserId: string
  parentUserId: string
}): Promise<Date | null> {
  if (input.artifactType === 'ASSESSMENT') {
    const rows = await prisma.$queryRaw<Array<{ at: Date }>>`
      SELECT "started_at" AS "at"
      FROM "assessments"
      WHERE "id" = ${input.artifactId}
        AND "subject_user_id" = ${input.studentUserId}
      LIMIT 1
    `
    return rows[0]?.at ?? null
  }

  if (input.artifactType === 'COMPOSITE_ATTEMPT') {
    const rows = await prisma.$queryRaw<Array<{ at: Date }>>`
      SELECT "started_at" AS "at"
      FROM "composite_assessment_attempts"
      WHERE "id" = ${input.artifactId}
        AND "subject_user_id" = ${input.studentUserId}
      LIMIT 1
    `
    return rows[0]?.at ?? null
  }

  // Relational assignments already freeze exact subject/respondent identity.
  // Their existence is itself exact-artifact historical evidence; no current
  // parent relationship or tenant membership is consulted.
  const rows = await prisma.$queryRaw<Array<{ at: Date }>>`
    SELECT "created_at" AS "at"
    FROM "relational_assessment_assignments"
    WHERE "id" = ${input.artifactId}
      AND "subject_user_id" = ${input.studentUserId}
      AND "respondent_user_id" = ${input.parentUserId}
      AND "relationship_kind" = 'PARENT'
    LIMIT 1
  `
  return rows[0]?.at ?? null
}

/**
 * Historical access is exact-artifact evidence, never a substitute for current
 * tenant scope. Legacy attempts without additive subject identity fail closed.
 */
export async function hasHistoricalParentArtifactEvidence(input: {
  parentUserId: string
  studentUserId: string
  artifactType: HistoricalParentArtifactType
  artifactId: string
}): Promise<boolean> {
  const at = await artifactTimestamp(input)
  if (!at) return false

  if (input.artifactType === 'RELATIONAL_ASSIGNMENT') return true

  const rows = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM "parent_student_relationships" r
      WHERE r."parent_user_id" = ${input.parentUserId}
        AND r."student_user_id" = ${input.studentUserId}
        AND r."approved_at" IS NOT NULL
        AND r."approved_at" <= ${at}
        AND (r."revoked_at" IS NULL OR ${at} < r."revoked_at")
    ) AS "allowed"
  `
  return rows[0]?.allowed === true
}
