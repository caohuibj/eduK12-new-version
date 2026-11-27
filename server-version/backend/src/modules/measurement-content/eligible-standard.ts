import { Prisma } from '@prisma/client'
import { ASSESSMENT_OPERATIONAL_HOLDS } from '../assessment-governance/operational-hold'
import { standardNativeScaleJoin } from '../scale/component-import/native-source'
import type { ToolLicenseProduct } from '../tool-licensing/contracts'

export function eligibleStandards(product: ToolLicenseProduct) {
  const holds = [...ASSESSMENT_OPERATIONAL_HOLDS.values()].filter(hold => hold.family === 'SCALE' && !hold.scoringVersion)
  return Prisma.sql`
  FROM survey_standard_releases s
  JOIN measurement_content_releases m ON m.id=s.measurement_release->>'releaseId' AND m.content_hash=s.measurement_release->>'contentHash'
   AND m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED'
  JOIN survey_tool_policies p ON p.product=${product} AND p.resource_key='standard-release:'||s.id AND p.fingerprint=s.combination_hash
   AND p.decision='APPROVED' AND NOT p.paused
  JOIN scales native ON ${standardNativeScaleJoin('native','s')} AND native.status='PUBLISHED' AND native.instrument_class='STANDARD' AND native.library_entry_id IS NULL
  WHERE s.state='ONLINE'
   AND NOT EXISTS(SELECT 1 FROM scale_library_emergency_stops stop
    WHERE stop.target_kind='RELEASE' AND stop.target_id=m.id OR stop.target_kind='TRAINING_SCALE' AND stop.target_id=native.id)
  ${holds.length ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM unnest(
     ${holds.map(h=>h.key)}::text[],${holds.map(h=>h.version)}::text[]) held(key,version)
     WHERE held.key=s.tool_key AND held.version=s.snapshot->>'instrumentVersion')` : Prisma.empty}`
}
