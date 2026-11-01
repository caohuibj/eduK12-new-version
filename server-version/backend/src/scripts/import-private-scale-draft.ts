import fs from 'node:fs'
import { prisma } from '../config/database'
import { parseScaleInstrumentSourceSchema } from '../modules/scale/onboarding/schema'
import { createScaleInstrumentRegistry } from '../modules/scale/onboarding/instrument-registry'
import { materializeScaleInstrumentContent } from '../modules/scale/onboarding/materialize'

// Private administrator import through the existing source/materialize contract.
// It creates hidden DRAFT content only; no deployment/authorization/publication.
async function main() {
  const args = process.argv.slice(2)
  const flag = (key: string) => args[args.indexOf('--' + key) + 1]
  if (!args.includes('--source') || !args.includes('--actor')) throw new Error('Required: --source <private source.json> --actor <SYSTEM_ADMIN id> [--apply]')
  const file = flag('source'), actorId = flag('actor')
  if (fs.statSync(file).size > 1024 * 1024) throw new Error('SOURCE_TOO_LARGE')
  const source = parseScaleInstrumentSourceSchema(JSON.parse(fs.readFileSync(file, 'utf8')))
  if (source.executable?.releaseStatus !== 'DRAFT') throw new Error('PRIVATE_IMPORT_REQUIRES_DRAFT_SOURCE')
  const registry = createScaleInstrumentRegistry([source]), validation = registry.getValidation(source.identity.instrumentKey, source.identity.instrumentVersion)!
  if (!validation.valid) throw new Error(validation.issues.map(i => i.message).join('; '))
  const actor = await prisma.user.findUnique({ where: { id: actorId } })
  if (!actor || actor.platformRole !== 'SYSTEM_ADMIN' || !actor.isActive || actor.isFrozen || actor.expiresAt && actor.expiresAt <= new Date()) throw new Error('SYSTEM_ADMIN_REQUIRED')
  if (!args.includes('--apply')) { process.stdout.write(JSON.stringify({ mode: 'PREVIEW', identity: source.identity, itemCount: source.executable.definition.items.length, validation: 'PASS', targetStatus: 'DRAFT', targetVisibility: 'HIDDEN' }) + '\n'); return }
  const result = await prisma.$transaction(tx => materializeScaleInstrumentContent(tx, { ...source.identity, actorUserId: actorId }, registry))
  process.stdout.write(JSON.stringify({ mode: 'APPLY', identity: source.identity, scaleId: result.scale.id, created: result.created, status: result.scale.status, visibility: result.scale.visibility, definitionHash: result.definitionHash }) + '\n')
}
main().catch(e => { console.error(e instanceof Error ? e.message : 'PRIVATE_DRAFT_IMPORT_FAILED'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
