import { Prisma } from '@prisma/client'

/** Shared by route discovery and transactional publish. Requires staff alias sa. */
export const currentClassDeliverySql = Prisma.sql`
  sa."valid_from" <= statement_timestamp()
  AND (sa."valid_until" IS NULL OR sa."valid_until" > statement_timestamp())
  AND (
    (sa."staff_role" = 'HOMEROOM' AND EXISTS (
      SELECT 1 FROM "organizations" delivery_org
      WHERE delivery_org."id" = sa."organization_id"
        AND delivery_org."homeroom_delivery_enabled" = TRUE
    ))
    OR EXISTS (
      SELECT 1 FROM "organization_assessment_delivery_grants" g
      WHERE g."organization_id" = sa."organization_id"
        AND g."teacher_membership_id" = sa."membership_id"
        AND g."class_unit_id" = sa."class_unit_id"
        AND g."permission" = 'CLASS_ASSESSMENT_DELIVERY'
        AND g."revoked_at" IS NULL
        AND g."valid_from" <= statement_timestamp()
        AND (g."valid_until" IS NULL OR g."valid_until" > statement_timestamp())
    )
  )
`

export function validDeliveryWindow(validFrom: Date, validUntil: Date | null): boolean {
  return Number.isFinite(validFrom.getTime()) && (validUntil === null
    || (Number.isFinite(validUntil.getTime()) && validUntil.getTime() > validFrom.getTime()))
}
