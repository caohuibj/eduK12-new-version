import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { runtimeTablePolicy, verifyRuntimePrivileges } from '../../../scripts/runtime-role-contract.mjs'

// Source-only acceptance. No database is connected and no ACL is applied here.
// RUNTIME_RW is the existing policy's narrowest writable category, not permission
// to remove business immutability, skip actor checks, or grant runtime ownership.
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const migrationsDirectory = new URL('../../../prisma/migrations/', import.meta.url)
const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => ({ name: entry.name, sql: read(`../../../prisma/migrations/${entry.name}/migration.sql`) }))
  .sort((a, b) => a.name.localeCompare(b.name))
const allMigrationSql = migrations.map(entry => entry.sql).join('\n')
const tables = [
  ['measurement_content_releases', '20261020020000_measurement_content_releases', 'measurement_content_release_immutable', 'protect_measurement_content_release'],
  ['measurement_content_release_events', '20261020020000_measurement_content_releases', 'measurement_content_event_immutable', 'protect_measurement_content_event'],
  ['measurement_reference_candidates', '20261020025000_reference_candidate_reviews', 'measurement_reference_candidate_immutable', 'protect_measurement_content_event'],
  ['measurement_reference_reviews', '20261020025000_reference_candidate_reviews', 'measurement_reference_review_immutable', 'protect_measurement_content_event'],
  ['content_capability_grants', '20261020030000_content_capability_authority', 'content_capability_grants_guard', 'guard_content_capability_grant'],
  ['survey_report_drafts', '20261020031000_survey_private_report_drafts', 'survey_report_draft_immutable', 'protect_published_survey_report_draft'],
  ['survey_interpretation_artifacts', '20261020043000_survey_interpretation_artifacts', 'survey_interpretation_artifacts_guard', 'guard_survey_interpretation_artifact'],
  ['survey_reference_requests', '20261020131000_survey_reference_requests', 'survey_reference_requests_guard', 'guard_survey_reference_request'],
  ['training_report_drafts', '20261020133000_training_private_report_drafts', 'training_report_draft_guard', 'protect_training_report_draft'],
  ['static_sjt_measurement_mappings', '20261020136000_static_sjt_measurement_mapping', 'static_sjt_measurement_mapping_guard', 'guard_static_sjt_measurement_mapping'],
  ['training_reference_requests', '20261020139000_training_reference_requests', 'training_reference_requests_guard', 'protect_measurement_content_event'],
  ['training_interpretation_artifacts', '20261020140000_training_reinterpretation_artifacts', 'training_interpretation_artifacts_guard', 'guard_training_interpretation_artifact'],
] as const

function currentFunctionBody(name: string) {
  const expression = new RegExp(`CREATE(?: OR REPLACE)? FUNCTION ${name}\\([^)]*\\)[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$`, 'gi')
  const definitions = [...allMigrationSql.matchAll(expression)]
  expect(definitions.length, `missing immutable guard ${name}`).toBeGreaterThan(0)
  return definitions[definitions.length - 1][1]
}

function connectedCatalogShape(extra: Record<string, unknown>[] = []) {
  const mapped = tables.map(([name]) => ({ name, readable: true, writable: true, read_only: false }))
  const query = vi.fn()
    .mockResolvedValueOnce([{ restricted: true }])
    .mockResolvedValueOnce([{ usable: true }])
    .mockResolvedValueOnce([...mapped, ...extra])
    .mockResolvedValueOnce([])
  return { $queryRawUnsafe: query }
}

describe('measurement-version exact runtime table policy source contract', () => {
  it('classifies only named migrated measurement tables as the existing writable category', () => {
    expect(runtimeTablePolicy.schemaVersion).toBe(1)
    for (const [name, migration] of tables) {
      expect(runtimeTablePolicy.tables[name], name).toBe('RUNTIME_RW')
      expect(migrations.find(entry => entry.name === migration)?.sql, migration)
        .toMatch(new RegExp(`CREATE TABLE ${name}\\s*\\(`))
    }
    expect(Object.keys(runtimeTablePolicy.tables).every(name => /^[a-z_][a-z0-9_]*$/.test(name))).toBe(true)
    expect(runtimeTablePolicy.tables._prisma_migrations).toBe('MIGRATION_LEDGER')
    expect(Object.entries(runtimeTablePolicy.tables).filter(([, category]) => category === 'OPERATOR_ONLY').map(([name]) => name).sort())
      .toEqual(['_legacy_import_batches', '_legacy_import_id_map'])
  })

  it('does not leave a current Prisma model unmapped, including new immutable artifacts', () => {
    const schema = read('../../../prisma/schema.prisma')
    const modelTables = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map(match => match[1])
    expect(modelTables.length).toBeGreaterThan(0)
    expect(modelTables.filter(name => !Object.prototype.hasOwnProperty.call(runtimeTablePolicy.tables, name))).toEqual([])
  })

  it('keeps every explicit UPDATE/DELETE guard and its current rejection function', () => {
    for (const [name, migration, trigger, guard] of tables) {
      const sql = migrations.find(entry => entry.name === migration)!.sql
      expect(sql, name).toMatch(new RegExp(`CREATE TRIGGER ${trigger} BEFORE (?:INSERT OR )?UPDATE OR DELETE ON ${name}\\s+FOR EACH ROW EXECUTE FUNCTION ${guard}\\(\\)`))
      expect(currentFunctionBody(guard), guard).toMatch(/RAISE EXCEPTION/i)
      expect(allMigrationSql, trigger).not.toMatch(new RegExp(`DROP TRIGGER(?: IF EXISTS)?\\s+"?${trigger}"?\\b`, 'i'))
      expect(allMigrationSql, trigger).not.toMatch(new RegExp(`ALTER TABLE\\s+"?${name}"?\\s+DISABLE TRIGGER`, 'i'))
    }
    expect(currentFunctionBody('protect_measurement_content_event')).toMatch(/BEGIN\s+RAISE EXCEPTION 'CONTENT_EVENT_IMMUTABLE'/)
    expect(currentFunctionBody('protect_measurement_content_release')).toMatch(/TG_OP\s*=\s*'DELETE'[\s\S]*?CONTENT_RELEASE_DELETE_FORBIDDEN/)
    expect(currentFunctionBody('protect_measurement_content_release')).toContain('CONTENT_RELEASE_IMMUTABLE')
    expect(currentFunctionBody('protect_published_survey_report_draft')).toMatch(/OLD\.state\s*=\s*'PUBLISHED'[\s\S]*?REPORT_PUBLISHED_DRAFT_IMMUTABLE/)
    expect(currentFunctionBody('protect_training_report_draft')).toMatch(/OLD\.state\s*=\s*'PUBLISHED'[\s\S]*?REPORT_PUBLISHED_DRAFT_IMMUTABLE/)
    expect(currentFunctionBody('guard_survey_interpretation_artifact')).toMatch(/TG_OP\s*<>\s*'INSERT'[\s\S]*?RAISE EXCEPTION/)
    expect(currentFunctionBody('guard_training_interpretation_artifact')).toMatch(/TG_OP\s*<>\s*'INSERT'[\s\S]*?RAISE EXCEPTION/)
  })

  it('accepts the explicit writable catalog shape but rejects an unknown table even with full CRUD', async () => {
    expect(await verifyRuntimePrivileges(connectedCatalogShape())).toMatchObject({
      runtimeTables: tables.length, restrictedRuntimeRole: true,
    })
    await expect(verifyRuntimePrivileges(connectedCatalogShape([
      { name: 'unreviewed_measurement_table', readable: true, writable: true, read_only: false },
    ]))).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
    await expect(verifyRuntimePrivileges(connectedCatalogShape([
      { name: 'unreviewed_operator_evidence', readable: false, writable: false, read_only: true },
    ]))).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
  })

  it('does not weaken migration-ledger, operator, ownership or missing-write rejection', async () => {
    for (const row of [
      { name: '_prisma_migrations', readable: true, writable: true, read_only: false },
      { name: '_legacy_import_batches', readable: true, writable: false, read_only: true },
      { name: 'measurement_content_releases', readable: true, writable: false, read_only: true },
    ]) {
      await expect(verifyRuntimePrivileges(connectedCatalogShape([row]))).rejects.toThrow('RUNTIME_PRIVILEGES_INCOMPLETE')
    }
    const owner = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ restricted: false }]) }
    await expect(verifyRuntimePrivileges(owner)).rejects.toThrow('RUNTIME_ROLE_NOT_RESTRICTED')
    expect(owner.$queryRawUnsafe).toHaveBeenCalledTimes(1)
  })

  it('retains exact opt-in ACL reconciliation and denies future tables/default authority', () => {
    const sql = read('../../../scripts/runtime-role-defaults.sql')
    expect(sql).toContain("category := policy->'tables'->>object_row.relname")
    expect(sql).toContain("IF category IS NULL THEN RAISE EXCEPTION 'UNCLASSIFIED_RUNTIME_TABLE'")
    expect(sql).toContain("IF category IS NULL THEN RAISE EXCEPTION 'UNCLASSIFIED_RUNTIME_SEQUENCE'")
    expect(sql).toContain('EXACT_RUNTIME_PROVISION_SCOPE_MISMATCH')
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES[\s\S]*?REVOKE ALL ON TABLES/)
    expect(sql).not.toMatch(/GRANT[\s\S]{0,120}ON ALL TABLES/i)
    expect(sql).not.toMatch(/ALTER DEFAULT PRIVILEGES[^;]*GRANT/i)
    expect(sql).not.toMatch(/GRANT[^;]*(?:TRUNCATE|TRIGGER|REFERENCES)/i)
    expect(sql).not.toMatch(/DISABLE TRIGGER|SESSION_REPLICATION_ROLE/i)
  })
})
