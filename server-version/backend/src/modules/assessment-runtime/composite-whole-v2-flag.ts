/**
 * Single runtime switch activating Phase 2 single-row FINAL + WHOLE_V2 zero-child-row
 * execution across Training / School / Teacher composite attempts.
 *
 * Set `COMPOSITE_WHOLE_V2_ENABLED=true` on pilot/production environments after running
 * `scripts/reset-phase2-test-attempts.sql` and `npm run db:migrate:guarded`.
 */
export function isCompositeWholeV2Enabled(): boolean {
  return process.env.COMPOSITE_WHOLE_V2_ENABLED === 'true'
}
