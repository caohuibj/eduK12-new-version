#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
require('../../backend/node_modules/dotenv/config')
const { PrismaClient } = require('../../backend/node_modules/@prisma/client')
const bcrypt = require('../../backend/node_modules/bcryptjs')

const prisma = new PrismaClient()
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

function fail(message) { throw new Error(message) }

function assertLocalDatabase() {
  const raw = process.env.DATABASE_URL
  if (!raw) fail('DATABASE_URL must be set')
  const url = new URL(raw)
  if (url.hostname !== '127.0.0.1' || url.port !== '55433' || url.pathname !== '/eduk12_dev') {
    fail('credential reset is restricted to 127.0.0.1:55433/eduk12_dev')
  }
}

function temporaryPassword() {
  for (;;) {
    let result = ''
    while (result.length < 16) result += alphabet[crypto.randomInt(alphabet.length)]
    if (/[A-Za-z]/.test(result) && /[0-9]/.test(result)) return result
  }
}

function cleanupHandoffs(handoffDir) {
  const configured = Number(process.env.CREDENTIAL_HANDOFF_TTL_HOURS || 24)
  const ttlHours = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 7 * 24) : 24
  const cutoff = Date.now() - ttlHours * 60 * 60 * 1000
  const pattern = /^(?:credential-handoff|admin-password-reset|student-password-reset)-.+\.json$/
  for (const name of fs.readdirSync(handoffDir)) {
    if (!pattern.test(name)) continue
    const filePath = path.join(handoffDir, name)
    try {
      const stat = fs.statSync(filePath)
      if (stat.isFile() && stat.mtimeMs < cutoff) fs.unlinkSync(filePath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
}

async function main() {
  if (process.env.CREDENTIAL_RESET_CONFIRMATION !== 'LOCAL_DEVELOPMENT_RESET') {
    fail('CREDENTIAL_RESET_CONFIRMATION=LOCAL_DEVELOPMENT_RESET is required')
  }
  assertLocalDatabase()
  const handoffDir = path.resolve(process.env.CREDENTIAL_HANDOFF_DIR || path.join(process.cwd(), '.local'))
  fs.mkdirSync(handoffDir, { recursive: true, mode: 0o700 })
  fs.chmodSync(handoffDir, 0o700)
  cleanupHandoffs(handoffDir)
  const handoffPath = path.join(handoffDir, `credential-handoff-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`)

  try {
    const users = await prisma.user.findMany({ select: { id: true, username: true } })
    if (!users.length) fail('no users found; seed the local database first')
    const entries = users.map((user) => ({ username: user.username, temporaryPassword: temporaryPassword() }))
    const passwordByUser = new Map(entries.map((entry, index) => [users[index].id, entry.temporaryPassword]))
    const handoff = { createdAt: new Date().toISOString(), entries }
    const file = fs.openSync(handoffPath, 'wx', 0o600)
    try {
      fs.writeFileSync(file, `${JSON.stringify(handoff, null, 2)}\n`, { encoding: 'utf8' })
    } finally {
      fs.closeSync(file)
    }
    fs.chmodSync(handoffPath, 0o600)

    await prisma.$transaction(async (tx) => {
      for (const user of users) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash: await bcrypt.hash(passwordByUser.get(user.id), 12),
            mustChangePassword: true,
            tokenVersion: { increment: 1 },
          },
        })
      }
    })
    console.log(`local credential handoff written: ${handoffPath}`)
  } catch (error) {
    try { fs.unlinkSync(handoffPath) } catch { /* ignore cleanup failure */ }
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'credential reset failed')
  process.exitCode = 1
})
