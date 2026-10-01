import { randomUUID } from 'node:crypto'
import { PrismaClient } from '../backend/node_modules/@prisma/client'
import bcrypt from '../backend/node_modules/bcryptjs'
import { writeFile } from 'node:fs/promises'

if (!process.env.DATABASE_URL?.includes('127.0.0.1:55473/situational_vnext')) throw new Error('Dedicated synthetic database required')
const db = new PrismaClient()
async function main() {
  const id = randomUUID(), username = `synthetic-browser-${id}`, password = `Synthetic-${randomUUID()}`
  await db.user.create({ data: { id, username, passwordHash: await bcrypt.hash(password, 10), role: 'STUDENT', mustChangePassword: false } })
  await writeFile(process.env.SITUATIONAL_VNEXT_BROWSER_FIXTURE_FILE || '/tmp/eduk12-situational-vnext-browser.json', JSON.stringify({ id, username, password, instrumentKey: 'synthetic-situational-vnext' }), { mode: 0o600 })
  console.log('Synthetic browser account created in dedicated test database')
}
main().finally(() => db.$disconnect())
