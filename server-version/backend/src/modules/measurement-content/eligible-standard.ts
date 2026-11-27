import { Prisma } from '@prisma/client'
import { ASSESSMENT_OPERATIONAL_HOLDS } from '../assessment-governance/operational-hold'
import { standardNativeScaleJoin } from '../scale/component-import/native-source'
import type { ToolLicenseProduct } from '../tool-licensing/contracts'

/** Catalogs may keep rows for past grants, but share the new-use admission rule. */
export function standardAvailability(product: ToolLicenseProduct, alias: 's' | 'r' = 's') {
  const release = Prisma.raw(alias)
  const holds = [...ASSESSMENT_OPERATIONAL_HOLDS.values()].filter(hold => hold.family === 'SCALE' && !hold.scoringVersion)
  const approved = Prisma.sql`p.decision='APPROVED' AND NOT p.paused`
  const measurementAvailable = Prisma.sql`m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED'
    AND m.content_hash=${release}.measurement_release->>'contentHash'`
  const available = Prisma.sql`
    ${release}.state='ONLINE' AND ${approved} AND native.status='PUBLISHED' AND ${measurementAvailable}
    AND NOT EXISTS (SELECT 1 FROM scale_library_emergency_stops stop
      WHERE (stop.target_kind='RELEASE' AND stop.target_id=m.id)
         OR (stop.target_kind='TRAINING_SCALE' AND stop.target_id=native.id))
    ${holds.length ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM unnest(
      ${holds.map(hold => hold.key)}::text[],${holds.map(hold => hold.version)}::text[]) held(key,version)
      WHERE held.key=${release}.tool_key AND held.version=${release}.snapshot->>'instrumentVersion')` : Prisma.empty}`
  return {
    joins: Prisma.sql`
      LEFT JOIN measurement_content_releases m ON m.id=${release}.measurement_release->>'releaseId'
      LEFT JOIN survey_tool_policies p ON p.product=${product}
        AND p.resource_key='standard-release:'||${release}.id AND p.fingerprint=${release}.combination_hash
      LEFT JOIN scales native ON ${standardNativeScaleJoin('native',alias)}
        AND native.instrument_class='STANDARD' AND native.library_entry_id IS NULL`,
    approved, measurementAvailable, available,
  }
}

export function eligibleStandards(product: ToolLicenseProduct) {
  const { joins, available } = standardAvailability(product)
  return Prisma.sql`FROM survey_standard_releases s ${joins} WHERE ${available}`
}
