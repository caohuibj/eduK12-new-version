import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('content grant UTC SQL contract', () => {
  it('changes only the two parent-window comparisons in the complete existing DB guard', () => {
    const previous = readFileSync('prisma/migrations/20261020030000_content_capability_authority/migration.sql', 'utf8')
    const expected = previous.slice(previous.indexOf('CREATE FUNCTION'), previous.indexOf('CREATE TRIGGER'))
      .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
      .replace('parent.valid_from > clock_timestamp() OR parent.expires_at <= clock_timestamp()',
        "parent.valid_from > (clock_timestamp() AT TIME ZONE 'UTC') OR parent.expires_at <= (clock_timestamp() AT TIME ZONE 'UTC')")
    const next = readFileSync('prisma/migrations/20261025040000_content_grant_utc_time/migration.sql', 'utf8')
    expect(next.slice(next.indexOf('CREATE OR REPLACE FUNCTION'))).toBe(expected)
  })
  it.each(['measurement-content/formal-reference-authority.ts', 'scale-library-governance/authority.ts', 'situational/entry-authority.ts'])(
    'uses UTC in grant candidate discovery: %s', file => {
      const source = readFileSync(`src/modules/${file}`, 'utf8')
      expect(source).toContain("valid_from<=(clock_timestamp() AT TIME ZONE 'UTC') AND expires_at>(clock_timestamp() AT TIME ZONE 'UTC')")
      expect(source).not.toMatch(/valid_from\s*<=\s*clock_timestamp\(\)/)
    })
})
