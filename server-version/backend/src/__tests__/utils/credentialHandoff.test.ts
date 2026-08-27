import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupCredentialHandoffs, writeCredentialHandoff } from '../../utils/credentialHandoff'

const originalHandoffDirectory = process.env.CREDENTIAL_HANDOFF_DIR
const originalTtlHours = process.env.CREDENTIAL_HANDOFF_TTL_HOURS
let testDirectory: string | undefined

const restoreEnvironment = (name: 'CREDENTIAL_HANDOFF_DIR' | 'CREDENTIAL_HANDOFF_TTL_HOURS', value: string | undefined) => {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

afterEach(async () => {
  restoreEnvironment('CREDENTIAL_HANDOFF_DIR', originalHandoffDirectory)
  restoreEnvironment('CREDENTIAL_HANDOFF_TTL_HOURS', originalTtlHours)
  if (testDirectory) await fs.rm(testDirectory, { recursive: true, force: true })
  testDirectory = undefined
})

describe('credential handoff files', () => {
  it('writes a private handoff file with a private directory', async () => {
    testDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'eduk12-handoff-'))
    process.env.CREDENTIAL_HANDOFF_DIR = testDirectory

    const filePath = await writeCredentialHandoff([
      { username: 'test-teacher', temporaryPassword: 'temporary-only-in-test' },
    ])
    const directoryStat = await fs.stat(testDirectory)
    const fileStat = await fs.stat(filePath)

    expect(directoryStat.mode & 0o777).toBe(0o700)
    expect(fileStat.mode & 0o777).toBe(0o600)
    await expect(fs.access(filePath)).resolves.toBeUndefined()
  })

  it('removes expired application handoffs without touching unrelated files', async () => {
    testDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'eduk12-handoff-'))
    process.env.CREDENTIAL_HANDOFF_TTL_HOURS = '1'
    const now = Date.now()
    const expiredTime = new Date(now - 2 * 60 * 60 * 1000)
    const expiredPath = path.join(testDirectory, 'credential-handoff-expired.json')
    const unrelatedPath = path.join(testDirectory, 'operator-notes.json')

    await fs.writeFile(expiredPath, '{}', { mode: 0o600 })
    await fs.writeFile(unrelatedPath, '{}', { mode: 0o600 })
    await fs.utimes(expiredPath, expiredTime, expiredTime)
    await fs.utimes(unrelatedPath, expiredTime, expiredTime)

    await cleanupCredentialHandoffs(testDirectory, now)

    await expect(fs.access(expiredPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.access(unrelatedPath)).resolves.toBeUndefined()
  })
})
