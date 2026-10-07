import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const migrationFingerprint = rows => createHash('sha256').update(
  [...rows].sort((a, b) => a.name.localeCompare(b.name)).map(row => `${row.name}\t${row.checksum}\n`).join(''),
).digest('hex')

export function expectedReleaseMigrations(directory = fileURLToPath(new URL('../prisma/migrations/', import.meta.url))) {
  const rows = readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => ({
    name: entry.name, checksum: createHash('sha256').update(readFileSync(`${directory}/${entry.name}/migration.sql`)).digest('hex'),
  }))
  if (!rows.length) throw new Error('RELEASE_MIGRATIONS_REQUIRED')
  return rows
}

export async function verifyReleaseSchema(db, expected = expectedReleaseMigrations()) {
  const applied = await db.$queryRawUnsafe('SELECT migration_name AS name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')
  const failed = await db.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL')
  if (failed[0].count || new Set(applied.map(row => row.name)).size !== applied.length
    || applied.length !== expected.length || migrationFingerprint(applied) !== migrationFingerprint(expected)) {
    throw new Error('RELEASE_MIGRATION_IDENTITY_MISMATCH')
  }
  return { migrationCount: applied.length, migrationFingerprint: migrationFingerprint(expected) }
}
