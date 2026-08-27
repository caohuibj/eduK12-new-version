import crypto from 'node:crypto'
import fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import path from 'node:path'

export interface CredentialHandoffEntry {
  username: string
  temporaryPassword: string
}

const HANDOFF_FILE_PATTERN = /^(?:credential-handoff|admin-password-reset|student-password-reset)-.+\.json$/
const DEFAULT_TTL_HOURS = 24
const MAX_TTL_HOURS = 7 * 24

const handoffTtlMs = (): number => {
  const configured = Number(process.env.CREDENTIAL_HANDOFF_TTL_HOURS || DEFAULT_TTL_HOURS)
  const hours = Number.isFinite(configured) && configured > 0
    ? Math.min(configured, MAX_TTL_HOURS)
    : DEFAULT_TTL_HOURS
  return hours * 60 * 60 * 1000
}

/** Remove only expired handoff files created by this application. */
export const cleanupCredentialHandoffs = async (directory: string, now = Date.now()): Promise<void> => {
  let names: string[]
  try {
    names = await fsPromises.readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }

  const cutoff = now - handoffTtlMs()
  await Promise.all(names.filter((name) => HANDOFF_FILE_PATTERN.test(name)).map(async (name) => {
    const filePath = path.join(directory, name)
    try {
      const stat = await fsPromises.stat(filePath)
      if (stat.isFile() && stat.mtimeMs < cutoff) await fsPromises.unlink(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }))
}

/**
 * Write a one-time local handoff without putting a temporary password in the
 * database, response body, application log, or repository.
 */
export const writeCredentialHandoff = async (entries: CredentialHandoffEntry[], prefix = 'credential-handoff') => {
  if (!entries.length) throw new Error('credential handoff cannot be empty')
  const directory = path.resolve(process.env.CREDENTIAL_HANDOFF_DIR || path.join(process.cwd(), '.local'))
  await fsPromises.mkdir(directory, { recursive: true, mode: 0o700 })
  await fsPromises.chmod(directory, 0o700)
  await cleanupCredentialHandoffs(directory)
  const filePath = path.join(directory, `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`)
  const content = `${JSON.stringify({ createdAt: new Date().toISOString(), entries }, null, 2)}\n`
  const fileHandle = await fsPromises.open(filePath, 'wx', 0o600)
  try {
    await fileHandle.writeFile(content, 'utf8')
  } finally {
    await fileHandle.close()
  }
  await fsPromises.chmod(filePath, 0o600)
  return filePath
}

export const removeCredentialHandoff = (filePath: string) => {
  try { fs.unlinkSync(filePath) } catch { /* best-effort cleanup after failed reset */ }
}
