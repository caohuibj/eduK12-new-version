import crypto from 'node:crypto'
import fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import path from 'node:path'

export interface CredentialHandoffEntry {
  username: string
  temporaryPassword: string
}

/**
 * Write a one-time local handoff without putting a temporary password in the
 * database, response body, application log, or repository.
 */
export const writeCredentialHandoff = async (entries: CredentialHandoffEntry[], prefix = 'credential-handoff') => {
  if (!entries.length) throw new Error('credential handoff cannot be empty')
  const directory = path.resolve(process.env.CREDENTIAL_HANDOFF_DIR || path.join(process.cwd(), '.local'))
  await fsPromises.mkdir(directory, { recursive: true, mode: 0o700 })
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
